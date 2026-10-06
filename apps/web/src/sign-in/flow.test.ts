import type { ErrorBody } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { stageAfterSignIn, stageOfSessionRead } from './flow';

// SYNTHETIC values only (code-house-rules 11.1).
const view = {
  organisationCode: 'SYN-ORG-A',
  userId: '01900000-0000-7000-8000-000000000001',
  displayName: 'SYNTHETIC User',
  personasHeld: ['P-AUD' as const],
  grants: [{ recordType: 'audit.audit_record', action: 'view' as const }],
};
const refusal = (code: string, kind: ErrorBody['kind'], missing?: { kind: string; step: string }[]) => ({
  ok: false as const,
  status: 401,
  replayed: false,
  idempotencyKey: undefined,
  error: { kind, code, reference: '01900000-0000-7000-8000-0000000000aa', ...(missing ? { missing } : {}) },
});

describe('where the sign-in screens go next (access-and-approvals 3.1 to 3.3)', () => {
  it('a sign-in that passed reads the session; one that needs a step goes to that step', () => {
    expect(stageAfterSignIn({ outcome: 'signed-in' })).toEqual({ stage: 'read-session' });
    expect(stageAfterSignIn({ outcome: 'enrolment-required' })).toEqual({ stage: 'enrolment' });
    expect(stageAfterSignIn({ outcome: 'password-change-required' })).toEqual({ stage: 'password-change' });
  });

  it('PRD-SEC-001 a session that finished first sign-in is signed in, with its display name', () => {
    expect(stageOfSessionRead({ ok: true, data: view, replayed: false, idempotencyKey: undefined })).toEqual({
      stage: 'signed-in',
      view,
    });
  });

  it('access-and-approvals 3.2: a session with a step left goes to the first step the server names', () => {
    const incomplete = (step: string) =>
      refusal('access.sign-in-incomplete', 'not-signed-in', [{ kind: 'sign-in-step', step }]);
    expect(stageOfSessionRead(incomplete('enrolment'))).toEqual({ stage: 'enrolment' });
    expect(stageOfSessionRead(incomplete('password-change'))).toEqual({ stage: 'password-change' });
  });

  it('no session goes to the sign-in screen; any other refusal is shown there as it came', () => {
    expect(stageOfSessionRead(refusal('access.not-signed-in', 'not-signed-in'))).toEqual({ stage: 'sign-in' });
    const failed = refusal('kernel.failed', 'failed');
    expect(stageOfSessionRead(failed)).toEqual({ stage: 'sign-in', refusal: failed.error });
  });
});
