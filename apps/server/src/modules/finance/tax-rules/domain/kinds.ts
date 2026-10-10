import {
  TAX_RULE_CHANGE,
  TAX_RULE_TYPE,
  taxRuleKindSchema,
  type RecordState,
  type TaxRuleKind,
} from '@apparel-os/schemas';
import type { ApprovalRule, LatestRequest } from '../../../access/index.js';
import type { Decision } from '../db/schema.js';

// The tax rules part's approval rules and version states (shared-calculations 10.1; S1-F09-T04).

export const TAX_RULE_KINDS: readonly TaxRuleKind[] = taxRuleKindSchema.options;

/**
 * The approval rules of the tax-rule versions (access-and-approvals 8): each kind's version is decided by a different
 * authorised Accounts user, one who holds approve on `finance.tax_rule`, with no value (DM-8), as posting maps are
 * (books-and-posting 6.3, GC4-2; POL-10.05; DEC-116). The reasons are configured, with no default (POL-02.23). The
 * decision's own evidence files carry no restricted class; the CA's evidence is recorded with the version (10.1).
 */
export const taxRulesApprovalRules: readonly ApprovalRule[] = TAX_RULE_KINDS.map((kind) => ({
  actionType: TAX_RULE_CHANGE[kind],
  module: 'finance',
  recordType: TAX_RULE_TYPE,
  independent: true,
  value: 'none',
  freeTextReason: false,
  decisionEvidenceClasses: [],
  synthetic: false,
}));

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
