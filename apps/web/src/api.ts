import { createApiClient, routes } from '@apparel-os/schemas';
import { countingRequests } from './lock/idle-lock';

/**
 * The web app's typed client of the API, made from the route table (code-house-rules 12.2). The API is served from the
 * page's own origin (code-house-rules 12.1), so the base URL is empty. Screens call it through TanStack Query once
 * the web shell exists (S1-F01-T14). Each call to a route that needs a session is noted as a request of the session, which
 * the screen's own idle lock counts as the server does (S1-F01-T30).
 */
export const api = countingRequests(createApiClient(routes, { baseUrl: '' }), routes);

/** Whether the server answers its health check. */
export async function serverIsHealthy(): Promise<boolean> {
  const result = await api.call('health', {});
  return result.ok;
}
