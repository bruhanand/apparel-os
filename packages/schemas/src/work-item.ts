import { z } from 'zod';
import { businessDateSchema, idSchema, paiseSchema, recordVersionRefSchema } from './common.js';
import { dueRuleSchema, exceptionPartySchema, namedPartySchema } from './exceptions.js';
import { settingOriginSchema } from './settings.js';

// A work item in My work (access-and-approvals 11; domain-model 3.3; PRD-ACS-009).

/**
 * The exposure of a work item: an amount in paise, Unknown, or none (an access change has no value). Unknown is
 * never zero and sorts above every known amount at the same due time (PRD-ACS-009, PRD-MOD-015).
 */
export const exposureSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('unknown') }),
  z.strictObject({ kind: z.literal('known'), amount: paiseSchema }),
]);
export type Exposure = z.infer<typeof exposureSchema>;

/**
 * When the item is due. "none" while task and approval routing has no rows (RR-058; access-and-approvals 11.1):
 * a stated value, never a default due time.
 */
export const dueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('at'), at: z.iso.datetime({ offset: true }) }),
]);

/**
 * One item of My work: its kind, the owner's record and version (keyed so a replay never makes a second item,
 * PRD-INT-008), when it is due, its exposure, its state, and what blocks it and what to do next (PRD-UXP-003). For
 * an approval, the owner is the approval request and its version the document version it binds to.
 */
export const workItemSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(['task', 'approval', 'exception']),
  owner: recordVersionRefSchema,
  due: dueSchema,
  exposure: exposureSchema,
  state: z.string().min(1),
  blockingReason: z.string().min(1).optional(),
  nextAction: z.string().min(1).optional(),
});
export type WorkItem = z.infer<typeof workItemSchema>;

/**
 * My work as read: the items the reader may act on now, ordered by due time, earliest first, then by exposure,
 * largest first, Unknown above every known amount (PRD-ACS-009, PRD-MOD-015), with the time it was read (PRD-PRF-004).
 */
export const myWorkSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  items: z.array(workItemSchema),
});
export type MyWork = z.infer<typeof myWorkSchema>;

/**
 * A new routing version for the approvals or tasks of one action type at a Site, or with no Site for those that have
 * none, such as an access change (access-and-approvals 9.4, 11.3; GC3-8, DEC-105; S1-F05-T02): the due-time rule, in
 * the versioned format exception routing uses (`elapsed-minutes-v1`: due a whole number of minutes after the item is
 * requested), and the escalation recipient, a named user or a role. No value has a default (KDPS question 52). Once a
 * different authorised person approves it, it takes effect from its first day, today or later.
 */
export const workItemRoutingDraftSchema = z.strictObject({
  actionType: z.string().min(1),
  siteId: idSchema.nullable(),
  dueRule: dueRuleSchema,
  escalation: exceptionPartySchema,
  validFrom: businessDateSchema,
  origin: settingOriginSchema,
});
export type WorkItemRoutingDraft = z.infer<typeof workItemRoutingDraftSchema>;

export const workItemRoutingPreparedSchema = z.strictObject({
  routingId: idSchema,
  versionId: idSchema,
  requestId: idSchema,
});

/**
 * Setup › Exception rules, the approvals and tasks tab: the action types a routing can be set for, and every routing
 * with its versions, each with its dates, state and origin (9.4, 11.3; PRD-MOD-010).
 */
export const workItemRoutingListSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  actionTypes: z.array(z.strictObject({ actionType: z.string().min(1), module: z.string().min(1) })),
  routings: z.array(
    z.strictObject({
      id: idSchema,
      actionType: z.string().min(1),
      siteId: idSchema.nullable(),
      versions: z.array(
        z.strictObject({
          id: idSchema,
          dueRule: dueRuleSchema,
          escalation: namedPartySchema,
          validFrom: businessDateSchema,
          validUntil: businessDateSchema.nullable(),
          origin: settingOriginSchema,
          state: z.enum(['Awaiting approval', 'Superseded', 'Rejected', 'Scheduled', 'In force', 'Ended']),
          requestId: idSchema.nullable(),
        }),
      ),
    }),
  ),
  /** The cursor of the next page, or null on the last (code-house-rules 12.1). */
  next: idSchema.nullable(),
});
export type WorkItemRoutingList = z.infer<typeof workItemRoutingListSchema>;
