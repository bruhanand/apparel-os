import { statusOfKind } from '@apparel-os/schemas';
import { existsSync, readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { basename, join, sep } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { correlationIdOf, newCorrelationId } from '../command-runner/correlation.js';
import { ERROR_CODE_LOCAL } from './error-envelope.filter.js';
import type { HttpRequest, HttpResponse } from './http-types.js';

/** How long a browser may keep a hashed file of the build: a year, the longest HTTP caches honour. Never changes. */
const HASHED_FILE_CACHE = 'public, max-age=31536000, immutable';

/** Where the counter app is served (offline-counter 5.2; deployment.md section 3). */
const COUNTER_PREFIX = '/counter';
/** The golden-case test page of the counter build, never served by the deployed service (offline-counter 5.2, 5.5). */
const GOLDEN_PREFIX = '/counter/golden';

/**
 * Serves the built web app (apps/web/dist) and, when its build is given, the counter app (apps/counter/dist, built with
 * the base path /counter/) from the one origin of the API (deployment.md section 3; offline-counter 5.2;
 * code-house-rules 12.1; S1-F01-T27, S1-F12-T02, RR-420). Every `GET` or `HEAD` outside `/api` answers the build's
 * file at that path: under `/counter/` the counter's, elsewhere the web app's. A path with no file extension is a
 * client route and answers that app's `index.html`, so a reload or a link opens the screen; anything else falls through
 * to the not-found envelope (12.3). `/api` is never either app. The counter's golden-case test page, `/counter/golden/`,
 * is not served: it is the counter run's (5.5). With no counter build given, `/counter/` answers not-found.
 *
 * Caching, the same rules for each app: the hashed files under its `assets/` may be kept for long, since a new build
 * names new files; its `index.html` is never kept, so a deploy reaches the next page load; any other file, such as a
 * font, is revalidated on each use. The counter has no service worker yet (offline-counter 5.3).
 *
 * Called after `configureApp` and before the application listens; throws when a build given has no `index.html`, so
 * the service refuses to start without it (code-house-rules 12.14).
 */
export function serveWebApp(app: INestApplication, directory: string, counterDirectory?: string): void {
  const indexHtml = indexOf(directory, 'The web app is not built');
  const counterHtml =
    counterDirectory === undefined ? undefined : indexOf(counterDirectory, 'The counter app is not built');
  // Express's own static file serving, which Nest exposes; no package is added (code-house-rules 10.6). The counter is
  // registered first, under its prefix, so its files never reach the web app's.
  if (counterDirectory !== undefined) {
    const counterStatic = staticOptions(counterDirectory);
    (app as NestExpressApplication).use((request: HttpRequest, response: HttpResponse, next: () => void) => {
      // The golden page and its folder are refused before the counter's static files are looked up.
      if (underPrefix(pathOf(request), GOLDEN_PREFIX)) {
        notFound(request, response);
        return;
      }
      next();
    });
    (app as NestExpressApplication).useStaticAssets(counterDirectory, {
      prefix: `${COUNTER_PREFIX}/`,
      ...counterStatic,
    });
  }
  (app as NestExpressApplication).useStaticAssets(directory, staticOptions(directory));
  app.use((request: HttpRequest, response: HttpResponse, next: () => void) => {
    const path = pathOf(request);
    if (underPrefix(path, '/api')) {
      next();
      return;
    }
    const counter = underPrefix(path, COUNTER_PREFIX);
    const html = counter ? counterHtml : indexHtml;
    if (
      html === undefined ||
      (request.method !== 'GET' && request.method !== 'HEAD') ||
      !isClientRoute(path, counter ? COUNTER_PREFIX : '')
    ) {
      notFound(request, response);
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(request.method === 'HEAD' ? undefined : html);
  });
}

/** A build's `index.html`, or a refusal to start naming what is missing (code-house-rules 12.14). */
function indexOf(directory: string, what: string): Buffer {
  const indexFile = join(directory, 'index.html');
  if (!existsSync(indexFile)) {
    throw new Error(`${what}: ${indexFile} is missing; run pnpm build before starting the server`);
  }
  return readFileSync(indexFile);
}

/** The static serving of one build, with its cache rules (above). */
function staticOptions(directory: string) {
  const assets = join(directory, 'assets') + sep;
  return {
    index: false,
    dotfiles: 'ignore' as const,
    // Replaces the Cache-Control Express's static serving sets.
    setHeaders: (response: ServerResponse, file: string) => {
      const cacheControl =
        basename(file) === 'index.html' ? 'no-store' : file.startsWith(assets) ? HASHED_FILE_CACHE : 'no-cache';
      response.setHeader('Cache-Control', cacheControl);
    },
  };
}

/** Outside /api no route of the API answers, so the envelope's not-found is answered here (12.3). */
function notFound(request: HttpRequest, response: HttpResponse): void {
  response.locals[ERROR_CODE_LOCAL] = 'kernel.not-found';
  response.status(statusOfKind('not-found')).json({
    error: {
      kind: 'not-found',
      code: 'kernel.not-found',
      reference: correlationIdOf(request) ?? newCorrelationId(),
    },
  });
}

/** The path of a request, without its query. */
function pathOf(request: HttpRequest): string {
  return (request.url ?? '/').split('?')[0] ?? '/';
}

/**
 * A path an app's router answers: for the web app not the counter's path (deployment.md section 3), and not a file,
 * whose last segment has an extension.
 */
function isClientRoute(path: string, prefix: string): boolean {
  if (prefix === '' && underPrefix(path, COUNTER_PREFIX)) return false;
  return !path.slice(path.lastIndexOf('/') + 1).includes('.');
}

function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}
