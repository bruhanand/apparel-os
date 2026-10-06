import { describe, expect, it } from 'vitest';
import { errorCodes, errorEnvelopeSchema, errorKindOf, errorKinds, kernelCodes, statusOfKind } from './errors.js';

// S1-F01-T04: the error envelope and the refusal codes (code-house-rules 12.3).

const REFERENCE = '01900000-0000-7000-8000-000000000e01';

describe('the error envelope (code-house-rules 12.3)', () => {
  it('PRD-UXP-003 holds the kind, the code, what is missing, the next action and the reference', () => {
    const envelope = {
      error: {
        kind: 'not-authorised',
        code: 'access.scope-not-covered',
        missing: [{ kind: 'scope', dimension: 'place', id: '01900000-0000-7000-8000-000000000e02' }],
        next: 'access.ask-for-assignment',
        reference: REFERENCE,
      },
    };
    expect(errorEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it('gives an invalid answer the paths and issue codes that failed, never an input value', () => {
    const envelope = {
      error: {
        kind: 'invalid',
        code: 'kernel.invalid-request',
        issues: [{ path: ['body', 'lines', 0, 'sku'], code: 'too_small' }],
        reference: REFERENCE,
      },
    };
    expect(errorEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(
      errorEnvelopeSchema.safeParse({
        error: { ...envelope.error, issues: [{ path: ['body'], code: 'too_small', input: 'SYNTHETIC' }] },
      }).success,
    ).toBe(false);
  });

  it('PRD-SEC-006 refuses a field it does not name, and a missing item holding anything but identifiers and codes', () => {
    const base = { kind: 'refused', code: 'kernel.synthetic', reference: REFERENCE };
    expect(errorEnvelopeSchema.safeParse({ error: { ...base, message: 'database said' } }).success).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({ error: { ...base, missing: [{ kind: 'setting', value: 5 }] } }).success,
    ).toBe(false);
  });

  it('refuses a code that is not <unit>.<reason> in lower-case words', () => {
    const base = { kind: 'refused', reference: REFERENCE };
    expect(errorEnvelopeSchema.safeParse({ error: { ...base, code: 'Refused' } }).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ error: { ...base, code: 'kernel.Bad_Code' } }).success).toBe(false);
  });
});

describe('the kinds and their statuses (code-house-rules 12.3)', () => {
  it('maps each kind to its one HTTP status', () => {
    expect(Object.fromEntries(errorKinds.map((kind) => [kind, statusOfKind(kind)]))).toEqual({
      invalid: 400,
      'not-signed-in': 401,
      unavailable: 403,
      'not-authorised': 403,
      'not-found': 404,
      refused: 422,
      conflict: 409,
      'timed-out': 503,
      failed: 500,
    });
  });
});

describe('the kernel codes (code-house-rules 12.3, 12.4, 12.5, 12.6)', () => {
  it('declares the shared codes, each with its one kind', () => {
    expect(kernelCodes).toEqual({
      'kernel.invalid-request': 'invalid',
      'kernel.idempotency-key-required': 'invalid',
      'kernel.not-found': 'not-found',
      'kernel.idempotency-key-reused': 'conflict',
      'kernel.request-in-progress': 'conflict',
      'kernel.stale-version': 'conflict',
      'kernel.secret-not-comparable': 'conflict',
      'kernel.answer-not-repeatable': 'conflict',
      'kernel.timed-out': 'timed-out',
      'kernel.failed': 'failed',
      'kernel.outcome-unknown': 'failed',
    });
  });

  it('finds the kind of every declared code', () => {
    expect(errorKindOf('kernel.outcome-unknown')).toBe('failed');
    for (const code of Object.keys(errorCodes))
      expect(errorKinds).toContain(errorKindOf(code as keyof typeof errorCodes));
  });
});
