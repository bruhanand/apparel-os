import { z } from 'zod';
import { defineEvent } from '../../../kernel/index.js';

// `stock` · documents' events (goods-in 10.4; module-map section 8; code-house-rules 12.8): identifiers only, saved in
// the command's transaction (PRD-MOD-006, PRD-INT-008). No consumer takes them yet.

/** Damage was reported, and its hold placed (goods-in 8.2). */
export const damageReported = defineEvent({
  type: 'stock.damage-reported',
  version: 1,
  payload: z.strictObject({ damageReportId: z.uuid() }),
});

/** A report's damage was confirmed: the goods are damaged and quarantined (goods-in 8.3). */
export const damageConfirmed = defineEvent({
  type: 'stock.damage-confirmed',
  version: 1,
  payload: z.strictObject({ damageReportId: z.uuid(), damageDecisionId: z.uuid() }),
});

/** A report was rejected: only its damage hold was released (goods-in 8.3; PRD-DMG-003). */
export const damageRejected = defineEvent({
  type: 'stock.damage-rejected',
  version: 1,
  payload: z.strictObject({ damageReportId: z.uuid(), damageDecisionId: z.uuid() }),
});

/** A confirmation was reversed by a linked record: the goods have their earlier condition and holds (8.3). */
export const damageReversed = defineEvent({
  type: 'stock.damage-reversed',
  version: 1,
  payload: z.strictObject({ damageReportId: z.uuid(), damageReversalId: z.uuid() }),
});
