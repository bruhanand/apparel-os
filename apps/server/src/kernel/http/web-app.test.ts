import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
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

/** A `GET` of the path exactly as written: `fetch` would normalise dot segments and other spellings first. */
function raw(baseUrl: string, path: string): Promise<{ status: number; body: string }> {
  const { hostname, port } = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const sent = request({ hostname, port, path, method: 'GET' }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (body += chunk));
      response.on('end', () => {
        resolve({ status: response.statusCode ?? 0, body });
      });
    });
    sent.on('error', reject);
    sent.end();
  });
}

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

  it('answers /counter/ with not-found when no counter build is given (offline-counter 5.2)', async () => {
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

// RR-420, S1-F12-T02: the counter app at /counter/ beside the web app (deployment.md section 3; offline-counter 5.2).
// The build is a SYNTHETIC stand-in for apps/counter/dist, built with the base path /counter/: its index.html, one
// hashed asset, and the golden-case test page, which the deployed service never serves.
const COUNTER_HTML = '<!doctype html><html><body><div id="counter">SYNTHETIC counter</div></body></html>';

describe('the counter app at /counter/ from the one origin', () => {
  let app: INestApplication;
  let baseUrl: string;
  let web: string;
  let counter: string;

  beforeAll(async () => {
    web = mkdtempSync(join(tmpdir(), 'aos-synthetic-web-'));
    writeFileSync(join(web, 'index.html'), INDEX_HTML);
    counter = mkdtempSync(join(tmpdir(), 'aos-synthetic-counter-'));
    writeFileSync(join(counter, 'index.html'), COUNTER_HTML);
    mkdirSync(join(counter, 'assets'));
    writeFileSync(join(counter, 'assets', 'main-SYNTH456.js'), 'console.log("SYNTHETIC counter");');
    writeFileSync(join(counter, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    mkdirSync(join(counter, 'golden'));
    writeFileSync(join(counter, 'golden', 'index.html'), '<!doctype html><p>SYNTHETIC golden page</p>');
    const moduleRef = await Test.createTestingModule({ imports: [KernelModule] })
      .overrideProvider(HTTP_ENVIRONMENT)
      .useValue({ AOS_PUBLIC_ORIGIN: 'http://synthetic.localhost', AOS_TRUSTED_PROXY_HOPS: '0' })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    serveWebApp(app, web, counter);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    rmSync(web, { recursive: true, force: true });
    rmSync(counter, { recursive: true, force: true });
  });

  it('answers /counter/ and its client routes with the counter, never kept by a cache', async () => {
    for (const path of ['/counter/', '/counter', '/counter/index.html', '/counter/sign-in?device=1']) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status, path).toBe(200);
      expect(response.headers.get('content-type'), path).toMatch(/^text\/html/);
      expect(response.headers.get('cache-control'), path).toBe('no-store');
      expect(await response.text(), path).toBe(COUNTER_HTML);
    }
  });

  it('answers the counter’s client routes by any spelling of its prefix, never the web app (S1-F12 review)', async () => {
    for (const path of ['/COUNTER/x', '/Counter/sign-in', '/%63ounter/x', '/counter//x', '/x/../counter/x']) {
      const response = await raw(baseUrl, path);
      expect(response.body, path).toBe(COUNTER_HTML);
    }
    expect(await (await fetch(`${baseUrl}/COUNTER/assets/main-SYNTH456.js`)).text()).toBe(
      'console.log("SYNTHETIC counter");',
    );
  });

  it('answers the counter’s hashed assets for a long time, and its other files revalidated', async () => {
    const asset = await fetch(`${baseUrl}/counter/assets/main-SYNTH456.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await asset.text()).toBe('console.log("SYNTHETIC counter");');
    const icon = await fetch(`${baseUrl}/counter/icon.svg`);
    expect(icon.status).toBe(200);
    expect(icon.headers.get('cache-control')).toBe('no-cache');
  });

  it('never serves the golden-case test page, nor a missing counter file, nor the web app under /counter/', async () => {
    for (const path of ['/counter/golden/', '/counter/golden/index.html', '/counter/assets/missing.js']) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status, path).toBe(404);
      expect(errorEnvelopeSchema.parse(await response.json()).error.code, path).toBe('kernel.not-found');
    }
  });

  it('never serves the golden-case test page by another spelling: letter case, an encoded character, a doubled or dot segment (S1-F12 review)', async () => {
    const spellings = [
      '/counter/Golden/',
      '/counter/GOLDEN/index.html',
      '/counter/golden/INDEX.HTML',
      '/COUNTER/golden/index.html',
      '/Counter/Golden/index.html',
      '/counter/%67olden/index.html',
      '/counter/%47olden/index.html',
      '/counter/golden%2Findex.html',
      '/counter/golden%2findex.html',
      '/counter/%2e/golden/index.html',
      '/counter/./golden/index.html',
      '/counter//golden/index.html',
      '/counter/golden/./index.html',
      '/counter/x/../golden/index.html',
    ];
    // A path that names no file may answer the counter's index.html as a client route; never the golden page.
    const leaked: string[] = [];
    for (const path of spellings) {
      if ((await raw(baseUrl, path)).body.includes('SYNTHETIC golden page')) leaked.push(path);
    }
    expect(leaked).toEqual([]);
  });

  it('keeps the web app at / and its routes, and the security headers on the counter too', async () => {
    expect(await (await fetch(`${baseUrl}/my-work`)).text()).toBe(INDEX_HTML);
    expect(await (await fetch(`${baseUrl}/counterfeit`)).text()).toBe(INDEX_HTML);
    for (const path of ['/counter/', '/counter/assets/main-SYNTH456.js']) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.headers.get('content-security-policy'), path).toBe(
        "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
      );
    }
  });

  it('refuses to start when the counter build has no index.html (code-house-rules 12.14)', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'aos-synthetic-counter-empty-'));
    const moduleRef = await Test.createTestingModule({ imports: [KernelModule] })
      .overrideProvider(HTTP_ENVIRONMENT)
      .useValue({ AOS_PUBLIC_ORIGIN: 'http://synthetic.localhost', AOS_TRUSTED_PROXY_HOPS: '0' })
      .compile();
    const other = moduleRef.createNestApplication({ logger: false });
    try {
      configureApp(other);
      expect(() => {
        serveWebApp(other, web, empty);
      }).toThrow(/counter app is not built/);
    } finally {
      await other.close();
      rmSync(empty, { recursive: true, force: true });
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
