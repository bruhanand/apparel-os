import type { ApiClient, CallInput, ErrorBody, routes } from '@apparel-os/schemas';
import { QueryCache, QueryClient } from '@tanstack/react-query';

// The data layer (PRD Stack: Web, TanStack Query; code-house-rules 12.1, 12.2). Reads go through the typed client and
// are cached in memory only; the cache is cleared at sign-out and when the session ends (12.1 "No caching").

type Table = typeof routes;
type ReadName = Extract<{ [K in keyof Table]: Table[K] extends { command: false } ? K : never }[keyof Table], string>;

/** A refusal of the API, with its envelope (code-house-rules 12.3). The screen turns it into text (12.13). */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorBody,
  ) {
    super(`The API refused the request: ${body.code}`);
    this.name = 'ApiFailure';
  }
}

/** The envelope of a failed read, or null when no answer came (design-language 10.13 "Error"). */
export function failureBody(error: unknown): ErrorBody | null {
  return error instanceof ApiFailure ? error.body : null;
}

/** The query options of one read route: keyed by the route and its input; a refusal is thrown as ApiFailure. */
export function readQuery<K extends ReadName>(client: ApiClient<Table>, name: K, input: CallInput<Table[K]>) {
  return {
    queryKey: [name, input] as const,
    queryFn: async () => {
      const result = await client.call(name, input);
      if (result.ok) return result.data;
      throw new ApiFailure(result.status, result.error);
    },
  };
}

/**
 * What a refusal says of the session (access-and-approvals 3.3; RR-264): `locked`, when the idle limit passed and the
 * same user's password unlocks it, so the page stays under the lock overlay; `ended`, for any other `not-signed-in`
 * answer (ended, revoked, signed out, or a user no longer Active), so the person signs in again; null otherwise.
 */
export function sessionRefusal(body: Pick<ErrorBody, 'kind' | 'code'> | null): 'locked' | 'ended' | null {
  if (body?.kind !== 'not-signed-in') return null;
  return body.code === 'access.session-locked' ? 'locked' : 'ended';
}

/**
 * The web app's query client. A read is not retried on its own: the error state offers Retry (design-language 10.13).
 * A `not-signed-in` answer tells the shell the session is locked or no longer in force (access-and-approvals 3.3).
 */
export function createQueryClient(onSessionRefused: (refused: 'locked' | 'ended') => void): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        const refused = sessionRefusal(failureBody(error));
        if (refused !== null) onSessionRefused(refused);
      },
    }),
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
}

/** The paged setup lists a screen reads whole, and the field each keeps its rows in (code-house-rules 12.1). */
const PAGED_ROWS = {
  listApprovalLimits: 'limits',
  listStandInGrants: 'grants',
  listWorkItemRouting: 'routings',
} as const;
type PagedName = keyof typeof PAGED_ROWS;

/**
 * The query options of a paged setup list read whole: page after page by the cursor the server gives, each within its
 * cap, until the last, the rows joined in order (code-house-rules 12.1 "Reads"). For a screen that shows or looks up
 * every row; a refusal is thrown as ApiFailure.
 */
export function allPagesQuery<K extends PagedName>(client: ApiClient<Table>, name: K) {
  type Data = Awaited<ReturnType<ReturnType<typeof readQuery<K>>['queryFn']>>;
  type Page = Record<string, unknown> & { readonly next: string | null };
  const read = async (after: string | undefined): Promise<Page> => {
    const input = { query: after === undefined ? {} : { after } } as CallInput<Table[K]>;
    const result = await client.call(name, input);
    if (result.ok) return result.data;
    throw new ApiFailure(result.status, result.error);
  };
  return {
    queryKey: [name, 'all'] as const,
    queryFn: async (): Promise<Data> => {
      const field = PAGED_ROWS[name];
      const first = await read(undefined);
      const rows = [...(first[field] as readonly unknown[])];
      let next = first.next;
      while (next !== null) {
        const page = await read(next);
        rows.push(...(page[field] as readonly unknown[]));
        next = page.next;
      }
      return { ...first, [field]: rows, next: null } as unknown as Data;
    },
  };
}
