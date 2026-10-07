import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { setupRequestSchema } from '@apparel-os/schemas';
import {
  CommandRunner,
  IdempotencyHelper,
  OrganisationRouter,
  restrictedValueCipherNotConfigured,
  secretCheckNotImplemented,
  Worker,
  type JobRegistry,
} from '../../src/kernel/index.js';
import {
  approvalDecided,
  approvalRequested,
  ORGANISATION_KEYS_VARIABLE,
  runSetupStep,
} from '../../src/modules/access/index.js';
// The access module's JobIdentities, as AccessJobIdentitiesModule provides it to the worker (RR-273).
import { jobIdentities } from '../../src/modules/access/commands/job-identities.js';
// The codes of the two roles the setup step creates, so the journey assigns exactly those roles (9.11).
import { FIRST_ADMIN_ROLE, FIRST_APPROVER_ROLE } from '../../src/modules/access/domain/first-roles.js';
import { inboxConsumers } from '../../src/modules/inbox/index.js';
import { serviceIdentitiesOf } from '../../src/setup-organisation.js';
import { jobRegistry } from '../../src/worker.module.js';
import { syntheticCode, syntheticName } from '../fixtures/synthetic.js';
import { syntheticWorkerSettings } from '../fixtures/worker-settings.js';
import {
  startAccessApp,
  syntheticKeysEnvironment,
  syntheticTimezone,
  writeSyntheticReason,
  writeSyntheticSetting,
  writeSyntheticUser,
} from '../support/access.js';
import { assignSyntheticRole, grantSynthetic } from '../support/grants.js';
import { capturingLogger } from '../support/jobs.js';
import { createSyntheticOrganisations } from '../support/organisations.js';
import { databaseUrl, dropDatabase, usePostgresServer } from '../support/postgres.js';
import { startPostgresServer } from '../support/postgres-server.js';

// The server of the browser journeys (S1-F01-T15, S1-F01-T20; code-house-rules 10.1, 11.2): a test composition of the
// whole application, and of the worker that feeds My work, on a PostgreSQL container of its own. It holds three
// synthetic Organisations:
// - the first of the two synthetic Organisations, with the user of the first sign-in journey (sign-in.spec.ts) and a
//   user with no role assignment (no-access.spec.ts);
// - the second, with a user already enrolled whose session locks after a short synthetic idle limit (lock.spec.ts);
// - a third, made by the real setup step (access-and-approvals 9.11; PRD-ACS-023), whose first Admin and first
//   approver walk the approval journey (approval.spec.ts; S1-F01-AT18);
// - a fourth, also made by the setup step, with an enrolled Admin holding the first Admin's role, who may prepare
//   security setting changes, and an enrolled approver holding the first approver's role, who may approve them, and an
//   approve reason in force (security-settings.spec.ts; S1-F01-T25, S1-F01-T26).
// It is built apart from the application (tsconfig.browser.json), so nothing here reaches dist. Every value is
// SYNTHETIC.
//
// The Organisation's timezone, the throttling, the password rules and the session limits have no value outside tests
// (RR-250, GC3-5, POL-02.18): this composition gives them labelled synthetic values, and never a default in application
// code. The app reads one synthetic timezone for every Organisation (Etc/UTC, test/support), and the setup request
// names the same one, so the journeys' dates are UTC dates.
//
// AOS_E2E_ORIGIN: the origin the journey's pages are served from (AOS_PUBLIC_ORIGIN of this server).
// AOS_E2E_PORT: the port to listen on, where the web app's preview sends /api.
// AOS_E2E_WORLD_FILE: where to write the synthetic users' sign-in details for the journeys to read.
// AOS_E2E_LOG_FILE: where to write the service log when the server stops, kept with the traces as the log sample of
// the journeys (spec section 15: correlation identifiers, and no secret).

/** SYNTHETIC throttling: a limit and a window no KDPS value stands behind (GC3-5 is OPEN). */
const SYNTHETIC_THROTTLING = { failureLimit: 5, windowSeconds: 600 };
/** SYNTHETIC password rules (GC3-5 is OPEN). */
const SYNTHETIC_PASSWORD_RULES = { minimumLength: 12 };
/** SYNTHETIC office session limits (access-and-approvals 3.3; POL-02.18's values apply only once it is Signed). */
const SYNTHETIC_SESSION_LIMITS = { idleLockSeconds: 1800, absoluteSeconds: 28800 };
/**
 * SYNTHETIC limits of the lock journey's Organisation: an idle limit short enough for a journey to wait out
 * (access-and-approvals 3.3; RR-304).
 */
const SYNTHETIC_SHORT_IDLE_LIMITS = { idleLockSeconds: 15, absoluteSeconds: 28800 };

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set`);
  return value;
}

const origin = required('AOS_E2E_ORIGIN');
const port = Number(required('AOS_E2E_PORT'));
const worldFile = required('AOS_E2E_WORLD_FILE');
const logFile = required('AOS_E2E_LOG_FILE');

const postgres = await startPostgresServer();
usePostgresServer(postgres.server);
const world = await createSyntheticOrganisations('browser');
const [orgA, orgB] = world.organisations;

// The first sign-in journey: a temporary password and no authenticator app yet (access-and-approvals 3.2).
await writeSyntheticSetting(orgA.database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
await writeSyntheticSetting(orgA.database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
await writeSyntheticSetting(orgA.database, 'access.office-session-limits', SYNTHETIC_SESSION_LIMITS);

// The lock journey: an enrolled user who may prepare users, under the short idle limit.
await writeSyntheticSetting(orgB.database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
await writeSyntheticSetting(orgB.database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
await writeSyntheticSetting(orgB.database, 'access.office-session-limits', SYNTHETIC_SHORT_IDLE_LIMITS);

// The approval journey's Organisation, made by the setup step itself, so its first two users hold exactly the
// permissions of the 9.11 matrix (DEC-112).
const journeyCode = syntheticCode('ORG-JOURNEY');
const journeyDatabase = `syn_browser_journey_${randomBytes(3).toString('hex')}`;
const journeyRequest = setupRequestSchema.parse({
  organisationCode: journeyCode,
  databaseName: journeyDatabase,
  firstAdmin: {
    login: syntheticCode('ADMIN').toLowerCase(),
    displayName: syntheticName('First Admin'),
    personas: ['P-ADM'],
    temporaryPassword: `SYNTHETIC-admin-${randomBytes(6).toString('hex')}`,
  },
  firstApprover: {
    login: syntheticCode('APPROVER').toLowerCase(),
    displayName: syntheticName('First Approver'),
    personas: ['P-OWN'],
    temporaryPassword: `SYNTHETIC-approver-${randomBytes(6).toString('hex')}`,
  },
  settings: {
    origin: 'synthetic',
    timezone: 'Etc/UTC',
    passwordRules: SYNTHETIC_PASSWORD_RULES,
    signInThrottling: SYNTHETIC_THROTTLING,
    officeSessionLimits: SYNTHETIC_SESSION_LIMITS,
  },
});
const setupLog = capturingLogger();
const setup = await runSetupStep({
  migrationConnectionString: databaseUrl(world.directory, 'migration'),
  runtimeConnectionString: databaseUrl(world.directory, 'runtime'),
  request: journeyRequest,
  serviceIdentities: serviceIdentitiesOf(jobRegistry),
  logger: setupLog.logger,
});
if (setup.outcome !== 'created') throw new Error(`The journey's setup step did not create: ${setup.outcome}`);

// The security settings journey's Organisation, made by the setup step like the one above, so its worker
// identities exist and My work is fed (S1-F01-T25).
const settingsCode = syntheticCode('ORG-SETTINGS');
const settingsDatabase = `syn_browser_settings_${randomBytes(3).toString('hex')}`;
const settingsSetup = await runSetupStep({
  migrationConnectionString: databaseUrl(world.directory, 'migration'),
  runtimeConnectionString: databaseUrl(world.directory, 'runtime'),
  request: setupRequestSchema.parse({
    ...journeyRequest,
    organisationCode: settingsCode,
    databaseName: settingsDatabase,
    firstAdmin: {
      ...journeyRequest.firstAdmin,
      temporaryPassword: journeyRequest.firstAdmin.temporaryPassword.reveal(),
    },
    firstApprover: {
      ...journeyRequest.firstApprover,
      temporaryPassword: journeyRequest.firstApprover.temporaryPassword.reveal(),
    },
  }),
  serviceIdentities: serviceIdentitiesOf(jobRegistry),
  logger: setupLog.logger,
});
if (settingsSetup.outcome !== 'created')
  throw new Error(`The settings setup step did not create: ${settingsSetup.outcome}`);

const keys = syntheticKeysEnvironment(world);
const keyring = JSON.parse(keys[ORGANISATION_KEYS_VARIABLE] ?? '{}') as Record<string, string>;
keyring[journeyCode] = randomBytes(32).toString('base64url');
keyring[settingsCode] = randomBytes(32).toString('base64url');
keys[ORGANISATION_KEYS_VARIABLE] = JSON.stringify(keyring);

const firstSignIn = await writeSyntheticUser(orgA.database, orgA.code, keys, { label: 'BROWSER-A', temporary: true });
// A role assignment in force, so the first sign-in journey lands on My work (DEC-118; RR-260).
await grantSynthetic(orgA.database, { kind: 'user', id: firstSignIn.id }, [
  { recordType: 'access.user', action: 'view' },
]);
// The no-access journey (no-access.spec.ts): a first sign-in like the one above, but no role assignment at all, so
// the shell shows only "No access assigned" (DEC-118; RR-260; PRD-ACS-002).
const noAccess = await writeSyntheticUser(orgA.database, orgA.code, keys, {
  label: 'BROWSER-NOACCESS',
  temporary: true,
});
const lockUser = await writeSyntheticUser(orgB.database, orgB.code, keys, {
  label: 'BROWSER-LOCK',
  enrolled: true,
  personas: ['P-ADM'],
});
await grantSynthetic(orgB.database, { kind: 'user', id: lockUser.id }, [
  { recordType: 'access.user', action: 'view' },
  { recordType: 'access.user', action: 'create' },
]);

// The security settings journey: two enrolled users, SYNTHETIC assignments of the first two roles standing in for
// approved ones, and an approve reason in force (access-and-approvals 3.3, 9.5; DEC-118, DEC-120).
const settingsAdmin = await writeSyntheticUser(settingsDatabase, settingsCode, keys, {
  label: 'BROWSER-SETTINGS-ADMIN',
  enrolled: true,
  personas: ['P-ADM'],
});
const settingsApprover = await writeSyntheticUser(settingsDatabase, settingsCode, keys, {
  label: 'BROWSER-SETTINGS-APPROVER',
  enrolled: true,
  personas: ['P-OWN'],
});
// Each holds the role the setup step made, so the first Admin's role is enough to prepare a setting change and the
// first approver's to approve it (access-and-approvals 9.11; DEC-120, RR-402).
await assignSyntheticRole(settingsDatabase, { kind: 'user', id: settingsAdmin.id }, FIRST_ADMIN_ROLE.code);
await assignSyntheticRole(settingsDatabase, { kind: 'user', id: settingsApprover.id }, FIRST_APPROVER_ROLE.code);
await writeSyntheticReason(settingsDatabase, 'approve');

const app = await startAccessApp(world, keys, { origin, port });

// The worker that turns approval requests into My work items (module-map 4.8, 6.2 flow A). It serves every
// Organisation whose outbox identity the setup step wrote: here, the journey's.
const workerLog = capturingLogger();
const router = new OrganisationRouter(
  { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
  workerLog.logger,
);
const runner = new CommandRunner({
  clock: { now: () => new Date() },
  timezones: syntheticTimezone,
  logger: workerLog.logger,
});
const inboxRegistry: JobRegistry = {
  events: [approvalRequested, approvalDecided],
  consumers: inboxConsumers,
  jobKinds: [],
};
const worker = new Worker({
  router,
  runner,
  helper: new IdempotencyHelper({
    runner,
    logger: workerLog.logger,
    secretCheck: secretCheckNotImplemented,
    cipher: restrictedValueCipherNotConfigured,
  }),
  identities: jobIdentities(),
  logger: workerLog.logger,
  registry: inboxRegistry,
  // SYNTHETIC worker settings (DEC-118, DEC-119; CH-10), with a test's short waits.
  settings: syntheticWorkerSettings(inboxRegistry, { fast: true }),
});
await worker.start();

mkdirSync(dirname(worldFile), { recursive: true });
writeFileSync(
  worldFile,
  JSON.stringify({
    organisationCode: orgA.code,
    login: firstSignIn.login,
    displayName: firstSignIn.displayName,
    temporaryPassword: firstSignIn.password,
    noAccess: {
      login: noAccess.login,
      displayName: noAccess.displayName,
      temporaryPassword: noAccess.password,
    },
    lock: {
      organisationCode: orgB.code,
      login: lockUser.login,
      displayName: lockUser.displayName,
      password: lockUser.password,
      factorSecretHex: lockUser.factorSecret?.toString('hex') ?? '',
      idleLockSeconds: SYNTHETIC_SHORT_IDLE_LIMITS.idleLockSeconds,
    },
    settings: {
      organisationCode: settingsCode,
      admin: {
        login: settingsAdmin.login,
        displayName: settingsAdmin.displayName,
        password: settingsAdmin.password,
        factorSecretHex: settingsAdmin.factorSecret?.toString('hex') ?? '',
      },
      approver: {
        login: settingsApprover.login,
        displayName: settingsApprover.displayName,
        password: settingsApprover.password,
        factorSecretHex: settingsApprover.factorSecret?.toString('hex') ?? '',
      },
    },
    journey: {
      organisationCode: journeyCode,
      admin: {
        login: journeyRequest.firstAdmin.login,
        displayName: journeyRequest.firstAdmin.displayName,
        temporaryPassword: journeyRequest.firstAdmin.temporaryPassword.reveal(),
      },
      approver: {
        login: journeyRequest.firstApprover.login,
        displayName: journeyRequest.firstApprover.displayName,
        temporaryPassword: journeyRequest.firstApprover.temporaryPassword.reveal(),
      },
    },
  }),
);
process.stdout.write(`Browser journey server listening on port ${String(port)} for ${origin}\n`);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await worker.stop().catch(() => undefined);
  await router.close().catch(() => undefined);
  await app.close().catch(() => undefined);
  try {
    mkdirSync(dirname(logFile), { recursive: true });
    writeFileSync(logFile, app.logText());
  } catch {
    // The log sample is evidence, not a result: a failure to write it fails no journey.
  }
  await dropDatabase(journeyDatabase).catch(() => undefined);
  await dropDatabase(settingsDatabase).catch(() => undefined);
  await world.reset().catch(() => undefined);
  await postgres.stop().catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
