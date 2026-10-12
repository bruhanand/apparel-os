import {
  fieldClassSchema,
  layoutStructureSchema,
  mappingFieldsSchema,
  type DocumentPreview,
  type FieldClass,
  type LayoutStructure,
  type StagedValueView,
} from '@apparel-os/schemas';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import {
  CommandDefect,
  scopeFactsOf,
  type CommandRefusal,
  type CommandRunner,
  type DeploymentEnvironment,
  type IdempotencyHelper,
  type RoutedOrganisation,
  type StructuredLogger,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AccessInterface, OrganisationKeys } from '../../access/index.js';
import type { AuditInterface, AuditScope } from '../../audit/index.js';
import type { NumberingInterface } from '../../numbering/index.js';
import type { HandlerDocument, ImportHandler, ImportHandlers, ImportReview } from '../contracts/import-handlers.js';
import {
  importBatch,
  importDocument,
  layoutVersion,
  mappingVersion,
  stagedRow,
  stagedValueEntry,
} from '../db/schema.js';
import { documentContentHash, identityFinding, type IdentityFinding } from '../domain/identity.js';
import type { IntakeCaps } from '../domain/intake-caps.js';
import type { EffectiveValue } from '../domain/report.js';
import type { FileStoreHandle } from '../file-store/file-store.js';

// What the import commands share (imports-and-opening-data 3.1, 5, 11, 13.1, 13.2; S1-F06-T01, S1-F06-T03): their
// dependencies, the batch as its reader may see it, its documents for the handler with each value a person entered
// standing for the value staged from the file, and the preview of a document.

export interface ImportDependencies {
  readonly runner: CommandRunner;
  readonly helper: IdempotencyHelper;
  readonly access: AccessInterface;
  readonly audit: AuditInterface;
  readonly keys: OrganisationKeys;
  readonly fileStore: FileStoreHandle;
  readonly logger: StructuredLogger;
  readonly numbering: NumberingInterface;
  readonly handlers: ImportHandlers;
  /** The environment's name (code-house-rules 12.14); the publishing limit of S1-F06-T01 that read it is lifted. */
  readonly environment: DeploymentEnvironment;
  /** The caps at intake, which every read of a stored workbook keeps to (9.3; S1-F06-T02). */
  readonly caps: IntakeCaps;
}

/** The person a route found: who, in which Organisation, under which request. */
export interface ImportActor {
  readonly organisation: RoutedOrganisation;
  readonly userId: string;
  readonly correlationId: string;
}

export { layoutStructureSchema, mappingFieldsSchema };

export function parsedOrDefect<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new CommandDefect(`A stored ${what} is not in its shape`);
  return parsed.data;
}

/**
 * The restricted classes a batch's file is held to carry (section 11): those its layout's columns declare once the
 * layout version is Confirmed; every class while it is not, since a file's classes are known only from a confirmed
 * layout.
 */
export function classesHeld(state: string, layout: LayoutStructure): FieldClass[] {
  if (state !== 'Confirmed') return [...fieldClassSchema.options];
  return [...new Set(layout.columns.flatMap((column) => column.restrictedClass ?? []))];
}

export type BatchRow = typeof importBatch.$inferSelect;

/** The batch, as row-level security shows it to the actor; undefined when it is not visible or does not exist. */
export async function visibleBatch(context: TransactionContext, batchId: string): Promise<BatchRow | undefined> {
  const [row] = await context.tx.select().from(importBatch).where(eq(importBatch.id, batchId));
  return row;
}

/** A batch's scope facts, a fact it holds as Unknown left out (PRD-MOD-015). */
export function factsOfBatch(batch: BatchRow): AuditScope {
  return scopeFactsOf({
    legalEntityId: batch.legalEntityId,
    siteId: batch.siteId,
    storeId: batch.storeId,
    businessUnitId: batch.businessUnitId,
  });
}

/** The scope columns a batch's documents, rows, entries, issues and totals copy from it (15.1). */
export function scopeColumnsOf(batch: {
  readonly legalEntityId: string | null;
  readonly siteId: string | null;
  readonly storeId: string | null;
  readonly businessUnitId: string | null;
}) {
  return {
    legalEntityId: batch.legalEntityId,
    siteId: batch.siteId,
    storeId: batch.storeId,
    businessUnitId: batch.businessUnitId,
  };
}

export const BATCH_NOT_FOUND: CommandRefusal<'not-found'> = {
  kind: 'not-found',
  code: 'files-imports.batch-not-found',
  missing: [],
};

/** The layout and mapping versions a batch was started with, as stored, and their states now. */
export async function versionsOf(context: TransactionContext, batch: BatchRow) {
  const [layout] = await context.tx.select().from(layoutVersion).where(eq(layoutVersion.id, batch.layoutVersionId));
  const [mapping] = await context.tx.select().from(mappingVersion).where(eq(mappingVersion.id, batch.mappingVersionId));
  if (layout === undefined || mapping === undefined)
    throw new CommandDefect('A batch names a version that is not there');
  return {
    layout,
    mapping,
    structure: parsedOrDefect(layoutStructureSchema, layout.structure, 'layout version'),
    fields: parsedOrDefect(mappingFieldsSchema, mapping.fields, 'mapping version'),
  };
}

export type EntryRow = typeof stagedValueEntry.$inferSelect;

/** A value a person entered, as its reader is served it, standing for the value staged from the file (section 5). */
export function enteredView(entry: EntryRow, staged: EffectiveValue | undefined): StagedValueView {
  return {
    kind: 'entered',
    value: entry.value,
    entry: {
      entryId: entry.id,
      enteredByUserId: entry.enteredByUserId,
      enteredAt: entry.enteredAt.toISOString(),
      reason: entry.reason,
      ...(entry.suggestion === null ? {} : { suggestion: entry.suggestion }),
    },
    staged: staged === undefined || staged.kind === 'entered' ? { kind: 'unknown' } : staged,
  };
}

/** The latest entry of each field of each row, by the entries' order (UUIDv7, so time order). */
export function latestEntries(entries: readonly EntryRow[]): Map<string, Map<string, EntryRow>> {
  const byRow = new Map<string, Map<string, EntryRow>>();
  for (const entry of [...entries].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const fields = byRow.get(entry.stagedRowId) ?? new Map<string, EntryRow>();
    fields.set(entry.field, entry);
    byRow.set(entry.stagedRowId, fields);
  }
  return byRow;
}

/** A row's values with each entered value standing for the staged one (section 5). */
export function effectiveValues(
  values: Readonly<Record<string, EffectiveValue>>,
  entries: ReadonlyMap<string, EntryRow> | undefined,
): Record<string, EffectiveValue> {
  const result: Record<string, EffectiveValue> = { ...values };
  for (const [field, entry] of entries ?? []) result[field] = { kind: 'entered', value: entry.value };
  return result;
}

export interface LoadedDocument extends HandlerDocument {
  readonly state: 'Staged' | 'Published';
  readonly excluded: boolean;
  /** The published document it revises, once published as a revision (7.3). */
  readonly revisesDocumentId: string | null;
}

/** A batch's documents with their data rows, in the file's order, each entered value standing for the staged one. */
export async function documentsOf(
  context: TransactionContext,
  batch: Pick<BatchRow, 'id' | 'kind'>,
): Promise<LoadedDocument[]> {
  const batchId = batch.id;
  const documents = await context.tx
    .select()
    .from(importDocument)
    .where(eq(importDocument.batchId, batchId))
    .orderBy(asc(importDocument.id));
  const rows = await context.tx
    .select()
    .from(stagedRow)
    .where(and(eq(stagedRow.batchId, batchId), eq(stagedRow.role, 'data')))
    .orderBy(asc(stagedRow.sheet), asc(stagedRow.rowNumber));
  const entries = latestEntries(await entriesOf(context, batchId));
  return documents.map((document) => ({
    documentId: document.id,
    reference: document.reference,
    kind: batch.kind,
    state: document.state,
    excluded: document.excluded,
    revisesDocumentId: document.revisesDocumentId,
    rows: rows
      .filter((row) => row.documentId === document.id)
      .map((row) => ({
        stagedRowId: row.id,
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        values: effectiveValues(row.values, entries.get(row.id)),
      })),
  }));
}

/** Every value entered in a batch's rows. */
export async function entriesOf(context: TransactionContext, batchId: string): Promise<EntryRow[]> {
  return context.tx
    .select()
    .from(stagedValueEntry)
    .where(eq(stagedValueEntry.batchId, batchId))
    .orderBy(asc(stagedValueEntry.id));
}

/**
 * Every user who recorded a change in the batch version: who started it, who entered values, and the submitter or
 * publisher (access-and-approvals 9.1, 9.7), so none of them decides its approval.
 */
export async function batchPreparers(
  context: TransactionContext,
  batch: Pick<BatchRow, 'id' | 'startedByUserId'>,
  actorId: string,
): Promise<string[]> {
  const entries = await context.tx
    .select({ userId: stagedValueEntry.enteredByUserId })
    .from(stagedValueEntry)
    .where(eq(stagedValueEntry.batchId, batch.id));
  return [...new Set([batch.startedByUserId, actorId, ...entries.map((entry) => entry.userId)])].sort();
}

/** The staged rows named, of the batch. */
export async function rowsNamed(context: TransactionContext, batchId: string, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return context.tx
    .select()
    .from(stagedRow)
    .where(and(eq(stagedRow.batchId, batchId), inArray(stagedRow.id, [...ids])));
}

/**
 * The preview of one document (3.1 steps 6 and 7): first every required field of the handler's row, which must be
 * known, never read as zero (PRD-MOD-015); then the handler's own preview, which writes nothing (13.2).
 */
export async function previewOf(
  context: TransactionContext,
  handler: ImportHandler,
  document: HandlerDocument,
): Promise<DocumentPreview> {
  const issues = document.rows.flatMap((row) =>
    handler.fields
      .filter((field) => field.required && (row.values[field.name] ?? { kind: 'unknown' }).kind === 'unknown')
      .map((field) => ({ code: 'files-imports.required-value-unknown', field: field.name, rowNumber: row.rowNumber })),
  );
  if (issues.length > 0) return { kind: 'issues', issues };
  return handler.preview(context, document);
}

/** The handler of a batch's target and kind; a batch is started only with one, so none here is a defect. */
export function handlerOf(handlers: ImportHandlers, batch: BatchRow): ImportHandler {
  const handler = handlers.for(batch.target, batch.kind);
  if (handler === undefined) throw new CommandDefect(`No import handler is registered for ${batch.target}`);
  return handler;
}

/** The review a batch's handler requires for its kind (3.1 step 8, 13.2). */
export function reviewOf(handler: ImportHandler, batch: Pick<BatchRow, 'kind'>): ImportReview {
  return handler.review(batch.kind);
}

/** The published document of a source identity, whatever the actor's scope sees (7.2; migration 0065). */
export async function publishedDocument(
  context: TransactionContext,
  identity: { readonly target: string; readonly scopeKey: string; readonly reference: string },
): Promise<{ readonly documentId: string; readonly contentHash: string | null } | undefined> {
  const result = await context.tx.execute<{ document_id: string; content_hash: string | null }>(
    sql`select document_id, content_hash from files_imports.published_document(${identity.target}, ${identity.scopeKey}, ${identity.reference})`,
  );
  const [row] = result.rows;
  return row === undefined ? undefined : { documentId: row.document_id, contentHash: row.content_hash };
}

/** A document's source identity and content, and what it is against the published document of its identity (7.1). */
export interface DocumentIdentity {
  readonly target: string;
  readonly scopeKey: string;
  readonly contentHash: string;
  readonly finding: IdentityFinding;
}

/**
 * Whether a batch is a governed revision of the documents it holds whose identities are published (7.3): an update
 * batch, of a handler that supports revisions. The preparer chooses it with the kind at the start, and the reviewer
 * reviews it as the batch.
 */
export function revisesPublished(handler: ImportHandler, batch: Pick<BatchRow, 'kind'>): boolean {
  return batch.kind === 'update' && handler.revisions !== 'none';
}

/** A document's source identity, its content hash, and what it is against the published document (7.1, 7.2). */
export async function identityOf(
  context: TransactionContext,
  handler: ImportHandler,
  batch: Pick<BatchRow, 'kind' | 'target'>,
  document: HandlerDocument,
): Promise<DocumentIdentity> {
  const scopeKey = handler.sourceScope(document);
  const contentHash = documentContentHash(
    handler.fields.map((field) => field.name),
    document.rows.map((row) => row.values),
  );
  const published = await publishedDocument(context, { target: batch.target, scopeKey, reference: document.reference });
  return {
    target: batch.target,
    scopeKey,
    contentHash,
    finding: identityFinding(published, contentHash, revisesPublished(handler, batch)),
  };
}
