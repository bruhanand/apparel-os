import type { AccessActionType, RecordTypeDeclaration } from '@apparel-os/schemas';
import type { Composition } from '../../../kernel/index.js';

/**
 * The value basis of an approval rule (access-and-approvals 8, 9.2; PRD-ACS-015; DM-8, DEC-105): none, as for an
 * access change, or cost, as for the stock actions of domain-model section 5. A later module adds its basis here when
 * its rule needs one.
 */
export type ValueBasis = 'none' | 'cost';

/**
 * The fixed parts of one approval rule, kept in code (access-and-approvals 8; domain-model section 5): the module that
 * owns the document, the record type whose approve permission decides it (9.3), whether independent approval is
 * required, which can never be switched off (PRD-ACS-006, POL-02.07), its value basis (PRD-ACS-015), and whether its
 * decision gives a free-text reason, which only a reason-list change does (DEC-104). A synthetic rule is declared by
 * test code only and accepted only in a test composition (stock-ledger 15.3; DEC-112, H4).
 */
export interface ApprovalRule {
  readonly actionType: string;
  readonly module: string;
  /** The record type approve is granted on, and the type of the document's record (4.1). */
  readonly recordType: string;
  readonly independent: true;
  readonly value: ValueBasis;
  readonly freeTextReason: boolean;
  readonly synthetic: boolean;
}

function rule(actionType: AccessActionType, recordType: string, freeTextReason = false): ApprovalRule {
  return {
    actionType,
    module: 'access',
    recordType,
    independent: true,
    value: 'none',
    freeTextReason,
    synthetic: false,
  };
}

/**
 * The approval rules of access changes (access-and-approvals 9.11; POL-02.06, POL-02.07; DEC-112). A material change
 * to any of these documents is a new version (9.6): no change to an access change carries a decision forward.
 */
export const accessApprovalRules: ReadonlyMap<string, ApprovalRule> = new Map(
  [
    rule('access.user.change', 'access.user'),
    rule('access.role.change', 'access.role'),
    rule('access.role_assignment.change', 'access.role_assignment'),
    rule('access.role_assignment.withdrawal', 'access.role_assignment'),
    rule('access.approval_reason.change', 'access.approval_reason', true),
    rule('access.approval_rule_setting.change', 'access.approval_rule_setting'),
    // The essential security settings (3.3; POL-02.06, POL-02.07; DEC-118, RR-334).
    rule('access.setting.change', 'access.setting'),
  ].map((each) => [each.actionType, each]),
);

/** The prefix every synthetic action type carries (stock-ledger 15.3; code-house-rules 11.1). */
const SYNTHETIC_PREFIX = 'test-';

/**
 * Every approval rule the composition knows: access's own, and the rules other modules declare for their documents
 * (access-and-approvals 8, 9.1; module-map 4.3 "Request approval"). Checked once, at start, so a wrong rule fails the
 * start (code-house-rules 12.14):
 *
 * - a module rule never takes an access action type or the `access` module;
 * - a synthetic rule is accepted only in a test composition, and its action type begins `test-`; a rule that is not
 *   synthetic never does (stock-ledger 13.2, 15.3; DEC-112, H2 and H4);
 * - its record type is declared, with approve (4.1);
 * - its record type declares no scope fact, since a request does not yet keep the document's scope facts that
 *   eligibility would check (9.1, 9.3): the rule of a scoped document arrives with them (S1-F10-T02 Notes).
 */
export function approvalRulesOf(
  moduleRules: readonly ApprovalRule[],
  composition: Composition,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
): ReadonlyMap<string, ApprovalRule> {
  const rules = new Map(accessApprovalRules);
  for (const each of moduleRules) {
    if (rules.has(each.actionType) || each.module === 'access') {
      throw new Error(`Approval rule ${each.actionType} takes an access action type or module`);
    }
    if (each.synthetic !== each.actionType.startsWith(SYNTHETIC_PREFIX)) {
      throw new Error(
        `Approval rule ${each.actionType}: only a synthetic rule's action type begins ${SYNTHETIC_PREFIX}`,
      );
    }
    if (each.synthetic && composition !== 'test') {
      throw new Error(`Synthetic approval rule ${each.actionType} outside a test composition`);
    }
    const declaration = registry.get(each.recordType);
    if (declaration?.actions.includes('approve') !== true) {
      throw new Error(`Approval rule ${each.actionType}: record type ${each.recordType} takes no approve`);
    }
    const facts = declaration.scopeFacts;
    if (facts.legalEntity || facts.place || facts.brand) {
      throw new Error(`Approval rule ${each.actionType}: a scoped record type is not supported yet`);
    }
    rules.set(each.actionType, each);
  }
  return rules;
}
