import type { AccessActionType } from '@apparel-os/schemas';

/**
 * The fixed parts of one approval rule, kept in code (access-and-approvals 8; domain-model section 5): the record
 * type whose approve permission decides it (9.3), the document it binds to, whether independent approval is
 * required, which can never be switched off (PRD-ACS-006, POL-02.07), its value basis (none for an access change,
 * DM-8), and whether its decision gives a free-text reason, which only a reason-list change does (DEC-104).
 */
export interface ApprovalRule {
  readonly actionType: AccessActionType;
  /** The record type approve is granted on, and the type of the document's record (4.1). */
  readonly recordType: string;
  readonly independent: true;
  readonly value: 'none';
  readonly freeTextReason: boolean;
}

function rule(actionType: AccessActionType, recordType: string, freeTextReason = false): ApprovalRule {
  return { actionType, recordType, independent: true, value: 'none', freeTextReason };
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
