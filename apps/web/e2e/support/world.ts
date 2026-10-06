import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Where the journeys find the servers, and the synthetic user the server of the journeys wrote
// (apps/server/test/browser/serve.ts). The user comes from the synthetic test fixtures, never from application code
// (code-house-rules 11.2). Every value is SYNTHETIC.

/** The port of the web app's preview, and its origin: the one origin of pages and API (code-house-rules 12.1). */
export const WEB_PORT = 4173;
export const WEB_ORIGIN = `http://localhost:${String(WEB_PORT)}`;
/** The port the server of the journeys listens on: the one vite.config.ts sends /api to. */
export const SERVER_PORT = 3000;
/** Git ignores this folder. */
export const WORLD_FILE = join(import.meta.dirname, '..', '.synthetic', 'world.json');

export interface SyntheticWorld {
  readonly organisationCode: string;
  readonly login: string;
  readonly displayName: string;
  /** The temporary password the user signs in with the first time (access-and-approvals 3.2). */
  readonly temporaryPassword: string;
}

export function readWorld(): SyntheticWorld {
  return JSON.parse(readFileSync(WORLD_FILE, 'utf8')) as SyntheticWorld;
}
