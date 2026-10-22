import { paise } from '@apparel-os/domain';
import { z } from 'zod';
import { approvalRequestStateSchema } from './approvals.js';
import { businessDateSchema, idSchema, paiseSchema } from './common.js';
import { evidenceListSchema } from './files.js';
import { agreementTermsSchema } from './parties.js';
import { settingOriginSchema } from './settings.js';

// `booking`'s open-to-buy budgets (goods-in 3.3, 10.1; PRD-BKG-004; POL-05.09, POL-02.07; S2-F01-T02): one amount in
// paise for one brand and one season, with versions. Booking prepares a version, Accounts records its check, and the
// Owner, or whoever holds the approval, approves it, each a different person from its preparer; a version is used only
// once approved. No amount is set here: every budget is the product owner's, OPEN until set (V-17, RR-080), and an
// amount on `dev` or in a test is labelled synthetic (code-house-rules 12.14).

/** The record type a budget is prepared, read and approved under; it carries the brand (access-and-approvals 5.3). */
export const OPEN_TO_BUY_BUDGET_TYPE = 'booking.open_to_buy_budget';
/** The record type Accounts' check of a budget version is decided under, apart from its approval (goods-in 3.3). */
export const OPEN_TO_BUY_CHECK_TYPE = 'booking.open_to_buy_check';
/** The action type of Accounts' check of a budget version (POL-05.09). */
export const OPEN_TO_BUY_CHECK = 'booking.open_to_buy_budget.check';
/** The action type of a budget version's approval, requested once its check is recorded (POL-05.09). */
export const OPEN_TO_BUY_APPROVAL = 'booking.open_to_buy_budget.change';

/** An amount in whole paise, never below zero (PRD-MOD-014). */
const amountSchema = paiseSchema.refine((value) => value >= 0, { message: 'An amount is never below zero' });

/**
 * A new budget for a brand and a season, with its first version (3.3). The season is a value of the attribute the
 * Organisation marks as its season (structure-and-masters 4.2 "As built"; goods-in 3.1; RR-550), so a budget names the
 * value alone; while none is marked, a budget is refused, naming the setting.
 */
export const openToBuyBudgetDraftSchema = z.strictObject({
  brandId: idSchema,
  seasonValueId: idSchema,
  amount: amountSchema,
  origin: settingOriginSchema,
});
export type OpenToBuyBudgetDraft = z.infer<typeof openToBuyBudgetDraftSchema>;

/** A budget's later version, through the same three steps (3.3), naming the newest version it replaces (12.7). */
export const openToBuyBudgetVersionDraftSchema = z.strictObject({
  amount: amountSchema,
  origin: settingOriginSchema,
  versionToken: idSchema,
});
export type OpenToBuyBudgetVersionDraft = z.infer<typeof openToBuyBudgetVersionDraftSchema>;

/** What preparing a budget or a version answers: the version waits for Accounts' check, requested here. */
export const openToBuyBudgetPreparedSchema = z.strictObject({
  budgetId: idSchema,
  versionId: idSchema,
  requestId: idSchema,
});
export type OpenToBuyBudgetPrepared = z.infer<typeof openToBuyBudgetPreparedSchema>;

/**
 * The state of one budget version (design-language 7): Awaiting approval, through Accounts' check and then the
 * approval; Superseded, when a newer version ended its request before it was decided; In force, the approved version
 * used now; Ended, an approved version a later one replaced; Rejected, at the check or at the approval.
 */
export const openToBuyVersionStateSchema = z.enum(['Awaiting approval', 'Superseded', 'In force', 'Ended', 'Rejected']);
export type OpenToBuyVersionState = z.infer<typeof openToBuyVersionStateSchema>;

const instantSchema = z.iso.datetime({ offset: true });

/** One version of a budget, with its history kept (3.3). */
export const openToBuyBudgetVersionSchema = z.strictObject({
  id: idSchema,
  amount: paiseSchema,
  origin: settingOriginSchema,
  state: openToBuyVersionStateSchema,
  /** While it is Awaiting approval: the step it waits for, Accounts' check or the approval. */
  awaiting: z.enum(['check', 'approval']).optional(),
  preparedBy: idSchema,
  preparedAt: instantSchema,
  /** Accounts' check, once recorded: who checked it and when. */
  check: z.strictObject({ checkedBy: idSchema, checkedAt: instantSchema }).optional(),
  /** While approved: the instants it was in force from and, once a later version replaced it, until. */
  inForceFrom: instantSchema.optional(),
  inForceUntil: instantSchema.optional(),
  /** The latest approval request of the version, for the approval panel. */
  request: z.strictObject({ id: idSchema, state: approvalRequestStateSchema }).optional(),
});
export type OpenToBuyBudgetVersion = z.infer<typeof openToBuyBudgetVersionSchema>;

/**
 * The remaining open-to-buy of a brand and season (3.3): the approved budget less the value reserved by approved
 * bookings of that brand and season, or none while no version is approved, which is never zero (PRD-MOD-015).
 */
export const openToBuyRemainingSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('not-approved') }),
  z.strictObject({
    kind: z.literal('approved'),
    versionId: idSchema,
    approved: paiseSchema,
    reserved: paiseSchema,
    remaining: paiseSchema,
  }),
]);
export type OpenToBuyRemaining = z.infer<typeof openToBuyRemainingSchema>;

/** A budget as Booking › Open-to-buy shows it: its brand and season, its remaining amount and every version. */
export const openToBuyBudgetSchema = z.strictObject({
  id: idSchema,
  brand: z.strictObject({ id: idSchema, code: z.string().min(1), name: z.string().min(1).optional() }),
  season: z.strictObject({
    attributeId: idSchema,
    valueId: idSchema,
    /** The version of the season's marking the season was read under when the budget was prepared (RR-550). */
    markedAttributeVersionId: idSchema,
    code: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
  }),
  /** The newest version's identifier, which a later version names (code-house-rules 12.7). */
  versionToken: idSchema,
  remaining: openToBuyRemainingSchema,
  versions: z.array(openToBuyBudgetVersionSchema),
});
export type OpenToBuyBudget = z.infer<typeof openToBuyBudgetSchema>;

/**
 * The largest page of the open-to-buy budgets: a technical cap the builders set (code-house-rules 12.1 "Reads"), not a
 * KDPS value. A longer list is read page by page with the cursor.
 */
export const OPEN_TO_BUY_PAGE_CAP = 100;

/**
 * A page of the budgets (code-house-rules 12.1): in the order they were prepared, starting after the budget `after`
 * names, at most `limit` of them read (the cap when left out). Those the reader may not see are left out after they
 * are read, so a page may hold fewer; the cursor, the last budget read, still moves past them. It is opaque to the
 * screen, which only hands back the `next` it was given.
 */
export const openToBuyBudgetPageQuerySchema = z.strictObject({
  after: idSchema.optional(),
  limit: z
    .string()
    .regex(/^[1-9]\d*$/)
    .refine((limit) => Number(limit) <= OPEN_TO_BUY_PAGE_CAP, { message: `At most ${String(OPEN_TO_BUY_PAGE_CAP)}` })
    .optional(),
});
export type OpenToBuyBudgetPageQuery = z.infer<typeof openToBuyBudgetPageQuerySchema>;

export const openToBuyBudgetListSchema = z.strictObject({
  asOf: instantSchema,
  budgets: z.array(openToBuyBudgetSchema),
  next: idSchema.nullable(),
});
export type OpenToBuyBudgetList = z.infer<typeof openToBuyBudgetListSchema>;

export const openToBuyBudgetReadSchema = z.strictObject({ asOf: instantSchema, budget: openToBuyBudgetSchema });
export type OpenToBuyBudgetRead = z.infer<typeof openToBuyBudgetReadSchema>;

// `booking`'s bookings (goods-in 3.1 to 3.4, 10.1, 10.3, section 11; PRD-BKG-001 to PRD-BKG-004, PRD-BKG-014;
// POL-05.01, POL-05.02, POL-01.04, POL-02.07, POL-02.09; DEC-129, DEC-130, DEC-132, DEC-136; S2-F01-T03). Booking
// uploads the booking document and enters the booking by hand as a Draft; submits it with at least one document; a
// different person, whose booking limit covers its value at cost, approves or rejects it. Approval reserves open-to-buy,
// fixes the brand's Agreement version and gives the booking its number, in one transaction. No price is set here: a
// line's indicative cost and MRP come from the person entering the booking.

/** The record type of a booking, its versions, lines and documents; it carries its destination and brand (5.3). */
export const BOOKING_TYPE = 'booking.booking';
/** The action type of a booking version's approval, on the booking's value at cost (goods-in 3.4; DM-8, DEC-105). */
export const BOOKING_APPROVAL = 'booking.booking.approve';

/**
 * The technical caps on what Booking enters (goods-in 3.4 "As built"): the builders' choice, set by no rule of the PRD
 * or the policies, so a booking stays bounded and its request fits its body limit. **Design choice**; none is a
 * business limit.
 */
export const BOOKING_CAPS = {
  /** Lines of one booking version. */
  lines: 1_000,
  /** Pieces on one line. */
  pieces: 1_000_000,
  /** A style code, a colour or a size as the document writes it. */
  codeText: 60,
} as const;

/** The body limit of a route that saves a booking's Draft, which holds every line (code-house-rules 12.1). */
export const BOOKING_DRAFT_BODY_LIMIT_BYTES = 512 * 1024;

/** The largest page of bookings: a technical cap the builders set (code-house-rules 12.1 "Reads"), not a KDPS value. */
export const BOOKING_PAGE_CAP = 100;

/** Text as the document writes it: at least one character that is not a space, at most `max` characters. */
const writtenText = (max: number) =>
  z.string().max(max).regex(/\S/, { message: 'Needs a character that is not a space' });

/**
 * One line of a booking (goods-in 3.1; DEC-130): the style code, and the colour and size where the document gives
 * them, each as written, so a GRN line is matched against them later (3.7); a missing size stays missing, never Free
 * Size (PRD-MER-005). Whole pieces, more than zero; an indicative cost and an MRP per piece in whole paise, used only
 * for the totals and the open-to-buy check (PRD-BKG-003); a delivery date where the line arrives apart (POL-05.05).
 */
export const bookingLineDraftSchema = z.strictObject({
  styleCode: writtenText(BOOKING_CAPS.codeText),
  colour: writtenText(BOOKING_CAPS.codeText).nullable(),
  size: writtenText(BOOKING_CAPS.codeText).nullable(),
  quantity: z.int().min(1).max(BOOKING_CAPS.pieces),
  indicativeCost: amountSchema,
  mrp: amountSchema,
  deliveryDate: businessDateSchema.nullable(),
});
export type BookingLineDraft = z.infer<typeof bookingLineDraftSchema>;

/** A line's style, quantity and prices, as the totals read them. */
interface Priced {
  readonly styleCode: string;
  readonly quantity: number;
  readonly indicativeCost: number;
  readonly mrp: number;
}

/** Whether the booking's totals at cost and at MRP stay whole paise a safe integer holds (PRD-MOD-014). */
function totalsFit(lines: readonly Priced[]): boolean {
  let cost = 0n;
  let mrp = 0n;
  for (const line of lines) {
    cost += BigInt(line.quantity) * BigInt(line.indicativeCost);
    mrp += BigInt(line.quantity) * BigInt(line.mrp);
  }
  const most = BigInt(Number.MAX_SAFE_INTEGER);
  return cost <= most && mrp <= most;
}

const bookingLinesSchema = z
  .array(bookingLineDraftSchema)
  .max(BOOKING_CAPS.lines)
  .refine(totalsFit, { message: 'The booking’s totals fit in whole paise' });

/** A start and an end date, the end not before the start (POL-05.05). */
export const deliveryWindowSchema = z
  .strictObject({ from: businessDateSchema, to: businessDateSchema })
  .refine((window) => window.from <= window.to, { message: 'The window ends on or after its start', path: ['to'] });
export type DeliveryWindow = z.infer<typeof deliveryWindowSchema>;

/**
 * A new booking, saved as a Draft (goods-in 3.1): its brand and destination, fixed for the booking's life; its
 * supplier, linked to the brand (PRD-MER-021); its season, a value of the attribute the Organisation marks as its
 * season, named by the value alone (structure-and-masters 4.2 "As built"; RR-550); its delivery window and its lines.
 * A Draft may hold no line yet; it is submitted only with one.
 */
export const bookingDraftSchema = z.strictObject({
  brandId: idSchema,
  destinationSiteId: idSchema,
  supplierPartyId: idSchema,
  seasonValueId: idSchema,
  deliveryWindow: deliveryWindowSchema,
  lines: bookingLinesSchema,
});
export type BookingDraft = z.infer<typeof bookingDraftSchema>;

/** The booking's next Draft, naming its version token (code-house-rules 12.7); its brand and destination stay. */
export const bookingDraftChangeSchema = z.strictObject({
  versionToken: idSchema,
  supplierPartyId: idSchema,
  seasonValueId: idSchema,
  deliveryWindow: deliveryWindowSchema,
  lines: bookingLinesSchema,
});
export type BookingDraftChange = z.infer<typeof bookingDraftChangeSchema>;

export const bookingSavedSchema = z.strictObject({ bookingId: idSchema, versionId: idSchema, versionToken: idSchema });
export type BookingSaved = z.infer<typeof bookingSavedSchema>;

/** Booking documents the brand gave, photos or PDFs stored first (goods-in 3.1; PRD-IMP-002). */
export const bookingDocumentsDraftSchema = z.strictObject({ files: evidenceListSchema });
export type BookingDocumentsDraft = z.infer<typeof bookingDocumentsDraftSchema>;

export const bookingDocumentsAttachedSchema = z.strictObject({
  attachmentIds: z.array(idSchema),
  versionToken: idSchema,
});
export type BookingDocumentsAttached = z.infer<typeof bookingDocumentsAttachedSchema>;

/** Submitting the Draft as it stands, named by its version token (goods-in 3.4; code-house-rules 12.7). */
export const bookingSubmissionSchema = z.strictObject({ versionToken: idSchema });
export type BookingSubmission = z.infer<typeof bookingSubmissionSchema>;

export const bookingSubmittedSchema = z.strictObject({
  bookingId: idSchema,
  versionId: idSchema,
  requestId: idSchema,
  versionToken: idSchema,
});
export type BookingSubmitted = z.infer<typeof bookingSubmittedSchema>;

/**
 * A booking's state (POL-05.01; design-language 7), read from its newest change: a Draft is editable, and a rejected
 * version returns it to Draft; Awaiting approval once submitted; Approved once a different person approved it.
 */
export const bookingStateSchema = z.enum(['Draft', 'Awaiting approval', 'Approved']);
export type BookingState = z.infer<typeof bookingStateSchema>;

/** Pieces, indicative cost value and MRP value (goods-in 3.1; PRD-BKG-003). */
export const bookingTotalsSchema = z.strictObject({
  pieces: z.int().min(0),
  cost: paiseSchema,
  mrp: paiseSchema,
});
export type BookingTotals = z.infer<typeof bookingTotalsSchema>;

/** The totals of one style, named by its style code as first written. */
export const bookingStyleTotalsSchema = z.strictObject({
  styleCode: z.string().min(1),
  pieces: z.int().min(0),
  cost: paiseSchema,
  mrp: paiseSchema,
});
export type BookingStyleTotals = z.infer<typeof bookingStyleTotalsSchema>;

/**
 * The totals of a booking and of each style, in the order each style first appears (goods-in 3.1; PRD-BKG-003). A
 * style is its style code compared ignoring case and spaces at the ends, as a GRN line is matched (3.7). Exact: whole
 * paise times whole pieces, never rounded (PRD-MOD-014); a total beyond a safe integer throws, which the draft's schema
 * refuses first. The booking's value at cost is `booking.cost` (DM-8).
 */
export function bookingTotals(lines: readonly Priced[]): {
  readonly booking: BookingTotals;
  readonly styles: BookingStyleTotals[];
} {
  const styles = new Map<string, { styleCode: string; pieces: number; cost: number; mrp: number }>();
  let pieces = 0;
  let cost = 0;
  let mrp = 0;
  for (const line of lines) {
    const key = line.styleCode.trim().toUpperCase();
    const style = styles.get(key) ?? { styleCode: line.styleCode.trim(), pieces: 0, cost: 0, mrp: 0 };
    style.pieces += line.quantity;
    style.cost = paise(style.cost + line.quantity * line.indicativeCost);
    style.mrp = paise(style.mrp + line.quantity * line.mrp);
    styles.set(key, style);
    pieces += line.quantity;
    cost = paise(cost + line.quantity * line.indicativeCost);
    mrp = paise(mrp + line.quantity * line.mrp);
  }
  return {
    booking: { pieces, cost: paise(cost), mrp: paise(mrp) },
    styles: [...styles.values()].map((style) => ({
      styleCode: style.styleCode,
      pieces: style.pieces,
      cost: paise(style.cost),
      mrp: paise(style.mrp),
    })),
  };
}

/** One saved line of a version. */
export const bookingLineSchema = z.strictObject({
  id: idSchema,
  lineNumber: z.int().min(1),
  styleCode: z.string().min(1),
  colour: z.string().min(1).nullable(),
  size: z.string().min(1).nullable(),
  quantity: z.int().min(1),
  indicativeCost: paiseSchema,
  mrp: paiseSchema,
  deliveryDate: businessDateSchema.nullable(),
});
export type BookingLine = z.infer<typeof bookingLineSchema>;

const latestRequestSchema = z.strictObject({ id: idSchema, state: approvalRequestStateSchema });

/** A version of a booking, frozen when saved, with its totals and its latest approval request. */
export const bookingVersionSchema = z.strictObject({
  id: idSchema,
  versionNumber: z.int().min(1),
  supplierPartyId: idSchema,
  season: z.strictObject({
    attributeId: idSchema,
    valueId: idSchema,
    /** The version of the season's marking the season was read under when the version was saved (RR-550). */
    markedAttributeVersionId: idSchema,
  }),
  deliveryWindow: z.strictObject({ from: businessDateSchema, to: businessDateSchema }),
  lines: z.array(bookingLineSchema),
  totals: bookingTotalsSchema,
  styles: z.array(bookingStyleTotalsSchema),
  savedBy: idSchema,
  savedAt: instantSchema,
  request: latestRequestSchema.optional(),
});
export type BookingVersion = z.infer<typeof bookingVersionSchema>;

/** A version, as the booking's history lists it. */
export const bookingVersionSummarySchema = z.strictObject({
  id: idSchema,
  versionNumber: z.int().min(1),
  savedBy: idSchema,
  savedAt: instantSchema,
  request: latestRequestSchema.optional(),
});
export type BookingVersionSummary = z.infer<typeof bookingVersionSummarySchema>;

/** A booking document, kept as a stored file attached to the booking (goods-in 3.1). */
export const bookingDocumentSchema = z.strictObject({
  attachmentId: idSchema,
  storedFileId: idSchema,
  attachedBy: idSchema,
  attachedAt: instantSchema,
});
export type BookingDocument = z.infer<typeof bookingDocumentSchema>;

/**
 * The brand's Agreement terms, read-only (goods-in 3.2; DEC-129, DEC-132): while the booking is not approved, the
 * version in force today, or none; once approved, the version its approval fixed (POL-01.04). A term the Agreement holds
 * as Unknown stays Unknown (POL-01.11). Margins are not shown here: they stay behind their field class on the
 * Agreement itself (access-and-approvals 6).
 */
export const bookingTermsSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({
    kind: z.literal('in-force'),
    agreementId: idSchema,
    code: z.string().min(1),
    versionId: idSchema,
    validFrom: businessDateSchema,
    validTo: businessDateSchema.optional(),
    terms: agreementTermsSchema,
  }),
  z.strictObject({
    kind: z.literal('fixed'),
    agreementId: idSchema,
    code: z.string().min(1),
    versionId: idSchema,
    validFrom: businessDateSchema,
    validTo: businessDateSchema.optional(),
    terms: agreementTermsSchema,
  }),
]);
export type BookingTerms = z.infer<typeof bookingTermsSchema>;

/** A booking as Booking › Bookings and the approval panel show it. */
export const bookingSchema = z.strictObject({
  id: idSchema,
  /** Its number from the booking series, once approved; a Draft carries its identifier as its reference. */
  number: z.string().min(1).optional(),
  state: bookingStateSchema,
  brandId: idSchema,
  destinationSiteId: idSchema,
  /** The newest change's identifier, which the next change names (code-house-rules 12.7). */
  versionToken: idSchema,
  /** The newest version: the Draft, the version awaiting approval, or the approved one. */
  version: bookingVersionSchema,
  /** Every version, oldest first. */
  versions: z.array(bookingVersionSummarySchema),
  documents: z.array(bookingDocumentSchema),
  terms: bookingTermsSchema,
  /** The remaining open-to-buy of the booking's brand and season now (goods-in 3.3). */
  openToBuy: openToBuyRemainingSchema,
  /** The approval of the approved version: the Agreement version fixed and the value reserved (3.2 to 3.4). */
  approval: z
    .strictObject({
      versionId: idSchema,
      agreementVersionId: idSchema,
      reserved: paiseSchema,
      approvedBy: idSchema,
      approvedAt: instantSchema,
    })
    .optional(),
});
export type Booking = z.infer<typeof bookingSchema>;

export const bookingReadSchema = z.strictObject({ asOf: instantSchema, booking: bookingSchema });
export type BookingRead = z.infer<typeof bookingReadSchema>;

/** A booking as the list shows it: its newest version's header and totals. */
export const bookingSummarySchema = z.strictObject({
  id: idSchema,
  number: z.string().min(1).optional(),
  state: bookingStateSchema,
  brandId: idSchema,
  destinationSiteId: idSchema,
  supplierPartyId: idSchema,
  seasonValueId: idSchema,
  deliveryWindow: z.strictObject({ from: businessDateSchema, to: businessDateSchema }),
  totals: bookingTotalsSchema,
  savedAt: instantSchema,
});
export type BookingSummary = z.infer<typeof bookingSummarySchema>;

/**
 * A page of the bookings (code-house-rules 12.1 "Reads"), newest first, filtered by state, brand, season, supplier and
 * destination (goods-in section 11), starting after the booking `after` names, at most `limit` of them. A booking the
 * reader may not see is never read: its rows are scoped (code-house-rules 6.2). The cursor is opaque to the screen.
 */
export const bookingPageQuerySchema = z.strictObject({
  after: idSchema.optional(),
  limit: z
    .string()
    .regex(/^[1-9]\d*$/)
    .refine((limit) => Number(limit) <= BOOKING_PAGE_CAP, { message: `At most ${String(BOOKING_PAGE_CAP)}` })
    .optional(),
  state: bookingStateSchema.optional(),
  brandId: idSchema.optional(),
  seasonValueId: idSchema.optional(),
  supplierPartyId: idSchema.optional(),
  siteId: idSchema.optional(),
});
export type BookingPageQuery = z.infer<typeof bookingPageQuerySchema>;

export const bookingListSchema = z.strictObject({
  asOf: instantSchema,
  bookings: z.array(bookingSummarySchema),
  next: idSchema.nullable(),
});
export type BookingList = z.infer<typeof bookingListSchema>;
