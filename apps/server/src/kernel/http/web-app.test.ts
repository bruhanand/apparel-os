import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { errorEnvelopeSchema } from '@apparel-os/schemas';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KernelModule } from '../kernel.module.js';
import { configureApp } from './configure-app.js';
import { HTTP_ENVIRONMENT } from './origin-check.guard.js';
import { serveWebApp } from './web-app.js';

// S1-F01-T27: the `app` service serves the web app at `/` from the one origin of the API (deployment.md section 3;
// code-house-rules 12.1). The build here is a SYNTHETIC stand-in for apps/web/dist: an index.html with a marker, one
// hashed asset and one font.

const INDEX_HTML = '<!doctype html><html><body><div id="root">SYNTHETIC web app</div></body></html>';

describe('the web app from the one origin', () => {
  let app: INestApplication;
  let baseUrl: string;
  let build: string;

  beforeAll(async () => {
    build = mkdtempSync(join(tmpdir(), 'aos-synthetic-web-'));
    writeFileSync(join(build, 'index.html'), INDEX_HTML);
    mkdirSync(join(build, 'assets'));
    writeFileSync(join(build, 'assets', 'index-SYNTH123.js'), 'console.log("SYNTHETIC");');
    mkdirSync(join(build, 'fonts'));
    writeFileSync(join(build, 'fonts', 'synthetic.woff2'), 'SYNTHETIC font');
    // SYNTHETIC HTTP settings: the test's own origin, no proxy in front.
    const moduleRef = await Test.createTestingModule({ imports: [KernelModule] })
      .overrideProvider(HTTP_ENVIRONMENT)
      .useValue({ AOS_PUBLIC_ORIGIN: 'http://synthetic.localhost', AOS_TRUSTED_PROXY_HOPS: '0' })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    serveWebApp(app, build);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    rmSync(build, { recursive: true, force: true });
  });

  it('answers / with the web app, never kept by a cache', async () => {
    const response = await fetch(`${baseUrl}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/html/);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe(INDEX_HTML);
  });

  it('answers an unknown /api path with the not-found envelope, never the web app (code-house-rules 12.3)', async () => {
    for (const path of ['/api/unknown', '/api', '/api/']) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status, path).toBe(404);
      expect(response.headers.get('cache-control'), path).toBe('no-store');
      const body = errorEnvelopeSchema.parse(await response.json());
      expect(body.error).toMatchObject({ kind: 'not-found', code: 'kernel.not-found' });
    }
  });

  it('answers a client route with the web app, so a reload or a link opens the screen', async () => {
    for (const path of ['/my-work', '/setup/users?state=active', '/apiary']) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status, path).toBe(200);
      expect(response.headers.get('cache-control'), path).toBe('no-store');
      expect(await response.text(), path).toBe(INDEX_HTML);
    }
  });

  it('answers a hashed asset of the build with its file, kept by a browser for a long time', async () => {
    const response = await fetch(`${baseUrl}/assets/index-SYNTH123.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/javascript/);
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await response.text()).toBe('console.log("SYNTHETIC");');
  });

  it('answers a file that is not hashed, such as a font, revalidated on every use', async () => {
    const response = await fetch(`${baseUrl}/fonts/synthetic.woff2`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(await response.text()).toBe('SYNTHETIC font');
  });

  it('answers /index.html itself never kept by a cache', async () => {
    const response = await fetch(`${baseUrl}/index.html`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('answers a missing file of the build with not-found, never the web app', async () => {
    for (const path of ['/assets/index-MISSING.js', '/fonts/missing.woff2', '/favicon.ico', '/.env']) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status, path).toBe(404);
      expect(response.headers.get('cache-control'), path).toBe('no-store');
      expect(errorEnvelopeSchema.parse(await response.json()).error.code, path).toBe('kernel.not-found');
    }
  });

  it('answers /counter/ with not-found while the counter is not built (offline-counter 5.2)', async () => {
    for (const path of ['/counter', '/counter/', '/counter/sale']) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status, path).toBe(404);
      expect(errorEnvelopeSchema.parse(await response.json()).error.code, path).toBe('kernel.not-found');
    }
  });

  it('answers a method other than GET or HEAD outside /api with not-found, never the web app', async () => {
    const response = await fetch(`${baseUrl}/my-work`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('kernel.not-found');
  });

  it('gives every answer the security headers: nothing loads from, frames or is referred to another origin', async () => {
    for (const path of ['/', '/my-work', '/assets/index-SYNTH123.js', '/api/health', '/api/unknown', '/counter/']) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.headers.get('content-security-policy'), path).toBe(
        "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
      );
      expect(response.headers.get('x-content-type-options'), path).toBe('nosniff');
      expect(response.headers.get('x-frame-options'), path).toBe('DENY');
      expect(response.headers.get('referrer-policy'), path).toBe('same-origin');
    }
  });
});

describe('a server without the web app', () => {
  it('refuses to start when the build has no index.html (code-house-rules 12.14)', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'aos-synthetic-web-empty-'));
    const moduleRef = await Test.createTestingModule({ imports: [KernelModule] })
      .overrideProvider(HTTP_ENVIRONMENT)
      .useValue({ AOS_PUBLIC_ORIGIN: 'http://synthetic.localhost', AOS_TRUSTED_PROXY_HOPS: '0' })
      .compile();
    const app = moduleRef.createNestApplication({ logger: false });
    try {
      expect(() => {
        serveWebApp(app, empty);
      }).toThrow(/index\.html/);
    } finally {
      await app.close();
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
