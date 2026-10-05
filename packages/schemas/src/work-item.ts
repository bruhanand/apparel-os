import { z } from 'zod';
import { idSchema, paiseSchema, recordVersionRefSchema } from './common.js';

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
 * PRD-INT-008), when it is due, its exposure, its state, and what blocks it and what to do next (PRD-UXP-003).
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
