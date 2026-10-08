import type { Route } from '@apparel-os/schemas';
import type { HttpRequest, HttpResponse } from './http-types.js';

// A JSON body larger than the ordinary parser's limit, for the routes whose table entry says how much they take, as
// the route that stores a file does (imports-and-opening-data 9.3; code-house-rules 12.2). Only those routes are
// raised, so every other route keeps the ordinary limit. A body over the route's limit is refused before it is held,
// and the refusal answers as the ordinary parser's does (the error envelope filter reads its `type`).

type Next = (error?: unknown) => void;

/** The token of the session probe (`access` provides it; read at the first large request). */
export const SESSION_PROBE = 'kernel.SessionProbe';

/**
 * Whether a request carries a cookie that names a session that exists and is open, read-only: it moves no activity
 * and ends nothing. Authenticate (access-and-approvals 7.1 step 1) still runs in full before the route does; this
 * only decides whether a larger body may be held.
 */
export type SessionProbe = (cookieHeader: string | undefined, correlationId: string) => Promise<boolean>;

function bodyError(type: 'entity.too.large' | 'entity.parse.failed', status: number): Error {
  return Object.assign(new Error(type), { type, status });
}

/** Reads and parses a JSON body of at most `limitBytes`, leaving it where the ordinary parser leaves it. */
export function largeJsonBody(limitBytes: number, admit: (request: HttpRequest) => Promise<boolean>) {
  return (request: HttpRequest, _response: HttpResponse, next: Next): void => {
    const type = request.headers['content-type'];
    if (request.method !== 'POST' || typeof type !== 'string' || !/^application\/json\b/i.test(type)) {
      next();
      return;
    }
    // Only a request whose cookie names an open session may hold the larger body, so someone not signed in cannot make
    // the server hold one. The body is not read until that is known (the stream stays paused); any other request is
    // left to the ordinary limit and refused at Authenticate (access-and-approvals 7.1 step 1).
    admit(request).then(
      (admitted) => {
        if (admitted) readBody(request, limitBytes, next);
        else next();
      },
      () => {
        next();
      },
    );
  };
}

function readBody(request: HttpRequest, limitBytes: number, next: Next): void {
  {
    const chunks: Buffer[] = [];
    let size = 0;
    let refused = false;
    request.on('data', (chunk: Buffer) => {
      if (refused) return;
      size += chunk.length;
      if (size > limitBytes) {
        refused = true;
        chunks.length = 0;
        next(bodyError('entity.too.large', 413));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (refused) return;
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        Object.assign(request, { body: parsed, _body: true });
        next();
      } catch {
        next(bodyError('entity.parse.failed', 400));
      }
    });
    request.on('error', (error: Error) => {
      if (!refused) next(error);
    });
  }
}

/** The pattern an Express mount uses for a route's path: each `{parameter}` is one path segment. */
export function mountPatternOf(route: Route): RegExp {
  const source = route.path.replace(/\{[a-zA-Z0-9]+\}/g, '[^/]+').replace(/\//g, '\\/');
  return new RegExp(`^${source}$`);
}
