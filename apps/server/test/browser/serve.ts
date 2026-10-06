import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  startAccessApp,
  syntheticKeysEnvironment,
  writeSyntheticSetting,
  writeSyntheticUser,
} from '../support/access.js';
import { createSyntheticOrganisations } from '../support/organisations.js';
import { usePostgresServer } from '../support/postgres.js';
import { startPostgresServer } from '../support/postgres-server.js';

// The server of the browser journeys (S1-F01-T15; code-house-rules 10.1, 11.2): a test composition of the whole
// application on a PostgreSQL container of its own, with the two synthetic Organisations and the synthetic user a
// journey signs in as. Playwright starts it (apps/web/e2e/playwright.config.ts); it is built apart from the application
// (tsconfig.browser.json), so nothing here reaches dist. Every value is SYNTHETIC.
//
// The Organisation's timezone, the throttling and the password rules have no value outside tests (RR-250, GC3-5): this
// composition gives them the labelled synthetic values of test/support, and never a default in application code.
//
// AOS_E2E_ORIGIN: the origin the journey's pages are served from (AOS_PUBLIC_ORIGIN of this server).
// AOS_E2E_PORT: the port to listen on, where the web app's preview sends /api.
// AOS_E2E_WORLD_FILE: where to write the synthetic user's sign-in details for the journey to read.

/** SYNTHETIC throttling: a limit and a window no KDPS value stands behind (GC3-5 is OPEN). */
const SYNTHETIC_THROTTLING = { failureLimit: 5, windowSeconds: 600 };
/** SYNTHETIC password rules (GC3-5 is OPEN). */
const SYNTHETIC_PASSWORD_RULES = { minimumLength: 12 };

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set`);
  return value;
}

const origin = required('AOS_E2E_ORIGIN');
const port = Number(required('AOS_E2E_PORT'));
const worldFile = required('AOS_E2E_WORLD_FILE');

const postgres = await startPostgresServer();
usePostgresServer(postgres.server);
const world = await createSyntheticOrganisations('browser');
const [orgA] = world.organisations;
const keys = syntheticKeysEnvironment(world);
await writeSyntheticSetting(orgA.database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
await writeSyntheticSetting(orgA.database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
// A first sign-in: a temporary password and no authenticator app yet (access-and-approvals 3.2).
const user = await writeSyntheticUser(orgA.database, orgA.code, keys, { label: 'BROWSER-A', temporary: true });
const app = await startAccessApp(world, keys, { origin, port });

mkdirSync(dirname(worldFile), { recursive: true });
writeFileSync(
  worldFile,
  JSON.stringify({
    organisationCode: orgA.code,
    login: user.login,
    displayName: user.displayName,
    temporaryPassword: user.password,
  }),
);
process.stdout.write(`Browser journey server listening on port ${String(port)} for ${origin}\n`);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await app.close().catch(() => undefined);
  await world.reset().catch(() => undefined);
  await postgres.stop().catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
