import {
  BOOKING_APPROVAL,
  BOOKING_CANCELLATION,
  BOOKING_EXTENSION,
  BOOKING_TYPE,
  type MissingItem,
} from '@apparel-os/schemas';
import type { ApprovalRule } from '../../access/index.js';
import type { BookingChangeKind } from '../db/schema.js';

// The rules of a booking (goods-in 3.1 to 3.4; PRD-BKG-001 to PRD-BKG-004; POL-05.01, POL-02.07, POL-02.09;
// S2-F01-T03). Pure: no database, no clock (code-house-rules 2).

/**
 * The approval rule of a booking version (access-and-approvals 8; goods-in 3.4; domain-model section 5): decided under
 * approve on the booking, by a different authorised person from its preparers, which can never be switched off
 * (POL-02.07), whose booking limit covers the booking's value at cost (DM-8, DEC-105; POL-02.09). The reasons are
 * configured, with no default (POL-02.23). Its decision's evidence carries no restricted field class.
 */
export const bookingApprovalRule: ApprovalRule = {
  actionType: BOOKING_APPROVAL,
  module: 'booking',
  recordType: BOOKING_TYPE,
  independent: true,
  value: 'cost',
  freeTextReason: false,
  decisionEvidenceClasses: [],
  synthetic: false,
};

/**
 * The approval rules of a cancellation of an undelivered balance and an extension of the window (goods-in 3.5, 3.10;
 * POL-05.07, POL-05.10; S2-F01-T04): each decided under approve on the booking by a different authorised person from
 * its proposer, which can never be switched off (POL-02.07). Neither has a value basis: no source names one
 * (domain-model section 5 names none for either), a cancellation releases open-to-buy and an extension moves dates
 * only, so neither needs an approval limit (access-and-approvals 9.3). **Design choice**, for the product owner to
 * confirm. The reasons are configured, with no default (POL-02.23).
 */
export const amendmentApprovalRules: readonly ApprovalRule[] = [BOOKING_CANCELLATION, BOOKING_EXTENSION].map(
  (actionType): ApprovalRule => ({
    actionType,
    module: 'booking',
    recordType: BOOKING_TYPE,
    independent: true,
    value: 'none',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  }),
);

/** The document an amendment's approval decides: the booking, at the amendment (module-map 6.2 flow A). */
export const amendmentDocument = (bookingId: string, amendmentId: string) =>
  ({ module: 'booking', recordType: BOOKING_TYPE, recordId: bookingId, versionId: amendmentId }) as const;

/** The evidence kinds of the supplier's files on a booking (imports-and-opening-data 11; goods-in 3.4, 3.5). */
export const SUPPLIER_CONFIRMATION = { kind: 'booking.supplier-confirmation', restrictedClasses: [] } as const;
export const SUPPLIER_COMMUNICATION = { kind: 'booking.supplier-communication', restrictedClasses: [] } as const;

/** A line of a booking named in a refusal, by its key (PRD-UXP-003; goods-in 3.10). */
export const lineItem = (bookingId: string, lineKey: string): MissingItem => ({
  kind: 'booking-line',
  recordId: bookingId,
  lineKey,
});

/** The evidence kind of a booking document on its booking (imports-and-opening-data 11; goods-in 3.1). */
export const BOOKING_DOCUMENT = { kind: 'booking.booking-document', restrictedClasses: [] } as const;

/** The document a version's approval decides (module-map 6.2 flow A). */
export const bookingDocument = (bookingId: string, versionId: string) =>
  ({ module: 'booking', recordType: BOOKING_TYPE, recordId: bookingId, versionId }) as const;

/** The record a booking's audit record names (numbering-and-audit 4.1). */
export const bookingAuditRecord = (bookingId: string, versionId?: string) =>
  ({ module: 'booking', type: 'booking', id: bookingId, ...(versionId === undefined ? {} : { versionId }) }) as const;

/** A booking named in a refusal (PRD-UXP-003). */
export const bookingItem = (bookingId: string): MissingItem => ({
  kind: 'record',
  recordType: BOOKING_TYPE,
  recordId: bookingId,
});

/** A booking version named in a refusal (PRD-UXP-003). */
export const bookingVersionItem = (bookingId: string, versionId: string): MissingItem => ({
  kind: 'version',
  recordType: BOOKING_TYPE,
  recordId: bookingId,
  versionId,
});

/** The kinds of change made by preparing the version under approval, as against deciding it (9.1; GC3-1). */
export const PREPARING_CHANGES: readonly BookingChangeKind[] = ['draft', 'documents', 'submission'];

/**
 * The preparers of the version submitted (access-and-approvals 9.1; GC3-1, DEC-105): everyone who saved a version,
 * attached documents or submitted it since the booking's last approval, the version's content being theirs; so whoever
 * made a rejected version stays a preparer of the next one built on it.
 */
export function preparersOf(
  changes: readonly { readonly change: BookingChangeKind; readonly changedByUserId: string }[],
): string[] {
  const lastApproval = changes.map((each) => each.change).lastIndexOf('approval');
  const since = changes.slice(lastApproval + 1);
  return [
    ...new Set(since.filter((each) => PREPARING_CHANGES.includes(each.change)).map((each) => each.changedByUserId)),
  ];
}

/**
 * The shortfall of an approval refused for open-to-buy (goods-in 3.3): the booking's value at cost, the remaining
 * amount and what is short, in whole paise as decimal text (code-house-rules 12.3), with the brand and season.
 */
export function shortfallItem(
  of: { readonly brandId: string; readonly seasonValueId: string },
  value: number,
  remaining: number,
): MissingItem {
  return {
    kind: 'open-to-buy-shortfall',
    brandId: of.brandId,
    seasonValueId: of.seasonValueId,
    value: String(value),
    remaining: String(remaining),
    shortfall: String(value - remaining),
  };
}
