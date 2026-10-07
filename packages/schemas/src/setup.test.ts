import { describe, expect, it } from 'vitest';
import { Secret, secretRegistry } from './secret.js';
import {
  missingSetupSettings,
  setupFingerprintFieldsSchema,
  setupOutcomeSchema,
  setupRequestFileSchema,
  setupRequestSchema,
  setupSettingsSchema,
  setupUserSchema,
} from './setup.js';

// Synthetic values only (code-house-rules 11.1). None of them is a default.
const ADMIN_PASSWORD = 'synthetic-admin-temporary-1';
const APPROVER_PASSWORD = 'synthetic-approver-temporary-1';

/** A copy of an object without one of its fields. */
function without<T extends object, K extends keyof T>(value: T, name: K): Omit<T, K> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== name)) as Omit<T, K>;
}

function syntheticSettings() {
  return {
    origin: 'synthetic' as const,
    timezone: 'Asia/Kolkata',
    passwordRules: { minimumLength: 12 },
    signInThrottling: { failureLimit: 5, windowSeconds: 600 },
    officeSessionLimits: { idleLockSeconds: 900, absoluteSeconds: 43_200 },
  };
}

function syntheticRequest() {
  return {
    organisationCode: 'SYN-ORG-A',
    databaseName: 'syn_org_a',
    firstAdmin: {
      login: 'synthetic.admin',
      displayName: 'SYNTHETIC Admin',
      personas: ['P-ADM'],
      temporaryPassword: ADMIN_PASSWORD,
    },
    firstApprover: {
      login: 'synthetic.approver',
      displayName: 'SYNTHETIC Approver',
      personas: [],
      temporaryPassword: APPROVER_PASSWORD,
    },
    settings: syntheticSettings(),
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

  it('refuses fields it does not know, and a database name the directory cannot keep', () => {
    expect(setupRequestSchema.safeParse({ ...syntheticRequest(), extra: true }).success).toBe(false);
    expect(setupRequestSchema.safeParse({ ...syntheticRequest(), databaseName: 'syn-org-a' }).success).toBe(false);
    expect(setupRequestSchema.safeParse({ ...syntheticRequest(), databaseName: 'a'.repeat(64) }).success).toBe(false);
  });

  it('the request file holds every field but the temporary passwords (access-and-approvals 3.2)', () => {
    const { firstAdmin, firstApprover, ...rest } = syntheticRequest();
    const admin = without(firstAdmin, 'temporaryPassword');
    const approver = without(firstApprover, 'temporaryPassword');
    expect(setupRequestFileSchema.safeParse({ ...rest, firstAdmin: admin, firstApprover: approver }).success).toBe(
      true,
    );
    expect(setupRequestFileSchema.safeParse(syntheticRequest()).success).toBe(false);
  });
});

describe('setup settings (code-house-rules 12.14; AGENTS.md "Never invent a value")', () => {
  it('needs the origin and every required security setting, and gives none a default (PRD-SEC-017; DEC-118)', () => {
    for (const name of ['origin', 'timezone', 'passwordRules', 'signInThrottling', 'officeSessionLimits'] as const) {
      const settings = without(syntheticSettings(), name);
      expect(setupSettingsSchema.safeParse(settings).success).toBe(false);
    }
  });

  it('test 19j names each required security setting a request leaves out (DEC-118)', () => {
    const request = syntheticRequest();
    expect(missingSetupSettings(request)).toEqual([]);
    const least = without(without(request.settings, 'signInThrottling'), 'officeSessionLimits');
    expect(missingSetupSettings({ ...request, settings: least })).toEqual([
      'settings.signInThrottling',
      'settings.officeSessionLimits',
    ]);
    expect(missingSetupSettings({ ...request, settings: without(request.settings, 'timezone') })).toEqual([
      'settings.timezone',
    ]);
    expect(missingSetupSettings({ ...request, settings: undefined })).toEqual([
      'settings.timezone',
      'settings.passwordRules',
      'settings.signInThrottling',
      'settings.officeSessionLimits',
    ]);
  });

  it('refuses an unknown timezone, an unknown origin and a value of the wrong shape', () => {
    expect(setupSettingsSchema.safeParse({ ...syntheticSettings(), timezone: 'Not/AZone' }).success).toBe(false);
    expect(setupSettingsSchema.safeParse({ ...syntheticSettings(), origin: 'guess' }).success).toBe(false);
    expect(setupSettingsSchema.safeParse({ ...syntheticSettings(), passwordRules: { minimumLength: 0 } }).success).toBe(
      false,
    );
    expect(
      setupSettingsSchema.safeParse({ ...syntheticSettings(), officeSessionLimits: { idleLockSeconds: 900 } }).success,
    ).toBe(false);
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
