import { z } from 'zod';
import { defineEvent } from '../../../kernel/index.js';

// The ledger's events (stock-ledger 13.7; module-map section 8): identifiers only, saved in the request's transaction
// (PRD-MOD-006, PRD-INT-008). No consumer takes them in stage 1.

const ids = z.array(z.uuid()).min(1);

/** Movements were posted: once per request with movements. */
export const movementsPosted = defineEvent({
  type: 'stock.movements-posted',
  version: 1,
  payload: z.strictObject({ movementIds: ids }),
});

/** Holds were placed or released. */
export const holdChanged = defineEvent({
  type: 'stock.hold-changed',
  version: 1,
  payload: z.strictObject({ holdIds: ids }),
});

/** Reservations were made or ended. */
export const reservationChanged = defineEvent({
  type: 'stock.reservation-changed',
  version: 1,
  payload: z.strictObject({ reservationIds: ids }),
});

/** Count freezes started or ended. */
export const countFreezeChanged = defineEvent({
  type: 'stock.count-freeze-changed',
  version: 1,
  payload: z.strictObject({ holdIds: ids }),
});
