import { z } from 'zod';
import { approvalRequestStateSchema } from './approvals.js';
import { idSchema, paiseSchema } from './common.js';
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
