import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { codesOfRoute, defineRoute, routes } from './route-table.js';
import { secretString } from './secret.js';

// S1-F01-T04: the route table (code-house-rules 12.1, 12.2).

describe('the route table (code-house-rules 12.2)', () => {
  it('PRD-SEC-005 declares the access of every route', () => {
    for (const route of Object.values(routes)) {
      expect(['public', 'own', 'action']).toContain(route.access.kind);
    }
  });

  it('serves the health check as a public read, under /api, with no unit in its path', () => {
    expect(routes.health).toMatchObject({
      method: 'GET',
      path: '/api/health',
      access: { kind: 'public' },
      command: false,
    });
  });

  it('names every route once, by method and path', () => {
    const keys = Object.values(routes).map((route) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('defineRoute (code-house-rules 12.1, 12.2)', () => {
  const response = z.strictObject({ id: z.uuid() });

  it('refuses a path outside /api', () => {
    expect(() =>
      defineRoute({ method: 'GET', path: '/health', access: { kind: 'public' }, command: false, response, codes: [] }),
    ).toThrow();
  });

  it('refuses a path parameter its schema does not name, or a schema naming one the path lacks', () => {
    expect(() =>
      defineRoute({
        method: 'GET',
        path: '/api/synthetic/{id}',
        access: { kind: 'public' },
        command: false,
        response,
        codes: [],
      }),
    ).toThrow();
    expect(() =>
      defineRoute({
        method: 'GET',
        path: '/api/synthetic',
        params: z.strictObject({ id: z.uuid() }),
        access: { kind: 'public' },
        command: false,
        response,
        codes: [],
      }),
    ).toThrow();
  });

  it('PRD-SEC-014 refuses a secret field its route does not declare as one', () => {
    expect(() =>
      defineRoute({
        method: 'POST',
        path: '/api/synthetic',
        access: { kind: 'own' },
        command: true,
        body: z.strictObject({ newPassword: secretString() }),
        secretFields: [],
        restrictedFields: [],
        shows: 'nothing',
        response,
        codes: [],
      }),
    ).toThrow();
  });

  it('PRD-SEC-014 refuses a new secret that is not parsed into a Secret', () => {
    expect(() =>
      defineRoute({
        method: 'POST',
        path: '/api/synthetic',
        access: { kind: 'own' },
        command: true,
        body: z.strictObject({ newPassword: z.string() }),
        secretFields: [{ path: ['newPassword'], kind: 'new-secret' }],
        restrictedFields: [],
        shows: 'nothing',
        response,
        codes: [],
      }),
    ).toThrow();
  });

  it('gives a command the shared codes of every command beside its own', () => {
    const route = defineRoute({
      method: 'POST',
      path: '/api/synthetic',
      access: { kind: 'own' },
      command: true,
      body: z.strictObject({ newPassword: secretString() }),
      secretFields: [{ path: ['newPassword'], kind: 'new-secret' }],
      restrictedFields: [],
      shows: 'secret',
      response,
      codes: ['kernel.stale-version'],
    });
    expect(codesOfRoute(route)).toEqual([
      'kernel.answer-not-repeatable',
      'kernel.failed',
      'kernel.idempotency-key-required',
      'kernel.idempotency-key-reused',
      'kernel.invalid-request',
      'kernel.outcome-unknown',
      'kernel.request-in-progress',
      'kernel.secret-not-comparable',
      'kernel.stale-version',
      'kernel.timed-out',
    ]);
    expect(codesOfRoute(routes.health)).toEqual(['kernel.failed', 'kernel.invalid-request', 'kernel.timed-out']);
  });
});
