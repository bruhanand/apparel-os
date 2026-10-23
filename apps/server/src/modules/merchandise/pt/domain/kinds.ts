import { PT_APPROVAL, PT_REVERSAL_APPROVAL, PT_TYPE, type AttributeMark } from '@apparel-os/schemas';
import type { ApprovalRule } from '../../../access/index.js';
import type { NumberedKind } from '../../../numbering/index.js';
import type { CallerRegistration } from '../../../stock/ledger/index.js';
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
 * the request its submit makes; the decision's effect, which makes the PT Official and values the stock, or ends the
 * draft, is commands/pt-decision.ts (goods-in 6.3; S2-F06-T01).
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
  // A PT's reversal before the scan-in (goods-in 6.4, 6.7; DEC-137, PRD-REC-019; S2-F09-T01): independent, so none of
  // its preparers, its proposer, approves it, within a limit on the cost it reverses, the PT's total proposed acquisition
  // cost (domain-model 5: a change to approved cost). Its effect is commands/reverse-pt.ts.
  {
    actionType: PT_REVERSAL_APPROVAL,
    module: PT_MODULE,
    recordType: PT_TYPE,
    independent: true,
    value: 'cost',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
];

/**
 * The PT number an approval gives the PT (goods-in 6.3 step 3, 10.4; PRD-REC-018): one series for the Organisation, not
 * restarted each financial year, whose years are not set (GC5-1), as the GRN's. No format is set here: the
 * Organisation chooses it (numbering-and-audit 3.5; RR-449). **Design choice.**
 */
export const PT_KIND: NumberedKind = {
  kind: 'merchandise.pt',
  yearly: false,
  scopeKeyStandsFor: 'the Organisation as a whole: one PT series',
  displayScope: { standsFor: 'the Organisation as a whole', perYear: false },
};

/** The one scope key of the PT kind: the Organisation itself (one database per Organisation). */
export const PT_SCOPE_KEY = 'organisation';

/** The record type a PT approval's stock effects name as their source (stock-ledger 13.2; books-and-posting 5.1). */
export const PT_STOCK_SOURCE_TYPE = 'pt_revision';
/** The record type a PT reversal's stock effects name as their source (stock-ledger 13.2, 13.21; goods-in 6.7). */
export const PT_REVERSAL_SOURCE_TYPE = 'pt_reversal';
/** A PT revision's reversal, as its records and history name it (goods-in 6.7). */
export const PT_REVERSAL_TYPE = 'merchandise.pt_reversal';

/**
 * `merchandise` · PT as a stock caller (stock-ledger 13.2, 13.14): a revision's approval ends the holds the PT route
 * ends for goods Booking took in, gives the GRN's pieces their SKUs by the identity step, and records the coverage and
 * establishes the cost of the pieces it covers (goods-in 6.3 steps 4 and 5; S2-F06-T01); its reversal removes them
 * (goods-in 6.7; S2-F09-T01); no import kind.
 */
export const ptStockCaller: CallerRegistration = {
  module: PT_MODULE,
  synthetic: false,
  recordTypes: [
    {
      recordType: PT_STOCK_SOURCE_TYPE,
      itemKinds: ['release-hold', 'identity-resolved', 'record-coverage', 'cost-established'],
      importKinds: ['none'],
    },
    // A reversal before the scan-in removes the coverage the approval recorded and reverses the cost it established
    // (goods-in 6.7; stock-ledger 13.21; S2-F09-T01).
    { recordType: PT_REVERSAL_SOURCE_TYPE, itemKinds: ['remove-coverage', 'reversal'], importKinds: ['none'] },
  ],
};

/**
 * The most rows of a PT whose approval posts in its decision's transaction; a larger one is posted by a queued job, one
 * at a time per accounting book (goods-in 6.3, 6.6; module-map 6.2 flow E; stock-ledger 10.6). A technical cap, the
 * builders' choice and no business limit: no source sets the size of a "large" document. **Design choice.**
 */
export const PT_POSTED_WITH_DECISION_ROWS = 1_000;

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
