import { z } from 'zod';
import { approvalRequestStateSchema } from './approvals.js';
import { idSchema, paiseSchema } from './common.js';
import { missingItemSchema } from './errors.js';
import { importBatchStateSchema, issueSeveritySchema } from './imports.js';
import { fieldClassSchema } from './roles.js';

// `merchandise` · PT, the upload of a PT file for a GRN (goods-in 5.1 to 5.8, section 11; DEC-134, DEC-135, DEC-137,
// DEC-138, DEC-140; S2-F04-T02): the GRN's PT with its mark and revisions, the preview of an uploaded file, the
// withdrawal of a draft and the blank template. No list, value, layout or amount is set here: the Organisation
// records its own (AGENTS.md "Never invent a value").

const asOf = z.iso.datetime({ offset: true });

/** The record type of a PT, scoped by its GRN's place, legal entity and brand (access-and-approvals 5.3). */
export const PT_TYPE = 'merchandise.pt';
/**
 * The action type of a PT revision's approval: by a different person, within a limit on its total proposed acquisition
 * cost, P RATE times QTY (goods-in 6.1; PRD-ACS-015, PRD-REC-017, POL-02.09).
 */
export const PT_APPROVAL = 'merchandise.pt.approve';
/** The import target a PT file is uploaded to, a transaction batch for one GRN (goods-in 5; imports 4.1, 13.2). */
export const PT_IMPORT_TARGET = 'merchandise.pt';

/** An amount of cost or margin a reader may not see: its class instead of its value (access-and-approvals 6). */
const maskedSchema = z.strictObject({ kind: z.literal('masked'), fieldClass: fieldClassSchema });
export const maskablePaiseSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('amount'), paise: paiseSchema }),
  maskedSchema,
]);
export type MaskablePaise = z.infer<typeof maskablePaiseSchema>;
export const maskableMarginSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('margin'), value: z.string().regex(/^-?\d+\.\d{2}$/) }),
  maskedSchema,
]);

/** The totals of a PT (goods-in 5.7): pieces, and the sums of MRP, BASIC and P RATE times QTY. */
export const ptTotalsSchema = z.strictObject({
  rows: z.number().int().nonnegative(),
  pieces: z.number().int().nonnegative(),
  mrpPaise: paiseSchema,
  basicPaise: maskablePaiseSchema,
  /** The total proposed acquisition cost the approval is judged on (goods-in 6.1). */
  costPaise: maskablePaiseSchema,
});

/** A GRN's "PT attached" mark (goods-in 5.8): set by a PT revision, or not, with its latest change. */
const markChangeSchema = z.strictObject({
  ptRevisionId: idSchema,
  reason: z.enum(['pt-submitted', 'pt-withdrawn', 'pt-rejected', 'pt-reversed']),
  changedBy: idSchema,
  occurredAt: asOf,
});
export const ptMarkSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('not-set'), lastChange: markChangeSchema.optional() }),
  z.strictObject({ kind: z.literal('set'), ptRevisionId: idSchema, lastChange: markChangeSchema }),
]);

/**
 * A revision's state (design-language 7; goods-in 6.3, 6.6): Awaiting approval, Withdrawn or Rejected; once approved,
 * Official when its approval is posted, Posting while a large PT waits for its posting job, as stock-ledger 10.6 names
 * it, and Failed when that job was refused, its decision kept unused (access-and-approvals 9.8; S2-F06-T01, code
 * review 7).
 */
export const ptRevisionStateSchema = z.enum([
  'Awaiting approval',
  'Withdrawn',
  'Rejected',
  'Posting',
  'Failed',
  'Official',
]);
export type PtRevisionState = z.infer<typeof ptRevisionStateSchema>;

/** One PT file submitted for the GRN, as its GRN's screen lists it (goods-in 5.7). */
export const ptRevisionSummarySchema = z.strictObject({
  revisionId: idSchema,
  revisionNumber: z.number().int().positive(),
  state: ptRevisionStateSchema,
  batchId: idSchema,
  uploadedBy: idSchema,
  submittedAt: asOf,
  totals: ptTotalsSchema,
  newProducts: z.number().int().nonnegative(),
  repeatedBarcodes: z.number().int().nonnegative(),
  differences: z.number().int().nonnegative(),
  request: z.strictObject({ id: idSchema, state: approvalRequestStateSchema }).optional(),
  withdrawn: z.strictObject({ by: idSchema, at: asOf }).optional(),
  /** The PT's number from its series, once its approval is posted (goods-in 6.3 step 3; S2-F06-T01). */
  number: z.string().optional(),
});
export type PtRevisionSummary = z.infer<typeof ptRevisionSummarySchema>;

/**
 * The PT of a GRN as its screen reads it (goods-in 5.1, 5.7, 5.8, section 11): the GRN, its mark, whether a file can be
 * uploaded now and, where not, what blocks it, and the PT with its revisions, newest first, and its version token.
 */
export const grnPtReadSchema = z.strictObject({
  asOf,
  grn: z.strictObject({ grnId: idSchema, number: z.string() }),
  mark: ptMarkSchema,
  upload: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('ready') }),
    z.strictObject({ kind: z.literal('blocked'), code: z.string(), missing: z.array(missingItemSchema) }),
  ]),
  pt: z
    .strictObject({ ptId: idSchema, versionToken: idSchema, revisions: z.array(ptRevisionSummarySchema) })
    .nullable(),
  /** The names of the people named, an unknown one left out (PRD-MOD-015). */
  people: z.array(z.strictObject({ userId: idSchema, name: z.string() })),
});
export type GrnPtRead = z.infer<typeof grnPtReadSchema>;

/** The largest page of a preview's rows: a technical cap the builders set (code-house-rules 12.1 "Reads"). */
export const PT_PREVIEW_PAGE_CAP = 200;

export const ptPreviewQuerySchema = z.strictObject({
  /** The last row number of the page before. */
  after: z
    .string()
    .regex(/^[1-9]\d*$/)
    .optional(),
  limit: z
    .string()
    .regex(/^[1-9]\d*$/)
    .optional(),
});

/** One issue of the batch's validation report, as the PT screen lists it by row and column (goods-in 5.6). */
export const ptIssueSchema = z.strictObject({
  /** The issue and its class, which marking a Warning seen names (imports-and-opening-data 8.2). */
  issueId: idSchema,
  class: z.string(),
  code: z.string(),
  severity: issueSeveritySchema,
  /** The sheet an issue about a sheet names, such as the template's lists sheet, which is not imported (8.1). */
  sheet: z.string().optional(),
  rowNumber: z.number().int().positive().optional(),
  column: z.string().optional(),
  field: z.string().optional(),
  missing: z.array(missingItemSchema),
  /** Who marked a Warning seen; Submit counts only the submitter's own mark (imports-and-opening-data 8 "As built"). */
  seenBy: idSchema.optional(),
});

/** One row of the file as the preview shows it (goods-in 5.6 step 3). */
export const ptPreviewRowSchema = z.strictObject({
  rowNumber: z.number().int().positive(),
  styleCode: z.string(),
  size: z.string(),
  colour: z.string(),
  barcode: z.string(),
  quantity: z.number().int().positive(),
  mrpPaise: paiseSchema,
  basicPaise: maskablePaiseSchema,
  pRatePaise: maskablePaiseSchema,
  margin: maskableMarginSchema,
  product: z.enum(['existing', 'proposed']),
  repeated: z.boolean(),
});

/**
 * The preview of an uploaded PT file (goods-in 5.6): the batch as it stands; its validation report's issues, every
 * problem by row and column; and, once the file passes every check, what submitting it makes: the rows a page at a
 * time, the totals, the GRN's styles and sizes it covers, the new products it proposes, the repeated barcodes and the
 * differences from existing products.
 */
export const ptPreviewSchema = z.strictObject({
  asOf,
  batchId: idSchema,
  batchCode: z.string(),
  batchVersionId: idSchema,
  batchState: importBatchStateSchema,
  submitted: z.boolean(),
  grnId: idSchema,
  issues: z.array(ptIssueSchema),
  draft: z
    .strictObject({
      totals: ptTotalsSchema,
      coverage: z.array(
        z.strictObject({ styleCode: z.string(), size: z.string().nullable(), quantity: z.number().int().positive() }),
      ),
      newProducts: z.array(
        z.strictObject({
          styleCode: z.string(),
          colour: z.string(),
          size: z.string(),
          newStyle: z.boolean(),
          rowNumbers: z.array(z.number().int().positive()),
        }),
      ),
      repeatedBarcodes: z.array(
        z.strictObject({ barcode: z.string(), rowNumbers: z.array(z.number().int().positive()) }),
      ),
      differences: z.array(
        z.strictObject({
          rowNumber: z.number().int().positive(),
          field: z.string(),
          file: z.string(),
          product: z.string().nullable(),
        }),
      ),
      rows: z.array(ptPreviewRowSchema),
      next: z.number().int().positive().nullable(),
    })
    .nullable(),
});
export type PtPreview = z.infer<typeof ptPreviewSchema>;

/** Withdraw a draft PT revision (goods-in 5.7): the PT's version token, as its GRN's screen read it (12.7). */
export const ptWithdrawalSchema = z.strictObject({ versionToken: idSchema });
export const ptWithdrawnSchema = z.strictObject({ ptId: idSchema, revisionId: idSchema, withdrawalId: idSchema });

/**
 * A failed PT posted again: the further request to post naming the same decision, which the posting job posts
 * (goods-in 6.6; access-and-approvals 9.8 step 5; books-and-posting 10 step 5; code review 7).
 */
export const ptPostedAgainSchema = z.strictObject({ revisionId: idSchema, postRequestId: idSchema });

/**
 * The blank template of a Confirmed layout version, and the name of its lists sheet in the screen's words, apart from
 * the template's sheet (code-house-rules 12.13): at most 31 characters, none of those a sheet name may not hold.
 */
export const ptTemplateQuerySchema = z.strictObject({
  layoutVersionId: idSchema,
  listsSheet: z.string().regex(/^[^[\]:*?/\\]{1,31}$/),
});
/** The blank template of a layout version, with the lists its values must be on (goods-in section 11). */
export const ptTemplateSchema = z.strictObject({ fileName: z.string(), contentBase64: z.base64() });

/**
 * Why a queued posting of a PT's approval was refused (goods-in 6.3, 6.6; stock-ledger 10.6; access-and-approvals 9.8
 * step 4): the refusal's code and what it names, kept with the request to post; the decision stays unused.
 */
export const ptPostingFailureSchema = z.strictObject({
  code: z.string(),
  missing: z.array(missingItemSchema),
  at: asOf,
});

/** The largest page of a revision's rows the review reads: a technical cap (code-house-rules 12.1 "Reads"). */
export const PT_REVISION_ROWS_PAGE_CAP = 200;

export const ptRevisionParamsSchema = z.strictObject({ revisionId: idSchema });

/**
 * A PT revision as its approver reviews it in My work and its GRN's screen shows it (goods-in 6.2, 6.3, 6.6, section
 * 11; S2-F06-T01): the GRN with its Arrival, whose invoices and photos the Arrival shows, and the bookings its lines
 * are linked to; who uploaded it and when; its
 * state, its number once Official, and a queued posting's failure; the totals of pieces, MRP, BASIC and P RATE times
 * QTY side by side (DEC-140); the new products it proposes, each with its SKU code once confirmed; the repeated barcodes
 * and the differences from existing products (goods-in 5.5); and its rows, a page at a time, with BASIC, P RATE and
 * MARGIN masked for a reader not granted cost or margin (PRD-ACS-008).
 */
export const ptRevisionReadSchema = z.strictObject({
  asOf,
  ptId: idSchema,
  revisionId: idSchema,
  revisionNumber: z.number().int().positive(),
  state: ptRevisionStateSchema,
  number: z.string().nullable(),
  grn: z.strictObject({ grnId: idSchema, number: z.string(), arrivalId: idSchema }),
  uploadedBy: idSchema,
  submittedAt: asOf,
  request: z.strictObject({ id: idSchema, state: approvalRequestStateSchema }).optional(),
  failure: ptPostingFailureSchema.optional(),
  /**
   * The bookings the GRN's lines are linked to, as far as the reader may see them, each with the GRN lines linked to
   * it: the line's style and size and the booking line's key (goods-in 6.2; code review 7). The screen reads each
   * booking for its reference.
   */
  bookings: z.array(
    z.strictObject({
      bookingId: idSchema,
      lines: z.array(
        z.strictObject({
          grnLineId: idSchema,
          /** Unknown (null) for goods the count could not identify (goods-in 4.6; PRD-MOD-015). */
          styleCode: z.string().nullable(),
          size: z.string().nullable(),
          lineKey: idSchema,
        }),
      ),
    }),
  ),
  totals: ptTotalsSchema,
  newProducts: z.array(
    z.strictObject({
      styleCode: z.string(),
      colour: z.string(),
      size: z.string(),
      newStyle: z.boolean(),
      rowNumbers: z.array(z.number().int().positive()),
      /** The SKU's code the approval generated (RR-585); absent before. */
      skuCode: z.string().optional(),
    }),
  ),
  repeatedBarcodes: z.array(z.strictObject({ barcode: z.string(), rowNumbers: z.array(z.number().int().positive()) })),
  differences: z.array(
    z.strictObject({
      rowNumber: z.number().int().positive(),
      field: z.string(),
      file: z.string(),
      product: z.string().nullable(),
    }),
  ),
  rows: z.array(ptPreviewRowSchema),
  next: z.number().int().positive().nullable(),
  /** The names of the people named, an unknown one left out (PRD-MOD-015). */
  people: z.array(z.strictObject({ userId: idSchema, name: z.string() })),
});
export type PtRevisionRead = z.infer<typeof ptRevisionReadSchema>;

/** An Official PT as an XLSX file in its template's columns (goods-in 6.5; PRD-PTW-008, PRD-PTW-009). */
export const ptDownloadSchema = z.strictObject({ fileName: z.string(), contentBase64: z.base64() });
