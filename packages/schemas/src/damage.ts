import { z } from 'zod';
import { approvalRequestStateSchema } from './approvals.js';
import { businessDateSchema, idSchema } from './common.js';
import { evidenceListSchema } from './files.js';

// The damage reports of `stock` · documents (goods-in 8, 10.1, 10.3; module-map section 5; PRD-DMG-001 to PRD-DMG-006,
// PRD-DMG-010, PRD-STK-017, PRD-ACP-005; S2-F08-T01). Anyone authorised at a Site reports damage on goods there, with
// photos, and a damage hold covers them at once; a different authorised person confirms or rejects the report in My
// work, on the goods' cost; a mistaken confirmation is undone by a linked reversal, proposed and approved by different
// people. No value is set here: what a decider may decide is their approval limit, the product owner's to set (V-02).

/** The record type a damage report is reported, read and decided under; it carries every scope fact (5.3). */
export const DAMAGE_REPORT_TYPE = 'stock.damage_report';
/** The record type a reversal of a confirmation is proposed, read and approved under (goods-in 8.3). */
export const DAMAGE_REVERSAL_TYPE = 'stock.damage_reversal';
/** The action type of a report's decision: approve confirms the damage, reject rejects the report (goods-in 8.3). */
export const DAMAGE_DECISION = 'stock.damage_report.decision';
/** The action type of a reversal's approval, by a different person from its proposer (goods-in 8.3; PRD-STK-017). */
export const DAMAGE_REVERSAL_APPROVAL = 'stock.damage_reversal.approval';

/**
 * The technical caps on what a reporter enters (goods-in 8.5 "Input caps"): the builders' choice, set by no rule of the
 * PRD or the policies, as receiving's are (goods-in 4.8). **Design choice**; none is a business limit.
 */
export const DAMAGE_CAPS = {
  /** Pieces one report covers, as a count line's. */
  pieces: 1_000_000,
  /** What is wrong with the goods, or why a confirmation is reversed. */
  text: 500,
  /** Photos given with one report. */
  photos: 20,
} as const;

/** Text as the reporter types it: at least one character that is not a space, at most the cap. */
const text = z.string().max(DAMAGE_CAPS.text).regex(/\S/, { message: 'Needs a character that is not a space' });

/**
 * The goods a report names (goods-in 8.2): a GRN line's goods, by the line, which names goods of a product not yet set
 * up too (stock-ledger 13.15); or a product, by its SKU, at the location.
 */
export const damagedGoodsSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('grn-line'), grnLineId: idSchema }),
  z.strictObject({ kind: z.literal('product'), skuId: idSchema }),
]);
export type DamagedGoods = z.infer<typeof damagedGoodsSchema>;

/** A damage report (goods-in 8.2): where the goods are, which goods and how many, what is wrong, and photos. */
export const damageReportDraftSchema = z.strictObject({
  /** The location of the goods; its Site and business unit are where they are (structure-and-masters 3.5). */
  locationId: idSchema,
  goods: damagedGoodsSchema,
  quantity: z.int().min(1).max(DAMAGE_CAPS.pieces),
  description: text,
  /** Photos of the damage, each a stored file given once (goods-in 8.2; S1-F06-T05). */
  photos: evidenceListSchema
    .refine((list) => list.length <= DAMAGE_CAPS.photos, { message: 'Too many photos' })
    .optional(),
});
export type DamageReportDraft = z.infer<typeof damageReportDraftSchema>;

/** What reporting answers: the report, its number, the version its decision binds to and the decision's request. */
export const damageReportedSchema = z.strictObject({
  damageReportId: idSchema,
  number: z.string(),
  versionToken: idSchema,
  requestId: idSchema,
});
export type DamageReported = z.infer<typeof damageReportedSchema>;

/**
 * A report's state (design-language 7): Submitted while it waits for its decision, Confirmed or Rejected once decided.
 * A confirmation reversed returns it to Submitted, waiting for a decision again (goods-in 8.5).
 */
export const damageReportStateSchema = z.enum(['Submitted', 'Confirmed', 'Rejected']);
export type DamageReportState = z.infer<typeof damageReportStateSchema>;

/**
 * One round of a report's decision (goods-in 8.5): the version its decision binds to. The first is the report as
 * reported; a renewal asks again on the goods' cost now; a restoration follows an approved reversal of a confirmation.
 */
export const damageRoundSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(['reported', 'renewed', 'restored']),
  recordedAt: z.iso.datetime({ offset: true }),
  /** The decision's request of the round, and its state, where the reader may see it. */
  requestId: idSchema.nullable(),
  requestState: approvalRequestStateSchema.nullable(),
  decision: z
    .strictObject({
      id: idSchema,
      outcome: z.enum(['Confirmed', 'Rejected']),
      decidedByUserId: idSchema,
      decidedAt: z.iso.datetime({ offset: true }),
    })
    .nullable(),
});
export type DamageRound = z.infer<typeof damageRoundSchema>;

/** A reversal of a confirmation, proposed with a reason and approved or rejected by a different person (8.3). */
export const damageReversalViewSchema = z.strictObject({
  id: idSchema,
  decisionId: idSchema,
  reason: z.string(),
  proposedByUserId: idSchema,
  proposedAt: z.iso.datetime({ offset: true }),
  requestId: idSchema.nullable(),
  requestState: approvalRequestStateSchema.nullable(),
  outcome: z.enum(['Approved', 'Rejected']).nullable(),
});
export type DamageReversalView = z.infer<typeof damageReversalViewSchema>;

/** A damage report as a reader sees it (goods-in 8.2, 8.3, 8.5). */
export const damageReportSchema = z.strictObject({
  id: idSchema,
  number: z.string(),
  state: damageReportStateSchema,
  siteId: idSchema,
  storeId: idSchema.nullable(),
  businessUnitId: idSchema,
  locationId: idSchema,
  brandId: idSchema,
  goods: damagedGoodsSchema,
  /** The SKU of the goods, or null while their product is not set up (Unknown; PRD-DMG-005). */
  skuId: idSchema.nullable(),
  quantity: z.int(),
  description: z.string(),
  photoAttachmentIds: z.array(idSchema),
  reportedByUserId: idSchema,
  reportedAt: z.iso.datetime({ offset: true }),
  businessDate: businessDateSchema,
  rounds: z.array(damageRoundSchema),
  reversals: z.array(damageReversalViewSchema),
  /** The current round: the version a renewal names, and a reversal's proposal (code-house-rules 12.7). */
  versionToken: idSchema,
});
export type DamageReport = z.infer<typeof damageReportSchema>;

export const damageReportReadSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  report: damageReportSchema,
});
export type DamageReportRead = z.infer<typeof damageReportReadSchema>;

/**
 * Asking for the decision again (goods-in 8.5): while the report waits, on the goods' cost now, when the cost changed
 * since it was asked and the decision is refused for it (access-and-approvals 9.7; DEC-066). Names the current round.
 */
export const damageDecisionRenewalSchema = z.strictObject({ versionToken: idSchema });
export type DamageDecisionRenewal = z.infer<typeof damageDecisionRenewalSchema>;

export const damageDecisionRenewedSchema = z.strictObject({ versionToken: idSchema, requestId: idSchema });
export type DamageDecisionRenewed = z.infer<typeof damageDecisionRenewedSchema>;

/** A reversal of the report's confirmation, proposed with a reason (goods-in 8.3; PRD-STK-017). */
export const damageReversalDraftSchema = z.strictObject({ reason: text, versionToken: idSchema });
export type DamageReversalDraft = z.infer<typeof damageReversalDraftSchema>;

export const damageReversalProposedSchema = z.strictObject({ damageReversalId: idSchema, requestId: idSchema });
export type DamageReversalProposed = z.infer<typeof damageReversalProposedSchema>;
