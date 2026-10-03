import { healthResponseSchema } from '@apparel-os/schemas';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
});
