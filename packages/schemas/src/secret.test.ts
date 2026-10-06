import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Secret, secretRegistry, secretString, shownOnceSecret } from './secret.js';

// Synthetic values only.
const SYNTHETIC_PASSWORD = 'synthetic-temporary-password-1';

describe('Secret (PRD-SEC-006, PRD-SEC-014)', () => {
  it('shows a placeholder to JSON, string conversion and the Node inspector', () => {
    const secret = new Secret(SYNTHETIC_PASSWORD);
    expect(JSON.stringify({ secret })).not.toContain(SYNTHETIC_PASSWORD);
    expect(String(secret)).not.toContain(SYNTHETIC_PASSWORD);
    expect(`value: ${String(secret)}`).not.toContain(SYNTHETIC_PASSWORD);
    expect(inspect({ secret })).not.toContain(SYNTHETIC_PASSWORD);
    expect(secret.reveal()).toBe(SYNTHETIC_PASSWORD);
  });

  it('wraps a parsed secret and registers its schema', () => {
    const schema = secretString();
    expect(secretRegistry.has(schema)).toBe(true);
    const parsed = schema.parse(SYNTHETIC_PASSWORD);
    expect(parsed).toBeInstanceOf(Secret);
    expect(parsed.reveal()).toBe(SYNTHETIC_PASSWORD);
  });

  it('refuses an absent value and sets no rule of its own (GC3-5 is OPEN)', () => {
    const schema = secretString();
    expect(schema.safeParse('').success).toBe(false);
    expect(schema.safeParse('x').success).toBe(true);
  });

  it('never echoes the value when it refuses the secret field itself', () => {
    const schema = z.strictObject({ password: secretString() });
    // Wrong type: a number, and an object holding the synthetic password.
    for (const [input, needle] of [
      [918273645, '918273645'],
      [{ value: SYNTHETIC_PASSWORD }, SYNTHETIC_PASSWORD],
    ] as const) {
      const result = schema.safeParse({ password: input });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).not.toContain(needle);
      expect(result.error?.message).not.toContain(needle);
    }
    // Too short: the empty value is refused.
    expect(schema.safeParse({ password: '' }).success).toBe(false);
  });
});

describe('a secret shown once (code-house-rules 12.6; DEC-113)', () => {
  it('PRD-SEC-014 is a plain string on the wire, revealed only where the server encodes the answer', () => {
    const schema = z.strictObject({ secret: shownOnceSecret() });
    expect(z.encode(schema, { secret: new Secret(SYNTHETIC_PASSWORD) })).toEqual({ secret: SYNTHETIC_PASSWORD });
  });

  it('PRD-SEC-014 is decoded back into a Secret by the client, so its state and logs show the placeholder', () => {
    const decoded = z.decode(z.strictObject({ secret: shownOnceSecret() }), { secret: SYNTHETIC_PASSWORD });
    expect(decoded.secret).toBeInstanceOf(Secret);
    expect(JSON.stringify(decoded)).not.toContain(SYNTHETIC_PASSWORD);
  });

  it('is registered as a secret shown once, and a secretString() as a secret only', () => {
    expect(secretRegistry.get(shownOnceSecret())).toEqual({ secret: true, shownOnce: true });
    expect(secretRegistry.get(secretString())).toEqual({ secret: true });
  });
});
