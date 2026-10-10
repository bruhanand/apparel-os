import { fieldClassSchema, type DocumentPreview, type FieldClass } from '@apparel-os/schemas';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
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
import type { HandlerDocument, ImportHandler, ImportHandlers } from '../contracts/import-handlers.js';
import { importBatch, importDocument, stagedRow } from '../db/schema.js';
import type { LayoutStructure, MappingFields } from '../domain/staging.js';
import type { FileStoreHandle } from '../file-store/file-store.js';

// What the import commands share (imports-and-opening-data 3.1, 13.1, 13.2; S1-F06-T01): their dependencies, the
// batch as its reader may see it, its documents for the handler, and the preview of a document.

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
  /** The environment's name, for the publishing limit of S1-F06-T01. */
  readonly environment: DeploymentEnvironment;
}

/** The person a route found: who, in which Organisation, under which request. */
export interface ImportActor {
  readonly organisation: RoutedOrganisation;
  readonly userId: string;
  readonly correlationId: string;
}

/** The stored layout structure, checked when read (6.1); a row that fails it is a defect, never data. */
export const layoutStructureSchema: z.ZodType<LayoutStructure> = z.strictObject({
  shape: z.literal('layout-version/1'),
  format: z.literal('xlsx'),
  sheet: z.string().min(1),
  headerRow: z.number().int().positive(),
  dataStartRow: z.number().int().positive(),
  columns: z
    .array(
      z.strictObject({
        name: z.string().min(1),
        required: z.boolean(),
        restrictedClass: fieldClassSchema.optional(),
      }),
    )
    .min(1),
  documentReference: z.string().min(1),
});

/** The stored mapping fields, checked when read (6.2). */
export const mappingFieldsSchema: z.ZodType<MappingFields> = z.strictObject({
  shape: z.literal('mapping-version/1'),
  fields: z.record(z.string(), z.strictObject({ column: z.string().min(1), transform: z.literal('text') })),
});

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

export const BATCH_NOT_FOUND: CommandRefusal<'not-found'> = {
  kind: 'not-found',
  code: 'files-imports.batch-not-found',
  missing: [],
};

export interface LoadedDocument extends HandlerDocument {
  readonly state: 'Staged' | 'Published';
}

/** A batch's documents with their data rows, in the file's order. */
export async function documentsOf(context: TransactionContext, batchId: string): Promise<LoadedDocument[]> {
  const documents = await context.tx
    .select()
    .from(importDocument)
    .where(eq(importDocument.batchId, batchId))
    .orderBy(asc(importDocument.id));
  const rows = await context.tx
    .select()
    .from(stagedRow)
    .where(eq(stagedRow.batchId, batchId))
    .orderBy(asc(stagedRow.sheet), asc(stagedRow.rowNumber));
  return documents.map((document) => ({
    documentId: document.id,
    reference: document.reference,
    state: document.state,
    rows: rows
      .filter((row) => row.documentId === document.id)
      .map((row) => ({ stagedRowId: row.id, sheet: row.sheet, rowNumber: row.rowNumber, values: row.values })),
  }));
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
