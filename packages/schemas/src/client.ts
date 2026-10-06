import { uuidv7 } from '@apparel-os/domain';
import type { z } from 'zod';
import { errorEnvelopeSchema, type ErrorBody } from './errors.js';
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENT_REPLAYED_HEADER } from './headers.js';
import { needsIdempotencyKey, type Route, type RouteTable } from './route-table.js';

// The typed client (code-house-rules 12.2): a small client over fetch, generic over the route table, for the web app
// and the counter. No client generator is added (10.6).

type InputOf<S> = S extends z.ZodType ? z.input<S> : never;

/** What a call to one route sends. The version token travels in the body (code-house-rules 12.7). */
export type CallInput<R extends Route> = (R['params'] extends z.ZodType ? { params: InputOf<R['params']> } : unknown) &
  (R['query'] extends z.ZodType ? { query?: InputOf<R['query']> } : unknown) &
  (R extends { command: true; body: infer B }
    ? {
        body: InputOf<B>;
        /**
         * The key of this submission. Leave it out for a new submission; give the earlier one to send it again after a
         * lost answer, `timed-out`, `kernel.outcome-unknown` or `kernel.request-in-progress` (code-house-rules 12.4).
         */
        idempotencyKey?: string | undefined;
      }
    : unknown);

/** What a call gives back: the decoded success answer, or the error envelope's body with the status. */
export type CallResult<R extends Route> =
  | {
      readonly ok: true;
      readonly data: z.output<R['response']>;
      /** True when the answer is the one kept under the key (code-house-rules 12.4). */
      readonly replayed: boolean;
      /** The key sent, for a command; undefined for a read. */
      readonly idempotencyKey: string | undefined;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: ErrorBody;
      readonly replayed: boolean;
      readonly idempotencyKey: string | undefined;
    };

export interface ApiClientOptions {
  /** The origin the API is served from; '' for the page's own origin (code-house-rules 12.1, one origin). */
  readonly baseUrl: string;
  readonly fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

/** An answer that matches neither the route's schema nor the error envelope: a defect of the server or the client. */
export class ApiContractError extends Error {
  constructor(
    readonly routeName: string,
    readonly status: number,
  ) {
    super(`The answer of ${routeName} (status ${String(status)}) matches neither its schema nor the error envelope`);
    this.name = 'ApiContractError';
  }
}

export interface ApiClient<T extends RouteTable> {
  call<K extends keyof T & string>(name: K, input: CallInput<T[K]>): Promise<CallResult<T[K]>>;
}

/**
 * Makes a client of a route table. It sets the idempotency key where a route needs one (12.4), and parses a success
 * answer with the route's schema, so a secret shown once becomes a `Secret` (12.6), and an error with the envelope's.
 * It sends the session cookie of the page's own origin and caches nothing (12.1).
 */
export function createApiClient<T extends RouteTable>(table: T, options: ApiClientOptions): ApiClient<T> {
  const send = options.fetch ?? ((url: string, init: RequestInit) => globalThis.fetch(url, init));
  return {
    async call(name, input) {
      const route: Route | undefined = table[name];
      if (route === undefined) throw new Error(`No route named ${name}`);
      const given = input as {
        params?: Record<string, string>;
        query?: Record<string, string | undefined>;
        body?: unknown;
        idempotencyKey?: string | undefined;
      };
      const headers: Record<string, string> = { accept: 'application/json' };
      const init: RequestInit = { method: route.method, headers, credentials: 'same-origin', cache: 'no-store' };
      let idempotencyKey: string | undefined;
      if (route.command) {
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(given.body);
        if (needsIdempotencyKey(route)) {
          idempotencyKey = given.idempotencyKey ?? uuidv7();
          headers[IDEMPOTENCY_KEY_HEADER] = idempotencyKey;
        }
      }
      const response = await send(`${options.baseUrl}${pathOf(route, given.params, given.query)}`, init);
      const replayed = response.headers.get(IDEMPOTENT_REPLAYED_HEADER) === 'true';
      const json = await readJson(response);
      if (response.ok) {
        const parsed = route.response.safeParse(json);
        if (!parsed.success) throw new ApiContractError(name, response.status);
        return { ok: true, data: parsed.data, replayed, idempotencyKey } as CallResult<T[typeof name]>;
      }
      const envelope = errorEnvelopeSchema.safeParse(json);
      if (!envelope.success) throw new ApiContractError(name, response.status);
      return { ok: false, status: response.status, error: envelope.data.error, replayed, idempotencyKey };
    },
  };
}

function pathOf(
  route: Route,
  params: Record<string, string> | undefined,
  query: Record<string, string | undefined> | undefined,
): string {
  const path = route.path.replace(/\{([a-zA-Z0-9]+)\}/g, (_match, name: string) =>
    encodeURIComponent(params?.[name] ?? ''),
  );
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) search.append(key, value);
  const text = search.toString();
  return text === '' ? path : `${path}?${text}`;
}

/** The answer's JSON, or undefined when it has none, which matches neither a schema nor the envelope. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}
