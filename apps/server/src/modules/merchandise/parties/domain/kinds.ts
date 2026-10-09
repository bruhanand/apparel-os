import {
  AGREEMENT_CHANGE,
  AGREEMENT_TYPE,
  BANK_DETAILS_CHANGE,
  BANK_DETAILS_TYPE,
  type RecordState,
} from '@apparel-os/schemas';
import type { ApprovalRule, LatestRequest } from '../../../access/index.js';
import type { Decision } from '../db/schema.js';

// The parties part's approval rules and version states (structure-and-masters 2.3, 5; S1-F03-T03).

/** The shape of an agreement version's stored terms (code-house-rules 3.3). */
export const AGREEMENT_TERMS_FORMAT = 'agreement-terms/1';

/**
 * The approval rules the parties part declares (access-and-approvals 8; structure-and-masters 2.3): a party's bank-
 * detail change, decided by a different authorised person (POL-02.07 for a supplier; GC2-6, DEC-105 for every other
 * party), and an agreement version, likewise (GC2-2, DEC-105). Neither has a value (DM-8); the reasons are configured,
 * with no default (POL-02.23). A bank-detail decision's evidence, such as a cancelled cheque, carries the bank details
 * themselves, so it is declared `bank-details`; an agreement decision's carries no class (access-and-approvals 9.5;
 * RR-453, the KDPS Admin confirms both before live use).
 */
export const partiesApprovalRules: readonly ApprovalRule[] = [
  {
    actionType: BANK_DETAILS_CHANGE,
    module: 'merchandise',
    recordType: BANK_DETAILS_TYPE,
    independent: true,
    value: 'none',
    freeTextReason: false,
    decisionEvidenceClasses: ['bank-details'],
    synthetic: false,
  },
  {
    actionType: AGREEMENT_CHANGE,
    module: 'merchandise',
    recordType: AGREEMENT_TYPE,
    independent: true,
    value: 'none',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
];

/** What decides the state a version shows (design-language 7; DM-4, DEC-105; code-house-rules 7.3). */
export function versionState(version: {
  readonly decision: Decision;
  readonly start: string;
  readonly end?: string | undefined;
  readonly today: string;
  readonly requestState?: LatestRequest['state'] | undefined;
}): RecordState {
  switch (version.decision) {
    case 'Rejected':
      return 'Rejected';
    case 'Approved':
      if (version.start > version.today) return 'Scheduled';
      if (version.end !== undefined && version.end <= version.today) return 'Ended';
      return 'In force';
    case 'Awaiting approval':
      return version.requestState === 'Superseded' ? 'Superseded' : 'Awaiting approval';
  }
}
