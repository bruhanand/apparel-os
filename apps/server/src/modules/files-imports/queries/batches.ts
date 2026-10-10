import {
  IMPORT_BATCH_TYPE,
  IMPORT_LAYOUT_TYPE,
  layoutStructureSchema,
  mappingFieldsSchema,
  type FieldClass,
  type ImportBatchRead,
  type ImportLayoutList,
  type MappingRuleList,
  type MissingItem,
  type RowIssue,
  type StagedRow,
  type StagedValueView,
} from '@apparel-os/schemas';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { ApiRefusal, type TransactionContext } from '../../../kernel/index.js';
import type { LatestRequest } from '../../access/index.js';
import {
  attachment,
  controlTotal,
  importDocument,
  importOutcome,
  layout,
  layoutVersion,
  mapping,
  mappingRule,
  mappingRuleVersion,
  mappingVersion,
  stagedRow,
} from '../db/schema.js';
import {
  BATCH_NOT_FOUND,
  enteredView,
  entriesOf,
  factsOfBatch,
  handlerOf,
  latestEntries,
  parsedOrDefect,
  previewOf,
  versionsOf,
  visibleBatch,
  type ImportDependencies,
} from '../commands/import-common.js';
import { currentIssues } from '../commands/review.js';
import { maskedColumn, maskPlan, maskRow, type MaskPlan } from '../domain/masking.js';
import type { EffectiveValue } from '../domain/report.js';

// Reads of imports (imports-and-opening-data 5, 8, 11, 13.1, 14; PRD-IMP-005, PRD-IMP-006, PRD-SEC-005, PRD-ACS-008;
// S1-F06-T01, S1-F06-T03): one batch with its documents, staged rows, preview, validation report and outcomes, masked
// for its reader; the layout versions with their mapping versions; and the mapping rules with their versions.

type StagedRowRecord = typeof stagedRow.$inferSelect;

function refuse(code: string, kind: 'not-found' | 'not-authorised', missing: readonly MissingItem[] = []): never {
  throw new ApiRefusal({ kind, code, missing: [...missing] });
}

function rowView(row: StagedRowRecord, values: Record<string, StagedValueView>): StagedRow {
  return {
    stagedRowId: row.id,
    sheet: row.sheet,
    rowNumber: row.rowNumber,
    role: row.role,
    hidden: row.hidden,
    cells: row.cells,
    values,
  };
}

/**
 * One batch as its reader may see it (section 11; PRD-SEC-005, PRD-ACS-008): row-level security shows it, and its
 * documents and rows, only within the reader's scope, so one outside it reads as not found; Authorise then checks view
 * on it with its facts. A cell or value of a class the reader's assignment does not grant is masked: while the layout
 * version is not Confirmed every column counts as holding every class, so a reader without every class the file holds
 * sees every cell masked. Each Staged document not excluded carries the handler's preview, worked out without writing
 * (13.2), shown only where nothing in it is masked.
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
  });
  if (authorised.kind === 'refused') refuse(authorised.refusal.code, 'not-authorised', authorised.refusal.missing);
  const restricted = await deps.access.restrictFields(
    context,
    { roleAssignmentId: authorised.roleAssignmentId, actorId, fieldClasses: batch.restrictedClasses },
    'view',
  );
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
  const versions = await versionsOf(context, batch);
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
  const header = rows.find((row) => row.role === 'header');
  const plan = maskPlan({
    layoutConfirmed: versions.layout.state === 'Confirmed',
    masked: restricted.masked,
    layout: versions.structure,
    mapping: versions.fields,
    header: (header?.cells ?? []).map((cell) => ({ column: cell.column, text: cell.text })),
  });
  const entries = latestEntries(await entriesOf(context, batch.id));
  const outcomes = await context.tx
    .select()
    .from(importOutcome)
    .where(eq(importOutcome.batchId, batch.id))
    .orderBy(asc(importOutcome.id));
  const handler = handlerOf(deps.handlers, batch);
  const referenceMasked = maskedColumn(plan, versions.structure.documentReference);
  const documentViews: ImportBatchRead['documents'] = [];
  for (const document of documents) {
    const own = rows.filter((row) => row.documentId === document.id);
    const effective = own.map((row) => {
      const values: Record<string, EffectiveValue> = { ...row.values };
      const views: Record<string, StagedValueView> = { ...row.values };
      for (const [field, entry] of entries.get(row.id) ?? []) {
        views[field] = enteredView(entry, row.values[field]);
        values[field] = { kind: 'entered', value: entry.value };
      }
      return { row, values, views };
    });
    const preview =
      document.state === 'Staged' && !document.excluded && plan.kind !== 'all'
        ? await previewOf(context, handler, {
            documentId: document.id,
            reference: document.reference,
            rows: effective.map(({ row, values }) => ({
              stagedRowId: row.id,
              sheet: row.sheet,
              rowNumber: row.rowNumber,
              values,
            })),
          })
        : undefined;
    documentViews.push({
      documentId: document.id,
      reference: referenceMasked === undefined ? document.reference : '',
      ...(referenceMasked === undefined ? {} : { referenceMasked }),
      state: document.state,
      excluded: document.excluded,
      rows: effective.map(({ row, views }) => maskRow(rowView(row, views), plan)),
      ...(preview === undefined || (plan.kind === 'columns' && plan.fields.size > 0) ? {} : { preview }),
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
      versionId: batch.versionId,
      ...(batch.submittedVersionId === null ? {} : { submittedVersionId: batch.submittedVersionId }),
      review: handler.review,
      storedFileId: batch.storedFileId,
      attachmentId: linked.id,
      layoutVersionId: batch.layoutVersionId,
      layoutState: versions.layout.state,
      mappingVersionId: batch.mappingVersionId,
      mappingState: versions.mapping.state,
      restrictedClasses: batch.restrictedClasses,
      maskedClasses: restricted.masked,
      startedByUserId: batch.startedByUserId,
      startedAt: batch.startedAt.toISOString(),
      sheets: batch.sheets.map((sheet) => ({ ...sheet })),
      readerNotes: batch.readerNotes.map((note) => ({ ...note })),
    },
    documents: documentViews,
    ignoredRows: rows
      .filter((row) => row.documentId === null)
      .map((row) => (row.role === 'header' ? rowView(row, {}) : maskRow(rowView(row, {}), plan))),
    ...(await reportView(context, batch, plan)),
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

/** The original value of an issue, masked where its column's class is masked for the reader (8.1, section 11). */
function originalOf(original: string | null, fieldClass: FieldClass | null, plan: MaskPlan): RowIssue['original'] {
  if (original === null) return undefined;
  if (plan.kind === 'all') return { kind: 'masked', fieldClass: plan.fieldClass };
  if (plan.kind === 'columns' && fieldClass !== null && [...plan.names.values()].includes(fieldClass)) {
    return { kind: 'masked', fieldClass };
  }
  return { kind: 'value', text: original };
}

/** The validation report of the batch's current version (8.1, 8.2), from its last validation run. */
async function reportView(
  context: TransactionContext,
  batch: { id: string; versionId: string },
  plan: MaskPlan,
): Promise<Pick<ImportBatchRead, 'report'>> {
  const issues = await currentIssues(context, batch);
  const [last] = await context.tx
    .select()
    .from(controlTotal)
    .where(and(eq(controlTotal.batchId, batch.id), eq(controlTotal.batchVersionId, batch.versionId)))
    .orderBy(desc(controlTotal.runAt))
    .limit(1);
  const runAt = issues[0]?.runAt ?? last?.runAt;
  if (runAt === undefined) return {};
  const totals = await context.tx
    .select()
    .from(controlTotal)
    .where(
      and(
        eq(controlTotal.batchId, batch.id),
        eq(controlTotal.batchVersionId, batch.versionId),
        eq(controlTotal.runAt, runAt),
      ),
    )
    .orderBy(asc(controlTotal.rowNumber));
  const count = (severity: string) => issues.filter((issue) => issue.severity === severity).length;
  return {
    report: {
      runAt: runAt.toISOString(),
      batchVersionId: batch.versionId,
      issues: issues.map((issue) => {
        const original = originalOf(issue.original, issue.restrictedClass, plan);
        return {
          issueId: issue.id,
          class: issue.class,
          severity: issue.severity,
          code: issue.code,
          correction: issue.correction,
          rule: issue.rule,
          ...(issue.documentId === null ? {} : { documentId: issue.documentId }),
          ...(issue.stagedRowId === null ? {} : { stagedRowId: issue.stagedRowId }),
          ...(issue.sheet === null ? {} : { sheet: issue.sheet }),
          ...(issue.rowNumber === null ? {} : { rowNumber: issue.rowNumber }),
          ...(issue.columnLetters === null ? {} : { column: issue.columnLetters }),
          ...(issue.field === null ? {} : { field: issue.field }),
          ...(original === undefined ? {} : { original }),
          missing: issue.missing,
          ...(issue.seenByUserId === null || issue.seenAt === null
            ? {}
            : { seen: { byUserId: issue.seenByUserId, at: issue.seenAt.toISOString() } }),
        };
      }),
      controlTotals: totals.map((total) => {
        const masked = plan.kind === 'all' || maskedColumn(plan, total.columnName) !== undefined;
        return {
          sheet: total.sheet,
          rowNumber: total.rowNumber,
          column: total.columnName,
          reported: masked ? null : total.reported,
          summed: masked ? null : total.summed,
          agrees: masked || total.reported === null || total.summed === null ? null : total.reported === total.summed,
        };
      }),
      counts: {
        blocking: count('Blocking'),
        warnings: count('Warning'),
        warningsNotSeen: issues.filter((issue) => issue.severity === 'Warning' && issue.seenByUserId === null).length,
        notes: count('Note'),
      },
    },
  };
}

/**
 * Whoever may view any import batch, or any layout, reads the layouts (14 "Layouts and mapping rules in force"): a
 * layout is the Organisation's and holds no data.
 */
async function mayReadLayouts(deps: Pick<ImportDependencies, 'access'>, context: TransactionContext, actorId: string) {
  for (const recordType of [IMPORT_BATCH_TYPE, IMPORT_LAYOUT_TYPE]) {
    const authorised = await deps.access.authoriseEach(context, { actorId, action: 'view', recordType }, []);
    if (authorised.kind !== 'refused') return;
    if (recordType === IMPORT_LAYOUT_TYPE) {
      refuse(authorised.refusal.code, 'not-authorised', authorised.refusal.missing);
    }
  }
}

const decided = (
  row: { id: string; decidedByUserId: string | null; decidedAt: Date | null },
  requests: ReadonlyMap<string, LatestRequest>,
) => {
  const request = requests.get(row.id);
  return {
    ...(row.decidedByUserId === null ? {} : { decidedByUserId: row.decidedByUserId }),
    ...(row.decidedAt === null ? {} : { decidedAt: row.decidedAt.toISOString() }),
    ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
  };
};

/**
 * The layout versions with their mapping versions, by layout code and version, each with its structure or fields, its
 * proposer and its decision (14 "Layouts and mapping rules in force").
 */
export async function layoutList(
  deps: Pick<ImportDependencies, 'access'>,
  context: TransactionContext,
  actorId: string,
): Promise<ImportLayoutList> {
  await mayReadLayouts(deps, context, actorId);
  const versions = await context.tx
    .select({ version: layoutVersion, layout })
    .from(layoutVersion)
    .innerJoin(layout, eq(layout.id, layoutVersion.layoutId))
    .orderBy(asc(layout.code), asc(layoutVersion.version));
  const mappings = await context.tx
    .select({ version: mappingVersion, mapping })
    .from(mappingVersion)
    .innerJoin(mapping, eq(mapping.id, mappingVersion.mappingId))
    .orderBy(asc(mapping.code), asc(mappingVersion.version));
  const requests = await deps.access.approvalRequestsOf(context, [
    ...versions.map((row) => row.version.id),
    ...mappings.map((row) => row.version.id),
  ]);
  return {
    asOf: context.startedAt.toISOString(),
    layouts: versions.map((row) => ({
      layoutId: row.layout.id,
      layoutVersionId: row.version.id,
      layoutCode: row.layout.code,
      source: row.layout.source,
      documentType: row.layout.documentType,
      kinds: row.layout.kinds as ImportLayoutList['layouts'][number]['kinds'],
      version: row.version.version,
      state: row.version.state,
      proposedByUserId: row.version.proposedByUserId,
      ...decided(row.version, requests),
      structure: parsedOrDefect(layoutStructureSchema, row.version.structure, 'layout version'),
      mappings: mappings
        .filter((each) => each.mapping.layoutVersionId === row.version.id)
        .map((each) => ({
          mappingId: each.mapping.id,
          mappingVersionId: each.version.id,
          mappingCode: each.mapping.code,
          target: each.mapping.target,
          version: each.version.version,
          state: each.version.state,
          proposedByUserId: each.version.proposedByUserId,
          ...decided(each.version, requests),
          fields: parsedOrDefect(mappingFieldsSchema, each.version.fields, 'mapping version'),
        })),
    })),
  };
}

/** A daterange's first day and the day after its last, as Postgres writes it: `[2026-10-10,2026-11-01)`. */
function datesOf(range: string): { validFrom: string; validTo?: string } {
  const match = /^\[([0-9-]+),([0-9-]*)\)$/.exec(range);
  const from = match?.[1] ?? '';
  const to = match?.[2] ?? '';
  return { validFrom: from, ...(to === '' ? {} : { validTo: to }) };
}

/** The mapping rules with their versions, proposers and confirmers, each marked in force today (14). */
export async function mappingRuleList(
  deps: Pick<ImportDependencies, 'access'>,
  context: TransactionContext,
  today: string,
): Promise<MappingRuleList> {
  const rules = await context.tx.select().from(mappingRule).orderBy(asc(mappingRule.attribute), asc(mappingRule.word));
  const versions = await context.tx.select().from(mappingRuleVersion).orderBy(asc(mappingRuleVersion.id));
  const requests = await deps.access.approvalRequestsOf(
    context,
    versions.map((version) => version.id),
  );
  return {
    asOf: context.startedAt.toISOString(),
    rules: rules.map((rule) => ({
      ruleId: rule.id,
      attribute: rule.attribute,
      scope:
        rule.scopeKind === 'organisation' || rule.scopeId === null
          ? { kind: 'organisation' as const }
          : { kind: rule.scopeKind, id: rule.scopeId },
      word: rule.word,
      caseSensitive: rule.caseSensitive,
      versions: versions
        .filter((version) => version.mappingRuleId === rule.id)
        .map((version) => {
          const dates = datesOf(version.validDuring);
          return {
            ruleVersionId: version.id,
            target: version.target,
            ...dates,
            inForce:
              version.state === 'Confirmed' &&
              dates.validFrom <= today &&
              (dates.validTo === undefined || today < dates.validTo),
            state: version.state,
            proposedByUserId: version.proposedByUserId,
            ...decided(version, requests),
          };
        }),
    })),
  };
}
