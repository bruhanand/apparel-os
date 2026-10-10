import { uuidv7 } from '@apparel-os/domain';
import { IMPORT_BATCH_TYPE, type FieldClass, type StartImportRequest } from '@apparel-os/schemas';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import {
  ApiRefusal,
  CommandDefect,
  LOCK_STEP,
  scopeFactsOf,
  type CommandOutcome,
  type CommandRefusal,
  type IdempotentAnswer,
  type JsonValue,
  type ReplayAuthorisation,
  type RequestContent,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { ImportHandler } from '../contracts/import-handlers.js';
import { openReceiptText } from '../domain/receipt-seal.js';
import { attach } from './attach.js';
import {
  fileReceipt,
  importBatch,
  importDocument,
  layout as layoutTable,
  layoutVersion,
  mapping,
  mappingVersion,
  stagedRow,
  storedFile,
} from '../db/schema.js';
import { IMPORT_BATCH_KIND, IMPORT_BATCH_SCOPE_KEY, MISSING_BATCH_SERIES } from '../domain/batch-code.js';
import { contentHashOf, openFile } from '../domain/file-seal.js';
import type { Grid, GridNote } from '../domain/grid.js';
import type { RuleInForce } from '../domain/rules.js';
import { stage, type SheetSummary, type StagedDocumentDraft, type StagedRowDraft } from '../domain/staging.js';
import { fileStoreNotConfigured } from '../file-store/file-store.js';
import { readXlsx } from '../readers/xlsx-reader.js';
import {
  classesHeld,
  layoutStructureSchema,
  mappingFieldsSchema,
  parsedOrDefect,
  publishedDocument,
  revisesPublished,
  scopeColumnsOf,
  type ImportActor,
  type ImportDependencies,
} from './import-common.js';
import { rulesInForce } from './proposals.js';

// Start an import, with Map and stage (imports-and-opening-data 3.1 steps 3 to 5, 13.1, 15.1; PRD-IMP-003,
// PRD-IMP-006, PRD-IMP-010; GC9-9; S1-F06-T01).
//
// In this order, so no outside call runs inside a transaction (code-house-rules 8.3): a read of the stored file, its
// receipt, the layout and mapping versions and the target's handler; the object fetched, decrypted and checked
// against its hash; the workbook read into the grid and staged in memory, with the Confirmed mapping rules in force
// today in the batch's scopes (6.3); then one transaction that holds the authority, takes the batch code series,
// allocates the code, writes the batch, its documents and staged rows with its scope facts, links the file to the
// batch, and records the audit record. A Proposed layout or mapping version may stage and preview a batch; a Rejected
// one never (6.4). The work runs in the request; a large file staged as a job on the worker (3.3) comes later.

export interface StartImportInput {
  readonly actor: ImportActor;
  readonly key: string;
  readonly content: RequestContent;
  readonly body: StartImportRequest;
}

const COMMAND = 'files-imports.start-import';

function refuse(refusal: CommandRefusal<string>): never {
  throw new ApiRefusal({
    kind: refusal.kind as 'not-found' | 'refused' | 'unavailable',
    code: refusal.code,
    missing: [...refusal.missing],
  });
}

/**
 * The file must be an XLSX file this person handed in, under the receipt named (13.1). Starting an import on a file
 * someone else handed in would let its content be staged and shown outside the receipt's own hand-in.
 */
export async function handedInFile(
  context: TransactionContext,
  userId: string,
  storedFileId: string,
  fileReceiptId: string,
): Promise<{ readonly objectKey: string; readonly contentHash: string; readonly scheme: string }> {
  const [file] = await context.tx
    .select({
      objectKey: storedFile.objectKey,
      contentHash: storedFile.contentHash,
      scheme: storedFile.encryptionScheme,
      format: storedFile.format,
    })
    .from(storedFile)
    .innerJoin(fileReceipt, eq(fileReceipt.storedFileId, storedFile.id))
    .where(
      and(
        eq(storedFile.id, storedFileId),
        eq(fileReceipt.id, fileReceiptId),
        eq(fileReceipt.receivedByKind, 'user'),
        eq(fileReceipt.receivedById, userId),
      ),
    );
  if (file?.format !== 'xlsx') refuse({ kind: 'not-found', code: 'files-imports.import-file-not-found', missing: [] });
  return { objectKey: file.objectKey, contentHash: file.contentHash, scheme: file.scheme };
}

interface Planned {
  readonly objectKey: string;
  readonly contentHash: string;
  readonly scheme: string;
  readonly layoutState: string;
  readonly classes: FieldClass[];
  readonly layout: ReturnType<typeof layoutStructureSchema.parse>;
  readonly mapping: ReturnType<typeof mappingFieldsSchema.parse>;
  readonly layoutId: string;
  readonly rules: readonly RuleInForce[];
}

/** The read before any outside call: what the request names, as this person may use it. */
async function plan(deps: ImportDependencies, input: StartImportInput): Promise<Planned> {
  const { body } = input;
  return deps.runner.read(
    {
      commandName: COMMAND,
      organisation: input.actor.organisation,
      correlationId: input.actor.correlationId,
      actor: { kind: 'actor', actorId: input.actor.userId },
    },
    async (context) => {
      const file = await handedInFile(context, input.actor.userId, body.storedFileId, body.fileReceiptId);
      const [versions] = await context.tx
        .select({
          layoutId: layoutTable.id,
          layoutState: layoutVersion.state,
          mappingState: mappingVersion.state,
          structure: layoutVersion.structure,
          fields: mappingVersion.fields,
        })
        .from(mappingVersion)
        .innerJoin(mapping, eq(mapping.id, mappingVersion.mappingId))
        .innerJoin(layoutVersion, eq(layoutVersion.id, mapping.layoutVersionId))
        .innerJoin(layoutTable, eq(layoutTable.id, layoutVersion.layoutId))
        .where(
          and(
            eq(mappingVersion.id, body.mappingVersionId),
            eq(layoutVersion.id, body.layoutVersionId),
            eq(mapping.target, body.target),
          ),
        );
      if (versions === undefined) refuse({ kind: 'not-found', code: 'files-imports.layout-not-found', missing: [] });
      // A Rejected version never stages a batch (6.4).
      if (versions.layoutState === 'Rejected' || versions.mappingState === 'Rejected') {
        refuse({ kind: 'refused', code: 'files-imports.layout-version-rejected', missing: [] });
      }
      const handler = deps.handlers.for(body.target, body.kind);
      if (handler === undefined) {
        refuse({
          kind: 'refused',
          code: 'files-imports.no-import-handler',
          missing: [{ kind: 'import-handler', target: body.target, importKind: body.kind }],
        });
      }
      await refuseRepeat(deps, context, input, handler, versions.layoutId);
      const layout = parsedOrDefect(layoutStructureSchema, versions.structure, 'layout version');
      const date = await context.businessDate();
      if (date.kind !== 'set') {
        refuse({
          kind: 'unavailable',
          code: 'access.business-date-not-set',
          missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
        });
      }
      return {
        layoutId: versions.layoutId,
        rules: await rulesInForce(context, date.date),
        objectKey: file.objectKey,
        contentHash: file.contentHash,
        scheme: file.scheme,
        layoutState: versions.layoutState,
        classes: classesHeld(versions.layoutState, layout),
        layout,
        mapping: parsedOrDefect(mappingFieldsSchema, versions.fields, 'mapping version'),
      };
    },
  );
}

/**
 * Duplicate control at the start (7.2, 13.1; PRD-IMP-011; S1-F06-T04). The same file starts a new batch for the same
 * target and layout only if every earlier such batch Failed; the refusal names the earlier batches the person may see.
 * And a document reference the uploader claimed at the hand-in, already published for the target, is refused, unless
 * the batch is a governed revision of it (7.3). Both are checked whatever the person's scope sees, since a source
 * identity is one across the Organisation; validation checks each document the file holds, and publishing checks again
 * under the lock, behind which the unique index is the last guard.
 */
async function refuseRepeat(
  deps: ImportDependencies,
  context: TransactionContext,
  input: StartImportInput,
  handler: ImportHandler,
  layoutId: string,
): Promise<void> {
  const { body } = input;
  const open = await context.tx.execute<{ open: boolean }>(
    sql`select files_imports.file_in_open_batch(${body.storedFileId}, ${body.target}, ${layoutId}) as open`,
  );
  if (open.rows[0]?.open === true) {
    const earlier = await context.tx
      .select({ batchId: importBatch.id, code: importBatch.code, state: importBatch.state })
      .from(importBatch)
      .innerJoin(layoutVersion, eq(layoutVersion.id, importBatch.layoutVersionId))
      .where(
        and(
          eq(importBatch.storedFileId, body.storedFileId),
          eq(importBatch.target, body.target),
          eq(layoutVersion.layoutId, layoutId),
          ne(importBatch.state, 'Failed'),
        ),
      )
      .orderBy(asc(importBatch.code));
    refuse({
      kind: 'refused',
      code: 'files-imports.file-already-imported',
      missing: earlier.map((batch) => ({
        kind: 'import-batch',
        batchId: batch.batchId,
        code: batch.code,
        state: batch.state,
      })),
    });
  }
  const [receipt] = await context.tx
    .select({ sealed: fileReceipt.claimedReferenceSealed, scheme: fileReceipt.encryptionScheme })
    .from(fileReceipt)
    .where(eq(fileReceipt.id, body.fileReceiptId));
  if (receipt?.sealed === null || receipt === undefined) return;
  const reference = openReceiptText(
    deps.keys,
    input.actor.organisation.organisationCode,
    body.fileReceiptId,
    'claimed-reference',
    {
      scheme: receipt.scheme,
      ciphertext: receipt.sealed,
    },
  );
  const published = await publishedDocument(context, {
    target: body.target,
    scopeKey: handler.sourceScope({ reference, rows: [] }),
    reference,
  });
  if (published !== undefined && !revisesPublished(handler, { kind: body.kind })) {
    refuse({
      kind: 'refused',
      code: 'files-imports.document-already-published',
      missing: [{ kind: 'import-document', documentId: published.documentId }],
    });
  }
}

interface StagedFile {
  readonly documents: readonly StagedDocumentDraft[];
  readonly others: readonly StagedRowDraft[];
  readonly sheets: readonly SheetSummary[];
  readonly notes: readonly GridNote[];
}

/** The stored workbook, fetched, decrypted, checked against its hash and read into the grid (9.1; 8.3). */
export async function storedGrid(
  deps: ImportDependencies,
  organisationCode: string,
  file: { readonly objectKey: string; readonly contentHash: string; readonly scheme: string },
): Promise<Grid> {
  if (deps.fileStore.kind === 'not-configured') throw fileStoreNotConfigured();
  const sealed = await deps.fileStore.store.get(file.objectKey);
  const bytes = openFile(deps.keys, organisationCode, file.contentHash, file.scheme, sealed);
  if (contentHashOf(bytes) !== file.contentHash) throw new CommandDefect('A stored file does not match its hash');
  const read = await readXlsx(bytes);
  if (read.kind === 'unreadable') refuse({ kind: 'refused', code: 'files-imports.file-unreadable', missing: [] });
  return read.grid;
}

/** Fetches, decrypts, checks, reads and stages the file, outside any transaction (code-house-rules 8.3). */
async function staged(deps: ImportDependencies, input: StartImportInput, planned: Planned): Promise<StagedFile> {
  const grid = await storedGrid(deps, input.actor.organisation.organisationCode, planned);
  const source = input.body.source ?? {};
  const result = stage(grid, planned.layout, planned.mapping, {
    target: input.body.target,
    rules: planned.rules,
    scopes: { layoutId: planned.layoutId, supplierId: source.supplierId, brandId: source.brandId },
  });
  if (result.kind === 'refused') refuse({ kind: 'refused', code: result.code, missing: [...result.missing] });
  return { documents: result.documents, others: result.others, sheets: result.sheets, notes: grid.notes };
}

export async function startImport(
  deps: ImportDependencies,
  input: StartImportInput,
): Promise<IdempotentAnswer<JsonValue>> {
  const planned = await plan(deps, input);
  const file = await staged(deps, input, planned);
  const scope = input.body.scope ?? {};
  const need = { action: 'create' as const, recordType: IMPORT_BATCH_TYPE, facts: scope };
  const authoriseReplay: ReplayAuthorisation = async (context) => {
    const authorised = await deps.access.authorise(context, { actorId: input.actor.userId, ...need });
    if (authorised.kind === 'allowed') return { kind: 'allowed' };
    return {
      kind: 'refused',
      refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
    };
  };
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
      authoriseReplay,
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        // Authorise with the batch's scope facts, then hold it at step 0 (access-and-approvals 7.1 steps 3 and 4).
        const authorised = await deps.access.authorise(context, { actorId: input.actor.userId, ...need });
        if (authorised.kind === 'refused') {
          return { kind: 'refusal', refusal: authorised.refusal, causedBySecret: false };
        }
        const held = await deps.access.holdAuthority(
          context,
          { kind: 'user', id: input.actor.userId },
          authorised.roleAssignmentId,
          need,
        );
        if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
        return record(deps, context, input, planned, file, authorised.roleAssignmentId);
      },
    },
  );
}

/** Takes the batch code series at step 8, or the refusal while none is Open: unavailable, naming it (GC9-9). */
async function seriesHeld(
  deps: ImportDependencies,
  context: TransactionContext,
): Promise<{ readonly seriesId: string } | CommandRefusal> {
  const series = await deps.numbering.liveSeries(context, {
    kind: IMPORT_BATCH_KIND.kind,
    scopeKey: IMPORT_BATCH_SCOPE_KEY,
  });
  if (series === undefined) {
    return {
      kind: 'unavailable',
      code: 'files-imports.no-import-batch-series',
      missing: [{ ...MISSING_BATCH_SERIES }],
    };
  }
  if (series.state === 'Paused') {
    return {
      kind: 'unavailable',
      code: 'files-imports.import-batch-series-paused',
      missing: [{ ...MISSING_BATCH_SERIES }],
    };
  }
  await context.lock(LOCK_STEP.numberSeries, [deps.numbering.seriesLockTarget(series.seriesId)]);
  return { seriesId: series.seriesId };
}

async function record(
  deps: ImportDependencies,
  context: TransactionContext,
  input: StartImportInput,
  planned: Planned,
  file: StagedFile,
  roleAssignmentId: string,
): Promise<CommandOutcome<JsonValue>> {
  const { body } = input;
  const held = await seriesHeld(deps, context);
  if ('code' in held) return { kind: 'refusal', refusal: held, causedBySecret: false };
  const batchId = uuidv7();
  const allocated = await deps.numbering.allocate(context, {
    seriesId: held.seriesId,
    documentType: IMPORT_BATCH_TYPE,
    documentId: batchId,
  });
  if (allocated.kind === 'refused') {
    if (allocated.refusal.code === 'numbering.series-paused') {
      return {
        kind: 'refusal',
        refusal: {
          kind: 'unavailable',
          code: 'files-imports.import-batch-series-paused',
          missing: [{ ...MISSING_BATCH_SERIES }],
        },
        causedBySecret: false,
      };
    }
    // Used up, or anything else on the live series the command holds: no code can be given (numbering-and-audit 3.5).
    return {
      kind: 'refusal',
      refusal: {
        kind: 'unavailable',
        code: 'files-imports.no-import-batch-series',
        missing: [{ ...MISSING_BATCH_SERIES }],
      },
      causedBySecret: false,
    };
  }
  const scope = body.scope ?? {};
  const columns = scopeColumnsOf({
    legalEntityId: scope.legalEntityId ?? null,
    siteId: scope.siteId ?? null,
    storeId: scope.storeId ?? null,
    businessUnitId: scope.businessUnitId ?? null,
  });
  await context.tx.insert(importBatch).values({
    id: batchId,
    code: allocated.value.formattedText,
    kind: body.kind,
    target: body.target,
    state: 'Staged',
    storedFileId: body.storedFileId,
    fileReceiptId: body.fileReceiptId,
    layoutVersionId: body.layoutVersionId,
    mappingVersionId: body.mappingVersionId,
    restrictedClasses: planned.classes,
    readerNotes: [...file.notes],
    startedByUserId: input.actor.userId,
    startedAt: context.startedAt,
    ...columns,
    versionId: uuidv7(),
    submittedVersionId: null,
    sheets: [...file.sheets],
    sourceSupplierId: body.source?.supplierId ?? null,
    sourceBrandId: body.source?.brandId ?? null,
  });
  const rows: (typeof stagedRow.$inferInsert)[] = [];
  const asRow = (row: StagedRowDraft, documentId: string | null) => ({
    id: uuidv7(),
    batchId,
    documentId,
    sheet: row.sheet,
    rowNumber: row.rowNumber,
    role: row.role,
    hidden: row.hidden,
    cells: [...row.cells],
    values: { ...row.values },
    ...columns,
  });
  const handler = deps.handlers.for(body.target, body.kind);
  if (handler === undefined) throw new CommandDefect(`No import handler is registered for ${body.target}`);
  for (const document of file.documents) {
    const documentId = uuidv7();
    // Its source identity (7.1): the target, the scope key its handler names and the reference.
    await context.tx.insert(importDocument).values({
      id: documentId,
      batchId,
      reference: document.reference,
      state: 'Staged',
      excluded: false,
      target: body.target,
      scopeKey: handler.sourceScope({ reference: document.reference, rows: [] }),
      ...columns,
    });
    for (const row of document.rows) rows.push(asRow(row, documentId));
  }
  for (const row of file.others) rows.push(asRow(row, null));
  // Staging writes rows in sets (9.4).
  const SET = 500;
  for (let at = 0; at < rows.length; at += SET) await context.tx.insert(stagedRow).values(rows.slice(at, at + SET));
  // The file is read through its batch: served only to a reader whose assignment covers the batch's scope and every
  // class the file is held to carry (section 11).
  const facts = scopeFactsOf(scope);
  const attached = await attach(context, deps.audit, {
    storedFileId: body.storedFileId,
    fileReceiptId: body.fileReceiptId,
    record: { module: 'files-imports', type: IMPORT_BATCH_TYPE, id: batchId },
    evidence: { kind: 'import-original', restrictedClasses: planned.classes },
    scope: facts,
    attachedBy: { kind: 'user', id: input.actor.userId },
    roleAssignmentId,
  });
  const dataRows = file.documents.reduce((total, document) => total + document.rows.length, 0);
  await deps.audit.record(context, {
    actor: { kind: 'user', id: input.actor.userId },
    roleAssignmentId,
    scope: facts,
    record: { module: 'files-imports', type: IMPORT_BATCH_TYPE, id: batchId },
    operation: 'start-import',
    changes: [
      { kind: 'value', field: 'code', before: null, after: allocated.value.formattedText },
      { kind: 'value', field: 'kind', before: null, after: body.kind },
      { kind: 'value', field: 'target', before: null, after: body.target },
      { kind: 'value', field: 'storedFileId', before: null, after: body.storedFileId },
      { kind: 'value', field: 'layoutVersionId', before: null, after: body.layoutVersionId },
      { kind: 'value', field: 'mappingVersionId', before: null, after: body.mappingVersionId },
      { kind: 'value', field: 'attachmentId', before: null, after: attached.attachmentId },
      { kind: 'value', field: 'state', before: null, after: 'Staged' },
    ],
    source: { kind: 'screen' },
    idempotencyKey: input.key,
  });
  return {
    kind: 'success',
    answer: {
      batchId,
      code: allocated.value.formattedText,
      state: 'Staged',
      documentCount: file.documents.length,
      rowCount: dataRows + file.others.length,
    },
    shows: 'nothing',
  };
}
