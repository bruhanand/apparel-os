import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('accepts the ok body and rejects anything else', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
    expect(healthResponseSchema.safeParse({ status: 'down' }).success).toBe(false);
    expect(healthResponseSchema.safeParse({}).success).toBe(false);
  });
});
