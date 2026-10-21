import { z } from 'zod';
import { defineEvent } from '../../kernel/index.js';

// `booking`'s events (goods-in 10.4; module-map section 8; code-house-rules 12.8): identifiers only, saved in the
// command's transaction (PRD-MOD-006, PRD-INT-008). No consumer takes them yet.

/** A booking version was approved (goods-in 3.4). */
export const bookingApproved = defineEvent({
  type: 'booking.booking-approved',
  version: 1,
  payload: z.strictObject({ bookingId: z.uuid(), versionId: z.uuid() }),
});
