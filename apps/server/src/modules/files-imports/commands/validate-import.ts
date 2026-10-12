import { uuidv7 } from '@apparel-os/domain';
import { IMPORT_BATCH_TYPE, type DocumentPreview } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import {
  insertInParts,
  LOCK_STEP,
  lockTable,
  type CommandOutcome,
  type IdempotentAnswer,
  type JsonValue,
  type ReplayAuthorisation,
  type RequestContent,
  type TransactionContext,
} from '../../../kernel/index.js';
import { controlTotal, importBatch, layout, mapping, rowIssue } from '../db/schema.js';
import { checkedForPublishing, validationReport, type Report } from '../domain/report.js';
import {
  BATCH_NOT_FOUND,
  documentsOf,
  factsOfBatch,
  handlerOf,
  identityOf,
  previewOf,
  scopeColumnsOf,
  stagedRowsOf,
  versionsOf,
  visibleBatch,
  type BatchRow,
  type ImportActor,
  type ImportDependencies,
  type LoadedDocument,
} from './import-common.js';

// Validate and preview (imports-and-opening-data 3.1 steps 6 and 7, 3.2, 8, 13.1, 13.2; PRD-IMP-005, PRD-IMP-007,
// PRD-IMP-013, PRD-MOD-015; S1-F06-T01, S1-F06-T03): the target's handler works out what each document would create,
// without writing, and the validation report is worked out for the batch version and kept: its row issues, each with
// its class, severity, place, original value, correction and rule, and its control totals. The batch is Validated when
// no Blocking issue is found and a document is left to publish; otherwise it stays Staged. An excluded document is
// neither previewed nor checked. With S1-F06-T04, each document is checked against the published document of its
// source identity (7.2): a duplicate is a Note and has no effect, a conflict is Blocking, and a governed revision of an
// update batch is a Note naming what it revises (PRD-IMP-011, PRD-ACP-012).

export interface BatchStepInput {
  readonly actor: ImportActor;
  readonly batchId: string;
  readonly key: string;
  readonly content: RequestContent;
}

const COMMAND = 'files-imports.validate-import';
export const BATCH_LOCK = lockTable('files_imports', 'import_batch');

/** A replay's access check: edit on the batch now, with its facts, as the step itself needs (code-house-rules 12.4). */
export function batchReplayAuthorisation(
  deps: ImportDependencies,
  input: { actor: ImportActor; batchId: string },
): ReplayAuthorisation {
  return async (context) => {
    const batch = await visibleBatch(context, input.batchId);
    if (batch === undefined) return { kind: 'refused', refusal: BATCH_NOT_FOUND };
    const authorised = await deps.access.authorise(context, {
      actorId: input.actor.userId,
      action: 'edit',
      recordType: IMPORT_BATCH_TYPE,
      facts: factsOfBatch(batch),
    });
    if (authorised.kind === 'allowed') return { kind: 'allowed' };
    return {
      kind: 'refused',
      refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
    };
  };
}

/**
 * The common start of a batch step (access-and-approvals 7.1; code-house-rules 8.2): the batch as the actor may see
 * it, edit on it authorised with its facts and held at step 0, then the batch locked at step 1 with any rows the step
 * names, and read again under the lock.
 */
export async function heldBatch(
  deps: ImportDependencies,
  context: TransactionContext,
  input: { actor: ImportActor; batchId: string },
  more: (batch: BatchRow) => Promise<{ table: ReturnType<typeof lockTable>; id: string; mode: 'exclusive' }[]> = () =>
    Promise.resolve([]),
): Promise<
  { kind: 'held'; batch: BatchRow; roleAssignmentId: string } | { kind: 'refusal'; outcome: CommandOutcome<JsonValue> }
> {
  const found = await visibleBatch(context, input.batchId);
  if (found === undefined) {
    return { kind: 'refusal', outcome: { kind: 'refusal', refusal: BATCH_NOT_FOUND, causedBySecret: false } };
  }
  const need = { action: 'edit' as const, recordType: IMPORT_BATCH_TYPE, facts: factsOfBatch(found) };
  const authorised = await deps.access.authorise(context, { actorId: input.actor.userId, ...need });
  if (authorised.kind === 'refused') {
    return { kind: 'refusal', outcome: { kind: 'refusal', refusal: authorised.refusal, causedBySecret: false } };
  }
  const held = await deps.access.holdAuthority(
    context,
    { kind: 'user', id: input.actor.userId },
    authorised.roleAssignmentId,
    need,
  );
  if (held !== undefined)
    return { kind: 'refusal', outcome: { kind: 'refusal', refusal: held, causedBySecret: false } };
  await context.lock(LOCK_STEP.document, [
    { table: BATCH_LOCK, id: found.id, mode: 'exclusive' },
    ...(await more(found)),
  ]);
  // Rechecked under the lock (code-house-rules 8.2).
  const batch = await visibleBatch(context, input.batchId);
  if (batch === undefined) {
    return { kind: 'refusal', outcome: { kind: 'refusal', refusal: BATCH_NOT_FOUND, causedBySecret: false } };
  }
  return { kind: 'held', batch, roleAssignmentId: authorised.roleAssignmentId };
}

/**
 * The version token (code-house-rules 12.7; PRD-ACS-007): a step made on a stale screen is refused under the batch's
 * lock, naming the current version and never the batch's content.
 */
export function staleBatchVersion(batch: BatchRow, versionId: string): CommandOutcome<JsonValue> | undefined {
  if (batch.versionId === versionId) return undefined;
  return {
    kind: 'refusal',
    refusal: {
      kind: 'conflict',
      code: 'kernel.stale-version',
      missing: [{ kind: 'version', recordType: IMPORT_BATCH_TYPE, recordId: batch.id, versionId: batch.versionId }],
    },
    causedBySecret: false,
  };
}

const NOTHING: DocumentPreview = { kind: 'would-create', records: [] };

/**
 * The validation report of a batch's current version, worked out without writing (8), with the batch's documents it
 * was worked out from. The staged rows are read once, in parts (`stagedRowsOf`), and the documents built from them.
 */
export async function reportOf(
  deps: ImportDependencies,
  context: TransactionContext,
  batch: BatchRow,
): Promise<{ report: Report; documents: LoadedDocument[] }> {
  const handler = handlerOf(deps.handlers, batch);
  const versions = await versionsOf(context, batch);
  const [names] = await context.tx
    .select({ layoutCode: layout.code, mappingCode: mapping.code })
    .from(layout)
    .innerJoin(mapping, eq(mapping.id, versions.mapping.mappingId))
    .where(eq(layout.id, versions.layout.layoutId));
  const rows = await stagedRowsOf(context, batch.id, 'all');
  const documents = await documentsOf(context, batch, rows);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const reportDocuments = [];
  for (const document of documents.filter((each) => each.state === 'Staged')) {
    // What it is against the published document of its source identity (7.2): a duplicate or a conflict never
    // publishes, so it is not previewed (S1-F06-T04).
    const identity = document.excluded ? undefined : (await identityOf(context, handler, batch, document)).finding;
    const checked = checkedForPublishing({
      excluded: document.excluded,
      ...(identity === undefined ? {} : { identity }),
    });
    reportDocuments.push({
      documentId: document.documentId,
      reference: document.reference,
      excluded: document.excluded,
      ...(identity === undefined ? {} : { identity }),
      preview: checked ? await previewOf(context, handler, document) : NOTHING,
      rows: document.rows.map((row) => ({
        stagedRowId: row.stagedRowId,
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        hidden: byId.get(row.stagedRowId)?.hidden ?? false,
        cells: byId.get(row.stagedRowId)?.cells ?? [],
        values: row.values,
      })),
    });
  }
  const report = validationReport({
    layoutName: `${names?.layoutCode ?? ''} v${String(versions.layout.version)}`,
    mappingName: `${names?.mappingCode ?? ''} v${String(versions.mapping.version)}`,
    target: batch.target,
    layout: versions.structure,
    mapping: versions.fields,
    fields: handler.fields,
    sheets: batch.sheets,
    documents: reportDocuments,
    others: rows
      .filter((row) => row.role !== 'data' && row.role !== 'ignored')
      .map((row) => ({
        stagedRowId: row.id,
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        hidden: row.hidden,
        role: row.role === 'ignored' ? 'filler' : row.role,
        cells: row.cells,
      })),
  });
  return { report, documents };
}

export async function validateImport(
  deps: ImportDependencies,
  input: BatchStepInput,
): Promise<IdempotentAnswer<JsonValue>> {
  return deps.helper.run(
    {
      commandName: COMMAND,
      organisation: input.actor.organisation,
      correlationId: input.actor.correlationId,
      actor: { kind: 'actor', actorId: input.actor.userId },
    },
    {
      key: input.key,
      content: input.content,
      authoriseReplay: batchReplayAuthorisation(deps, input),
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        const held = await heldBatch(deps, context, input);
        if (held.kind === 'refusal') return held.outcome;
        const { batch } = held;
        if (batch.state !== 'Staged') {
          return {
            kind: 'refusal',
            refusal: { kind: 'refused', code: 'files-imports.batch-not-staged', missing: [] },
            causedBySecret: false,
          };
        }
        const { report, documents } = await reportOf(deps, context, batch);
        const columns = scopeColumnsOf(batch);
        const kept = { batchId: batch.id, batchVersionId: batch.versionId, runAt: context.startedAt, ...columns };
        if (report.issues.length > 0) {
          await insertInParts(
            context,
            rowIssue,
            report.issues.map((issue) => ({
              id: uuidv7(),
              ...kept,
              documentId: issue.documentId ?? null,
              stagedRowId: issue.stagedRowId ?? null,
              sheet: issue.sheet ?? null,
              rowNumber: issue.rowNumber ?? null,
              columnLetters: issue.column ?? null,
              field: issue.field ?? null,
              class: issue.class,
              severity: issue.severity,
              code: issue.code,
              correction: issue.correction,
              rule: issue.rule,
              original: issue.original ?? null,
              restrictedClass: issue.restrictedClass ?? null,
              missing: issue.missing.map((item) => ({ ...item })),
            })),
          );
        }
        if (report.controlTotals.length > 0) {
          await insertInParts(
            context,
            controlTotal,
            report.controlTotals.map((total) => ({
              id: uuidv7(),
              ...kept,
              sheet: total.sheet,
              rowNumber: total.rowNumber,
              columnName: total.column,
              reported: total.reported,
              summed: total.summed,
            })),
          );
        }
        const blocking = report.issues.filter((issue) => issue.severity === 'Blocking').length;
        // A batch with every document excluded or a duplicate has nothing to publish; it stays Staged (3.2, 7.2).
        const duplicates = new Set(
          report.issues.filter((issue) => issue.class === 'duplicate').map((issue) => issue.documentId),
        );
        const anyDocument = documents.some(
          (each) => each.state === 'Staged' && !each.excluded && !duplicates.has(each.documentId),
        );
        const state = blocking === 0 && anyDocument ? 'Validated' : 'Staged';
        if (state === 'Validated') {
          await context.tx.update(importBatch).set({ state: 'Validated' }).where(eq(importBatch.id, batch.id));
        }
        await deps.audit.record(context, {
          actor: { kind: 'user', id: input.actor.userId },
          roleAssignmentId: held.roleAssignmentId,
          scope: factsOfBatch(batch),
          record: { module: 'files-imports', type: IMPORT_BATCH_TYPE, id: batch.id, versionId: batch.versionId },
          operation: 'validate-import',
          changes: [
            { kind: 'value', field: 'state', before: 'Staged', after: state },
            { kind: 'value', field: 'issues', before: null, after: report.issues.length },
            { kind: 'value', field: 'blocking', before: null, after: blocking },
          ],
          source: { kind: 'screen' },
          idempotencyKey: input.key,
        });
        return { kind: 'success', answer: { batchId: batch.id, state }, shows: 'nothing' };
      },
    },
  );
}
