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

/**
 * An approval request opened (access-and-approvals 9.1; module-map section 8): `inbox` publishes it to My work, for
 * whoever is eligible when My work is read (11.1, 11.2). Identifiers only; the subject is the request, its version
 * the document version it binds to.
 */
export const approvalRequested = defineEvent({
  type: 'access.approval-requested',
  version: 1,
  payload: z.strictObject({
    requestId: z.uuid(),
    actionType: z.string().min(1),
    documentRecordType: z.string().min(1),
    documentRecordId: z.uuid(),
    documentVersionId: z.uuid(),
  }),
});

/**
 * An approval request left Awaiting approval (access-and-approvals 9.5, 9.6; DEC-117): Approved or Rejected by a
 * decision, Superseded by a later version, or Withdrawn with the user it waited on. `inbox` closes its item, and on a
 * rejection returns the document to its preparers' My work (9.5).
 */
export const approvalDecided = defineEvent({
  type: 'access.approval-decided',
  version: 1,
  payload: z.strictObject({
    requestId: z.uuid(),
    state: z.enum(['Approved', 'Rejected', 'Superseded', 'Withdrawn']),
    decisionId: z.uuid().optional(),
    preparerIds: z.array(z.uuid()),
    documentRecordType: z.string().min(1),
    documentRecordId: z.uuid(),
    documentVersionId: z.uuid(),
  }),
});

/**
 * A role or role assignment changed what someone may do (access-and-approvals 7.2; module-map section 8): the actors
 * whose effective grants were rebuilt. The live-update stream reads their grants again (code-house-rules 12.12).
 */
export const assignmentChanged = defineEvent({
  type: 'access.assignment-changed',
  version: 1,
  payload: z.strictObject({ actorIds: z.array(z.uuid()) }),
});
