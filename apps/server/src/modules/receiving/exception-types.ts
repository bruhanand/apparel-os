import { GRN_TYPE, HELD_LINE_TYPE } from '@apparel-os/schemas';
import type { ExceptionTypeRegistration } from '../exceptions/index.js';
import { HELD_LINE_EXCEPTION_TYPES, RECEIVING_MODULE, SHORTAGE_EXCEPTION_TYPE } from './domain/kinds.js';
import { heldLineDecided, shortageFollowedUp } from './queries/held-lines.js';

// The exception types the findings at the count raise to Booking in My work (goods-in 2, 4.5, 4.9; access-and-approvals
// 12.1, 12.3; PRD-EXC-001, PRD-EXC-002; S2-F02-T03): a GRN's shortage, and each held line, closed once Booking decides
// it. Their owner is whoever the routing of each type at the Site names (POL-02.16). Their evidence carries no
// restricted class (RR-453).

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
  {
    code: HELD_LINE_EXCEPTION_TYPES.excess,
    category: 'excess',
    module: RECEIVING_MODULE,
    linksTo: [HELD_LINE_TYPE],
    evidenceClasses: [],
    resolutionCheck: heldLineDecided,
  },
  {
    code: HELD_LINE_EXCEPTION_TYPES.wrong,
    category: 'mismatch',
    module: RECEIVING_MODULE,
    linksTo: [HELD_LINE_TYPE],
    evidenceClasses: [],
    resolutionCheck: heldLineDecided,
  },
  {
    code: HELD_LINE_EXCEPTION_TYPES.unidentified,
    category: 'mismatch',
    module: RECEIVING_MODULE,
    linksTo: [HELD_LINE_TYPE],
    evidenceClasses: [],
    resolutionCheck: heldLineDecided,
  },
];
