import { z } from 'zod';
import { businessDateSchema, idSchema } from './common.js';
import { evidenceFileSchema, evidenceListSchema } from './files.js';
import { missingItemSchema } from './errors.js';

// `receiving`'s Arrival, count and GRN (goods-in 4.1 to 4.5, 10.1, 10.3, section 11; PRD-REC-001 to PRD-REC-005,
// PRD-REC-007, PRD-REC-008; DEC-133, DEC-138; S2-F02-T02). The receiver records the Arrival at the Site where the goods
// are, its invoices first, counts line by line against the invoice and issues the GRN, which holds quantities and never
// values. In this first piece a GRN is issued only when every line's counted quantity equals its invoice quantity; the
// findings at the count come with S2-F02-T03.

/** The record type of an Arrival, its invoices and its count; it carries the place, legal entity and brand (5.3). */
export const ARRIVAL_TYPE = 'receiving.arrival';
/** The record type of a GRN and its lines. Create on it issues a GRN (goods-in 4.5). */
export const GRN_TYPE = 'receiving.grn';

const instantSchema = z.iso.datetime({ offset: true });

/** Text as the receiver types it: at least one character that is not a space, at most `max` characters. */
const text = (max: number) => z.string().max(max).regex(/\S/, { message: 'Needs a character that is not a space' });

/** A whole number of pieces, never below zero (goods-in 4.3). */
const piecesSchema = z.int().min(0).max(1_000_000);

/** A new Arrival (goods-in 4.2): where the goods physically are, who sent them and how they came. */
export const arrivalDraftSchema = z.strictObject({
  /** The business unit the goods are received into; its Site is where they physically are (PRD-REC-004). */
  businessUnitId: idSchema,
  /** The location of the unit the receipt counts go into, such as a receiving zone the Site sets up (goods-in 4.5). */
  receivingLocationId: idSchema,
  supplierPartyId: idSchema,
  brandId: idSchema,
  transporter: text(200),
  lorryReceipt: z.strictObject({ number: text(60), date: businessDateSchema }),
  vehicleNumber: text(30).optional(),
  ewayBillNumber: text(30).optional(),
  cartons: z.int().min(1).max(100_000),
  /** When the goods arrived; the recording time is kept apart (PRD-MOD-009). */
  arrivedAt: instantSchema,
});
export type ArrivalDraft = z.infer<typeof arrivalDraftSchema>;

export const arrivalRecordedSchema = z.strictObject({ arrivalId: idSchema, versionToken: idSchema });
export type ArrivalRecorded = z.infer<typeof arrivalRecordedSchema>;

/**
 * A supplier invoice of the Arrival, with its uploaded file (DEC-133). An invoice number the same supplier used on
 * another Arrival is refused as a possible duplicate until the receiver confirms it (goods-in 4.2).
 */
export const invoiceDraftSchema = z.strictObject({
  number: text(60),
  date: businessDateSchema,
  file: evidenceFileSchema,
  confirmPossibleDuplicate: z.boolean().optional(),
});
export type InvoiceDraft = z.infer<typeof invoiceDraftSchema>;

export const invoiceRecordedSchema = z.strictObject({
  invoiceId: idSchema,
  attachmentId: idSchema,
  versionToken: idSchema,
});
export type InvoiceRecorded = z.infer<typeof invoiceRecordedSchema>;

/** Photos of the cartons, seals and any damage, as stored files (PRD-REC-007). */
export const photosDraftSchema = z.strictObject({ files: evidenceListSchema });
export type PhotosDraft = z.infer<typeof photosDraftSchema>;

export const photosAttachedSchema = z.strictObject({ attachmentIds: z.array(idSchema), versionToken: idSchema });
export type PhotosAttached = z.infer<typeof photosAttachedSchema>;

/**
 * A size of the Organisation's size list: a value of a list attribute, named by the attribute and the value, as a
 * budget names its season (goods-in 4.3; GI-2, GI-3).
 */
export const sizeRefSchema = z.strictObject({ attributeId: idSchema, valueId: idSchema });
export type SizeRef = z.infer<typeof sizeRefSchema>;

/**
 * One line of the count, by style, colour and size as the invoice lists the goods (goods-in 4.3; DEC-138): a new line,
 * or the next version of a line, naming the line and its latest version (code-house-rules 12.7).
 */
export const countLineDraftSchema = z
  .strictObject({
    line: z.strictObject({ lineId: idSchema, versionToken: idSchema }).optional(),
    styleCode: text(60),
    /** As the invoice names it; null when it names none (DEC-138). */
    colour: text(60).nullable(),
    /** Null when the invoice states none: a missing size stays missing (PRD-MER-005). */
    size: sizeRefSchema.nullable(),
    /** The product, when the style, colour and size name one already set up; null otherwise (goods-in 4.3). */
    skuId: idSchema.nullable(),
    invoiceQuantity: piecesSchema,
    countedQuantity: piecesSchema,
    /** Only for a product whose tracking profile requires them (PRD-MER-011). */
    batch: z.strictObject({ code: text(60), expiryDate: businessDateSchema }).nullable(),
  })
  .refine((line) => line.invoiceQuantity > 0 || line.countedQuantity > 0, {
    message: 'A line has pieces on the invoice or counted',
    path: ['countedQuantity'],
  });
export type CountLineDraft = z.infer<typeof countLineDraftSchema>;

export const countLineSavedSchema = z.strictObject({
  lineId: idSchema,
  lineVersionToken: idSchema,
  versionToken: idSchema,
});
export type CountLineSaved = z.infer<typeof countLineSavedSchema>;

/** Removing a line of the count before the GRN, naming its latest version. */
export const countLineRemovalSchema = z.strictObject({ lineVersionToken: idSchema });
export type CountLineRemoval = z.infer<typeof countLineRemovalSchema>;

/** Issuing the GRN, naming the Arrival's latest version the receiver saw (goods-in 4.5; code-house-rules 12.7). */
export const grnIssueSchema = z.strictObject({ versionToken: idSchema });
export type GrnIssue = z.infer<typeof grnIssueSchema>;

export const grnIssuedSchema = z.strictObject({ grnId: idSchema, number: z.string().min(1) });
export type GrnIssued = z.infer<typeof grnIssuedSchema>;

/**
 * Where an Arrival stands (design-language 7): In progress while it is counted; Issued once its GRN is, which then
 * waits for its PT (goods-in 4.1). The later states come with the held lines, the PT and the scan-in.
 */
export const arrivalStateSchema = z.enum(['In progress', 'Issued']);
export type ArrivalState = z.infer<typeof arrivalStateSchema>;

/** Whether receiving is available at a unit now, and what is missing when it is not (goods-in 4.1; PRD-UXP-003). */
export const receivingAvailabilitySchema = z.strictObject({
  state: z.enum(['available', 'unavailable']),
  missing: z.array(missingItemSchema),
});
export type ReceivingAvailability = z.infer<typeof receivingAvailabilitySchema>;

/** One line of the count as it stands, with its latest version (goods-in 4.3). */
export const countLineSchema = z.strictObject({
  lineId: idSchema,
  versionToken: idSchema,
  styleCode: z.string(),
  colour: z.string().nullable(),
  size: z.strictObject({ attributeId: idSchema, valueId: idSchema, code: z.string() }).nullable(),
  skuId: idSchema.nullable(),
  invoiceQuantity: piecesSchema,
  countedQuantity: piecesSchema,
  batch: z.strictObject({ code: z.string(), expiryDate: businessDateSchema }).nullable(),
  /** Who counted it: everyone who saved a version of it, from their sign-ins (goods-in 4.3). */
  countedBy: z.array(idSchema),
  savedAt: instantSchema,
});
export type CountLine = z.infer<typeof countLineSchema>;

export const arrivalInvoiceSchema = z.strictObject({
  id: idSchema,
  number: z.string(),
  date: businessDateSchema,
  attachmentId: idSchema,
  /** Other Arrivals of the same supplier with this number the receiver may see, confirmed when recorded. */
  possibleDuplicateOf: z.array(idSchema),
  /** Whether Arrivals the receiver may not see hold the number too. */
  possibleDuplicateElsewhere: z.boolean(),
  recordedBy: idSchema,
  recordedAt: instantSchema,
});
export type ArrivalInvoice = z.infer<typeof arrivalInvoiceSchema>;

/** The GRN, as printed: quantities only, never a price, tax or value (goods-in 4.5). */
export const grnSchema = z.strictObject({
  id: idSchema,
  number: z.string(),
  issuedAt: instantSchema,
  businessDate: businessDateSchema,
  /** Who entered it: the person who issued it, from their sign-in (goods-in 4.3). */
  enteredBy: idSchema,
  /** Who counted it: everyone who saved a line (goods-in 4.3). */
  countedBy: z.array(idSchema),
  lines: z.array(
    z.strictObject({
      lineNumber: z.int().min(1),
      styleCode: z.string(),
      colour: z.string().nullable(),
      size: z.string().nullable(),
      skuId: idSchema.nullable(),
      invoiceQuantity: piecesSchema,
      countedQuantity: piecesSchema,
      batch: z.strictObject({ code: z.string(), expiryDate: businessDateSchema }).nullable(),
      countedBy: z.array(idSchema),
    }),
  ),
});
export type Grn = z.infer<typeof grnSchema>;

/** An Arrival as the Arrival and Count screens show it (goods-in 4.2 to 4.5). */
export const arrivalSchema = z.strictObject({
  id: idSchema,
  state: arrivalStateSchema,
  siteId: idSchema,
  storeId: idSchema.nullable(),
  businessUnitId: idSchema,
  receivingLocationId: idSchema,
  supplierPartyId: idSchema,
  brandId: idSchema,
  transporter: z.string(),
  lorryReceipt: z.strictObject({ number: z.string(), date: businessDateSchema }),
  vehicleNumber: z.string().nullable(),
  ewayBillNumber: z.string().nullable(),
  cartons: z.int().min(1),
  arrivedAt: instantSchema,
  recordedBy: idSchema,
  recordedAt: instantSchema,
  /** The latest change of the Arrival, which issuing the GRN names (code-house-rules 12.7). */
  versionToken: idSchema,
  invoices: z.array(arrivalInvoiceSchema),
  photoAttachmentIds: z.array(idSchema),
  lines: z.array(countLineSchema),
  grn: grnSchema.nullable(),
  /** What blocks the next action, issuing the GRN, while it is In progress (PRD-UXP-003). */
  blocking: z.array(missingItemSchema),
  /** The names of the people it names, who recorded, counted and entered it, from their sign-ins (goods-in 4.3). */
  people: z.array(z.strictObject({ userId: idSchema, name: z.string() })),
});
export type Arrival = z.infer<typeof arrivalSchema>;

export const arrivalReadSchema = z.strictObject({ asOf: instantSchema, arrival: arrivalSchema });
export type ArrivalRead = z.infer<typeof arrivalReadSchema>;

/** The inbox's two views (goods-in 4.1). */
export const inboxViewSchema = z.enum(['pending', 'history']);
export type InboxView = z.infer<typeof inboxViewSchema>;

/**
 * The most deliveries one page of the inbox holds, a technical cap (code-house-rules 12.1); a longer list is read page
 * by page with the cursor, the last delivery of the page before.
 */
export const INBOX_PAGE_CAP = 100;

export const inboxQuerySchema = z.strictObject({
  view: inboxViewSchema,
  after: idSchema.optional(),
  limit: z
    .string()
    .regex(/^[1-9]\d*$/)
    .refine((limit) => Number(limit) <= INBOX_PAGE_CAP, { message: `At most ${String(INBOX_PAGE_CAP)}` })
    .optional(),
});
export type InboxQuery = z.infer<typeof inboxQuerySchema>;
export const inboxParamsSchema = z.strictObject({ siteId: idSchema });

/** One delivery in the inbox (goods-in 4.1). */
export const inboxEntrySchema = z.strictObject({
  arrivalId: idSchema,
  state: arrivalStateSchema,
  businessUnitId: idSchema,
  supplierPartyId: idSchema,
  brandId: idSchema,
  arrivedAt: instantSchema,
  invoiceNumbers: z.array(z.string()),
  lines: z.int().min(0),
  countedPieces: z.int().min(0),
  grn: z.strictObject({ id: idSchema, number: z.string(), issuedAt: instantSchema }).nullable(),
  /** What the delivery waits for next (goods-in 4.1): its invoice, its count, its GRN, or its PT. */
  waitingFor: z.enum(['invoice', 'count', 'grn', 'pt']),
});
export type InboxEntry = z.infer<typeof inboxEntrySchema>;

/** The Receive Goods inbox of one Site (goods-in 4.1; PRD-REC-001, PRD-REC-002). */
export const inboxSchema = z.strictObject({
  asOf: instantSchema,
  siteId: idSchema,
  view: inboxViewSchema,
  /** Each business unit of the Site in force today, with whether it may receive and the locations it receives into. */
  units: z.array(
    z.strictObject({
      businessUnitId: idSchema,
      code: z.string(),
      name: z.string(),
      receiving: receivingAvailabilitySchema,
      locations: z.array(z.strictObject({ id: idSchema, code: z.string(), name: z.string() })),
    }),
  ),
  /** The deliveries, newest recorded first, a page at a time. */
  entries: z.array(inboxEntrySchema),
  /** Where the next page starts, null on the last (code-house-rules 12.1). */
  next: idSchema.nullable(),
});
export type Inbox = z.infer<typeof inboxSchema>;
