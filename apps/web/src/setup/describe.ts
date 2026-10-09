import type { ApprovalLimitRecord, AssignmentScope, Permission } from '@apparel-os/schemas';
import { isMessageId, t } from '../messages/catalogue';
import { formatPaise } from './format';

// How the access setup screens and the approval panel name record types, permissions and scopes
// (access-and-approvals 4.1, 5.1; design-language 10.3; code-house-rules 12.13).

/** A record type's name, or its code where the catalogue has no words for it yet. */
export function recordTypeName(recordType: string): string {
  const id = `record-type.${recordType}`;
  return isMessageId(id) ? t(id) : recordType;
}

/** One permission in words: "View on User", or a field class with its access (POL-02.03, POL-02.04). */
export function permissionText(permission: Permission): string {
  if (permission.kind === 'action') {
    return t('permission.action', {
      action: t(`action.${permission.action}`),
      recordType: recordTypeName(permission.recordType),
    });
  }
  return t('permission.field-class', {
    fieldClass: t(`field-class.${permission.fieldClass}`),
    access: t(`field-access.${permission.access}`),
  });
}

type Dimension = Extract<AssignmentScope, { kind: 'dimensions' }>['legalEntity' | 'place' | 'brand'];

function dimensionText(dimension: Dimension): string {
  if (dimension.kind === 'selected') return t('scope.selected', { count: dimension.members.length });
  return t(`scope.${dimension.kind}`);
}

/**
 * A scope in words, per dimension (PRD-ACS-001, PRD-ACS-005, POL-02.02): "Legal entity: All members · Place: Empty ·
 * Brand: All members", or own records only (PRD-ACS-022).
 */
export function scopeText(scope: AssignmentScope): string {
  if (scope.kind === 'own-records') return t('scope.own-records');
  return t('scope.dimensions', {
    legalEntity: dimensionText(scope.legalEntity),
    place: dimensionText(scope.place),
    brand: dimensionText(scope.brand),
  });
}

/**
 * An approval limit's authority on its basis in words (access-and-approvals 9.2; PRD-ACS-015): "₹2,000.00 on cost",
 * "No upper limit on cost", or no value authority; authority over an unknown value is stated apart (PRD-ACS-016).
 */
export function limitText(limit: ApprovalLimitRecord): string {
  const value =
    limit.limit.kind === 'amount'
      ? formatPaise(limit.limit.amount)
      : t(limit.limit.kind === 'unlimited' ? 'limits.unlimited' : 'limits.no-value-authority');
  return t('limits.limit-with-basis', { limit: value, basis: t(`approval.basis.${limit.basis}`) });
}

/** Who holds an approval limit: a role within a scope, or a named person through one assignment (9.2; POL-02.15). */
export function limitHolderText(limit: ApprovalLimitRecord): string {
  return limit.holder.kind === 'role'
    ? t('limits.holder.role', { role: limit.holder.role.code, scope: scopeText(limit.holder.scope) })
    : t('limits.holder.individual', { name: limit.holder.name ?? limit.holder.userId, role: limit.holder.role.code });
}
