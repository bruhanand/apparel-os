import { describe, expect, it } from 'vitest';
import { landingScreen } from './landing';
import type { Grant } from './screens';

// SYNTHETIC grants: each list stands for the effective grants of a synthetic role assignment. None is a KDPS role.
const firstAdminSetupRole: Grant[] = (
  ['access.user', 'access.role', 'access.role_assignment', 'access.approval_reason'] as const
).flatMap((recordType) => (['view', 'create', 'edit'] as const).map((action) => ({ recordType, action })));
const historyReader: Grant[] = [{ recordType: 'audit.audit_record', action: 'view' }];
const policyReadinessReader: Grant[] = [{ recordType: 'configuration.policy_status', action: 'view' }];

describe('landingScreen (DEC-116; personas.md section 2 "Landing")', () => {
  it('PRD-ACS-002 lands the first Admin, whose setup role grants no Policy readiness, on Setup › Users', () => {
    expect(landingScreen(['P-ADM'], [...firstAdminSetupRole, ...historyReader])).toBe('setup.users');
  });

  it("lands on the persona's home screen when the roles grant it", () => {
    expect(landingScreen(['P-ADM'], [...firstAdminSetupRole, ...policyReadinessReader])).toBe('setup.policy-readiness');
    expect(landingScreen(['P-AUD'], [...firstAdminSetupRole, ...historyReader])).toBe('setup.audit-log');
  });

  it("otherwise takes the first screen the roles grant in the persona's menu, in menu order", () => {
    const rolesOnly: Grant[] = [
      { recordType: 'access.role_assignment', action: 'view' },
      { recordType: 'access.role', action: 'view' },
    ];
    expect(landingScreen(['P-ADM'], rolesOnly)).toBe('setup.roles');
    expect(landingScreen(['P-AUD'], rolesOnly)).toBe('setup.roles');
  });

  it('lands on My work, which needs no permission, when it is the persona home screen', () => {
    expect(landingScreen(['P-OWN'], [])).toBe('my-work');
  });

  it('takes the first persona held as the one that sets the landing screen (design-language 10.18)', () => {
    const grants = [...firstAdminSetupRole, ...historyReader];
    expect(landingScreen(['P-AUD', 'P-ADM'], grants)).toBe('setup.audit-log');
    expect(landingScreen(['P-ADM', 'P-AUD'], grants)).toBe('setup.users');
  });

  it('PRD-ACS-003 grants nothing for a persona alone: a screen its roles do not grant is never the landing screen', () => {
    expect(landingScreen(['P-AUD'], [])).toBe('my-work');
    expect(landingScreen(['P-ADM'], [{ recordType: 'access.user', action: 'create' }])).toBe('my-work');
  });

  it('opens My work when no persona is held or no screen of the menu is granted (RR-260)', () => {
    expect(landingScreen([], firstAdminSetupRole)).toBe('my-work');
    expect(landingScreen(['P-CSH'], firstAdminSetupRole)).toBe('my-work');
  });
});
