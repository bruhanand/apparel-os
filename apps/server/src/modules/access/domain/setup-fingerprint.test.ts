import { setupRequestSchema, type SetupRequestInput } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { setupFingerprint } from './setup-fingerprint.js';

// S1-F01-T10: the canonical form of the setup fingerprint (access-and-approvals 9.11, 13.1; RR-211). SYNTHETIC values.

function request(change: (input: SetupRequestInput) => void = () => undefined) {
  const input: SetupRequestInput = {
    organisationCode: 'SYN-ORG-A',
    databaseName: 'syn_org_a',
    firstAdmin: {
      login: 'synthetic.admin',
      displayName: 'SYNTHETIC Admin',
      personas: ['P-ADM', 'P-AUD'],
      temporaryPassword: 'SYNTHETIC-admin-1',
    },
    firstApprover: {
      login: 'synthetic.approver',
      displayName: 'SYNTHETIC Approver',
      personas: [],
      temporaryPassword: 'SYNTHETIC-approver-1',
    },
    settings: { origin: 'synthetic', timezone: 'Asia/Kolkata', passwordRules: { minimumLength: 12 } },
  };
  change(input);
  return setupRequestSchema.parse(input);
}

describe('setup fingerprint (access-and-approvals 9.11; RR-211)', () => {
  it('is a SHA-256 hex digest that ignores the temporary passwords (PRD-SEC-014)', () => {
    const first = setupFingerprint(request());
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(
      setupFingerprint(
        request((input) => {
          input.firstAdmin.temporaryPassword = 'SYNTHETIC-admin-2';
          input.firstApprover.temporaryPassword = 'SYNTHETIC-approver-2';
        }),
      ),
    ).toBe(first);
  });

  it('does not depend on the order of keys', () => {
    const reordered = request();
    const shuffled = setupRequestSchema.parse({
      settings: { passwordRules: { minimumLength: 12 }, timezone: 'Asia/Kolkata', origin: 'synthetic' },
      firstApprover: {
        temporaryPassword: 'SYNTHETIC-approver-1',
        personas: [],
        displayName: 'SYNTHETIC Approver',
        login: 'synthetic.approver',
      },
      firstAdmin: {
        personas: ['P-ADM', 'P-AUD'],
        temporaryPassword: 'SYNTHETIC-admin-1',
        displayName: 'SYNTHETIC Admin',
        login: 'synthetic.admin',
      },
      databaseName: 'syn_org_a',
      organisationCode: 'SYN-ORG-A',
    });
    expect(setupFingerprint(shuffled)).toBe(setupFingerprint(reordered));
  });

  it('changes with any non-secret field: login case, persona order, a setting, the database name', () => {
    const first = setupFingerprint(request());
    const changes: ((input: SetupRequestInput) => void)[] = [
      (input) => (input.firstAdmin.login = 'Synthetic.Admin'),
      (input) => (input.firstAdmin.personas = ['P-AUD', 'P-ADM']),
      (input) => (input.settings.passwordRules = { minimumLength: 13 }),
      (input) => (input.settings.signInThrottling = { failureLimit: 5, windowSeconds: 600 }),
      (input) => (input.settings.origin = 'test-setup'),
      (input) => (input.databaseName = 'syn_org_a2'),
      (input) => (input.firstApprover.displayName = 'SYNTHETIC Approver 2'),
    ];
    for (const change of changes) expect(setupFingerprint(request(change))).not.toBe(first);
  });
});
