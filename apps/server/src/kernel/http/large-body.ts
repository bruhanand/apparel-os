import type { Route } from '@apparel-os/schemas';
import type { HttpRequest, HttpResponse } from './http-types.js';

// A JSON body larger than the ordinary parser's limit, for the routes whose table entry says how much they take, as
// the route that stores a file does (imports-and-opening-data 9.3; code-house-rules 12.2). Only those routes are
// raised, so every other route keeps the ordinary limit. A body over the route's limit is refused before it is held,
// and the refusal answers as the ordinary parser's does (the error envelope filter reads its `type`).

type Next = (error?: unknown) => void;

function bodyError(type: 'entity.too.large' | 'entity.parse.failed', status: number): Error {
  return Object.assign(new Error(type), { type, status });
}

/** Reads and parses a JSON body of at most `limitBytes`, leaving it where the ordinary parser leaves it. */
export function largeJsonBody(limitBytes: number) {
  return (request: HttpRequest, _response: HttpResponse, next: Next): void => {
    const type = request.headers['content-type'];
    // Only a request that carries a cookie may hold the larger body; every route here needs a session, so a request
    // with none is left to the ordinary limit and is refused at Authenticate (access-and-approvals 7.1 step 1).
    if (
      request.method !== 'POST' ||
      typeof type !== 'string' ||
      !/^application\/json\b/i.test(type) ||
      request.headers.cookie === undefined
    ) {
      next();
      return;
    }
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
  };
}

/** The pattern an Express mount uses for a route's path: each `{parameter}` is one path segment. */
export function mountPatternOf(route: Route): RegExp {
  const source = route.path.replace(/\{[a-zA-Z0-9]+\}/g, '[^/]+').replace(/\//g, '\\/');
  return new RegExp(`^${source}$`);
}
