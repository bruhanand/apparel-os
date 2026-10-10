import {
  ACCOUNT_CHANGE,
  ACCOUNT_TYPE,
  BOOK_SETTING_CHANGE,
  BOOK_SETTING_TYPE,
  type CostFormula,
  type CostPoolMode,
  type RecordState,
} from '@apparel-os/schemas';
import type { ApprovalRule, LatestRequest } from '../../../access/index.js';

// The books part's approval rules and version states (books-and-posting 6.3; S1-F09-T01).

/**
 * The approval rules the books part declares (access-and-approvals 8; books-and-posting 6.3): an account version, and a
 * cost-setting or voucher-model-setting version, each prepared by an authorised Accounts user and decided by a
 * different one, never one of its preparers (POL-09.01; DEC-112, GC4-2). Neither has a value (DM-8). Their decisions'
 * evidence carries no restricted class (access-and-approvals 9.5); the CA's approval evidence is the books part's own
 * record (6.3).
 */
export const booksApprovalRules: readonly ApprovalRule[] = [
  {
    actionType: ACCOUNT_CHANGE,
    module: 'finance',
    recordType: ACCOUNT_TYPE,
    independent: true,
    value: 'none',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
  {
    actionType: BOOK_SETTING_CHANGE,
    module: 'finance',
    recordType: BOOK_SETTING_TYPE,
    independent: true,
    value: 'none',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
];

/** What decides the state a version shows (design-language 7; DM-4, DEC-105; code-house-rules 7.3). */
export function versionState(version: {
  readonly decision: 'Awaiting approval' | 'Approved' | 'Rejected';
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

/**
 * Whether a cost version changes the book's cost method (books-and-posting 2.2; stock-ledger 7.12): its formula or pool
 * mode differs from any approved cost version of the book. The book's first cost setting changes nothing.
 */
export function changesCostMethod(
  proposed: { readonly formula: CostFormula; readonly poolMode: CostPoolMode },
  approved: readonly { readonly formula: CostFormula | null; readonly poolMode: CostPoolMode | null }[],
): boolean {
  return approved.some((each) => each.formula !== proposed.formula || each.poolMode !== proposed.poolMode);
}
