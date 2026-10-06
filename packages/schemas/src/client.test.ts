import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiContractError, createApiClient } from './client.js';
import { defineRoute } from './route-table.js';
import { Secret, shownOnceSecret } from './secret.js';

// S1-F01-T04: the typed client (code-house-rules 12.2, 12.4, 12.6), against a recorded fetch.

const ID = '01900000-0000-7000-8000-000000000f01';
const KEY = '01900000-0000-7000-8000-000000000f02';
const REFERENCE = '01900000-0000-7000-8000-000000000f03';

const table = {
  read: defineRoute({
    method: 'GET',
    path: '/api/synthetic/{id}',
    params: z.strictObject({ id: z.uuid() }),
    query: z.strictObject({ after: z.string().optional() }),
    access: { kind: 'action', action: 'view', recordType: 'synthetic' },
    command: false,
    response: z.strictObject({ id: z.uuid(), secret: shownOnceSecret() }),
    codes: [],
  }),
  submit: defineRoute({
    method: 'POST',
    path: '/api/synthetic/{id}/submit',
    params: z.strictObject({ id: z.uuid() }),
    access: { kind: 'action', action: 'edit', recordType: 'synthetic' },
    command: true,
    body: z.strictObject({ versionToken: z.uuid() }),
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: z.strictObject({ id: z.uuid() }),
    codes: ['kernel.stale-version'],
  }),
};

interface Sent {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function recordingFetch(answer: { status: number; body: unknown; headers?: Record<string, string> }) {
  const sent: Sent[] = [];
  const fetch = (url: string, init?: RequestInit): Promise<Response> => {
    sent.push({
      url,
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    return Promise.resolve(
      new Response(JSON.stringify(answer.body), {
        status: answer.status,
        headers: { 'content-type': 'application/json', ...answer.headers },
      }),
    );
  };
  return { fetch, sent };
}

describe('the typed client (code-house-rules 12.2)', () => {
  it('builds the path and query, and decodes the answer through the route schema', async () => {
    const { fetch, sent } = recordingFetch({ status: 200, body: { id: ID, secret: 'SYNTHETIC-shown' } });
    const client = createApiClient(table, { baseUrl: 'https://app.example.test', fetch });
    const result = await client.call('read', { params: { id: ID }, query: { after: 'x y' } });
    expect(sent).toEqual([
      {
        url: `https://app.example.test/api/synthetic/${ID}?after=x+y`,
        method: 'GET',
        headers: { accept: 'application/json' },
        body: undefined,
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // PRD-SEC-014: a secret shown once is a Secret in the web app's state, never a plain string.
    expect(result.data.secret).toBeInstanceOf(Secret);
    expect(JSON.stringify(result.data)).not.toContain('SYNTHETIC-shown');
  });

  it('PRD-INT-002 sends a command with a new UUIDv7 Idempotency-Key, and the same key again when asked', async () => {
    const { fetch, sent } = recordingFetch({
      status: 200,
      body: { id: ID },
      headers: { 'Idempotent-Replayed': 'true' },
    });
    const client = createApiClient(table, { baseUrl: '', fetch });
    const first = await client.call('submit', { params: { id: ID }, body: { versionToken: ID } });
    const again = await client.call('submit', { params: { id: ID }, body: { versionToken: ID }, idempotencyKey: KEY });
    expect(sent[0]?.headers['idempotency-key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(sent[0]).toMatchObject({ method: 'POST', body: JSON.stringify({ versionToken: ID }) });
    expect(sent[0]?.headers['content-type']).toBe('application/json');
    expect(sent[1]?.headers['idempotency-key']).toBe(KEY);
    expect(first).toMatchObject({ ok: true, replayed: true, idempotencyKey: sent[0]?.headers['idempotency-key'] });
    expect(again).toMatchObject({ ok: true, idempotencyKey: KEY });
  });

  it('PRD-UXP-003 gives back an error as the envelope says, with its status', async () => {
    const error = { kind: 'conflict', code: 'kernel.stale-version', missing: [], reference: REFERENCE };
    const { fetch } = recordingFetch({ status: 409, body: { error } });
    const client = createApiClient(table, { baseUrl: '', fetch });
    const result = await client.call('submit', { params: { id: ID }, body: { versionToken: ID }, idempotencyKey: KEY });
    expect(result).toEqual({ ok: false, status: 409, error, replayed: false, idempotencyKey: KEY });
  });

  it('refuses an answer that matches neither the route schema nor the envelope', async () => {
    const client = createApiClient(table, {
      baseUrl: '',
      fetch: recordingFetch({ status: 200, body: { id: 'not-a-uuid' } }).fetch,
    });
    await expect(client.call('submit', { params: { id: ID }, body: { versionToken: ID } })).rejects.toBeInstanceOf(
      ApiContractError,
    );
    const broken = createApiClient(table, {
      baseUrl: '',
      fetch: recordingFetch({ status: 500, body: { message: 'SYNTHETIC' } }).fetch,
    });
    await expect(broken.call('submit', { params: { id: ID }, body: { versionToken: ID } })).rejects.toBeInstanceOf(
      ApiContractError,
    );
  });
});
