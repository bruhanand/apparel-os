import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Secret, secretRegistry, secretString } from './secret.js';

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
