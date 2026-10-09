import { z } from 'zod';
import {
  businessDateSchema,
  displayNameSchema,
  idSchema,
  paiseSchema,
  personasHeldSchema,
  recordVersionRefSchema,
  totpCodeSchema,
} from './common.js';
import { evidenceListSchema } from './files.js';
import { errorCodeSchema, missingItemSchema, type ErrorCode } from './errors.js';
import { assignmentScopeSchema } from './roles.js';
import { settingOriginSchema } from './settings.js';

// Approval requests and decisions (access-and-approvals 9.1, 9.3, 9.5, 9.6; PRD-ACS-006, PRD-ACS-007, PRD-ACS-010),
// and the access changes S1-F01-T13 adds: user versions, approve and reject reasons, approval rule settings
// (access-and-approvals 2.1, 8, 9.11; DEC-112).

/**
 * The action types of access changes that need approval, one approval rule each, kept in code (access-and-approvals
 * 8, 9.11; POL-02.07). Each is approved by an authorised person other than its preparers, and has no value (DM-8).
 */
export const accessActionTypeSchema = z.enum([
  'access.user.change',
  'access.role.change',
  'access.role_assignment.change',
  'access.role_assignment.withdrawal',
  'access.approval_reason.change',
  'access.approval_rule_setting.change',
  'access.setting.change',
  // An approval limit (access-and-approvals 9.2, 9.11; POL-02.07, POL-02.09, POL-02.15; S1-F05-T01).
  'access.approval_limit.change',
  // A stand-in grant (access-and-approvals 10; PRD-ACS-018, POL-02.20; GC3-7, DEC-105; S1-F05-T02).
  'access.stand_in_grant.change',
]);
export type AccessActionType = z.infer<typeof accessActionTypeSchema>;

/**
 * The money bases of PRD-ACS-015 and DEC-105 (DM-8). A quantity with its unit and a discount percentage where
 * configured arrive with the first approval rule that declares such a basis (access-and-approvals 9.2; stage 4's
 * configured exceptional discount), since no request can carry such a value before then.
 */
export const moneyBasisSchema = z.enum([
  'cost',
  'bill-value',
  'documented-valuation',
  'amount-paid',
  'cash-difference',
  'net-pay',
]);
export type MoneyBasis = z.infer<typeof moneyBasisSchema>;

/**
 * The value of a request on its basis (PRD-ACS-015). "none" is an action whose approval has no value, such as an
 * access change (DM-8); "unknown" is a value the basis cannot give yet, never zero (PRD-ACS-016, PRD-MOD-015).
 */
export const approvalValueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('unknown'), basis: moneyBasisSchema }),
  z.strictObject({ kind: z.literal('known'), basis: moneyBasisSchema, amount: paiseSchema }),
]);
export type ApprovalValue = z.infer<typeof approvalValueSchema>;

/**
 * The states of an approval request (DM-4, DEC-105; design-language section 7). Withdrawn: a request withdrawn
 * before approval, such as a rejected user's pending assignment (DEC-117).
 */
export const approvalRequestStateSchema = z.enum([
  'Awaiting approval',
  'Approved',
  'Rejected',
  'Superseded',
  'Withdrawn',
]);

/** A reason as a decision gives it, and as the panel shows it back. */
const shownReasonSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('listed'), reasonId: idSchema, code: z.string().min(1), text: z.string().min(1) }),
  z.strictObject({ kind: z.literal('free-text'), text: z.string().min(1) }),
]);

/**
 * Whether the reader may decide the request now, or what is missing (PRD-UXP-003; spec section 6 "Approval panel"):
 * `available` with the kind of reason the decision takes and the outcomes open now, each needing a reason of its own
 * kind in force (POL-02.23, DEC-104), with what is missing for an outcome that is not; `unavailable` with the refusal
 * code and what is missing, such as no reason list in force, not eligible or self-preparation. A fresh authenticator
 * code is asked at the decision itself (access-and-approvals 3.3).
 */
export const decidableSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('available'),
    reason: z.enum(['listed', 'free-text']),
    outcomes: z.array(z.enum(['approve', 'reject'])).min(1),
    missing: z.array(missingItemSchema),
  }),
  z.strictObject({ kind: z.literal('unavailable'), code: errorCodeSchema, missing: z.array(missingItemSchema) }),
]);

/**
 * Where the reader stands against a valued request, for the limit bar of the approval panel (design-language 10.14;
 * access-and-approvals 9.2 to 9.4; PRD-ACS-015, PRD-ACS-016, POL-02.09). `limit` is the reader's limit on the value's
 * basis, in paise; `next` the display name of an approver the request is offered to now (9.4), or null when nobody is
 * set up to approve it, which the panel shows as "No approver set up". Worked out at the read, so a limit change
 * applies as soon as it is in force. Absent for an action with no value (DM-8).
 *
 * - `within`: the reader's limit covers the value; `unlimited`: the reader's explicit unlimited authority does.
 * - `unknown-covered`: the value is Unknown and the reader holds explicit authority over Unknown value.
 * - `above`: the reader's limits fall short of the value; `no-limit`: the reader holds no limit for the action;
 *   `unknown-not-covered`: the value is Unknown and the reader's authority does not cover it.
 */
export const limitStandingSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('within'), limit: paiseSchema }),
  z.strictObject({ kind: z.literal('unlimited') }),
  z.strictObject({ kind: z.literal('unknown-covered') }),
  z.strictObject({ kind: z.literal('above'), limit: paiseSchema, next: z.string().min(1).nullable() }),
  z.strictObject({ kind: z.literal('no-limit'), next: z.string().min(1).nullable() }),
  z.strictObject({ kind: z.literal('unknown-not-covered'), next: z.string().min(1).nullable() }),
]);
export type LimitStanding = z.infer<typeof limitStandingSchema>;

/**
 * An approval request as the approval panel reads it: bound to one document version (PRD-ACS-007), with every
 * user who recorded a change in that version as a preparer (DEC-105, GC3-1), none of whom may decide it
 * (PRD-ACS-006, POL-02.08), its decision once decided, and whether the reader may decide it.
 */
export const approvalRequestViewSchema = z.strictObject({
  id: idSchema,
  actionType: z.string().min(1),
  document: recordVersionRefSchema,
  value: approvalValueSchema,
  preparers: z.array(idSchema).min(1),
  state: approvalRequestStateSchema,
  requestedAt: z.iso.datetime({ offset: true }),
  decision: z
    .strictObject({
      id: idSchema,
      outcome: z.enum(['Approved', 'Rejected']),
      approverId: idSchema,
      reason: shownReasonSchema,
      comment: z.string().min(1).optional(),
      /** The attachment of each evidence file the approver gave with the decision (9.5; S1-F08-T03). */
      evidence: z.array(idSchema),
      decidedAt: z.iso.datetime({ offset: true }),
    })
    .optional(),
  decidable: decidableSchema,
  /** Where the reader stands against the value, for a request with a value on a basis (9.2 to 9.4). */
  limit: limitStandingSchema.optional(),
  /**
   * Whether its action type is on the bulk allowlist in force today (9.9; POL-02.19), so My work offers it for bulk
   * approval; the allowlist has no default, and an empty one allows nothing (S1-F05-T02).
   */
  bulkAllowed: z.boolean(),
  /** The stand-in grant the reader would decide it through, where it is one (access-and-approvals 10; S1-F05-T02). */
  standInGrantId: idSchema.optional(),
  asOf: z.iso.datetime({ offset: true }),
});
export type ApprovalRequestView = z.infer<typeof approvalRequestViewSchema>;

/**
 * The reason of a decision: one from the list in force, or free text. Free text is allowed only on a change to
 * the reason list itself, which takes nothing else (POL-02.23, DEC-104); `access` checks that against the request's
 * action type.
 */
export const decisionReasonSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('listed'), reasonId: idSchema }),
  z.strictObject({ kind: z.literal('free-text'), text: z.string().min(1) }),
]);

/**
 * Deciding a request, named in the path. It names the version the approver reviewed, so a decision on an older
 * version is refused (PRD-ACS-007), and carries a fresh authenticator code, since deciding is a protected action
 * (PRD-SEC-001; access-and-approvals 3.3). A service identity never decides (PRD-SEC-018). Evidence, where given, is
 * stored files, each stored first, then linked in the decision's own transaction (9.5; S1-F08-T03).
 */
export const decisionRequestSchema = z.strictObject({
  versionId: idSchema,
  outcome: z.enum(['approve', 'reject']),
  reason: decisionReasonSchema,
  comment: z.string().min(1).optional(),
  evidence: evidenceListSchema.optional(),
  totpCode: totpCodeSchema,
});
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;

/** What a decision answers. */
export const decisionAnswerSchema = z.strictObject({
  requestId: idSchema,
  decisionId: idSchema,
  outcome: z.enum(['Approved', 'Rejected']),
});

/**
 * The codes a decision can be unavailable or refused with, so the panel names what is missing (PRD-UXP-003;
 * docs/plan/stage-1/s1-f01-first-access/spec.md section 6; RR-246). Each is an `access` code with its kind.
 */
export const decisionRefusalCodes = [
  'access.no-reason-list-in-force',
  'access.free-text-not-allowed',
  'access.free-text-required',
  'access.reason-not-in-force',
  'access.not-eligible',
  'access.self-preparation',
  'access.authenticator-code-refused',
  'access.approval-not-open',
  'access.approval-superseded',
  'access.user-not-approved',
  'access.no-approval-limit',
  'access.above-approval-limit',
  'access.unknown-value-not-covered',
  'access.bulk-not-allowed',
] as const satisfies readonly ErrorCode[];
export type DecisionRefusal = (typeof decisionRefusalCodes)[number];

/**
 * A new user, prepared by a person who holds create on users (access-and-approvals 2.1, 3.2; DEC-112): a draft
 * version Awaiting approval that cannot sign in until a different authorised person approves it. Its temporary
 * password is kept as an Argon2 hash with the version and handed over in person (DEC-099). See
 * `userCreateRequestSchema`.
 */
export const userPreparedSchema = z.strictObject({ userId: idSchema, versionId: idSchema, requestId: idSchema });

/**
 * A new version of a user: details, personas held and state (access-and-approvals 2.1, 9.11; DEC-112). It takes
 * effect on the day it is approved: a disabling at once, revoking every session of the user (PRD-SEC-008).
 */
export const userVersionDraftSchema = z.strictObject({
  displayName: displayNameSchema,
  personas: personasHeldSchema,
  state: z.enum(['Active', 'Disabled', 'Ended']),
});
export type UserVersionDraft = z.infer<typeof userVersionDraftSchema>;

/** A new approve or reject reason, with its first version (access-and-approvals 9.5; POL-02.23). */
export const approvalReasonDraftSchema = z.strictObject({
  code: z.string().min(1),
  kind: z.enum(['approve', 'reject']),
  text: z.string().min(1),
  validFrom: businessDateSchema,
});
export type ApprovalReasonDraft = z.infer<typeof approvalReasonDraftSchema>;

/** A new version of a reason: its text and start. Its code and kind are fixed. */
export const approvalReasonVersionDraftSchema = z.strictObject({
  text: z.string().min(1),
  validFrom: businessDateSchema,
});
export type ApprovalReasonVersionDraft = z.infer<typeof approvalReasonVersionDraftSchema>;

/** What preparing a reason answers. */
export const approvalReasonPreparedSchema = z.strictObject({
  reasonId: idSchema,
  versionId: idSchema,
  requestId: idSchema,
});

/**
 * The configured parts of one action type's approval rule (access-and-approvals 8; POL-02.19, POL-02.22): whether
 * bulk and phone approval are allowed. Both are stated; neither has a default.
 */
export const approvalRuleSettingDraftSchema = z.strictObject({
  actionType: z.string().min(1),
  bulkAllowed: z.boolean(),
  phoneAllowed: z.boolean(),
  validFrom: businessDateSchema,
});
export type ApprovalRuleSettingDraft = z.infer<typeof approvalRuleSettingDraftSchema>;

export const approvalRuleSettingVersionDraftSchema = z.strictObject({
  bulkAllowed: z.boolean(),
  phoneAllowed: z.boolean(),
  validFrom: businessDateSchema,
});
export type ApprovalRuleSettingVersionDraft = z.infer<typeof approvalRuleSettingVersionDraftSchema>;

/** What preparing a rule setting answers. */
export const approvalRuleSettingPreparedSchema = z.strictObject({
  settingId: idSchema,
  versionId: idSchema,
  requestId: idSchema,
});

/** The reasons in force today, for the reason picker (access-and-approvals 9.5; PRD-PRF-004). */
export const approvalReasonsInForceSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  reasons: z.array(
    z.strictObject({
      id: idSchema,
      versionId: idSchema,
      code: z.string().min(1),
      kind: z.enum(['approve', 'reject']),
      text: z.string().min(1),
    }),
  ),
});

/**
 * The authority of an approval limit (access-and-approvals 9.2; POL-02.09, POL-02.15, PRD-ACS-016): a value in paise
 * on the action's basis, explicit unlimited authority, or no value authority, with explicit authority over Unknown
 * value stated apart (`coversUnknown`). A limit grants something: a value, unlimited, or Unknown.
 */
export const limitAuthoritySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('amount'), amount: paiseSchema }),
  z.strictObject({ kind: z.literal('unlimited') }),
  z.strictObject({ kind: z.literal('none') }),
]);
export type LimitAuthority = z.infer<typeof limitAuthoritySchema>;

/** Who holds a limit: an approver role within a scope, or a named user through one assignment (9.2; POL-02.15). */
export const limitHolderSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('role'), roleId: idSchema, scope: assignmentScopeSchema }),
  z.strictObject({ kind: z.literal('individual'), userId: idSchema, roleAssignmentId: idSchema }),
]);

/**
 * A new approval limit (access-and-approvals 9.2, 9.11; POL-02.07, POL-02.09, POL-02.15): for one action type whose
 * rule has a value basis, held by a role within a scope or by a named user through one of their assignments, with its
 * authority and dates, half-open [validFrom, validTo). Its basis is the rule's (PRD-ACS-015), never chosen here. A
 * limit replacing one of the same action type and holder is a new limit from its start; the one it follows ends there
 * when it is approved (code-house-rules 7.3). A start in the past and an approved limit of the same action type and
 * holder starting on or after its start are refused by `access`, which knows today.
 */
export const approvalLimitDraftSchema = z
  .strictObject({
    actionType: z.string().min(1),
    holder: limitHolderSchema,
    limit: limitAuthoritySchema,
    coversUnknown: z.boolean(),
    /** Where the limit came from: KDPS's answer, the test setup, or synthetic (code-house-rules 11.1, 12.14). */
    origin: settingOriginSchema,
    validFrom: businessDateSchema,
    validTo: businessDateSchema.optional(),
  })
  .refine((draft) => draft.limit.kind !== 'none' || draft.coversUnknown, {
    message: 'A limit grants a value, unlimited authority or authority over Unknown value',
    path: ['limit'],
  })
  .refine((draft) => draft.validTo === undefined || draft.validTo > draft.validFrom, {
    message: 'A limit ends after it starts',
    path: ['validTo'],
  })
  .refine((draft) => draft.holder.kind !== 'role' || draft.holder.scope.kind === 'dimensions', {
    message: "A role's limit is within a scope of legal entity, place and brand",
    path: ['holder', 'scope'],
  });
export type ApprovalLimitDraft = z.infer<typeof approvalLimitDraftSchema>;

/** What preparing a limit answers. */
export const approvalLimitPreparedSchema = z.strictObject({ limitId: idSchema, requestId: idSchema });

/**
 * One action a stand-in grant gives (access-and-approvals 10; PRD-ACS-018, POL-02.20): approving one action type, with
 * the limit the stand-in may decide up to on its rule's basis, stated as a limit is (9.2): a value in paise, explicit
 * unlimited authority, or none, with authority over Unknown value apart (PRD-ACS-016). An action with no value takes
 * the limit `none` and no Unknown authority (DM-8). Never wider than the stood-for person's own (10).
 */
export const standInActionSchema = z.strictObject({
  actionType: z.string().min(1),
  limit: limitAuthoritySchema,
  coversUnknown: z.boolean(),
});
export type StandInAction = z.infer<typeof standInActionSchema>;

/**
 * A new stand-in grant (access-and-approvals 10; PRD-ACS-018, POL-02.20; GC3-7, DEC-105): the stand-in, the person
 * stood in for, the actions with their limits, the scope, and its dates, half-open [validFrom, validTo): it ends by
 * itself at validTo, which it always has. It takes effect only once a different authorised person approves it. The
 * names, scopes, limits and periods are KDPS's (KDPS Owner question 5); tests use labelled synthetic ones.
 */
export const standInGrantDraftSchema = z
  .strictObject({
    standInUserId: idSchema,
    forUserId: idSchema,
    actions: z.array(standInActionSchema).min(1),
    scope: assignmentScopeSchema,
    origin: settingOriginSchema,
    validFrom: businessDateSchema,
    validTo: businessDateSchema,
  })
  .refine((draft) => draft.standInUserId !== draft.forUserId, {
    message: 'A person never stands in for themselves',
    path: ['standInUserId'],
  })
  .refine((draft) => draft.validTo > draft.validFrom, { message: 'A grant ends after it starts', path: ['validTo'] })
  .refine((draft) => draft.scope.kind === 'dimensions', {
    message: 'A grant is within a scope of legal entity, place and brand',
    path: ['scope'],
  })
  .refine((draft) => new Set(draft.actions.map((action) => action.actionType)).size === draft.actions.length, {
    message: 'Each action type once',
    path: ['actions'],
  });
export type StandInGrantDraft = z.infer<typeof standInGrantDraftSchema>;

export const standInGrantPreparedSchema = z.strictObject({ grantId: idSchema, requestId: idSchema });

/** One stand-in grant as the screens and the approval panel's facts show it (10, 14). */
export const standInGrantRecordSchema = z.strictObject({
  id: idSchema,
  standIn: z.strictObject({ userId: idSchema, name: z.string().min(1).nullable() }),
  forUser: z.strictObject({ userId: idSchema, name: z.string().min(1).nullable() }),
  actions: z.array(standInActionSchema.extend({ basis: moneyBasisSchema.nullable() })),
  scope: assignmentScopeSchema,
  origin: settingOriginSchema,
  validFrom: businessDateSchema,
  validTo: businessDateSchema,
  state: z.enum(['Awaiting approval', 'Superseded', 'Scheduled', 'In force', 'Ended', 'Rejected', 'Withdrawn']),
  requestId: idSchema.nullable(),
});
export type StandInGrantRecord = z.infer<typeof standInGrantRecordSchema>;

/** Every stand-in grant, and the approval action types a grant can give, each with its basis or none (10). */
export const standInGrantListSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  actionTypes: z.array(z.strictObject({ actionType: z.string().min(1), basis: moneyBasisSchema.nullable() })),
  grants: z.array(standInGrantRecordSchema),
});
export type StandInGrantList = z.infer<typeof standInGrantListSchema>;

/**
 * Approving several requests at once (access-and-approvals 9.9; PRD-ACS-011, PRD-ACS-019, POL-02.19): each item names
 * the request and the version the approver reviewed (PRD-ACS-007); one reason from the list in force and one fresh
 * authenticator code cover the whole selection (3.3; S1-F05-T02).
 */
export const bulkDecisionRequestSchema = z
  .strictObject({
    items: z.array(z.strictObject({ requestId: idSchema, versionId: idSchema })).min(1),
    reason: z.strictObject({ kind: z.literal('listed'), reasonId: idSchema }),
    comment: z.string().min(1).optional(),
    totpCode: totpCodeSchema,
  })
  .refine((body) => new Set(body.items.map((item) => item.requestId)).size === body.items.length, {
    message: 'Each request once',
    path: ['items'],
  });
export type BulkDecisionRequest = z.infer<typeof bulkDecisionRequestSchema>;

/**
 * The total of a selection on one basis (9.9; PRD-ACS-019, PRD-MOD-015): the sum of its known values, or null when it
 * has none, and how many items are of Unknown value, never added as zero. Different bases are never totalled together.
 */
export const bulkTotalSchema = z.strictObject({
  basis: moneyBasisSchema,
  known: paiseSchema.nullable(),
  knownCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
});
export type BulkTotal = z.infer<typeof bulkTotalSchema>;

/** What bulk approval answers: the batch, the totals, and each item decided or sent to individual review (9.9). */
export const bulkDecisionAnswerSchema = z.strictObject({
  batchId: idSchema,
  totals: z.array(bulkTotalSchema),
  noValueCount: z.number().int().nonnegative(),
  items: z.array(
    z.discriminatedUnion('outcome', [
      z.strictObject({ requestId: idSchema, outcome: z.literal('Approved'), decisionId: idSchema }),
      z.strictObject({
        requestId: idSchema,
        outcome: z.literal('individual-review'),
        code: errorCodeSchema,
        missing: z.array(missingItemSchema),
      }),
    ]),
  ),
});
export type BulkDecisionAnswer = z.infer<typeof bulkDecisionAnswerSchema>;

/**
 * The totals of a selection by basis (access-and-approvals 9.9; PRD-ACS-019, PRD-MOD-015), shared by the server's
 * answer and the screen's bulk bar: per basis, in the order first met, the sum of the known values in whole paise, or
 * null when none is known, and the number of Unknown ones, never counted as zero; values with no basis are counted
 * apart. Integer paise only (PRD-MOD-014).
 */
export function bulkTotals(values: readonly ApprovalValue[]): { totals: BulkTotal[]; noValueCount: number } {
  const totals: { basis: MoneyBasis; known: number | null; knownCount: number; unknownCount: number }[] = [];
  let noValueCount = 0;
  for (const value of values) {
    if (value.kind === 'none') {
      noValueCount += 1;
      continue;
    }
    let total = totals.find((each) => each.basis === value.basis);
    if (total === undefined) {
      total = { basis: value.basis, known: null, knownCount: 0, unknownCount: 0 };
      totals.push(total);
    }
    if (value.kind === 'unknown') {
      total.unknownCount += 1;
    } else {
      total.known = (total.known ?? 0) + value.amount;
      total.knownCount += 1;
    }
  }
  return { totals: totals.map((each) => bulkTotalSchema.parse(each)), noValueCount };
}
