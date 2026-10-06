import { healthResponseSchema } from '@apparel-os/schemas';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CORRELATION_ID_HEADER, isCorrelationId } from '../command-runner/correlation.js';
import { configureApp } from '../http/configure-app.js';
import { KernelModule } from '../kernel.module.js';

describe('GET /api/health', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [KernelModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a body that satisfies the shared schema', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(healthResponseSchema.parse(body)).toEqual({ status: 'ok' });
  });

  it('code-house-rules 12.11 gives every request its own correlation identifier, made by the server', async () => {
    const first = await fetch(`${baseUrl}/api/health`);
    const second = await fetch(`${baseUrl}/api/health`, {
      headers: { [CORRELATION_ID_HEADER]: '01900000-0000-7000-8000-000000000001' },
    });
    const firstId = first.headers.get(CORRELATION_ID_HEADER) ?? '';
    const secondId = second.headers.get(CORRELATION_ID_HEADER) ?? '';
    expect(isCorrelationId(firstId)).toBe(true);
    expect(isCorrelationId(secondId)).toBe(true);
    expect(secondId).not.toBe(firstId);
    // Never one taken from the client.
    expect(secondId).not.toBe('01900000-0000-7000-8000-000000000001');
  });

  it('code-house-rules 12.11 gives a correlation identifier to a request no route answers', async () => {
    const response = await fetch(`${baseUrl}/api/no-such-route`);
    expect(response.status).toBe(404);
    expect(isCorrelationId(response.headers.get(CORRELATION_ID_HEADER) ?? '')).toBe(true);
  });
});
