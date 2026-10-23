import { GRN_TYPE, type MissingItem } from '@apparel-os/schemas';
import type { CommandRefusal } from '../../../../kernel/index.js';
import { PT_POST_REQUEST_TYPE, PT_REVISION_TYPE } from './kinds.js';

// What every command, read and route of `merchandise` · PT shares to answer with (code-house-rules 12.3; goods-in 5.8;
// S2-F04-T02): a command's outcome, the records a refusal names, and the refusals the part answers in more than one
// place. Pure: no database, no clock (code-house-rules 2).

/** A command's answer: its success, or a refusal naming what is missing (PRD-UXP-003). */
export type Outcome<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

/** A refusal outcome from its kind, code and what it names (code-house-rules 12.3). */
export const refused = (
  kind: CommandRefusal['kind'],
  code: string,
  missing: readonly MissingItem[],
): Outcome<never> => ({
  kind: 'refusal',
  refusal: { kind, code, missing },
});

/** A refusal as an outcome. */
export const refusalOutcome = (refusal: CommandRefusal): Outcome<never> => ({ kind: 'refusal', refusal });

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

/** No request to post a PT revision, or none the reader may see, has the identifier (code-house-rules 12.3). */
export const postRequestNotFound = (postRequestId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'merchandise.record-not-found',
  missing: [recordItem(PT_POST_REQUEST_TYPE, postRequestId)],
});

/** A revision no longer waiting for what is asked of it: decided, withdrawn or posted (goods-in 5.7, 6.3). */
export const notADraft = (revisionId: string): CommandRefusal => ({
  kind: 'refused',
  code: 'merchandise.pt-not-a-draft',
  missing: [recordItem(PT_REVISION_TYPE, revisionId)],
});
