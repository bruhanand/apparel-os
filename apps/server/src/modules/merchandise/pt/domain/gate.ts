import type { GatedOperation } from '../../../configuration/index.js';
import { POSTING_CONFIGURATION_CHECK } from '../../../finance/books/index.js';

// PT approval and the policy gate (goods-in 10.5; module-map 4.4; PRD-SEC-017; S2-F06-T01). Approving a PT records its
// business effect, coverage, cost and the stock value's journal, so it needs policies 1, 3, 9 and 10 Signed and
// validated. An operation the gate knows names one governing policy, so `merchandise` · PT declares one operation for
// each, sharing one capability; Available answers yes only when all four do. No activity grant applies: the GRN it
// covers was received under its unit's receiving activity, and the PT may be prepared and approved at another Site
// (PRD-REC-014). The policy 9 operation names the posting configuration of the event kind the approval posts,
// `stock.cost-established` (books-and-posting 11). A rejection records no business effect and asks no gate (DEC-116).
// **Design choice.**

/** The capability that switches PT approval on, off for every Organisation until an Admin switches it on. */
export const PT_APPROVAL_CAPABILITY = 'merchandise.pt-approval';

/** Under policy 1, commercial ownership: the brand Agreement's ownership event decides what posts (POL-01.05). */
export const APPROVE_PT_TERMS: GatedOperation = {
  code: 'merchandise.approve-pt-terms',
  policy: 1,
  capability: PT_APPROVAL_CAPABILITY,
  activity: null,
  checks: [],
};

/** Under policy 3, source conflicts and pricing (POL-03.02 to POL-03.04, POL-03.07): the P RATE it establishes (DEC-140). */
export const APPROVE_PT: GatedOperation = {
  code: 'merchandise.approve-pt',
  policy: 3,
  capability: PT_APPROVAL_CAPABILITY,
  activity: null,
  checks: [],
};

/** Under policy 9, financial posting: the stock value and its journal, `stock.cost-established` (books-and-posting 7.2). */
export const APPROVE_PT_POSTING: GatedOperation = {
  code: 'merchandise.approve-pt-posting',
  policy: 9,
  capability: PT_APPROVAL_CAPABILITY,
  activity: null,
  checks: [{ check: POSTING_CONFIGURATION_CHECK, subject: 'stock.cost-established' }],
};

/** Under policy 10, statutory applicability: the HSN and GST rates the PT carries (POL-10.08). */
export const APPROVE_PT_STATUTORY: GatedOperation = {
  code: 'merchandise.approve-pt-statutory',
  policy: 10,
  capability: PT_APPROVAL_CAPABILITY,
  activity: null,
  checks: [],
};

/** Every operation `merchandise` · PT registers with the policy gate, in the order Available is asked. */
export const PT_OPERATIONS: readonly GatedOperation[] = [
  APPROVE_PT_TERMS,
  APPROVE_PT,
  APPROVE_PT_POSTING,
  APPROVE_PT_STATUTORY,
];
