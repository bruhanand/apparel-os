import { z } from 'zod';
import { defineEvent } from '../../../kernel/index.js';

// `merchandise` · PT's events (goods-in 10.4; module-map section 8; code-house-rules 12.8; S2-F06-T01). Identifiers only:
// a consumer reads what it needs through the PT's interface.

/** A PT revision's approval posted: the PT is Official, its coverage recorded and its cost established (goods-in 6.3). */
export const ptApproved = defineEvent({
  type: 'merchandise.pt-approved',
  version: 1,
  payload: z.strictObject({ ptId: z.uuid(), revisionId: z.uuid(), ptApprovalId: z.uuid() }),
});

/**
 * A request to post an approved large PT revision, which the posting job delivers, one at a time per accounting book
 * (goods-in 6.3, 6.6; stock-ledger 10.6; access-and-approvals 9.8 step 1).
 */
export const ptPostRequested = defineEvent({
  type: 'merchandise.pt-post-requested',
  version: 1,
  payload: z.strictObject({ postRequestId: z.uuid(), revisionId: z.uuid(), bookId: z.uuid() }),
});

/**
 * A PT revision's reversal before the scan-in approved: its coverage removed and its cost reversed, the GRN waiting for
 * a corrected file (goods-in 6.4, 6.7, 10.4; S2-F09-T01).
 */
export const ptReversed = defineEvent({
  type: 'merchandise.pt-reversed',
  version: 1,
  payload: z.strictObject({ ptId: z.uuid(), revisionId: z.uuid(), reversalId: z.uuid() }),
});
