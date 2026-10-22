import { PT_APPROVAL, PT_TYPE, type AttributeMark } from '@apparel-os/schemas';
import type { ApprovalRule } from '../../../access/index.js';
import type { PtList } from './rows.js';

// The kinds `merchandise` · PT declares (goods-in 5, 6.1, 10.1; S2-F04-T02): the module it records under, its approval
// rule, and the marked attribute each list of the template is.

/** The module a PT's audit records and approval requests name; its parts share it (code-house-rules 3.2). */
export const PT_MODULE = 'merchandise';

/**
 * The rows a PT file's header is on: row 1, or row 2 below a work tab's subtotal row (goods-in 5.2; pt-file-layouts 1.7).
 * A layout of the PT target finding it on any other row is refused at Start an import (imports-and-opening-data 6.5).
 */
export const PT_HEADER_ROWS: readonly number[] = [1, 2];

/** The draft revisions, withdrawals and proposed products a PT's history names. */
export const PT_REVISION_TYPE = 'merchandise.pt_revision';
export const PT_PROPOSED_SKU_TYPE = 'merchandise.pt_proposed_sku';

/**
 * A PT revision's approval (goods-in 6.1; PRD-REC-017, PRD-ACS-015, POL-02.07, POL-02.09): independent, so none of its
 * preparers decides it, within a limit on its value at cost, the total proposed acquisition cost. Declared here, with
 * the request its submit makes; the decision's effect, which makes the PT official and values the stock, is
 * S2-F06-T01's. Until then every decision of it is refused (commands/pt-decision.ts; goods-in 5.8).
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
