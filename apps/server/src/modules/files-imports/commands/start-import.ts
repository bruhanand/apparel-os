import { uuidv7 } from '@apparel-os/domain';
import { IMPORT_BATCH_TYPE, type FieldClass, type StartImportRequest } from '@apparel-os/schemas';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import {
  ApiRefusal,
  CommandDefect,
  LOCK_STEP,
  lockTable,
  scopeFactsOf,
  type CommandOutcome,
  type CommandRefusal,
  type IdempotentAnswer,
  type JsonValue,
  type ReplayAuthorisation,
  type RequestContent,
  type TransactionContext,
} from '../../../kernel/index.js';
import { replayRefusal } from '../../access/index.js';
import type { ImportHandler, ImportNeed, ImportPlace } from '../contracts/import-handlers.js';
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
import { readWorkbook } from '../readers/workbook-read.js';
import {
  classesHeld,
  factsOfBatch,
  layoutStructureSchema,
  mappingFieldsSchema,
  parsedOrDefect,
  publishedDocument,
  revisesPublished,
  scopeColumnsOf,
  type ImportActor,
  type ImportDependencies,
} from './import-common.js';
import { cutoverRefusal } from './opening-gate.js';
import { rulesInForce } from './proposals.js';

// Start an import, with Map and stage (imports-and-opening-data 3.1 steps 3 to 5, 7.2, 13.1, 15.1; PRD-IMP-003,
// PRD-IMP-006, PRD-IMP-010; GC9-9; S1-F06-T01).
//
// In this order, so the person is authorised before any slow work (code-house-rules 8.1; module-map 6.1), no outside
// call runs inside a transaction (code-house-rules 8.3) and every refusal but an access refusal is answered under the
// request's key, after its replay (12.4 "Replay"; code review 10 of stage 2): Authorise, create on the batch with its
// scope facts, refusing access before anything else; a read of the stored file, its receipt, the layout and mapping
// versions, the target's handler and the duplicate checks; the object fetched, decrypted and checked against its hash;
// the workbook read into the grid and staged in memory, with the Confirmed mapping rules in force today in the batch's
// scopes (6.3); then one transaction under the key that authorises again and holds the authority at step 0, answers
// what the read refused, locks the stored file and the layout and mapping versions at step 1 and decides under those
// locks that neither version is Rejected (RR-503) and the duplicate control (7.2), then takes the batch code series at
// step 8, allocates the code, writes the batch, its documents and staged rows with its scope facts, links the file to
// the batch, and records the audit record. A read that finds the handler refusing a file for the record, or the file
// repeated, spares the staging; when the transaction finds that refusal no longer stands, the start is read and staged
// again and its transaction run again, once. A Proposed layout or mapping version may stage and preview a batch; a
// Rejected one never (6.4). The work runs in the request; a large file staged as a job on the worker (3.3) comes later.

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

/** An access refusal: the only refusal answered before the request's key, as it stops a replay too (12.4 "Replay"). */
function isAccessRefusal(refusal: CommandRefusal): boolean {
  return refusal.kind === 'not-authorised' || refusal.kind === 'not-found';
}

function refusalOf(refusal: CommandRefusal): CommandOutcome<JsonValue> {
  return { kind: 'refusal', refusal, causedBySecret: false };
}

const IMPORT_FILE_NOT_FOUND: CommandRefusal = {
  kind: 'not-found',
  code: 'files-imports.import-file-not-found',
  missing: [],
};
const LAYOUT_NOT_FOUND: CommandRefusal = { kind: 'not-found', code: 'files-imports.layout-not-found', missing: [] };
const LAYOUT_VERSION_REJECTED: CommandRefusal = {
  kind: 'refused',
  code: 'files-imports.layout-version-rejected',
  missing: [],
};

interface HandedInFile {
  readonly objectKey: string;
  readonly contentHash: string;
  readonly scheme: string;
}

/** The XLSX file this person handed in, under the receipt named, or undefined (13.1). */
async function fileHandedIn(
  context: TransactionContext,
  userId: string,
  storedFileId: string,
  fileReceiptId: string,
): Promise<HandedInFile | undefined> {
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
  if (file?.format !== 'xlsx') return undefined;
  return { objectKey: file.objectKey, contentHash: file.contentHash, scheme: file.scheme };
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
): Promise<HandedInFile> {
  const file = await fileHandedIn(context, userId, storedFileId, fileReceiptId);
  if (file === undefined) refuse(IMPORT_FILE_NOT_FOUND);
  return file;
}

interface Planned extends HandedInFile {
  readonly layoutState: string;
  readonly classes: readonly FieldClass[];
  readonly layout: ReturnType<typeof layoutStructureSchema.parse>;
  readonly mapping: ReturnType<typeof mappingFieldsSchema.parse>;
  readonly layoutId: string;
  readonly rules: readonly RuleInForce[];
  /** The batch's scope facts: the person's, or those of the record the batch is about (13.1). */
  readonly facts: ImportPlace;
  readonly subject?: { readonly recordType: string; readonly recordId: string };
}

interface StagedFile {
  readonly documents: readonly StagedDocumentDraft[];
  readonly others: readonly StagedRowDraft[];
  readonly sheets: readonly SheetSummary[];
  readonly notes: readonly GridNote[];
}

/**
 * What the read before the transaction found (code-house-rules 8.1, 8.3; imports-and-opening-data 7.2 "As built"). Its
 * refusals are answered in the transaction, under the request's key, in the order of 7.2; what can change in between,
 * the handler's refusal of a file for the record and the duplicate control, the transaction decides again.
 */
type Plan =
  /** Refused by what does not change for the request: its shape, the file, the versions, the handler, the cutover. */
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal }
  /**
   * Not read further nor staged, sparing the slow work, since the handler refused a file for the record (the layout not
   * read then) or the file was repeated (7.2); the transaction decides either again.
   */
  | { readonly kind: 'spared'; readonly layoutId?: string }
  /** Refused at reading the file, which comes after the duplicate control: the header rows, the business date. */
  | { readonly kind: 'refused-reading'; readonly layoutId: string; readonly refusal: CommandRefusal }
  | { readonly kind: 'read'; readonly planned: Planned };

/** The plan with its file read and staged, or the reader's or staging's refusal, which comes after the duplicates. */
type Prepared =
  | Exclude<Plan, { readonly kind: 'read' }>
  | { readonly kind: 'staged'; readonly planned: Planned; readonly file: StagedFile };

/**
 * The authority Start an import needs (13.1; access-and-approvals 7.1 step 3): create on the batch with its scope
 * facts; and, for a batch about one record (S2-F04-T02), the record read as the person may see it, the batch taking its
 * place from the record, with the handler's own permission on it and any refusal of a file for it now.
 */
interface Authority {
  readonly facts: ImportPlace;
  readonly need: { readonly action: 'create'; readonly recordType: string; readonly facts: ImportPlace };
  readonly subject?: {
    readonly recordType: string;
    readonly recordId: string;
    readonly need: ImportNeed;
    readonly refusal?: CommandRefusal;
  };
}

async function authorityOf(
  deps: ImportDependencies,
  context: TransactionContext,
  body: StartImportRequest,
): Promise<Authority | CommandRefusal> {
  const handler = deps.handlers.for(body.target, body.kind);
  const batchNeed = (facts: ImportPlace) => ({ action: 'create' as const, recordType: IMPORT_BATCH_TYPE, facts });
  if (handler?.subject === undefined) {
    if (handler !== undefined && body.subject !== undefined) {
      return { kind: 'refused', code: 'files-imports.subject-not-taken', missing: [] };
    }
    const facts = scopeFactsOf(body.scope ?? {});
    return { facts, need: batchNeed(facts) };
  }
  const { recordType } = handler.subject;
  if (body.subject === undefined) {
    return {
      kind: 'refused',
      code: 'files-imports.subject-required',
      missing: [{ kind: 'import-subject', recordType }],
    };
  }
  const read = await handler.subject.read(context, body.subject.recordId);
  if (read === undefined) {
    return {
      kind: 'not-found',
      code: 'files-imports.subject-not-found',
      missing: [{ kind: 'record', recordType, recordId: body.subject.recordId }],
    };
  }
  return {
    facts: read.place,
    need: batchNeed(read.place),
    subject: {
      recordType,
      recordId: body.subject.recordId,
      need: read.need,
      ...(read.refusal === undefined ? {} : { refusal: read.refusal }),
    },
  };
}

/**
 * Authorises the authority Start an import needs, first the batch's and then the handler's own permission on the
 * record; answers the assignments that grant them, or the refusal: not authorised, then the handler's refusal of a file
 * for the record, named as `files-imports.subject-refused` (S2-F04-T02), which alone keeps the authority beside it.
 */
async function authorised(
  deps: ImportDependencies,
  context: TransactionContext,
  input: StartImportInput,
): Promise<
  | {
      readonly kind: 'allowed';
      readonly authority: Authority;
      readonly roleAssignmentId: string;
      readonly further: { readonly roleAssignmentId: string; readonly need: ImportNeed }[];
    }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal; readonly authority?: Authority }
> {
  const authority = await authorityOf(deps, context, input.body);
  if ('code' in authority) return { kind: 'refused', refusal: authority };
  const actorId = input.actor.userId;
  const batch = await deps.access.authorise(context, { actorId, ...authority.need });
  if (batch.kind === 'refused') return { kind: 'refused', refusal: { ...batch.refusal, kind: 'not-authorised' } };
  const further: { roleAssignmentId: string; need: ImportNeed }[] = [];
  if (authority.subject !== undefined) {
    const own = await deps.access.authorise(context, { actorId, ...authority.subject.need });
    if (own.kind === 'refused') return { kind: 'refused', refusal: { ...own.refusal, kind: 'not-authorised' } };
    further.push({ roleAssignmentId: own.roleAssignmentId, need: authority.subject.need });
    const { refusal } = authority.subject;
    if (refusal !== undefined) {
      return {
        kind: 'refused',
        refusal: {
          kind: 'refused',
          code: 'files-imports.subject-refused',
          missing: [{ kind: 'import-subject', reason: refusal.code }, ...refusal.missing],
        },
        authority,
      };
    }
  }
  return { kind: 'allowed', authority, roleAssignmentId: batch.roleAssignmentId, further };
}

/**
 * The read before any outside call: what the request names, as this person may use it, stopping at its first refusal
 * in the order of 7.2. With `spare`, it stops at the handler's refusal and at the duplicate control, which the
 * transaction decides again, sparing the reads and the staging after them; read again once the transaction found such a
 * refusal no longer stands, it spares nothing.
 */
async function plan(deps: ImportDependencies, input: StartImportInput, spare: boolean): Promise<Plan> {
  const { body } = input;
  return deps.runner.read(
    {
      commandName: COMMAND,
      organisation: input.actor.organisation,
      correlationId: input.actor.correlationId,
      actor: { kind: 'actor', actorId: input.actor.userId },
    },
    async (context): Promise<Plan> => {
      // Authorise first, before any other read or slow work (code-house-rules 8.1; module-map 6.1): a person who may
      // not start a batch at this place learns nothing of the file, its layout or what is published. A batch about one
      // record reads the record first, as the person may see it, since it gives the batch its place (S2-F04-T02).
      const allowed = await authorised(deps, context, input);
      let authority: Authority;
      if (allowed.kind === 'refused') {
        // An access refusal stops the request before its key, as it stops a replay (12.4 "Replay").
        if (isAccessRefusal(allowed.refusal)) refuse(allowed.refusal);
        // A request whose shape the handler refuses; or the handler's refusal of a file for the record, which the
        // transaction decides again.
        if (allowed.authority === undefined) return { kind: 'refused', refusal: allowed.refusal };
        if (spare) return { kind: 'spared' };
        authority = allowed.authority;
      } else {
        authority = allowed.authority;
      }
      const file = await fileHandedIn(context, input.actor.userId, body.storedFileId, body.fileReceiptId);
      if (file === undefined) return { kind: 'refused', refusal: IMPORT_FILE_NOT_FOUND };
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
      if (versions === undefined) return { kind: 'refused', refusal: LAYOUT_NOT_FOUND };
      // A Rejected version never stages a batch (6.4).
      if (versions.layoutState === 'Rejected' || versions.mappingState === 'Rejected') {
        return { kind: 'refused', refusal: LAYOUT_VERSION_REJECTED };
      }
      const handler = deps.handlers.for(body.target, body.kind);
      if (handler === undefined) {
        return {
          kind: 'refused',
          refusal: {
            kind: 'refused',
            code: 'files-imports.no-import-handler',
            missing: [{ kind: 'import-handler', target: body.target, importKind: body.kind }],
          },
        };
      }
      // A new opening batch for a unit whose cutover is complete is refused: a later correction is a live correction
      // in the owning module (10.1, 10.5; PRD-LIF-011; S1-F13-T03).
      const cutover = await cutoverRefusal(context, handler, body.kind, authority.facts);
      if (cutover !== undefined) return { kind: 'refused', refusal: cutover };
      const { layoutId } = versions;
      // A file read as repeated is neither read further nor staged: the duplicate control comes before the reading's
      // refusals, and the transaction decides it again under the stored file's lock (7.2).
      if (spare && (await repeatRefusal(deps, context, input, handler, layoutId)) !== undefined) {
        return { kind: 'spared', layoutId };
      }
      const layout = parsedOrDefect(layoutStructureSchema, versions.structure, 'layout version');
      // A target whose files have their header on given rows only refuses a layout that looks for it elsewhere (13.2
      // "As built with S2-F04-T02"; goods-in 5.2: a PT file's header is on row 1 or row 2).
      const onRows = handler.headerRows;
      if (onRows !== undefined && (layout.headerRows ?? [layout.headerRow]).some((row) => !onRows.includes(row))) {
        return {
          kind: 'refused-reading',
          layoutId,
          refusal: {
            kind: 'refused',
            code: 'files-imports.header-rows-not-allowed',
            missing: onRows.map((row) => ({ kind: 'header-row', row: String(row) })),
          },
        };
      }
      const date = await context.businessDate();
      if (date.kind !== 'set') {
        return {
          kind: 'refused-reading',
          layoutId,
          refusal: {
            kind: 'unavailable',
            code: 'access.business-date-not-set',
            missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
          },
        };
      }
      return {
        kind: 'read',
        planned: {
          ...file,
          layoutId,
          rules: await rulesInForce(context, date.date),
          layoutState: versions.layoutState,
          classes: classesHeld(versions.layoutState, layout),
          layout,
          mapping: parsedOrDefect(mappingFieldsSchema, versions.fields, 'mapping version'),
          facts: authority.facts,
          ...(authority.subject === undefined
            ? {}
            : { subject: { recordType: authority.subject.recordType, recordId: authority.subject.recordId } }),
        },
      };
    },
  );
}

/**
 * The same file in a batch for the target and layout that has not Failed (7.2; S1-F06-T04): the refusal, naming the
 * earlier batches the person may see; undefined when there is none. Read through a narrowly authorised function that
 * sees every scope, since a file's batches are one across the Organisation.
 */
async function openBatchRefusal(
  context: TransactionContext,
  body: StartImportRequest,
  layoutId: string,
): Promise<CommandRefusal | undefined> {
  const open = await context.tx.execute<{ open: boolean }>(
    sql`select files_imports.file_in_open_batch(${body.storedFileId}, ${body.target}, ${layoutId}) as open`,
  );
  if (open.rows[0]?.open !== true) return undefined;
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
  return {
    kind: 'refused',
    code: 'files-imports.file-already-imported',
    missing: earlier.map((batch) => ({
      kind: 'import-batch',
      batchId: batch.batchId,
      code: batch.code,
      state: batch.state,
    })),
  };
}

/**
 * Duplicate control at the start (7.2, 13.1; PRD-IMP-011; S1-F06-T04). The same file starts a new batch for the same
 * target and layout only if every earlier such batch Failed; the refusal names the earlier batches the person may see.
 * And a document reference the uploader claimed at the hand-in, already published for the target, is refused, unless
 * the batch is a governed revision of it (7.3); the refusal names the published document only where the person may
 * view its batch, since the published document is found whatever their scope sees (section 11; PRD-SEC-005). Both are
 * checked whatever the person's scope sees, since a source identity is one across the Organisation; validation checks
 * each document the file holds, and publishing checks again under the lock, behind which the unique index is the last
 * guard. Decided in the start's transaction under the stored file's lock (RR-503; code review 10 of stage 2); the read
 * before it only spares a repeated file the staging.
 */
async function repeatRefusal(
  deps: ImportDependencies,
  context: TransactionContext,
  input: StartImportInput,
  handler: ImportHandler,
  layoutId: string,
): Promise<CommandRefusal | undefined> {
  const { body } = input;
  const open = await openBatchRefusal(context, body, layoutId);
  if (open !== undefined) return open;
  const [receipt] = await context.tx
    .select({ sealed: fileReceipt.claimedReferenceSealed, scheme: fileReceipt.encryptionScheme })
    .from(fileReceipt)
    .where(eq(fileReceipt.id, body.fileReceiptId));
  if (receipt?.sealed === null || receipt === undefined) return undefined;
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
    scopeKey: handler.sourceScope({ reference, rows: [], place: scopeFactsOf(body.scope ?? {}) }),
    reference,
  });
  if (published === undefined || revisesPublished(handler, { kind: body.kind })) return undefined;
  const shown = await mayViewDocument(deps, context, input.actor.userId, published.documentId);
  return {
    kind: 'refused',
    code: 'files-imports.document-already-published',
    missing: shown ? [{ kind: 'import-document', documentId: published.documentId }] : [],
  };
}

/**
 * Whether the person may view a document's batch: row-level security shows the document within their scope, and
 * Authorise allows view on its batch with the batch's facts (section 11; PRD-SEC-005).
 */
async function mayViewDocument(
  deps: ImportDependencies,
  context: TransactionContext,
  actorId: string,
  documentId: string,
): Promise<boolean> {
  const [visible] = await context.tx
    .select({ batch: importBatch })
    .from(importDocument)
    .innerJoin(importBatch, eq(importBatch.id, importDocument.batchId))
    .where(eq(importDocument.id, documentId));
  if (visible === undefined) return false;
  const authorised = await deps.access.authorise(context, {
    actorId,
    action: 'view',
    recordType: IMPORT_BATCH_TYPE,
    facts: factsOfBatch(visible.batch),
  });
  return authorised.kind === 'allowed';
}

/**
 * The stored workbook, fetched, decrypted, checked against its hash and read into the grid under the caps at intake
 * in force (9.1, 9.3; 8.3), or the refusal: no file store, or a file stored under looser caps, refused here as at
 * intake, naming the cap.
 */
async function gridOf(
  deps: ImportDependencies,
  organisationCode: string,
  file: HandedInFile,
): Promise<Grid | CommandRefusal> {
  if (deps.fileStore.kind === 'not-configured') {
    const { code, missing = [] } = fileStoreNotConfigured().body;
    return { kind: 'unavailable', code, missing: [...missing] };
  }
  const sealed = await deps.fileStore.store.get(file.objectKey);
  const bytes = openFile(deps.keys, organisationCode, file.contentHash, file.scheme, sealed);
  if (contentHashOf(bytes) !== file.contentHash) throw new CommandDefect('A stored file does not match its hash');
  const read = await readWorkbook(bytes, deps.caps);
  if (read.kind === 'refused') return { kind: 'refused', code: read.code, missing: [...read.missing] };
  return read.grid;
}

/** The stored workbook read into the grid, as gridOf, its refusal answered at once (Detect a layout; 6.5). */
export async function storedGrid(
  deps: ImportDependencies,
  organisationCode: string,
  file: HandedInFile,
): Promise<Grid> {
  const read = await gridOf(deps, organisationCode, file);
  if ('code' in read) refuse(read);
  return read;
}

/**
 * The plan, with the file fetched, decrypted, checked, read and staged outside any transaction (code-house-rules 8.3);
 * the reader's and staging's refusals are answered in the transaction, after the duplicate control (7.2).
 */
async function prepared(deps: ImportDependencies, input: StartImportInput, spare: boolean): Promise<Prepared> {
  const read = await plan(deps, input, spare);
  if (read.kind !== 'read') return read;
  const { planned } = read;
  const refused = (refusal: CommandRefusal): Prepared => ({
    kind: 'refused-reading',
    layoutId: planned.layoutId,
    refusal,
  });
  const grid = await gridOf(deps, input.actor.organisation.organisationCode, planned);
  if ('code' in grid) return refused(grid);
  const source = input.body.source ?? {};
  const result = stage(
    grid,
    planned.layout,
    planned.mapping,
    {
      target: input.body.target,
      rules: planned.rules,
      scopes: { layoutId: planned.layoutId, supplierId: source.supplierId, brandId: source.brandId },
    },
    // A batch about one record stages every data row into one document (S2-F04-T02).
    { oneDocument: planned.subject !== undefined },
  );
  if (result.kind === 'refused') return refused({ kind: 'refused', code: result.code, missing: [...result.missing] });
  return {
    kind: 'staged',
    planned,
    file: { documents: result.documents, others: result.others, sheets: result.sheets, notes: grid.notes },
  };
}

/**
 * Thrown in the start's transaction when a refusal the read stopped at no longer stands, so nothing was staged: the
 * transaction rolls back, its key unused, and the start is read, staged and run again (8.1).
 */
class PlanAgain extends Error {
  constructor() {
    super('A refusal the start read before its transaction no longer stands; it is read and staged again');
  }
}

export async function startImport(
  deps: ImportDependencies,
  input: StartImportInput,
): Promise<IdempotentAnswer<JsonValue>> {
  // A request the read finds refused is not staged: the slow work is spared. Every refusal but access is answered in
  // the command's transaction under the request's key, never before it, so the same request sent again under its key
  // gets its first answer, whatever its first batch did since (code-house-rules 12.4 "Replay"; PRD-INT-002).
  try {
    return await run(deps, input, await prepared(deps, input, true));
  } catch (error) {
    if (!(error instanceof PlanAgain)) throw error;
  }
  // Read again, staging whatever it reads, so the transaction runs a second time at most.
  return run(deps, input, await prepared(deps, input, false));
}

/** The start's transaction under the request's key (12.4), answering its refusals in the order of 7.2. */
function run(deps: ImportDependencies, input: StartImportInput, ready: Prepared): Promise<IdempotentAnswer<JsonValue>> {
  // A replay is answered while the same Authorise passes; a record no longer found stays not found (12.3, 12.4).
  const authoriseReplay: ReplayAuthorisation = async (context) => {
    const allowed = await authorised(deps, context, input);
    if (allowed.kind === 'allowed') return { kind: 'allowed' };
    // Only an access refusal stops a replay: the handler's refusal of a file for the record now is a rule of the
    // operation, which the first answer met as it stood (12.4; `access`'s replayRefusal keeps the kind).
    if (!isAccessRefusal(allowed.refusal)) return { kind: 'allowed' };
    return { kind: 'refused', refusal: replayRefusal(allowed.refusal) };
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
        // Authorise with the batch's scope facts, and the handler's own permission on the record a batch is about,
        // with its refusal of a file for the record now, then hold them at step 0 (access-and-approvals 7.1 steps 3
        // and 4).
        const allowed = await authorised(deps, context, input);
        if (allowed.kind === 'refused') return refusalOf(allowed.refusal);
        const held = await deps.access.holdAuthority(
          context,
          { kind: 'user', id: input.actor.userId },
          allowed.roleAssignmentId,
          allowed.authority.need,
          [],
          allowed.further,
        );
        if (held !== undefined) return refusalOf(held);
        // What the read refused, which does not change for the request; a refusal writes nothing it would rest on.
        if (ready.kind === 'refused') return refusalOf(ready.refusal);
        // Spared for the handler's refusal of a file for the record, which no longer stands.
        if (ready.kind === 'spared' && ready.layoutId === undefined) throw new PlanAgain();
        const layoutId = ready.kind === 'staged' ? ready.planned.layoutId : ready.layoutId;
        if (layoutId === undefined) throw new CommandDefect('An import start read its layout and kept none');
        const rechecked = await underLocks(deps, context, input, layoutId);
        if ('code' in rechecked) return refusalOf(rechecked);
        // Spared for the duplicate control, which no longer stands.
        if (ready.kind === 'spared') throw new PlanAgain();
        if (ready.kind === 'refused-reading') return refusalOf(ready.refusal);
        const now = {
          ...ready.planned,
          facts: allowed.authority.facts,
          classes: classesHeld(rechecked.layoutState, ready.planned.layout),
        };
        return record(deps, context, input, now, ready.file, allowed.roleAssignmentId);
      },
    },
  );
}

const STORED_FILE_LOCK = lockTable('files_imports', 'stored_file');
const LAYOUT_VERSION_LOCK = lockTable('files_imports', 'layout_version');
const MAPPING_VERSION_LOCK = lockTable('files_imports', 'mapping_version');

/**
 * The rechecks under the locks (code-house-rules 8.1, 8.2; RR-503): the stored file exclusively, so two Starts of the
 * same file queue and the second sees the first's batch; the layout and mapping versions shared, so a decision on
 * either waits or is seen. Then, read after the locks are held: neither version is Rejected (6.4); the duplicate
 * control, the file in no open batch for the target and layout and its claimed reference not published (7.2); and the
 * layout version's state now, which the classes the file is held to carry follow (section 11).
 */
async function underLocks(
  deps: ImportDependencies,
  context: TransactionContext,
  input: StartImportInput,
  layoutId: string,
): Promise<CommandRefusal | { readonly layoutState: string }> {
  const { body } = input;
  await context.lock(LOCK_STEP.document, [
    { table: STORED_FILE_LOCK, id: body.storedFileId, mode: 'exclusive' },
    { table: LAYOUT_VERSION_LOCK, id: body.layoutVersionId, mode: 'shared' },
    { table: MAPPING_VERSION_LOCK, id: body.mappingVersionId, mode: 'shared' },
  ]);
  const [layoutNow] = await context.tx
    .select({ state: layoutVersion.state })
    .from(layoutVersion)
    .where(eq(layoutVersion.id, body.layoutVersionId));
  const [mappingNow] = await context.tx
    .select({ state: mappingVersion.state })
    .from(mappingVersion)
    .where(eq(mappingVersion.id, body.mappingVersionId));
  if (layoutNow === undefined || mappingNow === undefined) {
    throw new CommandDefect('A layout or mapping version read before the locks is not there');
  }
  if (layoutNow.state === 'Rejected' || mappingNow.state === 'Rejected') return LAYOUT_VERSION_REJECTED;
  const handler = deps.handlers.for(body.target, body.kind);
  if (handler === undefined) throw new CommandDefect(`No import handler is registered for ${body.target}`);
  const repeated = await repeatRefusal(deps, context, input, handler, layoutId);
  if (repeated !== undefined) return repeated;
  return { layoutState: layoutNow.state };
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
  const scope = planned.facts;
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
    restrictedClasses: [...planned.classes],
    readerNotes: [...file.notes],
    startedByUserId: input.actor.userId,
    startedAt: context.startedAt,
    ...columns,
    versionId: uuidv7(),
    submittedVersionId: null,
    sheets: [...file.sheets],
    sourceSupplierId: body.source?.supplierId ?? null,
    sourceBrandId: body.source?.brandId ?? null,
    subjectRecordType: planned.subject?.recordType ?? null,
    subjectRecordId: planned.subject?.recordId ?? null,
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
    // A batch about one record holds one document, whose reference is the batch's own code, so each upload is a
    // source identity of its own (7.1; S2-F04-T02).
    const reference = planned.subject === undefined ? document.reference : allocated.value.formattedText;
    await context.tx.insert(importDocument).values({
      id: documentId,
      batchId,
      reference,
      state: 'Staged',
      excluded: false,
      target: body.target,
      scopeKey: handler.sourceScope({ reference, rows: [], place: scope }),
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
    evidence: { kind: 'import-original', restrictedClasses: [...planned.classes] },
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
