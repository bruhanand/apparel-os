import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Where the journeys find the servers, and the synthetic users the server of the journeys wrote
// (apps/server/test/browser/serve.ts). The user comes from the synthetic test fixtures, never from application code
// (code-house-rules 11.2). Every value is SYNTHETIC.

/** The port of the web app's preview, and its origin: the one origin of pages and API (code-house-rules 12.1). */
export const WEB_PORT = 4173;
export const WEB_ORIGIN = `http://localhost:${String(WEB_PORT)}`;
/** The port the server of the journeys listens on: the one vite.config.ts sends /api to. */
export const SERVER_PORT = 3000;
/** Git ignores this folder. */
export const WORLD_FILE = join(import.meta.dirname, '..', '.synthetic', 'world.json');

/** A user whose first sign-in is still to come: a temporary password, no authenticator app (3.2). */
export interface FirstSignInUser {
  readonly login: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
}

export interface SyntheticWorld {
  readonly organisationCode: string;
  readonly login: string;
  readonly displayName: string;
  /** The temporary password the user signs in with the first time (access-and-approvals 3.2). */
  readonly temporaryPassword: string;
  /** The lock journey's user: enrolled already, in an Organisation with a short synthetic idle limit (RR-304). */
  readonly lock: {
    readonly organisationCode: string;
    readonly login: string;
    readonly displayName: string;
    readonly password: string;
    /** The authenticator secret, hex, as an app holding it would. */
    readonly factorSecretHex: string;
    readonly idleLockSeconds: number;
  };
  /** The approval journey's Organisation, made by the setup step, and its first two users (S1-F01-AT18). */
  readonly journey: {
    readonly organisationCode: string;
    readonly admin: FirstSignInUser;
    readonly approver: FirstSignInUser;
  };
}

export function readWorld(): SyntheticWorld {
  return JSON.parse(readFileSync(WORLD_FILE, 'utf8')) as SyntheticWorld;
}
