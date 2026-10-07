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

/**
 * Serves the built web app (apps/web/dist) from the one origin of the API (deployment.md section 3; code-house-rules
 * 12.1; S1-F01-T27). Every `GET` or `HEAD` outside `/api` answers the build's file at that path; a path with no file
 * extension is a client route and answers `index.html`, so a reload or a link opens the screen; anything else falls
 * through to the not-found envelope (12.3). `/api` is never the web app. `/counter/` is not built yet (offline-counter
 * 5.2) and answers not-found.
 *
 * Caching: the hashed files under `/assets/` may be kept for long, since a new build names new files; `index.html` is
 * never kept, so a deploy reaches the next page load; any other file, such as a font, is revalidated on each use.
 *
 * Called after `configureApp` and before the application listens; throws when the build has no `index.html`, so the
 * service refuses to start without the web app (code-house-rules 12.14).
 */
export function serveWebApp(app: INestApplication, directory: string): void {
  const indexFile = join(directory, 'index.html');
  if (!existsSync(indexFile)) {
    throw new Error(`The web app is not built: ${indexFile} is missing; run pnpm build before starting the server`);
  }
  const indexHtml = readFileSync(indexFile);
  const assets = join(directory, 'assets') + sep;
  // Express's own static file serving, which Nest exposes; no package is added (code-house-rules 10.6).
  (app as NestExpressApplication).useStaticAssets(directory, {
    index: false,
    dotfiles: 'ignore',
    // Replaces the Cache-Control Express's static serving sets.
    setHeaders: (response: ServerResponse, file: string) => {
      const cacheControl =
        basename(file) === 'index.html' ? 'no-store' : file.startsWith(assets) ? HASHED_FILE_CACHE : 'no-cache';
      response.setHeader('Cache-Control', cacheControl);
    },
  });
  app.use((request: HttpRequest, response: HttpResponse, next: () => void) => {
    const path = pathOf(request);
    if (underPrefix(path, '/api')) {
      next();
      return;
    }
    if ((request.method !== 'GET' && request.method !== 'HEAD') || !isClientRoute(path)) {
      // Outside /api no route of the API answers, so the envelope's not-found is answered here (12.3).
      response.locals[ERROR_CODE_LOCAL] = 'kernel.not-found';
      response.status(statusOfKind('not-found')).json({
        error: {
          kind: 'not-found',
          code: 'kernel.not-found',
          reference: correlationIdOf(request) ?? newCorrelationId(),
        },
      });
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(request.method === 'HEAD' ? undefined : indexHtml);
  });
}

/** The path of a request, without its query. */
function pathOf(request: HttpRequest): string {
  return (request.url ?? '/').split('?')[0] ?? '/';
}

/**
 * A path the web app's router answers: not the counter's path (deployment.md
 * section 3), and not a file, whose last segment has an extension.
 */
function isClientRoute(path: string): boolean {
  if (underPrefix(path, '/counter')) return false;
  return !path.slice(path.lastIndexOf('/') + 1).includes('.');
}

function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}
