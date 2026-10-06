import { Secret } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password-hash.js';
import {
  isSlowed,
  meetsPasswordRules,
  passwordRulesSchema,
  sessionLimitReached,
  SETTING_FORMATS,
  signInThrottlingSchema,
} from './sign-in-rules.js';

// S1-F01-T08: the rules of sign-in that depend on settings (access-and-approvals 3.1, 3.2; GC3-5, DEC-116). Every
// value below is SYNTHETIC, made for the test; the real values are OPEN (GC3-5) and come only from settings.
const SYNTHETIC_THROTTLING = { failureLimit: 3, windowSeconds: 600 };

describe('throttling (access-and-approvals 3.1; DEC-116)', () => {
  it('slows once the failures of the typed login or of the source address reach the limit in the window', () => {
    expect(isSlowed(SYNTHETIC_THROTTLING, { byLogin: 2, byAddress: 2 })).toBe(false);
    expect(isSlowed(SYNTHETIC_THROTTLING, { byLogin: 3, byAddress: 0 })).toBe(true);
    expect(isSlowed(SYNTHETIC_THROTTLING, { byLogin: 0, byAddress: 3 })).toBe(true);
  });

  it('has a setting shape with no default: both values are whole and positive', () => {
    expect(signInThrottlingSchema.safeParse({ failureLimit: 3 }).success).toBe(false);
    expect(signInThrottlingSchema.safeParse({ failureLimit: 0, windowSeconds: 60 }).success).toBe(false);
    expect(signInThrottlingSchema.safeParse({ failureLimit: 1.5, windowSeconds: 60 }).success).toBe(false);
    expect(signInThrottlingSchema.parse(SYNTHETIC_THROTTLING)).toEqual(SYNTHETIC_THROTTLING);
    expect(SETTING_FORMATS['access.sign-in-throttling']).toBe('access.sign-in-throttling/1');
  });
});

describe('the password rules (access-and-approvals 3.2; GC3-5)', () => {
  it('refuses a password shorter than the minimum length the setting holds, counted in characters', () => {
    const rules = passwordRulesSchema.parse({ minimumLength: 4 });
    expect(meetsPasswordRules(rules, new Secret('abc'))).toBe(false);
    expect(meetsPasswordRules(rules, new Secret('abcd'))).toBe(true);
    expect(meetsPasswordRules(rules, new Secret('ab😀'))).toBe(false);
    expect(passwordRulesSchema.safeParse({}).success).toBe(false);
  });
});

describe('password hashes (PRD Stack: Authentication; access-and-approvals 3.2)', () => {
  it('PRD-SEC-014 keeps only an Argon2id hash, which verifies the password and nothing else', async () => {
    const hash = await hashPassword(new Secret('synthetic-password'));
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hash).not.toContain('synthetic-password');
    expect(await verifyPassword(hash, new Secret('synthetic-password'))).toBe(true);
    expect(await verifyPassword(hash, new Secret('synthetic-passwore'))).toBe(false);
  });
});

describe('session limits (access-and-approvals 3.3; PRD-ACS-017; S1-F01-T09)', () => {
  // SYNTHETIC: lock after 10 minutes idle, end after 2 hours.
  const limits = { idleLockSeconds: 600, absoluteSeconds: 7200 };
  const startedAt = new Date('2026-10-07T08:00:00Z');

  it('locks once the idle limit passes since the last activity, and not a moment before', () => {
    const lastActivityAt = new Date('2026-10-07T09:00:00Z');
    expect(sessionLimitReached(limits, { startedAt, lastActivityAt }, new Date('2026-10-07T09:09:59Z'))).toBe('none');
    expect(sessionLimitReached(limits, { startedAt, lastActivityAt }, new Date('2026-10-07T09:10:00Z'))).toBe('idle');
  });

  it('ends at the absolute limit from the start, whatever the activity', () => {
    const lastActivityAt = new Date('2026-10-07T09:59:00Z');
    expect(sessionLimitReached(limits, { startedAt, lastActivityAt }, new Date('2026-10-07T10:00:00Z'))).toBe(
      'absolute',
    );
  });
});
