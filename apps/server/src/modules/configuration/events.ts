import { z } from 'zod';
import { defineEvent } from '../../kernel/index.js';

/**
 * A policy was recorded as Signed, or its real values as validated (module-map 4.4, section 8; DEC-092; DM-6).
 * Identifiers only: the policy's number and the record. Its readers refetch Policy readiness through the interface.
 */
export const policyStatusChanged = defineEvent({
  type: 'configuration.policy-status-changed',
  version: 1,
  payload: z.strictObject({
    policyNumber: z.int().min(1).max(19),
    recordId: z.uuid(),
    change: z.enum(['signature', 'validation']),
  }),
});

/** A capability was switched on or off for the Organisation (module-map 4.4, section 8; PRD-SEC-017). */
export const capabilityChanged = defineEvent({
  type: 'configuration.capability-changed',
  version: 1,
  payload: z.strictObject({ changeId: z.uuid(), capability: z.string().min(1), on: z.boolean() }),
});
