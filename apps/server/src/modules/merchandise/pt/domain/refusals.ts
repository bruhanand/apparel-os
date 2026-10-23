import { GRN_TYPE, type MissingItem } from '@apparel-os/schemas';
import type { CommandRefusal } from '../../../../kernel/index.js';
import { PT_REVERSAL_TYPE, PT_REVISION_TYPE } from './kinds.js';

// What every command, read and route of `merchandise` · PT shares to answer with (code-house-rules 12.3; goods-in 5.8;
// S2-F04-T02): a command's outcome, the records a refusal names, and the refusals the part answers in more than one
// place. Pure: no database, no clock (code-house-rules 2).

/** A command's answer: its success, or a refusal naming what is missing (PRD-UXP-003). */
export type Outcome<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

/** A record named in a refusal, by its type and identifier only (code-house-rules 12.3 "What is missing"). */
export const recordItem = (recordType: string, recordId: string): MissingItem => ({
  kind: 'record',
  recordType,
  recordId,
});

/** The refusal while the Organisation has no timezone, so no business date (code-house-rules 9; PRD-SEC-017). */
export const BUSINESS_DATE_NOT_SET: CommandRefusal = {
  kind: 'unavailable',
  code: 'access.business-date-not-set',
  missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
};

/** No GRN, or none the reader may see, has the identifier (code-house-rules 6.2, 12.3). */
export const grnNotFound = (grnId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'merchandise.record-not-found',
  missing: [recordItem(GRN_TYPE, grnId)],
});

/** No PT revision, or none the reader may see, has the identifier (code-house-rules 6.2, 12.3). */
export const revisionNotFound = (revisionId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'merchandise.record-not-found',
  missing: [recordItem(PT_REVISION_TYPE, revisionId)],
});

/** No reversal of a PT, or none the reader may see, has the identifier (code-house-rules 6.2, 12.3; goods-in 6.7). */
export const reversalNotFound = (reversalId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'merchandise.record-not-found',
  missing: [recordItem(PT_REVERSAL_TYPE, reversalId)],
});
