import {
  HELD_LINE_DECISION,
  HELD_LINE_TYPE,
  RECOUNT_APPROVAL,
  RECOUNT_TYPE,
  type MissingItem,
} from '@apparel-os/schemas';
import type { ApprovalRule } from '../../access/index.js';
import type { NumberedKind } from '../../numbering/index.js';
import type { CallerRegistration } from '../../stock/ledger/index.js';

// What `receiving` declares to the modules below it at start (module-map section 3, rule 6): the GRN number kind it
// numbers (numbering-and-audit 3.1; goods-in 10.4), its registration as a stock caller (stock-ledger 13.2), the
// approval rule of a held line's decision (access-and-approvals 8) and the exception types the findings raise
// (access-and-approvals 12.1).

/** The module `receiving`'s records, postings, approvals and exceptions name. */
export const RECEIVING_MODULE = 'receiving';

/**
 * The GRN number (goods-in 4.5, 10.4): one series for the Organisation, not restarted each financial year, whose years
 * are not set (GC5-1). No format is set here: the Organisation chooses it (numbering-and-audit 3.5), and no screen
 * sets one yet (RR-449). **Design choice.**
 */
export const GRN_KIND: NumberedKind = {
  kind: 'receiving.grn',
  yearly: false,
  scopeKeyStandsFor: 'the Organisation as a whole: one GRN series',
  displayScope: { standsFor: 'the Organisation as a whole', perYear: false },
};

/** The one scope key of the GRN kind: the Organisation itself (one database per Organisation). */
export const GRN_SCOPE_KEY = 'organisation';

/** What a GRN lacks while no Open GRN series exists (numbering-and-audit 3.2; PRD-UXP-003). */
export const MISSING_GRN_SERIES: MissingItem = { kind: 'number-series', numberedKind: GRN_KIND.kind };

/** The record type a GRN's receipt counts name as their source (stock-ledger 13.2; books-and-posting 5.1). */
export const GRN_SOURCE_TYPE = 'grn';

/**
 * The record type a recount's receipt counts and reversals name as their source, each item's line one of its stock
 * effects (stock-ledger 13.2, 13.18; goods-in 4.11).
 */
export const RECOUNT_SOURCE_TYPE = 'recount';

/**
 * The record type a scan's acceptance, location move and ownership change name as their source, each item's line one
 * effect of the scan (stock-ledger 13.2, 13.20; goods-in 7.2, 7.5).
 */
export const SCAN_SOURCE_TYPE = 'scan';

/**
 * `receiving` as a stock caller (stock-ledger 13.2, 13.16): a GRN posts receipt counts and, in the same request, the
 * holds of what its count found: excess under an excess hold, wrong and unidentified goods in quarantine, damage under
 * a damage hold (goods-in 4.5, 4.9; S2-F02-T03); no import kind. A scan of the scan-in moves its piece from the
 * receiving location to where it goes and accepts it there, and, under an Agreement passing ownership at receipt and
 * acceptance, changes its owner (goods-in 7.2; DEC-141; S2-F07-T01).
 */
export const receivingStockCaller: CallerRegistration = {
  module: RECEIVING_MODULE,
  synthetic: false,
  recordTypes: [
    { recordType: GRN_SOURCE_TYPE, itemKinds: ['receipt-count', 'place-hold'], importKinds: ['none'] },
    // A recount adds receipt counts for pieces found and reverses receipt counts for pieces counted in error
    // (goods-in 4.11; stock-ledger 13.18; S2-F02-T05).
    { recordType: RECOUNT_SOURCE_TYPE, itemKinds: ['receipt-count', 'reversal'], importKinds: ['none'] },
    {
      recordType: SCAN_SOURCE_TYPE,
      itemKinds: ['location-move', 'record-acceptance', 'ownership-change'],
      importKinds: ['none'],
    },
  ],
};

/**
 * The approval rule of a held line's decision (goods-in 4.6; access-and-approvals 8; domain-model 5): a Booking
 * approver, a different authorised person from whoever counted the goods and issued the GRN (PRD-REC-013, POL-02.07),
 * takes them in (approve) or leaves them held (reject), on their cost, Unknown before their PT, so deciding needs
 * explicit authority over Unknown value (DM-8, DEC-105; PRD-ACS-016). Who holds it is set by roles, by Site and brand
 * (POL-17.11), never here. Its evidence carries no restricted class.
 */
export const receivingApprovalRules: readonly ApprovalRule[] = [
  {
    actionType: HELD_LINE_DECISION,
    module: RECEIVING_MODULE,
    recordType: HELD_LINE_TYPE,
    independent: true,
    value: 'cost',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
  // A recount's approval (goods-in 4.7, 4.11; PRD-REC-019; S2-F02-T05): a different authorised person from whoever
  // proposed it (POL-02.07) approves it, on the cost of the goods its receipt counts and reversals move, Unknown before
  // their PT, so approving needs explicit authority over Unknown value (DM-8, DEC-105; PRD-ACS-016). Who holds it is set
  // by roles (goods-in 11: the Owner, or whoever holds the limits), never here.
  {
    actionType: RECOUNT_APPROVAL,
    module: RECEIVING_MODULE,
    recordType: RECOUNT_TYPE,
    independent: true,
    value: 'cost',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
];

/**
 * The exception types the findings at the count raise to Booking in My work (goods-in 2, 4.5, 4.9;
 * access-and-approvals 12.1; PRD-EXC-001): a GRN's shortage, of the category shortage, linking to the GRN; and extra
 * pieces, excess of the category excess, wrong and unidentified goods of the category mismatch: each held line,
 * linking to it, and the extra pieces of each kind a GRN records as not received, linking to the GRN. Their owner is
 * whoever the routing of each type at the Site names (POL-02.16), never set here.
 */
export const SHORTAGE_EXCEPTION_TYPE = 'receiving.shortage';
export const EXTRA_EXCEPTION_TYPES = {
  excess: 'receiving.excess',
  wrong: 'receiving.wrong-goods',
  unidentified: 'receiving.unidentified-goods',
} as const;

/**
 * The exception type of the GRN lines sent to Booking for review at their GRN's issue (goods-in 2, 3.7, 4.5, 4.10;
 * access-and-approvals 12.1; PRD-BKG-007, PRD-BKG-008; POL-05.08): those of an Arrival against a booking that do not
 * link, and every line that delivers pieces of a GRN received without a booking (12 test 6; RR-580). One a GRN, of the
 * category mismatch, linking to the GRN, whose lines show where each stands. Its owner is whoever the routing of the type
 * at the Site names (POL-02.16), Booking by the grill's routing, never set here.
 */
export const BOOKING_REVIEW_EXCEPTION_TYPE = 'receiving.booking-review';

/**
 * The unfinished-operation exception of a recount's approval refused by the ledger's posting under the locks
 * (books-and-posting 10 step 3; goods-in 4.11; PRD-EXC-001; code review 7 of stage 2): raised in a command of its own
 * once the refusal is kept, linking the recount, whose request stays waiting so it is approved again once the cause is
 * fixed (step 5). Its owner is whoever the routing of the type at the Site names (POL-02.16), never set here.
 */
export const RECOUNT_POSTING_REFUSED_TYPE = 'receiving.recount-posting-refused';

/** The record type a GRN line is named by in a refusal (PRD-UXP-003). */
export const GRN_LINE_TYPE = 'receiving.grn_line';

/**
 * The reason each hold of a GRN's held part records (stock-ledger 6.1, 13.16; goods-in 4.4): a code, which a screen
 * names from the message catalogue, never stored text (code-house-rules 12.13).
 */
export const HOLD_REASONS = {
  excess: 'receiving.excess-at-count',
  wrong: 'receiving.wrong-goods-at-count',
  unidentified: 'receiving.unidentified-goods-at-count',
} as const;
