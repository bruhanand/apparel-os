import { z } from 'zod';
import { idSchema } from './common.js';
import { missingItemSchema } from './errors.js';
import { storedFileSchema } from './files.js';
import { fieldClassSchema } from './roles.js';

// Imports: the import upload, layouts and mappings, batches, staged rows, preview and publish
// (imports-and-opening-data 3.1, 3.2, 4.1, 5, 6.1, 6.2, 7.2, 7.4, 13.1, 13.2; S1-F06-T01). No layout, mapping, code
// format or value is set here: the Organisation records its own (AGENTS.md "Never invent a value").

const asOf = z.iso.datetime({ offset: true });

/** The record type an import batch is authorised, scoped and audited on (access-and-approvals 4.1; 15.1). */
export const IMPORT_BATCH_TYPE = 'files_imports.import_batch';

/** The five batch kinds, fixed for a batch's life (4.1; PRD-IMP-010). */
export const importKindSchema = z.enum(['create', 'update', 'opening-balance', 'historical-reference', 'transaction']);
export type ImportKind = z.infer<typeof importKindSchema>;

/** A batch's states, the DM-4 baseline (3.2; DEC-105). */
export const importBatchStateSchema = z.enum(['Staged', 'Validated', 'Published', 'Failed']);
export type ImportBatchState = z.infer<typeof importBatchStateSchema>;

/** A layout or mapping version's states, those of a proposal (6.4; DM-4). */
export const importVersionStateSchema = z.enum(['Proposed', 'Confirmed', 'Rejected']);

/** A batch that read a stored file before, as the same bytes handed in again show it (7.2). */
export const earlierBatchSchema = z.strictObject({
  batchId: idSchema,
  code: z.string(),
  kind: importKindSchema,
  target: z.string(),
  state: importBatchStateSchema,
});

/**
 * Store a file for an import (13.1): the same request as Store a file, refused unless the content is XLSX (9.2). The
 * answer names the batches that read the same bytes before (7.2).
 */
export const importFileStoredSchema = z.strictObject({
  ...storedFileSchema.shape,
  earlierBatches: z.array(earlierBatchSchema),
});
export type ImportFileStored = z.infer<typeof importFileStoredSchema>;

/** The layout versions with their mapping versions a batch may start with (6.1, 6.2; 14). */
export const importLayoutListSchema = z.strictObject({
  asOf,
  layouts: z.array(
    z.strictObject({
      layoutVersionId: idSchema,
      layoutCode: z.string(),
      source: z.string(),
      documentType: z.string(),
      version: z.number().int().positive(),
      state: importVersionStateSchema,
      mappings: z.array(
        z.strictObject({
          mappingVersionId: idSchema,
          mappingCode: z.string(),
          target: z.string(),
          version: z.number().int().positive(),
          state: importVersionStateSchema,
        }),
      ),
    }),
  ),
});
export type ImportLayoutList = z.infer<typeof importLayoutListSchema>;

/** A batch's scope facts (15.1): a fact left out is Unknown, covered only by all-members scope (PRD-MOD-015). */
export const importScopeSchema = z.strictObject({
  legalEntityId: idSchema.optional(),
  siteId: idSchema.optional(),
  storeId: idSchema.optional(),
  businessUnitId: idSchema.optional(),
});

/**
 * Start an import (13.1): the stored file and the receipt it was handed in under, the kind, the target, the layout
 * and mapping versions, and the scope facts.
 */
export const startImportRequestSchema = z.strictObject({
  storedFileId: idSchema,
  fileReceiptId: idSchema,
  kind: importKindSchema,
  target: z.string().min(1).max(60),
  layoutVersionId: idSchema,
  mappingVersionId: idSchema,
  scope: importScopeSchema.optional(),
});
export type StartImportRequest = z.infer<typeof startImportRequestSchema>;

export const importStartedSchema = z.strictObject({
  batchId: idSchema,
  code: z.string(),
  state: importBatchStateSchema,
  documentCount: z.number().int().nonnegative(),
  rowCount: z.number().int().nonnegative(),
});

const cellTypeSchema = z.enum(['text', 'number', 'date', 'boolean', 'error', 'empty']);
const rawSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** An original cell, as the reader read it (9.1). */
export const gridCellSchema = z.strictObject({
  column: z.number().int().positive(),
  ref: z.string(),
  type: cellTypeSchema,
  raw: rawSchema,
  text: z.string(),
});

/** Where a Supplied value came from (section 5). */
export const suppliedOriginSchema = z.strictObject({
  sheet: z.string(),
  row: z.number().int().positive(),
  column: z.string(),
  ref: z.string(),
  raw: rawSchema,
  cellType: cellTypeSchema,
  text: z.string(),
});

/** A staged value: Supplied with its origin, or Unknown (section 5; PRD-MOD-015). */
export const stagedValueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unknown') }),
  z.strictObject({ kind: z.literal('supplied'), value: z.string(), origin: suppliedOriginSchema }),
]);

export const stagedRowSchema = z.strictObject({
  stagedRowId: idSchema,
  sheet: z.string(),
  rowNumber: z.number().int().positive(),
  role: z.enum(['data', 'header', 'total', 'filler', 'note', 'ignored']),
  hidden: z.boolean(),
  cells: z.array(gridCellSchema),
  values: z.record(z.string(), stagedValueSchema),
});
export type StagedRow = z.infer<typeof stagedRowSchema>;

/** A problem validation found, with where it is (8.2): its code, the field and row, and what it names. */
export const importIssueSchema = z.strictObject({
  code: z.string(),
  field: z.string().optional(),
  rowNumber: z.number().int().positive().optional(),
  missing: z.array(missingItemSchema).optional(),
});

/** What the target's handler works out a document would create, without writing; or the issues that stop it (13.2). */
export const documentPreviewSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('would-create'),
    records: z.array(z.strictObject({ recordType: z.string(), codes: z.array(z.string()) })),
  }),
  z.strictObject({ kind: z.literal('issues'), issues: z.array(importIssueSchema).min(1) }),
]);
export type DocumentPreview = z.infer<typeof documentPreviewSchema>;

const outcomeCountsSchema = z.strictObject({
  rowsRead: z.number().int().nonnegative(),
  rowsIgnored: z.number().int().nonnegative(),
  rowsAccepted: z.number().int().nonnegative(),
  rowsRejected: z.number().int().nonnegative(),
  rowsPending: z.number().int().nonnegative(),
  rowsDuplicate: z.number().int().nonnegative(),
});

/** What one publish attempt did, for the batch and each document, kept for a failure too (7.4). */
export const importOutcomeSchema = z.strictObject({
  outcomeId: idSchema,
  result: z.enum(['published', 'failed']),
  refusalCode: z.string().optional(),
  attemptedAt: asOf,
  attemptedByUserId: idSchema,
  counts: outcomeCountsSchema,
  documents: z.array(
    z.strictObject({
      documentId: idSchema,
      result: z.enum(['published', 'refused', 'not-attempted']),
      records: z.array(z.strictObject({ recordType: z.string(), recordId: idSchema })),
      refusalCode: z.string().optional(),
    }),
  ),
});

/** A batch as its reader is served it: the batch, its documents with their staged rows and preview, its outcomes. */
export const importBatchReadSchema = z.strictObject({
  asOf,
  batch: z.strictObject({
    batchId: idSchema,
    code: z.string(),
    kind: importKindSchema,
    target: z.string(),
    state: importBatchStateSchema,
    storedFileId: idSchema,
    /** The attachment through which the file is read (section 11). */
    attachmentId: idSchema,
    layoutVersionId: idSchema,
    mappingVersionId: idSchema,
    /** The classes the file is held to carry: every class while its layout version is not Confirmed (section 11). */
    restrictedClasses: z.array(fieldClassSchema),
    startedByUserId: idSchema,
    startedAt: asOf,
    /** What the reader noted it could not read (9.1, A-11). */
    readerNotes: z.array(z.strictObject({ sheet: z.string(), ref: z.string().optional(), note: z.string() })),
  }),
  documents: z.array(
    z.strictObject({
      documentId: idSchema,
      reference: z.string(),
      state: z.enum(['Staged', 'Published']),
      rows: z.array(stagedRowSchema),
      /** The handler's preview, worked out at reading while the document is Staged. */
      preview: documentPreviewSchema.optional(),
    }),
  ),
  ignoredRows: z.array(stagedRowSchema),
  outcomes: z.array(importOutcomeSchema),
});
export type ImportBatchRead = z.infer<typeof importBatchReadSchema>;

/** Validate's answer: Validated when every document previews without issues, else still Staged (3.2). */
export const importValidatedSchema = z.strictObject({ batchId: idSchema, state: importBatchStateSchema });

/** Publish's answer, with the outcome it wrote (7.4). */
export const importPublishedSchema = z.strictObject({
  batchId: idSchema,
  state: importBatchStateSchema,
  outcomeId: idSchema,
});
