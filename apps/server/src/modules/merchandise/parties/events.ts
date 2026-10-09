import { z } from 'zod';
import { defineEvent } from '../../../kernel/index.js';

/**
 * An agreement version took effect (module-map 4.12, section 8; structure-and-masters 5.5; PRD-ORG-016): approved by a
 * different authorised person, in force from its start. Identifiers only, never a term or a margin (access-and-
 * approvals 6). Its readers, `pos`' working set and `reports`, read the version through the interface.
 */
export const agreementChanged = defineEvent({
  type: 'merchandise.agreement-changed',
  version: 1,
  payload: z.strictObject({ agreementId: z.uuid(), versionId: z.uuid() }),
});
