import { describe, expect, it } from 'vitest';
import { Secret, secretRegistry } from './secret.js';
import { errorKindOf } from './errors.js';
import {
  enrolmentStartResponseSchema,
  passwordChangeRequestSchema,
  signInOutcomeSchema,
  signInRequestSchema,
  userCreateRequestSchema,
} from './sign-in.js';

// Synthetic values only.
const PASSWORD = 'synthetic-password-1';

describe('sign-in (PRD-SEC-001, DEC-093; access-and-approvals 3.1)', () => {
  it('takes the Organisation code, the login, the password and the code in one request', () => {
    const parsed = signInRequestSchema.parse({
      organisationCode: 'SYN-ORG-A',
      login: 'synthetic.user',
      password: PASSWORD,
      totpCode: '123456',
    });
    expect(parsed.password).toBeInstanceOf(Secret);
    expect(JSON.stringify(parsed)).not.toContain(PASSWORD);
  });

  it('allows no authenticator code only for a user without a second factor, which the server decides', () => {
    expect(
      signInRequestSchema.safeParse({ organisationCode: 'SYN-ORG-A', login: 'synthetic.user', password: PASSWORD })
        .success,
    ).toBe(true);
    expect(
      signInRequestSchema.safeParse({
        organisationCode: 'SYN-ORG-A',
        login: 'synthetic.user',
        password: PASSWORD,
        totpCode: '12a456',
      }).success,
    ).toBe(false);
  });

  it('answers a sign-in that passed with the step it still needs, and nothing else', () => {
    for (const outcome of ['signed-in', 'enrolment-required', 'password-change-required']) {
      expect(signInOutcomeSchema.safeParse({ outcome }).success).toBe(true);
    }
    expect(signInOutcomeSchema.safeParse({ outcome: 'signed-in', userId: 'x' }).success).toBe(false);
  });

  it('refuses in the error envelope with one code that names no part, and slows with another (code-house-rules 12.3)', () => {
    // A refused or slowed sign-in is no success: it is the envelope, with one code and no `missing` (DEC-116).
    expect(signInOutcomeSchema.safeParse({ outcome: 'refused' }).success).toBe(false);
    expect(signInOutcomeSchema.safeParse({ outcome: 'slowed' }).success).toBe(false);
    expect(errorKindOf('access.sign-in-refused')).toBe('not-signed-in');
    expect(errorKindOf('access.sign-in-slowed')).toBe('not-signed-in');
  });
});

describe('enrolment and passwords (access-and-approvals 3.2)', () => {
  it('marks the authenticator secret, a new password and a temporary password as secrets', () => {
    expect(secretRegistry.get(enrolmentStartResponseSchema.shape.secret)).toEqual({ secret: true, shownOnce: true });
    expect(secretRegistry.get(enrolmentStartResponseSchema.shape.otpauthUri)).toEqual({
      secret: true,
      shownOnce: true,
    });
    expect(secretRegistry.has(passwordChangeRequestSchema.shape.newPassword)).toBe(true);
    expect(secretRegistry.has(userCreateRequestSchema.shape.temporaryPassword)).toBe(true);
  });

  it('needs a fresh authenticator code to change a password', () => {
    expect(passwordChangeRequestSchema.safeParse({ newPassword: PASSWORD }).success).toBe(false);
  });

  it('creates a later user with a temporary password and no role', () => {
    const parsed = userCreateRequestSchema.parse({
      login: 'synthetic.auditor',
      displayName: 'Synthetic Auditor',
      personas: ['P-AUD'],
      temporaryPassword: PASSWORD,
    });
    expect(parsed.temporaryPassword).toBeInstanceOf(Secret);
    expect(parsed).not.toHaveProperty('roleId');
    expect(userCreateRequestSchema.safeParse({ ...parsed, personas: ['P-AUD', 'P-AUD'] }).success).toBe(false);
  });
});
