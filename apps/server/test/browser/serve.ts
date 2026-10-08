import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupRequestSchema, type PersonaId } from '@apparel-os/schemas';
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
  type SyntheticUser,
} from '../support/access.js';
import { assignSyntheticRole, grantSynthetic, writeSyntheticRole } from '../support/grants.js';
import { capturingLogger } from '../support/jobs.js';
import { startTestFileStore } from '../support/minio.js';
import { approved, approvedGeography, structureSetup } from '../support/organisation.js';
import { masterKinds, recordTypeOf as organisationRecordType } from '../../src/modules/organisation/index.js';
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
// AOS_E2E_ORIGIN: the origin the journey's pages and API are served from (AOS_PUBLIC_ORIGIN of this server).
// AOS_E2E_PORT: the port to listen on; this server serves the built web app and the API from one origin.
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

// The test sign-in journey (demo-sign-in.spec.ts; access-and-approvals 3.4; DEC-121): one enrolled user with the
// first Admin's role, listed in AOS_DEMO_SIGN_IN, which the journeys' server sets as on `local`.
const demoUser = await writeSyntheticUser(settingsDatabase, settingsCode, keys, {
  label: 'BROWSER-DEMO',
  enrolled: true,
  personas: ['P-ADM'],
});
await assignSyntheticRole(settingsDatabase, { kind: 'user', id: demoUser.id }, FIRST_ADMIN_ROLE.code);
const demoLabel = 'SYNTHETIC Demo Admin';

// The organisation structure journey (organisation-structure.spec.ts; S1-F02-T01), in the security settings
// Organisation: an approved SYNTHETIC geography built through the real commands by two fixture people
// (code-house-rules 11.2), so a Site has an Area to sit in; an enrolled Admin who may prepare every organisation master
// and read the master lists; and an enrolled approver who may approve them and open the approval request.
const structureFixture = await structureSetup({
  directory: world.directory,
  database: settingsDatabase,
  organisationCode: settingsCode,
  keysEnvironment: keys,
  label: 'BROWSER-GEO',
});
const structureGeography = await approvedGeography(structureFixture, 'JOURNEY');
// The business units journey (organisation-units.spec.ts; S1-F02-T02): an approved SYNTHETIC Site in the journey's
// Area, and two legal entities, each with a tax registration in that Area's State and a book, so two units at the one
// Site can map to different books and registrations (structure-and-masters 9 test 1).
const unitsSite = await approved(structureFixture, (c, p) =>
  structureFixture.organisation.prepareSite(c, p, {
    code: syntheticCode('JOURNEY-UNITS-SITE'),
    name: syntheticName('Journey Units Site'),
    physicalKind: 'central-warehouse',
    areaId: structureGeography.area.recordId,
    addresses: [syntheticName('1 Units Road')],
    aliases: [],
    validFrom: structureFixture.today(),
  }),
);
const unitsEntities = [];
for (const label of ['ONE', 'TWO']) {
  const legalEntity = await approved(structureFixture, (c, p) =>
    structureFixture.organisation.prepareLegalEntity(c, p, {
      code: syntheticCode(`JOURNEY-LE-${label}`),
      legalName: syntheticName(`Journey Entity ${label}`),
      validFrom: structureFixture.today(),
    }),
  );
  const registrationNumber = `SYNTHETIC-GSTIN-${label}`;
  await approved(structureFixture, (c, p) =>
    structureFixture.organisation.prepareTaxRegistration(c, p, {
      code: syntheticCode(`JOURNEY-GSTIN-${label}`),
      legalEntityId: legalEntity.recordId,
      registrationNumber,
      stateId: structureGeography.state.recordId,
      validityFrom: structureFixture.today(),
      validFrom: structureFixture.today(),
    }),
  );
  await approved(structureFixture, (c, p) =>
    structureFixture.organisation.prepareAccountingBook(c, p, {
      code: syntheticCode(`JOURNEY-BK-${label}`),
      legalEntityId: legalEntity.recordId,
      name: syntheticName(`Journey Book ${label}`),
      validFrom: structureFixture.today(),
    }),
  );
  // How the unit form names each choice: its code and its latest version's name (the web's useNames).
  unitsEntities.push({
    legalEntityOption: `${syntheticCode(`JOURNEY-LE-${label}`)} · ${syntheticName(`Journey Entity ${label}`)}`,
    registrationOption: `${syntheticCode(`JOURNEY-GSTIN-${label}`)} · ${registrationNumber}`,
    bookOption: `${syntheticCode(`JOURNEY-BK-${label}`)} · ${syntheticName(`Journey Book ${label}`)}`,
  });
}
// The scope journey (scope-by-place.spec.ts; S1-F02-T03): an approved SYNTHETIC Site with two Stores, one of which
// a role assignment selects (access-and-approvals 5.2; PRD-ACS-021).
const scopeSite = await approved(structureFixture, (c, p) =>
  structureFixture.organisation.prepareSite(c, p, {
    code: syntheticCode('JOURNEY-SCOPE-SITE'),
    name: syntheticName('Journey Scope Site'),
    physicalKind: 'retail-site',
    areaId: structureGeography.area.recordId,
    addresses: [syntheticName('1 Scope Road')],
    aliases: [],
    validFrom: structureFixture.today(),
  }),
);
const scopeStores = [];
for (const label of ['MINE', 'OTHER']) {
  const code = syntheticCode(`JOURNEY-SCOPE-STORE-${label}`);
  const name = syntheticName(`Journey Scope Store ${label}`);
  const answer = await approved(structureFixture, (c, p) =>
    structureFixture.organisation.prepareStore(c, p, {
      code,
      name,
      format: 'ebo',
      operatingModel: 'company-owned',
      siteId: scopeSite.recordId,
      aliases: [],
      validFrom: structureFixture.today(),
    }),
  );
  scopeStores.push({ id: answer.recordId, code, name });
}
await structureFixture.close();
/** Verifying a mapping and storing its evidence file (structure-and-masters 3.4; S1-F06-T05). */
const verifyAuthorities = [
  { recordType: 'organisation.business_unit_mapping_verification', action: 'view' as const },
  { recordType: 'organisation.business_unit_mapping_verification', action: 'create' as const },
  { recordType: 'files_imports.stored_file', action: 'create' as const },
];
const organisationTypes = masterKinds.map(organisationRecordType);
const adminAuthorities = [
  ...organisationTypes.flatMap((recordType) =>
    (['view', 'create', 'edit'] as const).map((action) => ({ recordType, action })),
  ),
  { recordType: 'access.approval_request', action: 'view' as const },
  // The verify permission too, so that verifying a mapping they made is refused by the rule alone (GC2-2, DEC-105).
  ...verifyAuthorities,
];
const approverAuthorities = [
  ...organisationTypes.flatMap((recordType) =>
    (['view', 'approve'] as const).map((action) => ({ recordType, action })),
  ),
  { recordType: 'access.approval_request', action: 'view' as const },
  // The reasons in force, which the approval panel offers (access-and-approvals 9.5).
  { recordType: 'access.approval_reason', action: 'view' as const },
];
/** An enrolled SYNTHETIC user of the settings Organisation holding one persona and the authorities given. */
async function provisionUser(
  label: string,
  persona: PersonaId,
  authorities: Parameters<typeof grantSynthetic>[2],
): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(settingsDatabase, settingsCode, keys, {
    label,
    enrolled: true,
    personas: [persona],
  });
  await grantSynthetic(settingsDatabase, { kind: 'user', id: user.id }, authorities);
  return user;
}
const structureAdmin = await provisionUser('BROWSER-STRUCTURE-ADMIN', 'P-ADM', adminAuthorities);
// The business units journey's own Admin and approver: journeys run at once, and an authenticator code is taken once
// (access-and-approvals 3.3), so two journeys never sign in as one person.
const unitsAdmin = await provisionUser('BROWSER-UNITS-ADMIN', 'P-ADM', adminAuthorities);
const unitsApprover = await provisionUser('BROWSER-UNITS-APPROVER', 'P-OWN', approverAuthorities);
// The Accounts user who verifies a mapping they did not make (POL-10.08), reading the structure.
const structureAccounts = await provisionUser('BROWSER-STRUCTURE-ACCOUNTS', 'P-ACC', [
  ...organisationTypes.map((recordType) => ({ recordType, action: 'view' as const })),
  ...verifyAuthorities,
]);
const structureApprover = await provisionUser('BROWSER-STRUCTURE-APPROVER', 'P-OWN', approverAuthorities);
// The scope journey's people (S1-F02-T03): an Admin who prepares role assignments and reads the structure to choose
// places from; an approver who decides them; and a person with no assignment yet, given one by the journey, of a
// SYNTHETIC role that reads Sites, Stores and business units.
const scopeAdmin = await provisionUser('BROWSER-SCOPE-ADMIN', 'P-ADM', [
  { recordType: 'access.role_assignment', action: 'view' },
  { recordType: 'access.role_assignment', action: 'create' },
  { recordType: 'access.user', action: 'view' },
  { recordType: 'access.role', action: 'view' },
  { recordType: 'access.approval_request', action: 'view' },
  ...['legal_entity', 'site', 'store', 'business_unit'].map((kind) => ({
    recordType: `organisation.${kind}`,
    action: 'view' as const,
  })),
]);
const scopeApprover = await provisionUser('BROWSER-SCOPE-APPROVER', 'P-OWN', [
  { recordType: 'access.role_assignment', action: 'view' },
  { recordType: 'access.role_assignment', action: 'approve' },
  { recordType: 'access.user', action: 'view' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
const scopeReader = await writeSyntheticUser(settingsDatabase, settingsCode, keys, {
  label: 'BROWSER-SCOPE-READER',
  enrolled: true,
  personas: ['P-ADM'],
});
const scopeRole = { code: syntheticCode('JOURNEY-STORE-READER'), name: syntheticName('Journey Store Reader') };
await writeSyntheticRole(settingsDatabase, {
  ...scopeRole,
  authorities: ['site', 'store', 'business_unit'].map((kind) => ({
    recordType: `organisation.${kind}`,
    action: 'view' as const,
  })),
});

/** How a journey signs a user in: login, name, password and authenticator secret. */
const credentialsOf = (user: SyntheticUser) => ({
  login: user.login,
  displayName: user.displayName,
  password: user.password,
  factorSecretHex: user.factorSecret?.toString('hex') ?? '',
});

// The built web app from the same origin as the API, as the `app` service serves it (deployment.md section 3;
// S1-F01-T27): this file runs from apps/server/dist-browser/test/browser/.
const webApp = fileURLToPath(new URL('../../../../web/dist', import.meta.url));
// A MinIO container for the evidence files of the business units journey (code-house-rules 12.10).
const fileStore = await startTestFileStore();
const app = await startAccessApp(
  world,
  {
    ...keys,
    AOS_ENVIRONMENT: 'local',
    AOS_DEMO_SIGN_IN: JSON.stringify([{ organisationCode: settingsCode, login: demoUser.login, label: demoLabel }]),
  },
  { origin, port, webApp, fileStoreEnvironment: fileStore.environment },
);

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
    demo: { label: demoLabel, displayName: demoUser.displayName },
    structure: {
      organisationCode: settingsCode,
      areaId: structureGeography.area.recordId,
      // How the Site form names the Area: its code and name (approvedGeography).
      areaOption: `${syntheticCode('JOURNEY-AR')} · ${syntheticName('JOURNEY Area')}`,
      admin: credentialsOf(structureAdmin),
      approver: credentialsOf(structureApprover),
      unitsAdmin: credentialsOf(unitsAdmin),
      unitsApprover: credentialsOf(unitsApprover),
      accounts: credentialsOf(structureAccounts),
      siteId: unitsSite.recordId,
      siteOption: `${syntheticCode('JOURNEY-UNITS-SITE')} · ${syntheticName('Journey Units Site')}`,
      entities: unitsEntities,
    },
    scope: {
      organisationCode: settingsCode,
      admin: credentialsOf(scopeAdmin),
      approver: credentialsOf(scopeApprover),
      reader: credentialsOf(scopeReader),
      // How the assignment form names the person and the role (AssignmentsScreen).
      readerOption: `${scopeReader.displayName} (${scopeReader.login})`,
      roleOption: `${scopeRole.code} · ${scopeRole.name}`,
      stores: scopeStores,
    },
    settings: {
      organisationCode: settingsCode,
      admin: credentialsOf(settingsAdmin),
      approver: credentialsOf(settingsApprover),
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
  await fileStore.stop().catch(() => undefined);
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
