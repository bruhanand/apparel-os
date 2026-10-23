import { GRN_TYPE, HELD_LINE_TYPE, RECOUNT_TYPE } from '@apparel-os/schemas';
import type { ExceptionTypeRegistration } from '../exceptions/index.js';
import {
  BOOKING_REVIEW_EXCEPTION_TYPE,
  EXTRA_EXCEPTION_TYPES,
  RECEIVING_MODULE,
  RECOUNT_POSTING_REFUSED_TYPE,
  SHORTAGE_EXCEPTION_TYPE,
} from './domain/kinds.js';
import { extraFollowedUp, reviewFollowedUp, shortageFollowedUp } from './queries/held-lines.js';
import { recountDecided } from './queries/recounts.js';

// The exception types the findings at the count raise to Booking in My work (goods-in 2, 4.5, 4.9; access-and-approvals
// 12.1, 12.3; PRD-EXC-001, PRD-EXC-002; S2-F02-T03): a GRN's shortage; and extra pieces, each held line, closed once
// Booking takes its goods in, and the extra pieces of each kind a GRN records as not received; and the GRN lines sent to
// Booking for review, of an Arrival against a booking or received without one (goods-in 3.7, 4.10; S2-F02-T04; RR-580).
// Their owner is whoever
// the routing of each type at the Site names (POL-02.16). Their evidence carries no restricted class (RR-453).

/** The type of extra pieces of one kind: a held line's, or a GRN's not received (goods-in 4.5, 4.9). */
const extraType = (code: string, category: 'excess' | 'mismatch'): ExceptionTypeRegistration => ({
  code,
  category,
  module: RECEIVING_MODULE,
  linksTo: [HELD_LINE_TYPE, GRN_TYPE],
  evidenceClasses: [],
  resolutionCheck: extraFollowedUp,
});

/** The exception types `receiving` raises, handed to `exceptions` by the composition root (module-map section 3). */
export const receivingExceptionTypes: readonly ExceptionTypeRegistration[] = [
  {
    code: SHORTAGE_EXCEPTION_TYPE,
    category: 'shortage',
    module: RECEIVING_MODULE,
    linksTo: [GRN_TYPE],
    evidenceClasses: [],
    resolutionCheck: shortageFollowedUp,
  },
  extraType(EXTRA_EXCEPTION_TYPES.excess, 'excess'),
  extraType(EXTRA_EXCEPTION_TYPES.wrong, 'mismatch'),
  extraType(EXTRA_EXCEPTION_TYPES.unidentified, 'mismatch'),
  // The GRN lines sent to Booking for review, against a booking or without one (goods-in 3.7, 4.10; S2-F02-T04).
  {
    code: BOOKING_REVIEW_EXCEPTION_TYPE,
    category: 'mismatch',
    module: RECEIVING_MODULE,
    linksTo: [GRN_TYPE],
    evidenceClasses: [],
    resolutionCheck: reviewFollowedUp,
  },
  // A recount's approval refused by the ledger's posting under the locks (books-and-posting 10 step 3; goods-in 4.11;
  // code review 7), finished once the recount is decided.
  {
    code: RECOUNT_POSTING_REFUSED_TYPE,
    category: 'unfinished-operation',
    module: RECEIVING_MODULE,
    linksTo: [RECOUNT_TYPE],
    evidenceClasses: [],
    resolutionCheck: recountDecided,
  },
];
