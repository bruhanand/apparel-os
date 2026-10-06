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
 * The web app's query client. A read is not retried on its own: the error state offers Retry (design-language 10.13).
 * A `not-signed-in` answer tells the shell the session is no longer in force (access-and-approvals 3.3).
 */
export function createQueryClient(onNotSignedIn: () => void): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (error instanceof ApiFailure && error.body.kind === 'not-signed-in') onNotSignedIn();
      },
    }),
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
}
