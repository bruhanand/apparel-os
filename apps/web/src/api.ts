import { createApiClient, routes } from '@apparel-os/schemas';

/**
 * The web app's typed client of the API, made from the route table (code-house-rules 12.2). The API is served from the
 * page's own origin (code-house-rules 12.1), so the base URL is empty. Screens call it through TanStack Query once
 * the web shell exists (S1-F01-T14).
 */
export const api = createApiClient(routes, { baseUrl: '' });

/** Whether the server answers its health check. */
export async function serverIsHealthy(): Promise<boolean> {
  const result = await api.call('health', {});
  return result.ok;
}
