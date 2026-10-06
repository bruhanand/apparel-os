import type { Grant } from '../shell/screens';

/** The views of Setup › Audit log (ui-blueprint 16 "Audit log": Changes · Sign-ins · Sensitive access). */
export type AuditLogTab = 'changes' | 'sign-ins' | 'sensitive-access';

/** The record type each view reads under (numbering-and-audit 4.5; access-and-approvals 9.11). */
const tabNeeds: Readonly<Record<AuditLogTab, string>> = {
  changes: 'audit.audit_record',
  'sign-ins': 'audit.access_record',
  'sensitive-access': 'audit.sensitive_access_record',
};

/** The views a person's role assignments grant, in order: a view no assignment grants is not shown (PRD-ACS-002). */
export function auditLogTabs(grants: readonly Grant[]): AuditLogTab[] {
  return (Object.keys(tabNeeds) as AuditLogTab[]).filter((tab) =>
    grants.some((grant) => grant.recordType === tabNeeds[tab] && grant.action === 'view'),
  );
}
