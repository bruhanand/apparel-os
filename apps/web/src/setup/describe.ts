import type { AssignmentScope, Permission } from '@apparel-os/schemas';
import { isMessageId, t } from '../messages/catalogue';

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
