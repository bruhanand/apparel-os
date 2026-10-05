import { describe, expect, it } from 'vitest';
import { Secret, secretRegistry } from './secret.js';
import {
  setupFingerprintFieldsSchema,
  setupOutcomeSchema,
  setupRequestSchema,
  setupSettingsSchema,
  setupUserSchema,
} from './setup.js';

// Synthetic values only (code-house-rules 11.1). None of them is a default.
const ADMIN_PASSWORD = 'synthetic-admin-temporary-1';
const APPROVER_PASSWORD = 'synthetic-approver-temporary-1';

function syntheticRequest() {
  return {
    organisationCode: 'SYN-ORG-A',
    firstAdmin: {
      login: 'synthetic.admin',
      displayName: 'Synthetic Admin',
      personas: ['P-ADM'],
      temporaryPassword: ADMIN_PASSWORD,
    },
    firstApprover: {
      login: 'synthetic.approver',
      displayName: 'Synthetic Approver',
      personas: [],
      temporaryPassword: APPROVER_PASSWORD,
    },
    settings: { timezone: 'Asia/Kolkata' },
  };
}

describe('setup request (PRD-ACS-023, DEC-112; access-and-approvals 9.11)', () => {
  it('marks each temporary password as a secret and wraps it', () => {
    expect(secretRegistry.has(setupUserSchema.shape.temporaryPassword)).toBe(true);
    const parsed = setupRequestSchema.parse(syntheticRequest());
    expect(parsed.firstAdmin.temporaryPassword).toBeInstanceOf(Secret);
    expect(parsed.firstApprover.temporaryPassword).toBeInstanceOf(Secret);
    expect(JSON.stringify(parsed)).not.toContain(ADMIN_PASSWORD);
    expect(JSON.stringify(parsed)).not.toContain(APPROVER_PASSWORD);
  });

  it('needs a temporary password for each user', () => {
    const request = syntheticRequest();
    const withoutPassword = Object.fromEntries(
      Object.entries(request.firstApprover).filter(([name]) => name !== 'temporaryPassword'),
    );
    expect(setupRequestSchema.safeParse({ ...request, firstApprover: withoutPassword }).success).toBe(false);
  });

  it('refuses one login for both users, ignoring letter case (PRD-ACS-006)', () => {
    const request = syntheticRequest();
    const same = { ...request, firstApprover: { ...request.firstApprover, login: 'SYNTHETIC.ADMIN' } };
    expect(setupRequestSchema.safeParse(same).success).toBe(false);
  });

  it('refuses fields it does not know', () => {
    expect(setupRequestSchema.safeParse({ ...syntheticRequest(), extra: true }).success).toBe(false);
  });

  it('gives no setting a default: an absent setting stays absent', () => {
    expect(setupSettingsSchema.parse({})).toEqual({});
    expect(setupSettingsSchema.parse({ sessionLimits: { office: {} } })).toEqual({ sessionLimits: { office: {} } });
  });

  it('keeps the session limits per session kind, office and shared POS (access-and-approvals 3.3)', () => {
    const limits = { office: { idleLockMinutes: 1, absoluteMinutes: 2 }, sharedPos: { idleLockMinutes: 3 } };
    expect(setupSettingsSchema.parse({ sessionLimits: limits }).sessionLimits).toEqual(limits);
    expect(setupSettingsSchema.safeParse({ sessionLimits: { absoluteMinutes: 2 } }).success).toBe(false);
    expect(setupSettingsSchema.safeParse({ sessionLimits: { office: { idleLockMinutes: 0 } } }).success).toBe(false);
    expect(setupSettingsSchema.safeParse({ timezone: 'Not/AZone' }).success).toBe(false);
  });
});

describe('setup fingerprint fields (access-and-approvals 9.11, 13.1)', () => {
  it('drops every temporary password, from the raw request and from the parsed one', () => {
    const raw = setupFingerprintFieldsSchema.parse(syntheticRequest());
    const parsed = setupFingerprintFieldsSchema.parse(setupRequestSchema.parse(syntheticRequest()));
    for (const fields of [raw, parsed]) {
      expect(fields.firstAdmin).not.toHaveProperty('temporaryPassword');
      expect(fields.firstApprover).not.toHaveProperty('temporaryPassword');
      expect(JSON.stringify(fields)).not.toContain(ADMIN_PASSWORD);
      expect(JSON.stringify(fields)).not.toContain(APPROVER_PASSWORD);
    }
  });

  it('is the same for two requests that differ only in a temporary password', () => {
    const first = syntheticRequest();
    const second = syntheticRequest();
    second.firstApprover.temporaryPassword = 'synthetic-approver-temporary-2';
    expect(setupFingerprintFieldsSchema.parse(first)).toEqual(setupFingerprintFieldsSchema.parse(second));
  });
});

describe('setup outcome', () => {
  it('has the four outcomes and nothing more', () => {
    expect(setupOutcomeSchema.parse({ outcome: 'created', organisationCode: 'SYN-ORG-A' }).outcome).toBe('created');
    expect(setupOutcomeSchema.parse({ outcome: 'completed', organisationCode: 'SYN-ORG-A' }).outcome).toBe('completed');
    for (const reason of ['duplicate', 'conflict', 'fingerprint-version']) {
      expect(setupOutcomeSchema.safeParse({ outcome: 'refused', reason, organisationCode: 'SYN-ORG-A' }).success).toBe(
        true,
      );
    }
    expect(
      setupOutcomeSchema.safeParse({ outcome: 'refused', reason: 'password', organisationCode: 'SYN-ORG-A' }).success,
    ).toBe(false);
  });

  it('carries no detail of a conflict: no user, field or value', () => {
    const detailed = { outcome: 'refused', reason: 'conflict', organisationCode: 'SYN-ORG-A', user: 'firstApprover' };
    expect(setupOutcomeSchema.safeParse(detailed).success).toBe(false);
  });
});
