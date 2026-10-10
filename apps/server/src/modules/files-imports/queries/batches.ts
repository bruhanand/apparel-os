import { IMPORT_BATCH_TYPE, type ImportBatchRead, type ImportLayoutList, type MissingItem } from '@apparel-os/schemas';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { ApiRefusal, type TransactionContext } from '../../../kernel/index.js';
import {
  attachment,
  importDocument,
  importOutcome,
  layout,
  layoutVersion,
  mapping,
  mappingVersion,
  stagedRow,
} from '../db/schema.js';
import {
  BATCH_NOT_FOUND,
  factsOfBatch,
  handlerOf,
  previewOf,
  visibleBatch,
  type ImportDependencies,
} from '../commands/import-common.js';

// Reads of imports (imports-and-opening-data 11, 13.1, 14; PRD-SEC-005; S1-F06-T01): one batch with its documents,
// staged rows, preview and outcomes; and the layout versions with their mapping versions a batch may start with.

type StagedRowView = ImportBatchRead['documents'][number]['rows'][number];

function rowView(row: typeof stagedRow.$inferSelect): StagedRowView {
  return {
    stagedRowId: row.id,
    sheet: row.sheet,
    rowNumber: row.rowNumber,
    role: row.role,
    hidden: row.hidden,
    cells: row.cells,
    values: row.values,
  };
}

function refuse(code: string, kind: 'not-found' | 'not-authorised', missing: readonly MissingItem[] = []): never {
  throw new ApiRefusal({ kind, code, missing: [...missing] });
}

/**
 * One batch as its reader may see it (section 11; PRD-SEC-005): row-level security shows it only within the reader's
 * scope, so one outside it reads as not found; Authorise then checks view on it with its facts and every restricted
 * class its file is held to carry, since its staged rows hold the file's cells. Each Staged document carries the
 * handler's preview, worked out without writing (13.2).
 */
export async function readBatch(
  deps: Pick<ImportDependencies, 'access' | 'handlers'>,
  context: TransactionContext,
  actorId: string,
  batchId: string,
): Promise<ImportBatchRead> {
  const batch = await visibleBatch(context, batchId);
  if (batch === undefined) refuse(BATCH_NOT_FOUND.code, 'not-found');
  const authorised = await deps.access.authorise(context, {
    actorId,
    action: 'view',
    recordType: IMPORT_BATCH_TYPE,
    facts: factsOfBatch(batch),
    fieldClasses: batch.restrictedClasses.map((fieldClass) => ({ fieldClass, use: 'view' as const })),
  });
  if (authorised.kind === 'refused') refuse(authorised.refusal.code, 'not-authorised', authorised.refusal.missing);
  const [linked] = await context.tx
    .select({ id: attachment.id })
    .from(attachment)
    .where(
      and(
        eq(attachment.recordType, IMPORT_BATCH_TYPE),
        eq(attachment.recordId, batch.id),
        isNull(attachment.recordVersionId),
      ),
    );
  if (linked === undefined) refuse(BATCH_NOT_FOUND.code, 'not-found');
  const documents = await context.tx
    .select()
    .from(importDocument)
    .where(eq(importDocument.batchId, batch.id))
    .orderBy(asc(importDocument.id));
  const rows = await context.tx
    .select()
    .from(stagedRow)
    .where(eq(stagedRow.batchId, batch.id))
    .orderBy(asc(stagedRow.sheet), asc(stagedRow.rowNumber));
  const outcomes = await context.tx
    .select()
    .from(importOutcome)
    .where(eq(importOutcome.batchId, batch.id))
    .orderBy(asc(importOutcome.id));
  const handler = handlerOf(deps.handlers, batch);
  const documentViews: ImportBatchRead['documents'] = [];
  for (const document of documents) {
    const own = rows.filter((row) => row.documentId === document.id);
    const preview =
      document.state === 'Staged'
        ? await previewOf(context, handler, {
            documentId: document.id,
            reference: document.reference,
            rows: own.map((row) => ({
              stagedRowId: row.id,
              sheet: row.sheet,
              rowNumber: row.rowNumber,
              values: row.values,
            })),
          })
        : undefined;
    documentViews.push({
      documentId: document.id,
      reference: document.reference,
      state: document.state,
      rows: own.map(rowView),
      ...(preview === undefined ? {} : { preview }),
    });
  }
  return {
    asOf: context.startedAt.toISOString(),
    batch: {
      batchId: batch.id,
      code: batch.code,
      kind: batch.kind,
      target: batch.target,
      state: batch.state,
      storedFileId: batch.storedFileId,
      attachmentId: linked.id,
      layoutVersionId: batch.layoutVersionId,
      mappingVersionId: batch.mappingVersionId,
      restrictedClasses: batch.restrictedClasses,
      startedByUserId: batch.startedByUserId,
      startedAt: batch.startedAt.toISOString(),
      readerNotes: batch.readerNotes.map((note) => ({ ...note })),
    },
    documents: documentViews,
    ignoredRows: rows.filter((row) => row.documentId === null).map(rowView),
    outcomes: outcomes.map((outcome) => ({
      outcomeId: outcome.id,
      result: outcome.result,
      ...(outcome.refusalCode === null ? {} : { refusalCode: outcome.refusalCode }),
      attemptedAt: outcome.attemptedAt.toISOString(),
      attemptedByUserId: outcome.attemptedByUserId,
      counts: outcome.counts,
      documents: outcome.documents.map((document) => ({
        documentId: document.documentId,
        result: document.result,
        records: [...document.records],
        ...(document.refusalCode === undefined ? {} : { refusalCode: document.refusalCode }),
      })),
    })),
  };
}

/**
 * The layout versions with their mapping versions, by layout code and version (14 "Layouts and mapping rules in
 * force"). A layout is the Organisation's and holds no data, so whoever may view any import batch reads them.
 */
export async function layoutList(
  deps: Pick<ImportDependencies, 'access'>,
  context: TransactionContext,
  actorId: string,
): Promise<ImportLayoutList> {
  const authorised = await deps.access.authoriseEach(
    context,
    { actorId, action: 'view', recordType: IMPORT_BATCH_TYPE },
    [],
  );
  if (authorised.kind === 'refused') refuse(authorised.refusal.code, 'not-authorised', authorised.refusal.missing);
  const versions = await context.tx
    .select({
      layoutVersionId: layoutVersion.id,
      layoutCode: layout.code,
      source: layout.source,
      documentType: layout.documentType,
      version: layoutVersion.version,
      state: layoutVersion.state,
    })
    .from(layoutVersion)
    .innerJoin(layout, eq(layout.id, layoutVersion.layoutId))
    .orderBy(asc(layout.code), asc(layoutVersion.version));
  const mappings = await context.tx
    .select({
      layoutVersionId: mapping.layoutVersionId,
      mappingVersionId: mappingVersion.id,
      mappingCode: mapping.code,
      target: mapping.target,
      version: mappingVersion.version,
      state: mappingVersion.state,
    })
    .from(mappingVersion)
    .innerJoin(mapping, eq(mapping.id, mappingVersion.mappingId))
    .orderBy(asc(mapping.code), asc(mappingVersion.version));
  return {
    asOf: context.startedAt.toISOString(),
    layouts: versions.map((version) => ({
      ...version,
      mappings: mappings
        .filter((each) => each.layoutVersionId === version.layoutVersionId)
        .map((each) => ({
          mappingVersionId: each.mappingVersionId,
          mappingCode: each.mappingCode,
          target: each.target,
          version: each.version,
          state: each.state,
        })),
    })),
  };
}
