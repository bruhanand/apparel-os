import { z } from 'zod';
import { defineEvent } from '../../kernel/index.js';

/**
 * Sessions of a user were revoked (access-and-approvals 3.3; module-map section 8; PRD-SEC-008): one, or every one,
 * by a person, by a credential reset, or by the decision that disables the user (2.1, 4.3). Identifiers only. The
 * live-update stream (S1-F08) closes the sessions' streams on it.
 */
export const sessionRevoked = defineEvent({
  type: 'access.session-revoked',
  version: 1,
  payload: z.strictObject({
    userId: z.uuid(),
    sessionIds: z.array(z.uuid()).min(1),
  }),
});
