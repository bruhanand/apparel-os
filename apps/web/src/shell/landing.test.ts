import { permissionRegistry } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { landingScreen } from './landing';
import { screenIds, screens, type Grant, type ScreenNeed } from './screens';

// SYNTHETIC grants: each list stands for the effective grants of a synthetic role assignment. None is a KDPS role.
const firstAdminSetupRole: Grant[] = (
  ['access.user', 'access.role', 'access.role_assignment', 'access.approval_reason'] as const
).flatMap((recordType) => (['view', 'create', 'edit'] as const).map((action) => ({ recordType, action })));
const historyReader: Grant[] = [{ recordType: 'audit.audit_record', action: 'view' }];
const policyReadinessReader: Grant[] = [{ recordType: 'configuration.policy_status', action: 'view' }];

describe('the record types the screens need (access-and-approvals 4.1; RR-261)', () => {
  it('names only record types the permission registry declares (RR-297: configuration’s too, since S1-F04-T01)', () => {
    const declared = new Set(permissionRegistry.map((declaration) => declaration.code));
    for (const id of screenIds) {
      const need: ScreenNeed = screens[id].need;
      if (need.kind === 'none') continue;
      expect(declared.has(need.grant.recordType), id).toBe(true);
    }
  });
});

describe('landingScreen (DEC-116; personas.md section 2 "Landing")', () => {
  it('PRD-ACS-002 lands the first Admin, whose setup role grants no Policy readiness, on Setup › Users', () => {
    expect(landingScreen(true, ['P-ADM'], [...firstAdminSetupRole, ...historyReader])).toBe('setup.users');
  });

  it("lands on the persona's home screen when the roles grant it", () => {
    expect(landingScreen(true, ['P-ADM'], [...firstAdminSetupRole, ...policyReadinessReader])).toBe(
      'setup.policy-readiness',
    );
    expect(landingScreen(true, ['P-AUD'], [...firstAdminSetupRole, ...historyReader])).toBe('setup.audit-log');
  });

  it("otherwise takes the first screen the roles grant in the persona's menu, in menu order", () => {
    const rolesOnly: Grant[] = [
      { recordType: 'access.role_assignment', action: 'view' },
      { recordType: 'access.role', action: 'view' },
    ];
    expect(landingScreen(true, ['P-ADM'], rolesOnly)).toBe('setup.roles');
    expect(landingScreen(true, ['P-AUD'], rolesOnly)).toBe('setup.roles');
  });

  it('lands on My work, which needs no permission, when it is the persona home screen', () => {
    expect(landingScreen(true, ['P-OWN'], [])).toBe('my-work');
  });

  it('takes the first persona held as the one that sets the landing screen (design-language 10.18)', () => {
    const grants = [...firstAdminSetupRole, ...historyReader];
    expect(landingScreen(true, ['P-AUD', 'P-ADM'], grants)).toBe('setup.audit-log');
    expect(landingScreen(true, ['P-ADM', 'P-AUD'], grants)).toBe('setup.users');
  });

  it('PRD-ACS-003 grants nothing for a persona alone: a screen its roles do not grant is never the landing screen', () => {
    expect(landingScreen(true, ['P-AUD'], [])).toBe('my-work');
    expect(landingScreen(true, ['P-ADM'], [{ recordType: 'access.user', action: 'create' }])).toBe('my-work');
  });

  it('PRD-ACS-002 opens My work when no persona is held or no screen of the menu is granted, to a person who holds a role assignment in force (DEC-118; RR-260)', () => {
    expect(landingScreen(true, [], firstAdminSetupRole)).toBe('my-work');
    expect(landingScreen(true, ['P-CSH'], firstAdminSetupRole)).toBe('my-work');
    // A role assignment in force whose role grants no screen of the first persona's menu.
    expect(landingScreen(true, ['P-ADM'], [])).toBe('my-work');
  });

  it('PRD-ACS-002 lands a person who holds no role assignment in force on "No access assigned" (DEC-118; RR-260)', () => {
    expect(landingScreen(false, [], [])).toBe('no-access-assigned');
    expect(landingScreen(false, ['P-ADM'], [])).toBe('no-access-assigned');
    // My work is the Owner's home screen, but a person may use it only with a role assignment in force.
    expect(landingScreen(false, ['P-OWN'], [])).toBe('no-access-assigned');
  });
});
