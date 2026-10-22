import { PT_APPROVAL, PT_TYPE, type AttributeMark } from '@apparel-os/schemas';
import type { ApprovalRule, ModuleApprovals } from '../../../access/index.js';
import type { PtList } from './rows.js';

// The kinds `merchandise` · PT declares (goods-in 5, 6.1, 10.1; S2-F04-T02): the module it records under, its approval
// rule, and the marked attribute each list of the template is.

/** The module a PT's audit records and approval requests name; its parts share it (code-house-rules 3.2). */
export const PT_MODULE = 'merchandise';

/** The draft revisions, withdrawals and proposed products a PT's history names. */
export const PT_REVISION_TYPE = 'merchandise.pt_revision';
export const PT_PROPOSED_SKU_TYPE = 'merchandise.pt_proposed_sku';

/**
 * A PT revision's approval (goods-in 6.1; PRD-REC-017, PRD-ACS-015, POL-02.07, POL-02.09): independent, so none of its
 * preparers decides it, within a limit on its value at cost, the total proposed acquisition cost. Declared here, with
 * the request its submit makes; the decision's effect, which makes the PT official and values the stock, is
 * S2-F06-T01's. Until then a decision is recorded and changes nothing (access-and-approvals 9.8; DEC-097).
 */
export const ptApprovalRules: readonly ApprovalRule[] = [
  {
    actionType: PT_APPROVAL,
    module: PT_MODULE,
    recordType: PT_TYPE,
    independent: true,
    value: 'cost',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
];

/** The marked attribute each list of the template is (structure-and-masters 4.2 "As built"; goods-in 5.2). */
export const LIST_MARKS: Readonly<Record<PtList, AttributeMark>> = {
  season: 'season',
  colour: 'colour',
  gender: 'gender',
  type: 'type',
  item: 'item',
  fit: 'fit',
  size: 'size',
  gstRate: 'gst-rate',
};

/**
 * The approval rule `merchandise` · PT declares to `access` (access-and-approvals 8; module-map section 3, rule 6),
 * which the composition root hands over at start. It declares no decision effect yet (S2-F06-T01).
 */
export function ptApprovals(): ModuleApprovals {
  return { rules: ptApprovalRules, effects: new Map() };
}
