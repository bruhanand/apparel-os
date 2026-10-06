import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { openApiDocument, openApiText } from './openapi.js';
import { defineRoute, routes } from './route-table.js';
import { secretString, shownOnceSecret } from './secret.js';

// S1-F01-T04: the OpenAPI document, generated from the route table (code-house-rules 12.2, 12.6; PRD-SEC-015).

const synthetic = {
  enrol: defineRoute({
    method: 'POST',
    path: '/api/synthetic/{id}/enrol',
    params: z.strictObject({ id: z.uuid() }),
    access: { kind: 'own' },
    command: true,
    body: z.strictObject({ newPassword: secretString(), totpCode: z.string() }),
    secretFields: [
      { path: ['newPassword'], kind: 'new-secret' },
      { path: ['totpCode'], kind: 'authenticator-code' },
    ],
    restrictedFields: [],
    shows: 'secret',
    response: z.strictObject({ secret: shownOnceSecret() }),
    codes: [],
  }),
};

type Operation = Record<string, unknown> & {
  parameters: Record<string, unknown>[];
  requestBody: { content: { 'application/json': { schema: { properties: Record<string, unknown> } } } };
  responses: Record<string, { content: { 'application/json': { schema: unknown } }; 'x-error-codes'?: string[] }>;
};

function operation(): Operation {
  const document = openApiDocument(synthetic) as { paths: Record<string, Record<string, Operation>> };
  const found = document.paths['/api/synthetic/{id}/enrol']?.post;
  if (found === undefined) throw new Error('No operation');
  return found;
}

describe('the OpenAPI document (code-house-rules 12.2)', () => {
  it('PRD-SEC-015 the committed document is the one the route table generates; regenerate it with generate:openapi', () => {
    const committed = readFileSync(new URL('../openapi.json', import.meta.url), 'utf8');
    expect(committed).toBe(openApiText(routes));
  });

  it('PRD-SEC-014 describes a secret field as a write-only password and a secret shown once as read-only, shown once', () => {
    expect(operation().requestBody.content['application/json'].schema.properties.newPassword).toEqual({
      type: 'string',
      minLength: 1,
      format: 'password',
      writeOnly: true,
    });
    expect(operation().responses['200']?.content['application/json'].schema).toMatchObject({
      properties: { secret: { type: 'string', format: 'password', readOnly: true, 'x-shown-once': true } },
    });
  });

  it('code-house-rules 12.4 requires the Idempotency-Key header of a command, beside its path parameters', () => {
    expect(operation().parameters).toEqual([
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid', pattern: expect.any(String) as unknown },
      },
      { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', format: 'uuid' } },
    ]);
  });

  it('code-house-rules 12.3 lists the error envelope with the codes of each status', () => {
    const responses = operation().responses;
    expect(responses['409']).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
      'x-error-codes': [
        'kernel.answer-not-repeatable',
        'kernel.idempotency-key-reused',
        'kernel.request-in-progress',
        'kernel.secret-not-comparable',
      ],
    });
    expect(responses['400']?.['x-error-codes']).toEqual(['kernel.idempotency-key-required', 'kernel.invalid-request']);
    expect(responses['500']?.['x-error-codes']).toEqual(['kernel.failed', 'kernel.outcome-unknown']);
    expect(Object.keys(responses).sort()).toEqual(['200', '400', '409', '500', '503']);
  });
});
