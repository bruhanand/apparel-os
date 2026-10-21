import {
  OPEN_TO_BUY_APPROVAL,
  OPEN_TO_BUY_BUDGET_TYPE,
  OPEN_TO_BUY_CHECK,
  OPEN_TO_BUY_CHECK_TYPE,
  type MissingItem,
  type OpenToBuyVersionState,
} from '@apparel-os/schemas';
import type { ApprovalRule, LatestRequest } from '../../access/index.js';
import type { Decision } from '../db/schema.js';

// The rules of an open-to-buy budget's versions (goods-in 3.3; POL-05.09, POL-02.07; S2-F01-T02).

/**
 * The two approval rules of a budget version (access-and-approvals 8; goods-in 3.3): Accounts' check, decided under
 * approve on `booking.open_to_buy_check`, and then the approval, decided under approve on the budget, each by a
 * different authorised person from the version's preparer, which can never be switched off (POL-05.09, POL-02.07).
 * Neither has a value basis: no source names one for a budget, which is a master of policy 5, not a document of
 * value (DM-8; domain-model section 5). The reasons are configured, with no default (POL-02.23). Neither decision's
 * evidence carries a restricted field class.
 */
export const bookingApprovalRules: readonly ApprovalRule[] = [
  {
    actionType: OPEN_TO_BUY_CHECK,
    module: 'booking',
    recordType: OPEN_TO_BUY_CHECK_TYPE,
    independent: true,
    value: 'none',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
  {
    actionType: OPEN_TO_BUY_APPROVAL,
    module: 'booking',
    recordType: OPEN_TO_BUY_BUDGET_TYPE,
    independent: true,
    value: 'none',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
];

/** A budget named in a refusal (PRD-UXP-003). */
export const budgetItem = (budgetId: string): MissingItem => ({
  kind: 'record',
  recordType: OPEN_TO_BUY_BUDGET_TYPE,
  recordId: budgetId,
});

/** A budget version named in a refusal (PRD-UXP-003). */
export const versionItem = (budgetId: string, versionId: string): MissingItem => ({
  kind: 'version',
  recordType: OPEN_TO_BUY_BUDGET_TYPE,
  recordId: budgetId,
  versionId,
});

/**
 * What decides the state a version shows (design-language 7; code-house-rules 7.3): an approved version is In force
 * while open-ended and Ended once a later one replaced it; a version still waiting is Superseded once its request is;
 * otherwise its decision. While waiting, the step is Accounts' check until it is recorded, then the approval.
 */
export function versionState(version: {
  readonly decision: Decision;
  readonly openEnded: boolean;
  readonly requestState?: LatestRequest['state'] | undefined;
}): OpenToBuyVersionState {
  switch (version.decision) {
    case 'Rejected':
      return 'Rejected';
    case 'Approved':
      return version.openEnded ? 'In force' : 'Ended';
    case 'Awaiting approval':
      return version.requestState === 'Superseded' ? 'Superseded' : 'Awaiting approval';
  }
}
