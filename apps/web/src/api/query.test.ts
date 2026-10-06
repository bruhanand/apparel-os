import { createApiClient, routes } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { ApiFailure, readQuery, sessionRefusal } from './query';

const reference = '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f7a8';

function clientAnswering(status: number, body: unknown) {
  return createApiClient(routes, {
    baseUrl: '',
    fetch: () => Promise.resolve(new Response(JSON.stringify(body), { status })),
  });
}

describe('readQuery (code-house-rules 12.2; PRD Stack: Web, TanStack Query)', () => {
  it('keys a read by its route and input, and gives its decoded answer', async () => {
    const options = readQuery(clientAnswering(200, { status: 'ok' }), 'health', {});
    expect(options.queryKey).toEqual(['health', {}]);
    await expect(options.queryFn()).resolves.toEqual({ status: 'ok' });
  });

  it('PRD-UXP-003 throws the refusal with its envelope, so the screen can name the reason and the reference', async () => {
    const envelope = { error: { kind: 'timed-out', code: 'kernel.timed-out', reference } };
    const failure = await readQuery(clientAnswering(503, envelope), 'health', {})
      .queryFn()
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiFailure);
    expect((failure as ApiFailure).body).toEqual(envelope.error);
    expect((failure as ApiFailure).status).toBe(503);
  });
});

describe('sessionRefusal (access-and-approvals 3.3; RR-264)', () => {
  const body = (kind: 'not-signed-in' | 'not-authorised', code: string) => ({ kind, code, reference });

  it('PRD-ACS-017 tells a locked session apart from one that ended or was revoked', () => {
    expect(sessionRefusal(body('not-signed-in', 'access.session-locked'))).toBe('locked');
    expect(sessionRefusal(body('not-signed-in', 'access.not-signed-in'))).toBe('ended');
    expect(sessionRefusal(body('not-signed-in', 'access.sign-in-incomplete'))).toBe('ended');
  });

  it('leaves any other refusal to the screen', () => {
    expect(sessionRefusal(body('not-authorised', 'access.not-authorised'))).toBeNull();
    expect(sessionRefusal(null)).toBeNull();
  });
});
