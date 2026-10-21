import { z } from 'zod';
import { defineEvent } from '../../kernel/index.js';

// `receiving`'s events (goods-in 10.4; module-map section 8; code-house-rules 12.8): identifiers only, saved in the
// command's transaction (PRD-MOD-006, PRD-INT-008). No consumer takes them yet.

/** A GRN was issued (goods-in 4.5). */
export const grnIssued = defineEvent({
  type: 'receiving.grn-issued',
  version: 1,
  payload: z.strictObject({ grnId: z.uuid(), arrivalId: z.uuid() }),
});
