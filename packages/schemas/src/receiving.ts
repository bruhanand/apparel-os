import { z } from 'zod';
import { approvalRequestStateSchema } from './approvals.js';
import { BOOKING_CAPS } from './booking.js';
import { businessDateSchema, idSchema } from './common.js';
import { DAMAGE_CAPS } from './damage.js';
import { evidenceFileSchema, evidenceListSchema } from './files.js';
import { missingItemSchema } from './errors.js';

// `receiving`'s Arrival, count and GRN (goods-in 4.1 to 4.6, 4.9, 10.1, 10.3, section 11; PRD-REC-001 to PRD-REC-008,
// PRD-REC-012, PRD-REC-013; DEC-133, DEC-138; S2-F02-T02, S2-F02-T03). The receiver records the Arrival at the Site
// where the goods are, its invoices first, counts line by line against the invoice, with shortage, excess, wrong,
// unidentified and damage kept apart, and issues the GRN, which holds quantities and never values. A Booking approver
// then takes each held line in or leaves it held.

/** The record type of an Arrival, its invoices and its count; it carries the place, legal entity and brand (5.3). */
export const ARRIVAL_TYPE = 'receiving.arrival';
/** The record type of a GRN and its lines. Create on it issues a GRN (goods-in 4.5). */
export const GRN_TYPE = 'receiving.grn';
/**
 * The record type of a held line, the excess, wrong or unidentified goods of a GRN line received and held (goods-in
 * 4.6): edit names the product of unidentified goods; approve decides it, taking the goods in or leaving them held.
 */
export const HELD_LINE_TYPE = 'receiving.held_line';
/**
 * The action type of a held line's decision (goods-in 4.6; PRD-REC-013, POL-17.02, POL-17.11): approve takes the goods
 * in, reject leaves them held. Decided by a Booking approver, never by whoever received them.
 */
export const HELD_LINE_DECISION = 'receiving.held_line.decision';

const instantSchema = z.iso.datetime({ offset: true });

/**
 * The technical caps on what a receiver enters (goods-in 4.8 "Input caps"): the builders' choice, set by no rule of the
 * PRD or the policies, so that a row stays bounded and a quantity fits the database's whole-number column with room to
 * add lines up. **Design choice**; none is a business limit.
 */
export const RECEIVING_CAPS = {
  /** Pieces on one line, on the invoice or counted. */
  pieces: 1_000_000,
  /** Cartons of one Arrival. */
  cartons: 100_000,
  /** A vehicle or e-way bill number. */
  shortText: 30,
  /** A lorry receipt or invoice number, a style code, a colour or a batch code. */
  codeText: 60,
  /** The transporter. */
  longText: 200,
} as const;

/** Text as the receiver types it: at least one character that is not a space, at most `max` characters. */
const text = (max: number) => z.string().max(max).regex(/\S/, { message: 'Needs a character that is not a space' });

/** A whole number of pieces, never below zero (goods-in 4.3). */
const piecesSchema = z.int().min(0).max(RECEIVING_CAPS.pieces);

/** A new Arrival (goods-in 4.2): where the goods physically are, who sent them and how they came. */
export const arrivalDraftSchema = z.strictObject({
  /** The business unit the goods are received into; its Site is where they physically are (PRD-REC-004). */
  businessUnitId: idSchema,
  /** The location of the unit the receipt counts go into, such as a receiving zone the Site sets up (goods-in 4.5). */
  receivingLocationId: idSchema,
  supplierPartyId: idSchema,
  brandId: idSchema,
  transporter: text(RECEIVING_CAPS.longText),
  lorryReceipt: z.strictObject({ number: text(RECEIVING_CAPS.codeText), date: businessDateSchema }),
  vehicleNumber: text(RECEIVING_CAPS.shortText).optional(),
  ewayBillNumber: text(RECEIVING_CAPS.shortText).optional(),
  cartons: z.int().min(1).max(RECEIVING_CAPS.cartons),
  /** When the goods arrived; the recording time is kept apart (PRD-MOD-009). */
  arrivedAt: instantSchema,
  /**
   * The one booking the goods come against ("Receive against booking"), of the same supplier and brand, Approved,
   * Issued or Confirmed; none for "Goods arrived" (goods-in 3.7, 4.2; PRD-REC-002; S2-F02-T04).
   */
  bookingId: idSchema.optional(),
});
export type ArrivalDraft = z.infer<typeof arrivalDraftSchema>;

export const arrivalRecordedSchema = z.strictObject({ arrivalId: idSchema, versionToken: idSchema });
export type ArrivalRecorded = z.infer<typeof arrivalRecordedSchema>;

/**
 * A supplier invoice of the Arrival, with its uploaded file (DEC-133). An invoice number the same supplier used on
 * another Arrival is refused as a possible duplicate until the receiver confirms it (goods-in 4.2).
 */
export const invoiceDraftSchema = z.strictObject({
  number: text(RECEIVING_CAPS.codeText),
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
 * What a count line counts (goods-in 4.4): goods the invoice lists, of a product set up or not yet set up
 * (`on-invoice`); wrong goods, a known product the invoice does not list (`wrong`); or unidentified goods, not on the
 * invoice and matching no product, with no identity at all (`unidentified`). A missing PT alone never makes goods wrong
 * (PRD-REC-012).
 */
export const lineGoodsSchema = z.enum(['on-invoice', 'wrong', 'unidentified']);
export type LineGoods = z.infer<typeof lineGoodsSchema>;

/**
 * What the receiver records of a line's extra pieces (goods-in 4.4): counted beyond the invoice quantity, or every piece
 * of goods not on the invoice. Received, they stay at the Site and are held; not received, they are not kept and no
 * custody is created, the finding staying on the GRN as a record.
 */
export const extraPiecesSchema = z.enum(['received', 'not-received']);
export type ExtraPieces = z.infer<typeof extraPiecesSchema>;

/** The kind of a held line (goods-in 4.6): excess under an excess hold, wrong or unidentified goods in quarantine. */
export const heldKindSchema = z.enum(['excess', 'wrong', 'unidentified']);
export type HeldKind = z.infer<typeof heldKindSchema>;

/** What a line's findings are worked out from: what the count records of it. */
export interface CountedLine {
  readonly goods: LineGoods;
  readonly invoiceQuantity: number;
  readonly countedQuantity: number;
  readonly extra: ExtraPieces | null;
  readonly damagedQuantity: number | null;
}

/**
 * A line's findings at the count (goods-in 4.4, 4.9; PRD-REC-006), kept apart since they can coexist: the shortage,
 * pieces on the invoice not counted, never held; the extra pieces; the pieces received into custody (PRD-REC-008); the
 * held part Booking decides, the extra pieces when received; and the pieces found damaged, which never lower the
 * counted quantity. Pure, shared by the server and the count screen.
 */
export interface LineFindings {
  readonly shortage: number;
  readonly extra: number;
  readonly received: number;
  readonly held: { readonly kind: HeldKind; readonly quantity: number } | null;
  readonly damaged: number;
}

/** The extra pieces of a line: counted beyond the invoice, or every piece of goods not on it (goods-in 4.4). */
export function extraPiecesOf(line: Pick<CountedLine, 'goods' | 'invoiceQuantity' | 'countedQuantity'>): number {
  return line.goods === 'on-invoice' ? Math.max(0, line.countedQuantity - line.invoiceQuantity) : line.countedQuantity;
}

/**
 * The most pieces damage at the count may name (goods-in 4.4, 4.9; PRD-REC-006): any piece received, excess, wrong or
 * unidentified goods held too, since damage coexists with every other finding ("Damaged pieces, whatever else the line
 * shows"; RR-571, decided by the product owner on 22 Oct 2026); never pieces recorded as not received, which are not
 * at the Site. The ledger turns held goods damaged too, carrying their holds (stock-ledger 13.17).
 */
export function damageablePiecesOf(
  line: Pick<CountedLine, 'goods' | 'invoiceQuantity' | 'countedQuantity' | 'extra'>,
): number {
  const extra = extraPiecesOf(line);
  return line.countedQuantity - (extra > 0 && line.extra === 'not-received' ? extra : 0);
}

export function lineFindings(line: CountedLine): LineFindings {
  const extra = extraPiecesOf(line);
  const keepsExtra = extra > 0 && line.extra === 'received';
  return {
    shortage: line.goods === 'on-invoice' ? Math.max(0, line.invoiceQuantity - line.countedQuantity) : 0,
    extra,
    received: line.countedQuantity - (keepsExtra ? 0 : extra),
    held: keepsExtra ? { kind: line.goods === 'on-invoice' ? 'excess' : line.goods, quantity: extra } : null,
    damaged: line.damagedQuantity ?? 0,
  };
}

const damageTextSchema = z
  .string()
  .max(DAMAGE_CAPS.text)
  .regex(/\S/, { message: 'Needs a character that is not a space' });

/** The damage the count finds on a line (goods-in 4.4; PRD-DMG-001): how many pieces, what is wrong, one photo or none. */
export const countDamageSchema = z.strictObject({
  quantity: z.int().min(1).max(RECEIVING_CAPS.pieces),
  description: damageTextSchema,
  /** A photo of the damage, stored first (S1-F06-T05); attached to the damage report when the GRN is issued. */
  photo: evidenceFileSchema.nullable(),
});
export type CountDamage = z.infer<typeof countDamageSchema>;

/**
 * One line of the count, by style, colour and size as the invoice lists the goods (goods-in 4.3, 4.4; DEC-138): a new
 * line, or the next version of a line, naming the line and its latest version (code-house-rules 12.7). Goods on the
 * invoice name their style code and are on the invoice; wrong goods name their style code and their product, and are
 * not on it; unidentified goods name nothing but what they look like, and are not on it either. Extra pieces are
 * recorded as received or not received exactly when the line has some; damage only on pieces on the invoice, at most
 * those counted. **Design choice** of the shape (goods-in 4.9).
 */
export const countLineDraftSchema = z
  .strictObject({
    line: z.strictObject({ lineId: idSchema, versionToken: idSchema }).optional(),
    goods: lineGoodsSchema,
    /** As the invoice writes it, or the goods' tag for wrong goods; null for unidentified goods. */
    styleCode: text(RECEIVING_CAPS.codeText).nullable(),
    /** As the invoice names it; null when it names none (DEC-138), and for unidentified goods. */
    colour: text(RECEIVING_CAPS.codeText).nullable(),
    /**
     * A value of the attribute the Organisation marks as its size list (structure-and-masters 4.2 "As built"; goods-in
     * 4.3; RR-556), named by the value alone. Null when the invoice states none: a missing size stays missing
     * (PRD-MER-005).
     */
    sizeValueId: idSchema.nullable(),
    /**
     * The product, when the style, colour and size name one already set up; null otherwise (goods-in 4.3). Wrong goods
     * always name theirs.
     */
    skuId: idSchema.nullable(),
    /** For unidentified goods only: what they look like, since nothing else tells them apart (goods-in 4.9). */
    description: text(RECEIVING_CAPS.longText).nullable(),
    invoiceQuantity: piecesSchema,
    countedQuantity: piecesSchema,
    /** What happens to the line's extra pieces, exactly when it has some (goods-in 4.4). */
    extra: extraPiecesSchema.nullable(),
    damage: countDamageSchema.nullable(),
    /** Only for a product whose tracking profile requires them (PRD-MER-011). */
    batch: z.strictObject({ code: text(RECEIVING_CAPS.codeText), expiryDate: businessDateSchema }).nullable(),
  })
  .superRefine((line, context) => {
    const issue = (path: string, message: string) => {
      context.addIssue({ code: 'custom', path: [path], message });
    };
    if (line.goods === 'unidentified') {
      for (const field of ['styleCode', 'colour', 'sizeValueId', 'skuId', 'batch'] as const) {
        if (line[field] !== null) issue(field, 'Unidentified goods carry no identity');
      }
      if (line.description === null) issue('description', 'Say what the unidentified goods look like');
    } else {
      if (line.styleCode === null) issue('styleCode', 'A line names its style code');
      if (line.description !== null) issue('description', 'Only unidentified goods are described');
    }
    if (line.goods === 'wrong' && line.skuId === null) issue('skuId', 'Wrong goods name their product');
    if (line.goods === 'on-invoice') {
      if (line.invoiceQuantity === 0) issue('invoiceQuantity', 'Goods on the invoice have pieces on it');
    } else {
      if (line.invoiceQuantity !== 0) issue('invoiceQuantity', 'Goods not on the invoice have none on it');
      if (line.countedQuantity === 0) issue('countedQuantity', 'Goods not on the invoice are counted');
    }
    const extra = extraPiecesOf(line);
    if (extra > 0 && line.extra === null) issue('extra', 'Say whether the extra pieces are received');
    if (extra === 0 && line.extra !== null) issue('extra', 'The line has no extra pieces');
    if (line.damage !== null && line.damage.quantity > damageablePiecesOf(line)) {
      issue('damage', 'Damage at the count is of pieces received');
    }
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

/** One line of the count as it stands, with its latest version (goods-in 4.3, 4.4). */
export const countLineSchema = z.strictObject({
  lineId: idSchema,
  versionToken: idSchema,
  goods: lineGoodsSchema,
  /** Null for unidentified goods, which carry no identity (goods-in 4.4). */
  styleCode: z.string().nullable(),
  colour: z.string().nullable(),
  description: z.string().nullable(),
  extra: extraPiecesSchema.nullable(),
  damage: countDamageSchema.nullable(),
  /** The size, with the version of the size list's marking it was read under (code-house-rules 7.3; RR-556). */
  size: z
    .strictObject({ attributeId: idSchema, valueId: idSchema, markedAttributeVersionId: idSchema, code: z.string() })
    .nullable(),
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

/**
 * Where a held line stands (design-language 7): Awaiting approval while its decision waits in My work; Accepted once
 * Booking takes it in; Held once Booking leaves it held, until a supplier return (stage 3).
 */
export const heldLineStateSchema = z.enum(['Awaiting approval', 'Accepted', 'Held']);
export type HeldLineState = z.infer<typeof heldLineStateSchema>;

/** The product Booking names for unidentified goods before taking them in (goods-in 4.6), as a count line names one. */
export const namedProductSchema = z.strictObject({
  styleCode: z.string(),
  colour: z.string().nullable(),
  size: z
    .strictObject({ attributeId: idSchema, valueId: idSchema, markedAttributeVersionId: idSchema, code: z.string() })
    .nullable(),
  skuId: idSchema.nullable(),
});
export type NamedProduct = z.infer<typeof namedProductSchema>;

/** A held line as a reader of its Arrival sees it (goods-in 4.6, 4.9). */
export const heldLineSchema = z.strictObject({
  id: idSchema,
  kind: heldKindSchema,
  quantity: z.int().min(1),
  state: heldLineStateSchema,
  /** Its latest version, which naming the product names and its decision binds to (code-house-rules 12.7). */
  versionToken: idSchema,
  /** The product named for unidentified goods, or null while none is (goods-in 4.6). */
  named: namedProductSchema.nullable(),
  /** The decision's latest request and its state, where the reader may see it. */
  requestId: idSchema.nullable(),
  requestState: approvalRequestStateSchema.nullable(),
  decision: z
    .strictObject({
      outcome: z.enum(['taken-in', 'left-held']),
      decidedBy: idSchema,
      decidedAt: instantSchema,
    })
    .nullable(),
});
export type HeldLine = z.infer<typeof heldLineSchema>;

/** One line of a GRN, as its count line stood at issue, with its findings and its held part (goods-in 4.4 to 4.6). */
export const grnLineSchema = z.strictObject({
  /** The line's identifier, which a damage report on its goods names (goods-in 8.2; S2-F08-T01). */
  id: idSchema,
  lineNumber: z.int().min(1),
  goods: lineGoodsSchema,
  styleCode: z.string().nullable(),
  colour: z.string().nullable(),
  size: z.string().nullable(),
  skuId: idSchema.nullable(),
  description: z.string().nullable(),
  invoiceQuantity: piecesSchema,
  countedQuantity: piecesSchema,
  extra: extraPiecesSchema.nullable(),
  /** Shortage, extra, received and damaged pieces, worked out by `lineFindings` (goods-in 4.4). */
  findings: z.strictObject({
    shortage: piecesSchema,
    extra: piecesSchema,
    received: piecesSchema,
    damaged: piecesSchema,
  }),
  /** The damage the count found: what is wrong and the damage report it raised (goods-in 4.5, 8.5). */
  damage: z.strictObject({ quantity: z.int().min(1), description: z.string(), damageReportId: idSchema }).nullable(),
  heldLine: heldLineSchema.nullable(),
  batch: z.strictObject({ code: z.string(), expiryDate: businessDateSchema }).nullable(),
  countedBy: z.array(idSchema),
});
export type GrnLine = z.infer<typeof grnLineSchema>;

/**
 * Why a GRN line went to Booking for review at its GRN's issue rather than linking to a booking line (goods-in 3.7,
 * 4.10; PRD-BKG-007; POL-05.08): it matched no booking line, or had no identity (`no-match`), or more than one
 * (`ambiguous`); it was counted at a Site that is not the booking's destination (`other-site`); the booking's version in
 * force names another supplier (`other-supplier`); the booking had no approved version (`not-approved`); it arrived
 * after the delivery window as extended (`late`), or its pieces are beyond the booking line's outstanding (`excess`),
 * which need a different person's approval before they are accepted into the booking.
 */
export const reviewReasonSchema = z.enum([
  'no-match',
  'ambiguous',
  'other-site',
  'other-supplier',
  'not-approved',
  'late',
  'excess',
]);
export type ReviewReason = z.infer<typeof reviewReasonSchema>;

/**
 * Where a GRN line stands against bookings (goods-in 3.6, 3.7, 4.10): what its GRN's issue did with it when its Arrival
 * named a booking and it delivered pieces, linked or sent for review, or nothing otherwise (`atIssue` null); and, as far
 * as the reader may see bookings, the receipt link that gives it its booking line now, made at issue, later by Booking,
 * or by an approved proposal, and a proposal of it still waiting for its decision.
 */
export const grnLineBookingSchema = z.strictObject({
  grnLineId: idSchema,
  atIssue: z
    .discriminatedUnion('outcome', [
      z.strictObject({ outcome: z.literal('linked'), bookingId: idSchema, lineKey: idSchema }),
      z.strictObject({
        outcome: z.literal('review'),
        bookingId: idSchema,
        reason: reviewReasonSchema,
        /** The booking line a late or excess line matches, which a proposal links it to; none otherwise. */
        lineKey: idSchema.nullable(),
      }),
    ])
    .nullable(),
  link: z
    .strictObject({
      bookingId: idSchema,
      lineKey: idSchema,
      kind: z.enum(['at-issue', 'later']),
      /** The approved proposal a later link of late or excess goods came from (POL-05.08); none otherwise. */
      proposalId: idSchema.nullable(),
      linkedBy: idSchema,
      linkedAt: instantSchema,
    })
    .nullable(),
  proposal: z.strictObject({ bookingId: idSchema, proposalId: idSchema, lineKey: idSchema }).nullable(),
});
export type GrnLineBooking = z.infer<typeof grnLineBookingSchema>;

/** The GRN, as printed: quantities and findings only, never a price, tax or value (goods-in 4.5). */
export const grnSchema = z.strictObject({
  id: idSchema,
  number: z.string(),
  issuedAt: instantSchema,
  businessDate: businessDateSchema,
  /** Who entered it: the person who issued it, from their sign-in (goods-in 4.3). */
  enteredBy: idSchema,
  /** Who counted it: everyone who saved a line (goods-in 4.3). */
  countedBy: z.array(idSchema),
  lines: z.array(grnLineSchema),
  /** Each line's place against bookings, in the lines' order (goods-in 3.7, 4.10; S2-F02-T04). */
  bookingLinks: z.array(grnLineBookingSchema),
});
export type Grn = z.infer<typeof grnSchema>;

/**
 * Booking links GRN lines to the lines of one booking later (goods-in 3.7, 4.10; PRD-BKG-008; POL-05.08): a GRN
 * received without a booking, or lines sent for review. Each names its GRN line once and the booking line it delivers
 * by its key; at most `BOOKING_CAPS.lines` of them, a technical cap (goods-in 3.9 "Input caps").
 */
export const grnBookingLinksDraftSchema = z.strictObject({
  bookingId: idSchema,
  lines: z
    .array(z.strictObject({ grnLineId: idSchema, lineKey: idSchema }))
    .min(1)
    .max(BOOKING_CAPS.lines)
    .refine((lines) => new Set(lines.map((line) => line.grnLineId)).size === lines.length, {
      message: 'Name each GRN line once',
    }),
});
export type GrnBookingLinksDraft = z.infer<typeof grnBookingLinksDraftSchema>;

/**
 * What the later link answers: the lines linked now, and the proposal of those that need a different person's
 * approval first, late or excess goods (POL-05.08), or none.
 */
export const grnBookingLinkedSchema = z.strictObject({
  linked: z.array(z.strictObject({ grnLineId: idSchema, linkId: idSchema, lineKey: idSchema })),
  proposal: z
    .strictObject({ proposalId: idSchema, requestId: idSchema, grnLineIds: z.array(idSchema).min(1) })
    .nullable(),
});
export type GrnBookingLinked = z.infer<typeof grnBookingLinkedSchema>;

export const grnParamsSchema = z.strictObject({ grnId: idSchema });

/**
 * Naming the product of unidentified goods before they are taken in (goods-in 4.6): by style code, colour and size
 * from the size list, as a count line names its goods, and the product where one is set up; naming the held line's
 * latest version (code-house-rules 12.7). The decision is asked again on the version it makes.
 */
export const heldLineProductDraftSchema = z.strictObject({
  versionToken: idSchema,
  styleCode: text(RECEIVING_CAPS.codeText),
  colour: text(RECEIVING_CAPS.codeText).nullable(),
  sizeValueId: idSchema.nullable(),
  skuId: idSchema.nullable(),
});
export type HeldLineProductDraft = z.infer<typeof heldLineProductDraftSchema>;

export const heldLineProductNamedSchema = z.strictObject({ versionToken: idSchema, requestId: idSchema });
export type HeldLineProductNamed = z.infer<typeof heldLineProductNamedSchema>;

export const heldLineParamsSchema = z.strictObject({ heldLineId: idSchema });

/**
 * A held line with the GRN line it holds and where it is, as its decision's panel in My work shows it (goods-in 4.6,
 * section 11): read with view on the Arrival.
 */
export const heldLineReadSchema = z.strictObject({
  asOf: instantSchema,
  arrivalId: idSchema,
  grnNumber: z.string(),
  supplierPartyId: idSchema,
  brandId: idSchema,
  businessUnitId: idSchema,
  line: grnLineSchema,
  people: z.array(z.strictObject({ userId: idSchema, name: z.string() })),
});
export type HeldLineRead = z.infer<typeof heldLineReadSchema>;

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
  /** The booking the goods come against, whose open lines are the expected goods, or none (goods-in 3.7, 4.1). */
  bookingId: idSchema.nullable(),
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
  /**
   * What the delivery waits for next (goods-in 4.1): its invoice, its count, its GRN, the decisions of its held lines
   * and damage reported at the count, or its PT.
   */
  waitingFor: z.enum(['invoice', 'count', 'grn', 'held-lines', 'pt']),
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
