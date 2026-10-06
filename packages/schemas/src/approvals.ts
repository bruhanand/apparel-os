import { z } from 'zod';
import { idSchema, paiseSchema, recordVersionRefSchema, totpCodeSchema } from './common.js';

// Approval requests and decisions (access-and-approvals 9.1, 9.3, 9.5, 9.6; PRD-ACS-006, PRD-ACS-007, PRD-ACS-010).

/** The money bases of PRD-ACS-015 and DEC-105 (DM-8). Quantity and discount-percentage bases arrive with S1-F05. */
export const moneyBasisSchema = z.enum([
  'cost',
  'bill-value',
  'documented-valuation',
  'amount-paid',
  'cash-difference',
  'net-pay',
]);

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

/** The states of an approval request (DM-4, DEC-105; design-language section 7). */
export const approvalRequestStateSchema = z.enum(['Awaiting approval', 'Approved', 'Rejected', 'Superseded']);

/**
 * An approval request as the approval panel reads it: bound to one document version (PRD-ACS-007), with every
 * user who recorded a change in that version as a preparer (DEC-105, GC3-1), none of whom may decide it
 * (PRD-ACS-006, POL-02.08).
 */
export const approvalRequestViewSchema = z.strictObject({
  id: idSchema,
  actionType: z.string().min(1),
  document: recordVersionRefSchema,
  value: approvalValueSchema,
  preparers: z.array(idSchema).min(1),
  state: approvalRequestStateSchema,
});
export type ApprovalRequestView = z.infer<typeof approvalRequestViewSchema>;

/**
 * The reason of a decision: one from the list in force, or free text. Free text is allowed only on a change to
 * the reason list itself (POL-02.23, DEC-104); `access` checks that against the request's action type.
 */
export const decisionReasonSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('listed'), reasonId: idSchema }),
  z.strictObject({ kind: z.literal('free-text'), text: z.string().min(1) }),
]);

/**
 * Deciding a request. It names the version the approver reviewed, so a decision on an older version is refused
 * (PRD-ACS-007), and carries a fresh authenticator code, since deciding is a protected action (PRD-SEC-001;
 * access-and-approvals 3.3). A service identity never decides (PRD-SEC-018).
 */
export const decisionRequestSchema = z.strictObject({
  requestId: idSchema,
  versionId: idSchema,
  outcome: z.enum(['approve', 'reject']),
  reason: decisionReasonSchema,
  comment: z.string().min(1).optional(),
  evidenceFileIds: z.array(idSchema).optional(),
  totpCode: totpCodeSchema,
});
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;

/**
 * Why deciding is unavailable or refused, so the panel names what is missing (PRD-UXP-003;
 * docs/plan/stage-1/s1-f01-first-access/spec.md section 6).
 */
export const decisionRefusalSchema = z.enum([
  'no-reason-list-in-force',
  'free-text-not-allowed',
  'not-eligible',
  'self-preparation',
  'fresh-code-required',
  'not-open',
  'superseded',
]);
export type DecisionRefusal = z.infer<typeof decisionRefusalSchema>;
