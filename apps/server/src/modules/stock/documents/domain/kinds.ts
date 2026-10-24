import {
  DAMAGE_DECISION,
  DAMAGE_REPORT_TYPE,
  DAMAGE_REVERSAL_APPROVAL,
  DAMAGE_REVERSAL_TYPE,
  type MissingItem,
} from '@apparel-os/schemas';
import type { ApprovalRule } from '../../../access/index.js';
import type { GatedOperation } from '../../../configuration/index.js';
import type { NumberedKind } from '../../../numbering/index.js';
import type { CallerRegistration } from '../../ledger/index.js';

// What `stock` · documents declares to the modules below it at start (module-map section 3, rule 6; goods-in 10.2,
// 10.4, 10.5; S2-F08-T01): the damage-report number kind, its registration as a stock caller, the approval rules of a
// report's decision and of a reversal, the exception type a report raises, and the policy-gated operation.

/**
 * The damage-report number (goods-in 10.4): one series for the Organisation, not restarted each financial year, whose
 * years are not set (GC5-1), as the GRN's. No format is set here: the Organisation chooses it (numbering-and-audit 3.5),
 * and no screen sets one yet (RR-449). **Design choice.**
 */
export const DAMAGE_REPORT_KIND: NumberedKind = {
  kind: 'stock.damage-report',
  yearly: false,
  scopeKeyStandsFor: 'the Organisation as a whole: one damage-report series',
  displayScope: { standsFor: 'the Organisation as a whole', perYear: false },
};

/** The one scope key of the damage-report kind: the Organisation itself (one database per Organisation). */
export const DAMAGE_REPORT_SCOPE_KEY = 'organisation';

/** What a report lacks while no Open damage-report series exists (numbering-and-audit 3.2; PRD-UXP-003). */
export const MISSING_DAMAGE_REPORT_SERIES: MissingItem = {
  kind: 'number-series',
  numberedKind: DAMAGE_REPORT_KIND.kind,
};

/** The module a report's records and postings name (stock-ledger 13.2; books-and-posting 5.1). */
export const DOCUMENTS_MODULE = 'stock';
/** The record type a report's postings name as their source; with the module, `stock.damage_report`. */
export const DAMAGE_SOURCE_TYPE = 'damage_report';
/** The record type a reversal's posting names as its source; with the module, `stock.damage_reversal`. */
export const REVERSAL_SOURCE_TYPE = 'damage_reversal';

/**
 * `stock` · documents as a stock caller (stock-ledger 13.2, 13.15): a report places its damage hold; its decision
 * releases that hold, and when confirmed changes the goods' condition and quarantines them (6.1, 2.3); a reversal of a
 * confirmation releases the quarantine, reverses the condition change and restores the damage hold. No import kind.
 */
export const stockDocumentsStockCaller: CallerRegistration = {
  module: DOCUMENTS_MODULE,
  synthetic: false,
  recordTypes: [
    {
      recordType: DAMAGE_SOURCE_TYPE,
      itemKinds: ['place-hold', 'release-hold', 'condition-change'],
      importKinds: ['none'],
    },
    { recordType: REVERSAL_SOURCE_TYPE, itemKinds: ['release-hold', 'reversal', 'place-hold'], importKinds: ['none'] },
  ],
};

/**
 * The approval rules `stock` · documents declares (access-and-approvals 8; domain-model 5): a report's decision,
 * confirmed or rejected by a different authorised person from the reporter (PRD-DMG-002, POL-02.07), on the goods'
 * cost (DM-8, DEC-105); and a reversal of a confirmation, approved by a different person from its proposer
 * (PRD-STK-017), on the cost of the goods it returns to good condition, as the confirmation it undoes (**Design
 * choice**, the product owner to confirm: domain-model 5 names no basis for it). Their evidence carries no restricted
 * class.
 */
export const stockDocumentsApprovalRules: readonly ApprovalRule[] = [
  {
    actionType: DAMAGE_DECISION,
    module: DOCUMENTS_MODULE,
    recordType: DAMAGE_REPORT_TYPE,
    independent: true,
    value: 'cost',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
  {
    actionType: DAMAGE_REVERSAL_APPROVAL,
    module: DOCUMENTS_MODULE,
    recordType: DAMAGE_REVERSAL_TYPE,
    independent: true,
    value: 'cost',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
];

/** The exception a report raises, to Operations as its routing says (goods-in 8.2; access-and-approvals 12.1). */
export const DAMAGE_EXCEPTION_TYPE = 'stock.damage';

/** The capability that switches damage reports on, off until an Admin switches it on (PRD-SEC-017). */
export const DAMAGE_CAPABILITY = 'stock.damage-reports';

/**
 * Damage reports under policy 17, damage, quarantine and disposal (goods-in 10.5; POL-17): reporting damage, deciding a
 * report and reversing a confirmation each record a business effect, a hold or a condition, so each asks Available
 * first (PRD-SEC-017). A report raises a numbered exception, so the exception-code series and the routing of its type
 * at the Site are among its checks (access-and-approvals 12.1, 12.2; POL-02.16). No activity grant applies: damage is
 * reported wherever goods are. **Design choice.**
 */
export const DAMAGE_REPORTS: GatedOperation = {
  code: 'stock.damage-reports',
  policy: 17,
  capability: DAMAGE_CAPABILITY,
  activity: null,
  checks: [
    { check: 'exceptions.exception-code-series' },
    { check: 'exceptions.exception-routing', subject: DAMAGE_EXCEPTION_TYPE },
  ],
};
