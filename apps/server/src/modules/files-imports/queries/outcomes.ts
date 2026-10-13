import {
  IMPORT_BATCH_TYPE,
  layoutStructureSchema,
  mappingFieldsSchema,
  type ImportOutcomes,
  type ImportOutcomesQuery,
} from '@apparel-os/schemas';
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { ApiRefusal, type TransactionContext } from '../../../kernel/index.js';
import {
  importBatch,
  importDocument,
  importOutcome,
  layout,
  layoutVersion,
  mapping,
  mappingVersion,
} from '../db/schema.js';
import {
  documentsInFileOrder,
  factsOfBatch,
  parsedOrDefect,
  stagedRowCounts,
  type ImportDependencies,
} from '../commands/import-common.js';
import { rowsReadOf } from '../commands/outcomes.js';
import { maskedColumn, maskOutcome, maskPlan } from '../domain/masking.js';
import { outcomeView } from './batches.js';

// The import outcomes report (imports-and-opening-data 7.4, 14; phases.md stage 1; PRD-IMP-013, PRD-MOD-003,
// PRD-EXC-010, PRD-EXC-011, PRD-SEC-005; S1-F06-T04): each batch the reader may see and each of its documents, with
// kind, target, layout and mapping versions, who started it and when, state, and its last attempt's counts, quantities,
// values and control totals; filtered by Store, kind, state and the date started; read at one as-of time. Row-level
// security shows only the batches, documents and outcomes inside the reader's scope, and Authorise checks view on each
// batch with its facts under the reader's own assignment. A document reference, a control total or a measure of a class
// the reader is not granted is masked, and every one while the batch's layout version is not Confirmed (section 11). The rows, issues and
// stored file are read through the batch (13.1 "Reads").

function notAuthorised(code: string, missing: readonly { readonly kind: string }[]): never {
  throw new ApiRefusal({ kind: 'not-authorised', code, missing: [...missing] });
}

export async function importOutcomes(
  deps: Pick<ImportDependencies, 'access'>,
  context: TransactionContext,
  actorId: string,
  query: ImportOutcomesQuery,
): Promise<ImportOutcomes> {
  const may = await deps.access.authoriseEach(context, { actorId, action: 'view', recordType: IMPORT_BATCH_TYPE }, []);
  if (may.kind === 'refused') notAuthorised(may.refusal.code, may.refusal.missing);
  const filters: SQL[] = [];
  if (query.storeId !== undefined) filters.push(eq(importBatch.storeId, query.storeId));
  if (query.kind !== undefined) filters.push(eq(importBatch.kind, query.kind));
  if (query.state !== undefined) filters.push(eq(importBatch.state, query.state));
  if (query.from !== undefined || query.to !== undefined) {
    // The date started, in the Organisation's timezone (code-house-rules 9; PRD-MOD-009).
    const date = await context.businessDate();
    if (date.kind !== 'set') {
      throw new ApiRefusal({
        kind: 'unavailable',
        code: 'access.business-date-not-set',
        missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
      });
    }
    const started = sql`(${importBatch.startedAt} at time zone ${date.timezone})::date`;
    if (query.from !== undefined) filters.push(sql`${started} >= ${query.from}::date`);
    if (query.to !== undefined) filters.push(sql`${started} <= ${query.to}::date`);
  }
  const batches = await context.tx
    .select({
      batch: importBatch,
      layoutCode: layout.code,
      layoutVersion: layoutVersion.version,
      layoutState: layoutVersion.state,
      structure: layoutVersion.structure,
      fields: mappingVersion.fields,
      mappingCode: mapping.code,
      mappingVersion: mappingVersion.version,
    })
    .from(importBatch)
    .innerJoin(layoutVersion, eq(layoutVersion.id, importBatch.layoutVersionId))
    .innerJoin(layout, eq(layout.id, layoutVersion.layoutId))
    .innerJoin(mappingVersion, eq(mappingVersion.id, importBatch.mappingVersionId))
    .innerJoin(mapping, eq(mapping.id, mappingVersion.mappingId))
    .where(and(...filters))
    .orderBy(desc(importBatch.startedAt), desc(importBatch.id));
  const report: ImportOutcomes['batches'] = [];
  for (const row of batches) {
    const { batch } = row;
    const authorised = await deps.access.authorise(context, {
      actorId,
      action: 'view',
      recordType: IMPORT_BATCH_TYPE,
      facts: factsOfBatch(batch),
    });
    if (authorised.kind === 'refused') continue;
    const restricted = await deps.access.restrictFields(
      context,
      { roleAssignmentId: authorised.roleAssignmentId, actorId, fieldClasses: batch.restrictedClasses },
      'view',
    );
    // What the reader may not see, as the batch's read masks it (section 11): the reference column's class, the
    // control totals of a masked column and the measures of a masked field once the layout version is Confirmed;
    // every one while it is not.
    const structure = parsedOrDefect(layoutStructureSchema, row.structure, 'layout version');
    const plan = maskPlan({
      layoutConfirmed: row.layoutState === 'Confirmed',
      masked: restricted.masked,
      layout: structure,
      mapping: parsedOrDefect(mappingFieldsSchema, row.fields, 'mapping version'),
      header: [],
    });
    const masked = maskedColumn(plan, structure.documentReference);
    const documents = await context.tx
      .select()
      .from(importDocument)
      .where(eq(importDocument.batchId, batch.id))
      .orderBy(...documentsInFileOrder);
    const rowCounts = (await stagedRowCounts(context, batch.id)).byDocument;
    const outcomes = await context.tx
      .select()
      .from(importOutcome)
      .where(eq(importOutcome.batchId, batch.id))
      .orderBy(asc(importOutcome.id));
    const last = outcomes.at(-1);
    report.push({
      batchId: batch.id,
      code: batch.code,
      kind: batch.kind,
      target: batch.target,
      state: batch.state,
      ...(batch.legalEntityId === null ? {} : { legalEntityId: batch.legalEntityId }),
      ...(batch.siteId === null ? {} : { siteId: batch.siteId }),
      ...(batch.storeId === null ? {} : { storeId: batch.storeId }),
      ...(batch.businessUnitId === null ? {} : { businessUnitId: batch.businessUnitId }),
      layout: { layoutVersionId: batch.layoutVersionId, code: row.layoutCode, version: row.layoutVersion },
      mapping: { mappingVersionId: batch.mappingVersionId, code: row.mappingCode, version: row.mappingVersion },
      startedByUserId: batch.startedByUserId,
      startedAt: batch.startedAt.toISOString(),
      rowsRead: rowsReadOf(batch),
      attempts: outcomes.length,
      ...(last === undefined ? {} : { lastOutcome: maskOutcome(outcomeView(last), plan) }),
      documents: documents.map((document) => ({
        documentId: document.id,
        reference: masked === undefined ? document.reference : '',
        ...(masked === undefined ? {} : { referenceMasked: masked }),
        state: document.state,
        excluded: document.excluded,
        rows: rowCounts.get(document.id) ?? 0,
        ...(document.revisesDocumentId === null ? {} : { revisesDocumentId: document.revisesDocumentId }),
        ...(document.replacedByDocumentId === null ? {} : { replacedByDocumentId: document.replacedByDocumentId }),
      })),
    });
  }
  return { asOf: context.startedAt.toISOString(), batches: report };
}
