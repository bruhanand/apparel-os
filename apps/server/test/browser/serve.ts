import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { known, paise, uuidv7 } from '@apparel-os/domain';
import {
  DAMAGE_DECISION,
  HELD_LINE_DECISION,
  PT_APPROVAL,
  RECOUNT_APPROVAL,
  fieldClassSchema,
  permissionRegistry,
  setupRequestSchema,
  type PersonaId,
  type RecordTypeDeclaration,
} from '@apparel-os/schemas';
import {
  CommandRunner,
  CommandTimedOut,
  defineConsumer,
  defineEvent,
  IdempotencyHelper,
  LOCK_STEP,
  newCorrelationId,
  OrganisationRouter,
  restrictedValueCipherNotConfigured,
  secretCheckNotImplemented,
  Worker,
  type JobRegistry,
} from '../../src/kernel/index.js';
import {
  Access,
  approvalDecided,
  approvalRequested,
  ORGANISATION_KEYS_VARIABLE,
  runSetupStep,
  type ApprovalRule,
} from '../../src/modules/access/index.js';
import { TEST_COMPOSITION } from '../support/composition.js';
import { JOURNAL_KIND, type PostingEventKind } from '../../src/modules/finance/books/index.js';

/** The posting maps journey's SYNTHETIC event kind and its reversal kind (books-and-posting 7.1; S1-F09-T02). */
const POSTING_JOURNEY_KIND: PostingEventKind = {
  kind: 'test-synthetic.value-in',
  components: ['to-pool', 'to-dispatch'],
  reversalKind: 'test-synthetic.value-in-reversal',
  liveStage: 1,
};
const POSTING_JOURNEY_KINDS: readonly PostingEventKind[] = [
  POSTING_JOURNEY_KIND,
  { ...POSTING_JOURNEY_KIND, kind: 'test-synthetic.value-in-reversal', reversalKind: null },
];
// The access module's JobIdentities, as AccessJobIdentitiesModule provides it to the worker (RR-273).
import { jobIdentities } from '../../src/modules/access/commands/job-identities.js';
// The codes of the two roles the setup step creates, so the journey assigns exactly those roles (9.11).
import { FIRST_ADMIN_ROLE, FIRST_APPROVER_ROLE } from '../../src/modules/access/domain/first-roles.js';
import { Audit } from '../../src/modules/audit/index.js';
import type { GatedOperation, ValidityCheck } from '../../src/modules/configuration/index.js';
import {
  EXCEPTION_CODE_KIND,
  Exceptions,
  ROUTING_ACTION_TYPE,
  routingApprovals,
} from '../../src/modules/exceptions/index.js';
import { Inbox, inboxConsumers } from '../../src/modules/inbox/index.js';
import { Numbering } from '../../src/modules/numbering/index.js';
import { IMPORT_BATCH_KIND, IMPORT_HANDLERS, type ImportHandlers } from '../../src/modules/files-imports/index.js';
import { CATALOGUE, SKU_CODE_KIND, type CatalogueInterface } from '../../src/modules/merchandise/catalogue/index.js';
import { ORGANISATION, type OrganisationInterface } from '../../src/modules/organisation/index.js';
import {
  cellsOf,
  MANIFEST_FIELDS,
  MANIFEST_LAYOUT,
  MANIFEST_MAPPING,
  MANIFEST_SHEET,
  OPENING_LAYOUT_CODES,
} from '../fixtures/opening-data.js';
import { OPENING_STOCK_TARGET, openingStockHandler } from '../support/opening-stock.js';
import {
  SYNTHETIC_PRODUCT_COLUMNS,
  SYNTHETIC_PRODUCT_LAYOUT,
  SYNTHETIC_PRODUCT_LAYOUT_CODE,
  SYNTHETIC_PRODUCT_MAPPING,
  SYNTHETIC_PRODUCT_MAPPING_CODE,
  syntheticProductFileName,
  syntheticProductWorkbook,
  syntheticWorkbook,
} from '../fixtures/imports.js';
import { withParts } from '../fixtures/workbook-parts.js';
import {
  defineSyntheticImportBatchSeries,
  writeSyntheticLayout,
  writeSyntheticProductLayout,
} from '../support/imports.js';
import { serviceIdentitiesOf } from '../../src/setup-organisation.js';
import { jobRegistry } from '../../src/worker.module.js';
import { syntheticCode, syntheticIdentifier, syntheticName } from '../fixtures/synthetic.js';
import { syntheticWorkerSettings } from '../fixtures/worker-settings.js';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  syntheticTimezone,
  writeSyntheticReason,
  writeSyntheticSetting,
  writeSyntheticUser,
  type SyntheticUser,
} from '../support/access.js';
import { assignSyntheticRole, grantSynthetic, writeSyntheticRole } from '../support/grants.js';
import { writeSyntheticMarking } from '../support/marked-attributes.js';
import { capturingLogger, writeSyntheticServiceIdentity } from '../support/jobs.js';
import { startTestFileStore } from '../support/minio.js';
import { approved, approvedGeography, structureSetup, writeSyntheticSites } from '../support/organisation.js';
import { STORE_FILE_PATH, syntheticPdfUpload } from '../support/opening-app.js';
import { masterKinds, recordTypeOf as organisationRecordType } from '../../src/modules/organisation/index.js';
import {
  createTestExceptionsSchema,
  defineSyntheticCodeSeries,
  syntheticMismatch,
  TEST_DOCUMENT_TYPE,
  TEST_EXCEPTIONS_MODULE,
  writeTestDocument,
} from '../support/exceptions.js';
import { createSyntheticOrganisations } from '../support/organisations.js';
import { GRN_KIND, receivingExceptionTypes } from '../../src/modules/receiving/index.js';
import { receivingApprovalRules } from '../../src/modules/receiving/domain/kinds.js';
import { BOOKING_KIND, overdueExceptionType } from '../../src/modules/booking/index.js';
import { defineSyntheticGrnSeries } from '../fixtures/grn-series.js';
import { syntheticPtFileName, syntheticPtWorkbook, type SyntheticPtRow } from '../fixtures/pt.js';
import { ptWorld } from '../support/pt.js';
import { ptGateOpen, syntheticPtBook } from '../support/pt-gate.js';
import { defineSyntheticPtSeries, defineSyntheticSkuCodeSeries } from '../fixtures/pt-series.js';
import { PT_KIND } from '../../src/modules/merchandise/pt/index.js';
import { ptApprovalRules } from '../../src/modules/merchandise/pt/domain/kinds.js';
import { STOCK_POSTING_EVENT_KINDS } from '../../src/modules/stock/ledger/index.js';
import { defineSyntheticBookingSeries } from '../fixtures/booking-series.js';
import {
  BOOKING_POLICY_CHECKS,
  bookingGateOpen,
  syntheticPolicyValues,
  bookingLimitApproved,
  writeSyntheticBudget,
} from '../support/booking.js';
import { defineSyntheticDamageReportSeries } from '../fixtures/damage-report-series.js';
import { DAMAGE_REPORT_KIND, damageExceptionType } from '../../src/modules/stock/documents/index.js';
import { stockDocumentsApprovalRules } from '../../src/modules/stock/documents/domain/kinds.js';
import {
  damageGateOpen,
  DECIDER_AUTHORITY,
  LIMIT_ADMIN_AUTHORITY,
  LIMIT_APPROVER_AUTHORITY,
  RECEIVER_REPORTER_AUTHORITY,
  SYNTHETIC_POLICY_17_VALUES,
} from '../support/damage.js';
import {
  mappingsVerified,
  placeScope,
  RECEIVER_AUTHORITY,
  RECEIVING_POLICY_CHECKS,
  receivingFixture,
  receivingGateOpen,
  receivingGranted,
  STOCK_VIEW,
} from '../support/receiving.js';
import { reportedValues, signedFixture } from '../support/signed-policies.js';
import { connect, databaseUrl, dropDatabase, usePostgresServer } from '../support/postgres.js';
import { startPostgresServer } from '../support/postgres-server.js';
import { z } from 'zod';
import { localOrigins } from '../support/origins.js';

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

/** The SYNTHETIC work the operations view journey's failing consumer is handed (S1-F08-T04). */
const syntheticFailing = defineEvent({
  type: 'kernel.synthetic-work-requested',
  version: 1,
  payload: z.object({ recordId: z.uuid() }),
});
const SYNTHETIC_FAILING_IDENTITY = 'synthetic-failing-consumer';
/** A SYNTHETIC consumer that always fails transiently, so its job exhausts its SYNTHETIC retries (12.9). */
const syntheticAlwaysFails = defineConsumer({
  name: 'kernel.synthetic-always-fails',
  event: syntheticFailing,
  serviceIdentity: SYNTHETIC_FAILING_IDENTITY,
  authorises: { action: 'view', recordType: 'kernel.outbox_event' },
  handle: (context) => Promise.reject(new CommandTimedOut('statement', '57014', context.correlationId)),
});

/**
 * The approval limits journey's test-only action type: booking approval on its value at cost (DM-8, DEC-105), since
 * bookings arrive in stage 2 (S1-F05-T01; code-house-rules 11.4). SYNTHETIC, so accepted only in this test composition.
 */
const LIMITS_MODULE = syntheticIdentifier('limits');
const LIMITS_BOOKING_TYPE = `${LIMITS_MODULE}.booking`;
const LIMITS_BOOKING = `${LIMITS_MODULE}.approve-booking`;
const limitsBookingType: RecordTypeDeclaration = {
  code: LIMITS_BOOKING_TYPE,
  actions: ['view', 'approve'],
  scopeFacts: { legalEntity: false, place: false, brand: false },
  subject: false,
  fieldClasses: [],
  serviceOnly: false,
};
const limitsBookingRule: ApprovalRule = {
  actionType: LIMITS_BOOKING,
  module: LIMITS_MODULE,
  recordType: LIMITS_BOOKING_TYPE,
  independent: true,
  value: 'cost',
  freeTextReason: false,
  decisionEvidenceClasses: [],
  synthetic: true,
};

/**
 * The bulk approval journey's test-only action type: booking approval on its value at cost (DM-8, DEC-105; S1-F05-T02;
 * code-house-rules 11.4). SYNTHETIC, so accepted only in this test composition.
 */
const BULK_MODULE = syntheticIdentifier('bulk');
const BULK_BOOKING_TYPE = `${BULK_MODULE}.booking`;
const BULK_BOOKING = `${BULK_MODULE}.approve-booking`;
const bulkBookingType: RecordTypeDeclaration = { ...limitsBookingType, code: BULK_BOOKING_TYPE };
const bulkBookingRule: ApprovalRule = {
  ...limitsBookingRule,
  actionType: BULK_BOOKING,
  module: BULK_MODULE,
  recordType: BULK_BOOKING_TYPE,
};

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

// The Receive Goods journey's Organisation (S2-F02-T02), made by the setup step below.
const receivingCode = syntheticCode('ORG-RECEIVING');
const receivingDatabase = `syn_browser_receiving_${randomBytes(3).toString('hex')}`;

// The readiness journey's Organisation (S1-F04-T02), made by the setup step below: its approvals queue behind no other
// fixture's in the worker, and no other journey's mapping verification lapses its validation of policy 10, whose values
// are the verified mappings (goods-in 10.5; RR-558).
const readinessCode = syntheticCode('ORG-READINESS');
const readinessDatabase = `syn_browser_readiness_${randomBytes(3).toString('hex')}`;

// The posting maps journey's Organisation (S1-F09-T02), made by the setup step like the one above, so My work is fed.
const postingCode = syntheticCode('ORG-POSTING');
const postingDatabase = `syn_browser_posting_${randomBytes(3).toString('hex')}`;
const postingSetup = await runSetupStep({
  migrationConnectionString: databaseUrl(world.directory, 'migration'),
  runtimeConnectionString: databaseUrl(world.directory, 'runtime'),
  request: setupRequestSchema.parse({
    ...journeyRequest,
    organisationCode: postingCode,
    databaseName: postingDatabase,
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
if (postingSetup.outcome !== 'created')
  throw new Error(`The posting setup step did not create: ${postingSetup.outcome}`);

// The worker that turns approval requests into My work items (module-map 4.8, 6.2 flow A), and runs the operations
// view journey's failing consumer. It serves every Organisation whose outbox identity the setup step wrote: here, the
// journeys'. It starts before any fixture below writes an event, since a consumer receives only the events recorded
// from its first registration on (code-house-rules 12.8; S1-F08 review).
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
  events: [approvalRequested, approvalDecided, syntheticFailing],
  consumers: [...inboxConsumers, syntheticAlwaysFails],
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

const keys = syntheticKeysEnvironment(world);
const keyring = JSON.parse(keys[ORGANISATION_KEYS_VARIABLE] ?? '{}') as Record<string, string>;
keyring[journeyCode] = randomBytes(32).toString('base64url');
keyring[settingsCode] = randomBytes(32).toString('base64url');
keyring[postingCode] = randomBytes(32).toString('base64url');
keyring[receivingCode] = randomBytes(32).toString('base64url');
keyring[readinessCode] = randomBytes(32).toString('base64url');
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
// The vocabularies journey (vocabularies.spec.ts; S1-F03-T01): one list-type SYNTHETIC attribute, recorded through
// the catalogue's real command by the fixture person (code-house-rules 11.2), so the Vocabularies screen has a tab
// whose values a Booking user proposes. No attribute is set by the application (GC2-9).
const vocabularyAttribute = { code: syntheticCode('JOURNEY-COLOUR'), name: syntheticName('Journey Colour') };
const vocabularyAttributeAnswer = await structureFixture.asPreparerDo((c, p) =>
  structureFixture.catalogue.prepareAttribute(c, p, {
    ...vocabularyAttribute,
    valueKind: 'list',
    validFrom: structureFixture.today(),
  }),
);
if (vocabularyAttributeAnswer.kind !== 'success') {
  throw new Error(`The synthetic attribute was refused: ${vocabularyAttributeAnswer.refusal.code}`);
}
// The season and size attributes journey's SYNTHETIC list attribute for sizes (season-and-size-attributes.spec.ts;
// structure-and-masters 4.2 "As built"; RR-556), recorded through the catalogue's real command by the fixture person;
// the journey marks it as the size list.
const markingAttribute = { code: syntheticCode('JOURNEY-SIZES'), name: syntheticName('Journey Sizes') };
const markingAttributeAnswer = await structureFixture.asPreparerDo((c, p) =>
  structureFixture.catalogue.prepareAttribute(c, p, {
    ...markingAttribute,
    valueKind: 'list',
    validFrom: structureFixture.today(),
  }),
);
if (markingAttributeAnswer.kind !== 'success') {
  throw new Error(`The synthetic size list was refused: ${markingAttributeAnswer.refusal.code}`);
}
// The bank details journey (bank-details.spec.ts; S1-F03-T03): one SYNTHETIC supplier, recorded through the parties
// part's real command by the fixture person (code-house-rules 11.2), whose bank details the journey changes.
const bankSupplier = { code: syntheticCode('JOURNEY-SUPPLIER'), legalName: syntheticName('Journey Supplier') };
const bankSupplierAnswer = await structureFixture.asPreparerDo((c, p) =>
  structureFixture.parties.prepareParty(c, p, {
    ...bankSupplier,
    taxIdentities: [],
    msmeClassification: null,
    contacts: [],
    roles: ['supplier'],
    validFrom: structureFixture.today(),
  }),
);
if (bankSupplierAnswer.kind !== 'success') {
  throw new Error(`The synthetic supplier was refused: ${bankSupplierAnswer.refusal.code}`);
}
// The agreement journey (agreement.spec.ts; S2-F01-T01): one SYNTHETIC supplier with no agreement yet, recorded
// through the parties part's real command by the fixture person (code-house-rules 11.2), whose agreement the journey
// prepares.
const agreementSupplier = {
  code: syntheticCode('JOURNEY-AGREEMENT-SUPPLIER'),
  legalName: syntheticName('Journey Agreement Supplier'),
};
const agreementSupplierAnswer = await structureFixture.asPreparerDo((c, p) =>
  structureFixture.parties.prepareParty(c, p, {
    ...agreementSupplier,
    taxIdentities: [],
    msmeClassification: null,
    contacts: [],
    roles: ['supplier'],
    validFrom: structureFixture.today(),
  }),
);
if (agreementSupplierAnswer.kind !== 'success') {
  throw new Error(`The synthetic supplier was refused: ${agreementSupplierAnswer.refusal.code}`);
}
// The products journey (products.spec.ts; S1-F03-T02): one SYNTHETIC brand and one category whose size set holds a
// SYNTHETIC free size, recorded through the catalogue's real commands by the fixture person (code-house-rules 11.2),
// so a Booking user proposes a style into them. A size set is fixed to its category, which names it by a later version
// (structure-and-masters 4.1), so the category and its size set are recorded on the fixture's clock a day earlier and
// the category names its size set from today. No product, size or unit is set by the application.
const productsBrand = { code: syntheticCode('JOURNEY-PRODUCTS-BRAND'), name: syntheticName('Journey Products Brand') };
const productsCategory = {
  code: syntheticCode('JOURNEY-PRODUCTS-CAT'),
  name: syntheticName('Journey Products Category'),
};
const productsFreeSize = 'SYNTHETIC Free Size';
const recordedCatalogue = <A>(
  outcome: { kind: 'success'; answer: A } | { kind: 'refusal'; refusal: { code: string } },
) => {
  if (outcome.kind !== 'success') throw new Error(`The synthetic catalogue was refused: ${outcome.refusal.code}`);
  return outcome.answer;
};
recordedCatalogue(
  await structureFixture.asPreparerDo((c, p) =>
    structureFixture.catalogue.prepareBrand(c, p, {
      ...productsBrand,
      aliases: [],
      validFrom: structureFixture.today(),
    }),
  ),
);
structureFixture.advanceDays(-1);
const productsCategoryAnswer = recordedCatalogue(
  await structureFixture.asPreparerDo((c, p) =>
    structureFixture.catalogue.prepareCategory(c, p, {
      ...productsCategory,
      identityAttributeIds: [],
      validFrom: structureFixture.today(),
    }),
  ),
);
const productsSizeSet = recordedCatalogue(
  await structureFixture.asPreparerDo((c, p) =>
    structureFixture.catalogue.prepareSizeSet(c, p, {
      code: syntheticCode('JOURNEY-PRODUCTS-SIZES'),
      categoryId: productsCategoryAnswer.recordId,
      name: syntheticName('Journey Products Sizes'),
      sizes: [productsFreeSize],
      validFrom: structureFixture.today(),
    }),
  ),
);
structureFixture.advanceDays(1);
recordedCatalogue(
  await structureFixture.asPreparerDo((c, p) =>
    structureFixture.catalogue.prepareCategoryVersion(c, p, productsCategoryAnswer.recordId, {
      name: productsCategory.name,
      sizeSetId: productsSizeSet.recordId,
      identityAttributeIds: [],
      validFrom: structureFixture.today(),
      versionToken: productsCategoryAnswer.versionId,
    }),
  ),
);
// A style's attribute values (S1-F03 review S1): a SYNTHETIC list-type attribute with one confirmed value, and a
// SYNTHETIC text attribute, so the journey enters and changes them on Setup › Products (structure-and-masters 4.2).
const productsSeason = { code: syntheticCode('JOURNEY-PRODUCTS-SEASON'), name: syntheticName('Journey Season') };
const productsSeasonValue = { code: syntheticCode('JOURNEY-PRODUCTS-SS'), name: syntheticName('Journey Summer') };
const productsFit = { code: syntheticCode('JOURNEY-PRODUCTS-FIT'), name: syntheticName('Journey Fit') };
const productsSeasonAnswer = recordedCatalogue(
  await structureFixture.asPreparerDo((c, p) =>
    structureFixture.catalogue.prepareAttribute(c, p, {
      ...productsSeason,
      valueKind: 'list',
      validFrom: structureFixture.today(),
    }),
  ),
);
recordedCatalogue(
  await structureFixture.asPreparerDo((c, p) =>
    structureFixture.catalogue.prepareAttribute(c, p, {
      ...productsFit,
      valueKind: 'text',
      validFrom: structureFixture.today(),
    }),
  ),
);
const productsSeasonProposal = recordedCatalogue(
  await structureFixture.asPreparerDo((c, p) =>
    structureFixture.catalogue.proposeVocabularyValue(c, p, {
      attributeId: productsSeasonAnswer.recordId,
      ...productsSeasonValue,
    }),
  ),
);
recordedCatalogue(await structureFixture.decide(productsSeasonProposal.requestId, productsSeasonProposal.proposalId));
// That list attribute is the Organisation's season attribute, a SYNTHETIC setting written as a fixture, so the
// open-to-buy journey's budget names its season from it (structure-and-masters 4.2 "As built"; RR-550). Written
// directly, not through its routes (code-house-rules 11.2), for the clock, as writeSyntheticSetting writes a setting of
// access: a marking approved through Decide is in force from the decision's instant on this composition's clock, which
// may fall after the instant the journeys' requests read it at; this one is in force from a day before.
await writeSyntheticMarking(settingsDatabase, 'season', productsSeasonAnswer.recordId, structureFixture.preparer.id);
// A SYNTHETIC legal entity with a registration and a book, to which the devices journey's units are mapped. The
// readiness journey's own Site and unit are in the receiving Organisation, below (RR-558).
const readinessEntity = await approved(structureFixture, (c, p) =>
  structureFixture.organisation.prepareLegalEntity(c, p, {
    code: syntheticCode('JOURNEY-READY-LE'),
    legalName: syntheticName('Journey Ready Entity'),
    validFrom: structureFixture.today(),
  }),
);
const readinessRegistration = await approved(structureFixture, (c, p) =>
  structureFixture.organisation.prepareTaxRegistration(c, p, {
    code: syntheticCode('JOURNEY-READY-GSTIN'),
    legalEntityId: readinessEntity.recordId,
    registrationNumber: 'SYNTHETIC-GSTIN-READY',
    stateId: structureGeography.state.recordId,
    validityFrom: structureFixture.today(),
    validFrom: structureFixture.today(),
  }),
);
const readinessBook = await approved(structureFixture, (c, p) =>
  structureFixture.organisation.prepareAccountingBook(c, p, {
    code: syntheticCode('JOURNEY-READY-BK'),
    legalEntityId: readinessEntity.recordId,
    name: syntheticName('Journey Ready Book'),
    validFrom: structureFixture.today(),
  }),
);
// The devices journey (billing-devices.spec.ts; S1-F12-T01): a SYNTHETIC Site with two Stores, the first with a
// whole-store unit and a brand counter, the second with a whole-store unit, each mapped to the readiness journey's
// registration, so the Admin registers a device for the first Store and sees a unit of the second refused. No bill
// format or financial year is set here: the bill numbering journey (S1-F12-T03) sets both through their approvals,
// while the other devices journeys run, so none of them relies on a device having or lacking series.
const devicesSite = await approved(structureFixture, (c, p) =>
  structureFixture.organisation.prepareSite(c, p, {
    code: syntheticCode('JOURNEY-DEVICES-SITE'),
    name: syntheticName('Journey Devices Site'),
    physicalKind: 'retail-site',
    areaId: structureGeography.area.recordId,
    addresses: [syntheticName('1 Till Road')],
    aliases: [],
    validFrom: structureFixture.today(),
  }),
);
const devicesStore = { code: syntheticCode('JOURNEY-DEVICES-STORE'), name: syntheticName('Journey Devices Store') };
const devicesOtherStore = { code: syntheticCode('JOURNEY-DEVICES-OTHER'), name: syntheticName('Journey Other Store') };
const devicesStores: { readonly recordId: string }[] = [];
for (const store of [devicesStore, devicesOtherStore]) {
  devicesStores.push(
    await approved(structureFixture, (c, p) =>
      structureFixture.organisation.prepareStore(c, p, {
        ...store,
        format: 'ebo',
        operatingModel: 'company-owned',
        siteId: devicesSite.recordId,
        aliases: [],
        validFrom: structureFixture.today(),
      }),
    ),
  );
}
const devicesUnits = [
  {
    code: syntheticCode('JOURNEY-DEVICES-WHOLE'),
    name: syntheticName('Journey Devices Whole Store'),
    kind: 'whole-store',
    store: 0,
  },
  {
    code: syntheticCode('JOURNEY-DEVICES-COUNTER'),
    name: syntheticName('Journey Devices Counter'),
    kind: 'brand-counter',
    store: 0,
  },
  {
    code: syntheticCode('JOURNEY-DEVICES-ELSEWHERE'),
    name: syntheticName('Journey Other Whole Store'),
    kind: 'whole-store',
    store: 1,
  },
] as const;
for (const unit of devicesUnits) {
  await approved(structureFixture, (c, p) =>
    structureFixture.organisation.prepareBusinessUnit(c, p, {
      code: unit.code,
      name: unit.name,
      siteId: devicesSite.recordId,
      kind: unit.kind,
      storeId: devicesStores[unit.store]?.recordId ?? '',
      legalEntityId: readinessEntity.recordId,
      taxRegistrationId: readinessRegistration.recordId,
      accountingBookId: readinessBook.recordId,
      origin: 'synthetic',
      validFrom: structureFixture.today(),
    }),
  );
}
// The posting maps journey (posting-maps.spec.ts; S1-F09-T02), in an Organisation of its own made by the setup step,
// so its fixture's approvals never queue ahead of the other journeys' My work items in the worker: a SYNTHETIC
// geography, and a SYNTHETIC book with a Site, a Store, a whole-store
// unit and a warehouse unit mapped to it, the accounts of the synthetic chart of books-and-posting 16.1 in force, one
// Open period from today with its journal series in a SYNTHETIC format, a map version in force from today, and two
// journals posted through Post by the synthetic caller (DEC-112 H2), one at each unit, so the trial balance has lines
// in and out of the Store reader's scope. Every value is SYNTHETIC (GC4-1, GC5-1, V-10).
const postingFixture = await structureSetup({
  directory: world.directory,
  database: postingDatabase,
  organisationCode: postingCode,
  keysEnvironment: keys,
  label: 'BROWSER-POST',
  // The journey's SYNTHETIC event kinds, declared in the test composition only (books-and-posting 7.1; DEC-112 H2).
  eventKinds: POSTING_JOURNEY_KINDS,
});
// The file intake journey's catalogue, saved layout and batch code series (S1-F06-T01; its person and file are below),
// in this Organisation, so the product proposal it publishes reaches no other journey's My work: a SYNTHETIC brand and
// a category with no size set, the one SYNTHETIC layout and mapping, proposed by the fixture person, and an Open series
// of the import-batch kind with a SYNTHETIC format (numbering-and-audit 3.5).
const intakeBrand = { code: syntheticCode('JOURNEY-INTAKE-BRAND'), name: syntheticName('Journey Intake Brand') };
const intakeCategory = { code: syntheticCode('JOURNEY-INTAKE-CAT'), name: syntheticName('Journey Intake Category') };
const intakeRecorded = (outcome: { kind: 'success' } | { kind: 'refusal'; refusal: { code: string } }) => {
  if (outcome.kind !== 'success') throw new Error(`The synthetic catalogue was refused: ${outcome.refusal.code}`);
};
intakeRecorded(
  await postingFixture.asPreparerDo((c, p) =>
    postingFixture.catalogue.prepareBrand(c, p, { ...intakeBrand, aliases: [], validFrom: postingFixture.today() }),
  ),
);
intakeRecorded(
  await postingFixture.asPreparerDo((c, p) =>
    postingFixture.catalogue.prepareCategory(c, p, {
      ...intakeCategory,
      identityAttributeIds: [],
      validFrom: postingFixture.today(),
    }),
  ),
);
// Confirmed by a different person from its proposer, so the journey's batch may publish (6.4; S1-F06-T03).
const intakeLayout = await writeSyntheticProductLayout(
  postingDatabase,
  postingFixture.preparer.id,
  postingFixture.approver.id,
);
await postingFixture.run(postingFixture.preparer.id, (c) =>
  defineSyntheticImportBatchSeries(c, new Numbering({ kinds: [IMPORT_BATCH_KIND] })),
);
const postingGeography = await approvedGeography(postingFixture, 'POSTING');
const postingEntity = await approved(postingFixture, (c, p) =>
  postingFixture.organisation.prepareLegalEntity(c, p, {
    code: syntheticCode('JOURNEY-POST-LE'),
    legalName: syntheticName('Journey Posting Entity'),
    validFrom: postingFixture.today(),
  }),
);
const postingRegistration = await approved(postingFixture, (c, p) =>
  postingFixture.organisation.prepareTaxRegistration(c, p, {
    code: syntheticCode('JOURNEY-POST-GSTIN'),
    legalEntityId: postingEntity.recordId,
    registrationNumber: 'SYNTHETIC-GSTIN-POST',
    stateId: postingGeography.state.recordId,
    validityFrom: postingFixture.today(),
    validFrom: postingFixture.today(),
  }),
);
const postingBookCode = syntheticCode('JOURNEY-POST-BK');
const postingBookName = syntheticName('Journey Posting Book');
const postingBook = await approved(postingFixture, (c, p) =>
  postingFixture.organisation.prepareAccountingBook(c, p, {
    code: postingBookCode,
    legalEntityId: postingEntity.recordId,
    name: postingBookName,
    validFrom: postingFixture.today(),
  }),
);
const postingSite = await approved(postingFixture, (c, p) =>
  postingFixture.organisation.prepareSite(c, p, {
    code: syntheticCode('JOURNEY-POST-SITE'),
    name: syntheticName('Journey Posting Site'),
    physicalKind: 'retail-site',
    areaId: postingGeography.area.recordId,
    addresses: [syntheticName('1 Posting Road')],
    aliases: [],
    validFrom: postingFixture.today(),
  }),
);
const postingStore = await approved(postingFixture, (c, p) =>
  postingFixture.organisation.prepareStore(c, p, {
    code: syntheticCode('JOURNEY-POST-STORE'),
    name: syntheticName('Journey Posting Store'),
    format: 'ebo',
    operatingModel: 'company-owned',
    siteId: postingSite.recordId,
    aliases: [],
    validFrom: postingFixture.today(),
  }),
);
const postingMapping = {
  legalEntityId: postingEntity.recordId,
  taxRegistrationId: postingRegistration.recordId,
  accountingBookId: postingBook.recordId,
  origin: 'synthetic' as const,
};
const postingStoreUnit = await approved(postingFixture, (c, p) =>
  postingFixture.organisation.prepareBusinessUnit(c, p, {
    code: syntheticCode('JOURNEY-POST-STORE-UNIT'),
    name: syntheticName('Journey Posting Store Unit'),
    siteId: postingSite.recordId,
    kind: 'whole-store',
    storeId: postingStore.recordId,
    ...postingMapping,
    validFrom: postingFixture.today(),
  }),
);
const postingWarehouse = await approved(postingFixture, (c, p) =>
  postingFixture.organisation.prepareBusinessUnit(c, p, {
    code: syntheticCode('JOURNEY-POST-WAREHOUSE'),
    name: syntheticName('Journey Posting Warehouse'),
    siteId: postingSite.recordId,
    kind: 'warehouse',
    ...postingMapping,
    validFrom: postingFixture.today(),
  }),
);
const postingOutcome = <A>(
  outcome: { kind: 'success'; answer: A } | { kind: 'refusal'; refusal: { code: string } },
) => {
  if (outcome.kind !== 'success') throw new Error(`The synthetic books were refused: ${outcome.refusal.code}`);
  return outcome.answer;
};
/** A books version covered by a SYNTHETIC CA reference and decided by the fixture's other person (6.3). */
async function postingInForce(
  change: { versionId: string; requestId?: string | undefined },
  recordType: 'finance.account' | 'finance.posting_map',
) {
  postingOutcome(
    await postingFixture.asPreparerDo((c, p) =>
      postingFixture.books.recordCaEvidence(c, p, {
        versions: [{ recordType, versionId: change.versionId }],
        evidence: {
          kind: 'reference',
          what: syntheticName('CA approval letter'),
          givenBy: syntheticName('CA'),
          givenOn: postingFixture.today(),
          keptAt: syntheticName('Accounts file'),
        },
      }),
    ),
  );
  const decided = await postingFixture.decide(change.requestId ?? '', change.versionId);
  if (decided.kind !== 'success') throw new Error(`The synthetic books decision was refused: ${decided.refusal.code}`);
}
const postingAccounts: Record<string, string> = {};
for (const [code, nature, name] of [
  ['SYN-INV', 'asset', 'SYNTHETIC Stock in cost pools'],
  ['SYN-TRN', 'asset', 'SYNTHETIC Value held on a dispatch'],
  ['SYN-PUR', 'liability', 'SYNTHETIC Purchase clearing'],
] as const) {
  const change = postingOutcome(
    await postingFixture.asPreparerDo((c, p) =>
      postingFixture.books.prepareAccount(c, p, {
        bookId: postingBook.recordId,
        code,
        nature,
        origin: 'synthetic',
        name,
        validFrom: postingFixture.today(),
      }),
    ),
  );
  await postingInForce(change, 'finance.account');
  postingAccounts[code] = change.recordId;
}
const postingPeriod = postingOutcome(
  await postingFixture.asPreparerDo((c, p) =>
    postingFixture.books.definePeriod(c, p, postingBook.recordId, {
      code: syntheticCode('JOURNEY-P1'),
      financialYear: syntheticCode('FY-JOURNEY'),
      firstDay: postingFixture.today(),
      lastDay: postingFixture.day(29),
    }),
  ),
);
await postingFixture.run(postingFixture.preparer.id, async (c) => {
  await postingFixture.numbering.defineFormatVersion(c, syntheticCode('JOURNEY-JV'), [
    { kind: 'text', text: 'SYN-JV-' },
    { kind: 'year' },
    { kind: 'text', text: '-' },
    { kind: 'sequence', width: 5 },
  ]);
  const series = await postingFixture.numbering.defineSeries(c, {
    kind: JOURNAL_KIND.kind,
    scopeKey: postingBook.recordId,
    financialYear: syntheticCode('FY-JOURNEY'),
    displayScopeKey: postingBook.recordId,
    formatCode: syntheticCode('JOURNEY-JV'),
  });
  if (series.kind !== 'done') throw new Error(`The synthetic journal series was refused: ${series.refusal.code}`);
});
const postingLine = (component: string, side: 'debit' | 'credit', code: string) => ({
  component,
  side,
  accountId: postingAccounts[code] ?? '',
  requiresStore: false,
  requiresBrand: false,
});
await postingInForce(
  postingOutcome(
    await postingFixture.asPreparerDo((c, p) =>
      postingFixture.books.preparePostingMap(c, p, {
        bookId: postingBook.recordId,
        eventKind: POSTING_JOURNEY_KIND.kind,
        origin: 'synthetic',
        validFrom: postingFixture.today(),
        lines: [
          postingLine('to-pool', 'debit', 'SYN-INV'),
          postingLine('to-pool', 'credit', 'SYN-PUR'),
          postingLine('to-dispatch', 'debit', 'SYN-TRN'),
          postingLine('to-dispatch', 'credit', 'SYN-PUR'),
        ],
      }),
    ),
  ),
  'finance.posting_map',
);
{
  const request = {
    sourceModule: 'test-synthetic',
    document: { recordType: 'test-synthetic.document', recordId: uuidv7(), importKind: 'none' as const },
    actor: { kind: 'user' as const, id: postingFixture.preparer.id },
    items: [
      [postingStoreUnit.recordId, 100_000],
      [postingWarehouse.recordId, 50_000],
    ].map(([businessUnitId, amount]) => ({
      itemKey: uuidv7(),
      eventKind: POSTING_JOURNEY_KIND.kind,
      businessUnitId: String(businessUnitId),
      brandId: null,
      businessDate: postingFixture.today(),
      components: [{ component: 'to-pool', amount: known(paise(Number(amount))) }],
    })),
  };
  const result = await postingFixture.run(postingFixture.preparer.id, async (context) => {
    const checks = await postingFixture.books.checkPostable(context, request);
    const held = await postingFixture.books.holdPeriods(context, checks);
    if (held.kind === 'refused') throw new Error(held.refusal.code);
    await context.lock(LOCK_STEP.numberSeries, held.seriesTargets);
    return postingFixture.books.post(context, request);
  });
  if (result.kind !== 'posted') throw new Error(`The synthetic journals were not posted: ${JSON.stringify(result)}`);
}
// The period close journey (period-close.spec.ts; S1-F09-T03), in the posting Organisation: a SYNTHETIC book of its
// own, so the posting maps journey's trial balance is untouched, with a warehouse unit at the posting Site mapped to
// it, its accounts in force, two Open periods of ten days from today, its journal series and a map in force; and a
// SYNTHETIC document that a reopening will name as its correction, posted mid-journey by the harness below, which
// stands for the module that owns the document (DEC-112 H2). The fixture stays open for it until the server stops.
const periodBookCode = syntheticCode('JOURNEY-CLOSE-BK');
const periodBookName = syntheticName('Journey Period Close Book');
const periodBook = await approved(postingFixture, (c, p) =>
  postingFixture.organisation.prepareAccountingBook(c, p, {
    code: periodBookCode,
    legalEntityId: postingEntity.recordId,
    name: periodBookName,
    validFrom: postingFixture.today(),
  }),
);
const periodUnit = await approved(postingFixture, (c, p) =>
  postingFixture.organisation.prepareBusinessUnit(c, p, {
    code: syntheticCode('JOURNEY-CLOSE-WAREHOUSE'),
    name: syntheticName('Journey Period Close Warehouse'),
    siteId: postingSite.recordId,
    kind: 'warehouse',
    legalEntityId: postingEntity.recordId,
    taxRegistrationId: postingRegistration.recordId,
    accountingBookId: periodBook.recordId,
    origin: 'synthetic',
    validFrom: postingFixture.today(),
  }),
);
const periodAccounts: Record<string, string> = {};
for (const [code, nature] of [
  ['SYN-CL-INV', 'asset'],
  ['SYN-CL-PUR', 'liability'],
] as const) {
  const change = postingOutcome(
    await postingFixture.asPreparerDo((c, p) =>
      postingFixture.books.prepareAccount(c, p, {
        bookId: periodBook.recordId,
        code,
        nature,
        origin: 'synthetic',
        name: syntheticName(`Period close ${code}`),
        validFrom: postingFixture.today(),
      }),
    ),
  );
  await postingInForce(change, 'finance.account');
  periodAccounts[code] = change.recordId;
}
const periodCodes = [syntheticCode('JOURNEY-CLOSE-P1'), syntheticCode('JOURNEY-CLOSE-P2')] as const;
for (const [index, code] of periodCodes.entries()) {
  postingOutcome(
    await postingFixture.asPreparerDo((c, p) =>
      postingFixture.books.definePeriod(c, p, periodBook.recordId, {
        code,
        financialYear: syntheticCode('FY-JOURNEY'),
        firstDay: postingFixture.day(index * 10),
        lastDay: postingFixture.day(index * 10 + 9),
      }),
    ),
  );
}
await postingFixture.run(postingFixture.preparer.id, async (c) => {
  const series = await postingFixture.numbering.defineSeries(c, {
    kind: JOURNAL_KIND.kind,
    scopeKey: periodBook.recordId,
    financialYear: syntheticCode('FY-JOURNEY'),
    displayScopeKey: periodBook.recordId,
    formatCode: syntheticCode('JOURNEY-JV'),
  });
  if (series.kind !== 'done') throw new Error(`The synthetic journal series was refused: ${series.refusal.code}`);
});
const periodLine = (component: string, side: 'debit' | 'credit', code: string) => ({
  component,
  side,
  accountId: periodAccounts[code] ?? '',
  requiresStore: false,
  requiresBrand: false,
});
await postingInForce(
  postingOutcome(
    await postingFixture.asPreparerDo((c, p) =>
      postingFixture.books.preparePostingMap(c, p, {
        bookId: periodBook.recordId,
        eventKind: POSTING_JOURNEY_KIND.kind,
        origin: 'synthetic',
        validFrom: postingFixture.today(),
        lines: [
          periodLine('to-pool', 'debit', 'SYN-CL-INV'),
          periodLine('to-pool', 'credit', 'SYN-CL-PUR'),
          periodLine('to-dispatch', 'debit', 'SYN-CL-INV'),
          periodLine('to-dispatch', 'credit', 'SYN-CL-PUR'),
        ],
      }),
    ),
  ),
  'finance.posting_map',
);
const periodCorrection = { module: 'test-synthetic', recordType: 'test-synthetic.document', recordId: uuidv7() };
/** Posts the SYNTHETIC correction into the first period, as the module that owns it would (DEC-112 H2). */
async function postPeriodCorrection(): Promise<string> {
  const request = {
    sourceModule: periodCorrection.module,
    document: {
      recordType: periodCorrection.recordType,
      recordId: periodCorrection.recordId,
      importKind: 'none' as const,
    },
    actor: { kind: 'user' as const, id: postingFixture.preparer.id },
    items: [
      {
        itemKey: periodCorrection.recordId,
        eventKind: POSTING_JOURNEY_KIND.kind,
        businessUnitId: periodUnit.recordId,
        brandId: null,
        businessDate: postingFixture.today(),
        components: [{ component: 'to-pool', amount: known(paise(25_000)) }],
      },
    ],
  };
  const result = await postingFixture.run(postingFixture.preparer.id, async (context) => {
    const checks = await postingFixture.books.checkPostable(context, request);
    if (checks.some((each) => each.kind === 'refused')) return { kind: 'refused' as const, checks };
    const held = await postingFixture.books.holdPeriods(context, checks);
    if (held.kind === 'refused') return { kind: 'refused' as const, refusal: held.refusal };
    await context.lock(LOCK_STEP.numberSeries, held.seriesTargets);
    return postingFixture.books.post(context, request);
  });
  return JSON.stringify(result);
}
// The posting maps journey's people (S1-F09-T02): an Accounts user who prepares a map version and attaches the CA's
// evidence file, a different Accounts user who decides it from My work, and a reader of journals scoped to the one Store.
const postingBookView = { recordType: 'organisation.accounting_book', action: 'view' as const };
/** An enrolled SYNTHETIC Accounts user of the posting Organisation holding the authorities given. */
async function postingUser(label: string, authorities: Parameters<typeof grantSynthetic>[2]): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(postingDatabase, postingCode, keys, {
    label,
    enrolled: true,
    personas: ['P-ACC'],
  });
  await grantSynthetic(postingDatabase, { kind: 'user', id: user.id }, authorities);
  return user;
}
const postingMapsPreparer = await postingUser('BROWSER-POSTING-PREPARER', [
  postingBookView,
  { recordType: 'finance.posting_map', action: 'view' },
  { recordType: 'finance.posting_map', action: 'edit' },
  // Approve too, so the refusal of their own version is for its preparation alone (POL-09.01; PRD-ACS-006).
  { recordType: 'finance.posting_map', action: 'approve' },
  { recordType: 'access.approval_reason', action: 'view' },
  { recordType: 'finance.account', action: 'view' },
  { recordType: 'finance.ca_approval_evidence', action: 'create' },
  { recordType: 'files_imports.stored_file', action: 'create' },
  { recordType: 'access.approval_request', action: 'view' },
]);
const postingMapsApprover = await postingUser('BROWSER-POSTING-APPROVER', [
  postingBookView,
  { recordType: 'finance.posting_map', action: 'view' },
  { recordType: 'finance.posting_map', action: 'approve' },
  { recordType: 'finance.account', action: 'view' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
const postingStoreReader = await writeSyntheticUser(postingDatabase, postingCode, keys, {
  label: 'BROWSER-POSTING-STORE-READER',
  enrolled: true,
  personas: ['P-ACC'],
});
await grantSynthetic(postingDatabase, { kind: 'user', id: postingStoreReader.id }, [
  postingBookView,
  { recordType: 'finance.financial_period', action: 'view' },
]);
await grantSynthetic(
  postingDatabase,
  { kind: 'user', id: postingStoreReader.id },
  [{ recordType: 'finance.journal', action: 'view' }],
  {
    scope: {
      kind: 'dimensions',
      legalEntity: { kind: 'all' },
      place: { kind: 'selected', members: [{ type: 'store', id: postingStore.recordId }] },
      brand: { kind: 'all' },
    },
  },
);
const postingReasonId = await writeSyntheticReason(postingDatabase, 'approve');
// The period close journey's people (S1-F09-T03): an Accounts user who locks the periods and requests a reopening,
// holding approve too, so that the refusal of their own approval is for their request alone (PRD-LED-019), and a
// different Accounts user who approves it from My work. SYNTHETIC grants: who may lock, request and approve is KDPS's
// (V-01).
const periodRequester = await postingUser('BROWSER-PERIOD-REQUESTER', [
  postingBookView,
  { recordType: 'finance.financial_period', action: 'view' },
  { recordType: 'finance.financial_period', action: 'edit' },
  { recordType: 'finance.period_reopening', action: 'view' },
  { recordType: 'finance.period_reopening', action: 'create' },
  { recordType: 'finance.period_reopening', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
const periodApprover = await postingUser('BROWSER-PERIOD-APPROVER', [
  postingBookView,
  { recordType: 'finance.financial_period', action: 'view' },
  { recordType: 'finance.period_reopening', action: 'view' },
  { recordType: 'finance.period_reopening', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
// The harness the journey asks to post the correction (code-house-rules 11.4: test code, composed only here), on a
// local port of its own beside the server of the journeys. It also answers `GET /ready` once the world file is
// written and the worker has delivered every event the fixtures recorded, which Playwright waits for: the API answers
// before the seeding done through it ends, so its health alone would let the journeys read a world file that is
// missing or left by an earlier run, and a journey would wait in My work behind other fixtures' approvals (code-house-
// rules 10.1; code review 7 of stage 2). And `GET /now`, the server's clock, the one the application runs on, which
// the journeys' times are taken from (e2e/support/clock.ts).
const harnessPort = port + 11;
let worldWritten = false;
const harness = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/ready') {
    response.writeHead(worldWritten ? 200 : 503).end();
    return;
  }
  if (request.method === 'GET' && request.url === '/now') {
    response.writeHead(200, { 'content-type': 'text/plain' }).end(new Date().toISOString());
    return;
  }
  if (request.method !== 'POST' || request.url !== '/post-period-correction') {
    response.writeHead(404).end();
    return;
  }
  postPeriodCorrection().then(
    (body) => response.writeHead(200, { 'content-type': 'application/json' }).end(body),
    (error: unknown) => response.writeHead(500).end(String(error)),
  );
});
await new Promise<void>((resolve) => harness.listen(harnessPort, '127.0.0.1', resolve));
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
// The classifications journey's own Admin and approver (organisation-classifications.spec.ts; S1-F02-T04).
const classifyAdmin = await provisionUser('BROWSER-CLASSIFY-ADMIN', 'P-ADM', adminAuthorities);
const classifyApprover = await provisionUser('BROWSER-CLASSIFY-APPROVER', 'P-OWN', approverAuthorities);
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

// The vocabularies journey's people (S1-F03-T01): a Booking user who reads the catalogue, proposes values and may
// confirm another person's, and a different person who confirms from My work. Who holds which is KDPS's (V-01, RR-064).
const catalogueViews = [
  'merchandise.brand',
  'merchandise.category',
  'merchandise.size_set',
  'merchandise.attribute',
  'merchandise.vocabulary_value',
  'merchandise.vocabulary_proposal',
].map((recordType) => ({ recordType, action: 'view' as const }));
const vocabularyBooking = await provisionUser('BROWSER-VOCABULARY-BOOKING', 'P-BKG', [
  ...catalogueViews,
  { recordType: 'merchandise.vocabulary_proposal', action: 'create' },
  { recordType: 'merchandise.vocabulary_proposal', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
const vocabularyConfirmer = await provisionUser('BROWSER-VOCABULARY-CONFIRMER', 'P-BKG', [
  ...catalogueViews,
  { recordType: 'merchandise.vocabulary_proposal', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);

// The season and size attributes journey's people (season-and-size-attributes.spec.ts; structure-and-masters 4.2 "As
// built"; RR-556): an Admin (P-ADM) who marks the SYNTHETIC size list as the size list on Setup › Vocabularies and may approve too,
// so the refusal of their own is for their preparation alone (POL-02.07); and the Owner (P-OWN), who approves it from
// My work. No size attribute is marked in this Organisation before the journey. SYNTHETIC grants: who holds each is
// the product owner's to name (V-01).
const markingViews = [
  ...catalogueViews,
  { recordType: 'merchandise.marked_attribute', action: 'view' as const },
  { recordType: 'access.approval_request', action: 'view' as const },
  { recordType: 'access.approval_reason', action: 'view' as const },
];
const markingAdmin = await provisionUser('BROWSER-MARKING-ADMIN', 'P-ADM', [
  ...markingViews,
  { recordType: 'merchandise.marked_attribute', action: 'edit' },
  { recordType: 'merchandise.marked_attribute', action: 'approve' },
]);
const markingOwner = await provisionUser('BROWSER-MARKING-OWNER', 'P-OWN', [
  ...markingViews,
  { recordType: 'merchandise.marked_attribute', action: 'approve' },
]);

// The products journey's people (S1-F03-T02): a Booking user who reads the catalogue, proposes products and may
// confirm another person's, and a different person who confirms from My work and reads the SKUs. Who holds which is
// KDPS's (V-01, RR-064).
const productViews = [
  'merchandise.brand',
  'merchandise.category',
  'merchandise.size_set',
  'merchandise.attribute',
  'merchandise.vocabulary_value',
  'merchandise.style',
  'merchandise.sku',
  'merchandise.pack',
  'merchandise.external_code',
  'merchandise.product_proposal',
].map((recordType) => ({ recordType, action: 'view' as const }));
const productsBooking = await provisionUser('BROWSER-PRODUCTS-BOOKING', 'P-BKG', [
  ...productViews,
  // Edit, so they record a style's later version with its attribute values (S1-F03 review S1).
  { recordType: 'merchandise.style', action: 'edit' },
  { recordType: 'merchandise.product_proposal', action: 'create' },
  // Approve too, so the refusal of their own proposal is for the proposal alone (DM-5, DEC-105).
  { recordType: 'merchandise.product_proposal', action: 'approve' },
  // Create on codes, so they map one brand barcode to both SKUs and see it flagged as repeated (S2-F04-T01).
  { recordType: 'merchandise.external_code', action: 'create' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
const productsConfirmer = await provisionUser('BROWSER-PRODUCTS-CONFIRMER', 'P-BKG', [
  ...productViews,
  { recordType: 'merchandise.product_proposal', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);

// The open-to-buy journey's people (open-to-buy.spec.ts; goods-in 3.3, section 11; POL-05.09; S2-F01-T02): a Booking
// user who prepares a budget for the products journey's SYNTHETIC brand and season, and may check and approve too, so
// each refusal of their own is for their preparation alone (POL-02.07); Accounts, who records the check from My work;
// and the Owner, who approves it there. SYNTHETIC grants: who holds each is the product owner's to name (V-01).
const openToBuyReads = [
  { recordType: 'booking.open_to_buy_budget', action: 'view' as const },
  { recordType: 'access.approval_request', action: 'view' as const },
  { recordType: 'access.approval_reason', action: 'view' as const },
];
const openToBuyBooking = await provisionUser('BROWSER-OPEN-TO-BUY-BOOKING', 'P-BKG', [
  ...openToBuyReads,
  ...['merchandise.brand', 'merchandise.marked_attribute', 'merchandise.vocabulary_value'].map((recordType) => ({
    recordType,
    action: 'view' as const,
  })),
  { recordType: 'booking.open_to_buy_budget', action: 'create' },
  { recordType: 'booking.open_to_buy_budget', action: 'edit' },
  { recordType: 'booking.open_to_buy_budget', action: 'approve' },
  { recordType: 'booking.open_to_buy_check', action: 'approve' },
]);
const openToBuyAccounts = await provisionUser('BROWSER-OPEN-TO-BUY-ACCOUNTS', 'P-ACC', [
  ...openToBuyReads,
  { recordType: 'booking.open_to_buy_check', action: 'view' },
  { recordType: 'booking.open_to_buy_check', action: 'approve' },
]);
const openToBuyOwner = await provisionUser('BROWSER-OPEN-TO-BUY-OWNER', 'P-OWN', [
  ...openToBuyReads,
  { recordType: 'booking.open_to_buy_budget', action: 'approve' },
]);
const openToBuyReasonId = await writeSyntheticReason(settingsDatabase, 'approve');

// The file intake journey (file-intake.spec.ts; S1-F06-T01), in the posting maps journey's Organisation, where its
// catalogue, layout and series are recorded above: a Booking user who uploads the SYNTHETIC product file, stages it
// with the one SYNTHETIC saved layout and mapping, validates and publishes it. Its SYNTHETIC category has no size set,
// so the file's one SKU has an Unknown size. The importer holds every
// restricted class, since a file whose layout is not confirmed counts as holding them all (imports-and-opening-data
// 11). Every value is SYNTHETIC.
const intakeBooking = await writeSyntheticUser(postingDatabase, postingCode, keys, {
  label: 'BROWSER-INTAKE-BOOKING',
  enrolled: true,
  personas: ['P-BKG'],
});
await grantSynthetic(
  postingDatabase,
  { kind: 'user', id: intakeBooking.id },
  [
    { recordType: 'files_imports.stored_file', action: 'create' },
    { recordType: 'files_imports.import_batch', action: 'view' },
    { recordType: 'files_imports.import_batch', action: 'create' },
    { recordType: 'files_imports.import_batch', action: 'edit' },
    ...productViews,
    { recordType: 'merchandise.product_proposal', action: 'create' },
    { recordType: 'access.approval_request', action: 'view' },
    // Layouts, mappings and mapping rules, proposed by the Booking user (S1-F06-T03).
    { recordType: 'files_imports.layout', action: 'view' },
    { recordType: 'files_imports.layout', action: 'create' },
    { recordType: 'files_imports.mapping', action: 'view' },
    { recordType: 'files_imports.mapping', action: 'create' },
    { recordType: 'files_imports.mapping_rule', action: 'view' },
    { recordType: 'files_imports.mapping_rule', action: 'create' },
  ],
  { fieldClasses: fieldClassSchema.options.map((fieldClass) => ({ fieldClass, access: 'view' as const })) },
);
// The mapping rule journey's own Booking user, so the two journeys never share an authenticator (S1-F06-T03).
const ruleBooking = await writeSyntheticUser(postingDatabase, postingCode, keys, {
  label: 'BROWSER-RULE-BOOKING',
  enrolled: true,
  personas: ['P-BKG'],
});
await grantSynthetic(postingDatabase, { kind: 'user', id: ruleBooking.id }, [
  { recordType: 'files_imports.import_batch', action: 'view' },
  { recordType: 'files_imports.mapping_rule', action: 'view' },
  { recordType: 'files_imports.mapping_rule', action: 'create' },
  // Approve too, so the panel refuses their own proposal as their own, not for a missing permission (POL-02.07).
  { recordType: 'files_imports.mapping_rule', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
]);
// A different person who confirms them from My work (6.4; POL-02.07; S1-F06-T03). Who confirms is KDPS's (RR-197).
const intakeConfirmer = await writeSyntheticUser(postingDatabase, postingCode, keys, {
  label: 'BROWSER-INTAKE-CONFIRMER',
  enrolled: true,
  personas: ['P-ADM'],
});
await grantSynthetic(postingDatabase, { kind: 'user', id: intakeConfirmer.id }, [
  { recordType: 'files_imports.layout', action: 'view' },
  { recordType: 'files_imports.layout', action: 'approve' },
  { recordType: 'files_imports.mapping', action: 'view' },
  { recordType: 'files_imports.mapping', action: 'approve' },
  { recordType: 'files_imports.mapping_rule', action: 'view' },
  { recordType: 'files_imports.mapping_rule', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
const intakeSuffix = randomBytes(3).toString('hex').toUpperCase();
const intakeStyle = syntheticCode(`JOURNEY-INTAKE-STYLE-${intakeSuffix}`);
const intakeSku = syntheticCode(`JOURNEY-INTAKE-SKU-${intakeSuffix}`);
const intakeFile = join(dirname(worldFile), syntheticProductFileName('journey-products'));
mkdirSync(dirname(worldFile), { recursive: true });
writeFileSync(
  intakeFile,
  await syntheticProductWorkbook(
    [
      {
        'Style code': intakeStyle,
        'SKU code': intakeSku,
        'Brand code': intakeBrand.code,
        'Category code': intakeCategory.code,
        Size: undefined,
        'Stock unit': 'piece',
        Purpose: 'merchandise',
      },
    ],
    intakeSuffix,
  ),
);

// The intake refusal journeys (S1-F06-T02; imports-and-opening-data 9.3, 11): a Booking user of their own whose
// workbook holding a macro project is refused before it is stored, then stores a clean copy; and a Booking user who
// is not granted the class cost, who stages a file of a Confirmed layout with a cost column and sees cost masked.
// The costed layout reads a sheet of its own, so the intake journey's file still matches one saved layout. Every
// value is SYNTHETIC.
const intakeGrants = [
  { recordType: 'files_imports.stored_file', action: 'create' as const },
  { recordType: 'files_imports.import_batch', action: 'view' as const },
  { recordType: 'files_imports.import_batch', action: 'create' as const },
  { recordType: 'files_imports.import_batch', action: 'edit' as const },
  { recordType: 'files_imports.layout', action: 'view' as const },
  { recordType: 'files_imports.mapping', action: 'view' as const },
  ...productViews,
];
const refusalBooking = await writeSyntheticUser(postingDatabase, postingCode, keys, {
  label: 'BROWSER-REFUSAL-BOOKING',
  enrolled: true,
  personas: ['P-BKG'],
});
await grantSynthetic(postingDatabase, { kind: 'user', id: refusalBooking.id }, intakeGrants, {
  fieldClasses: fieldClassSchema.options.map((fieldClass) => ({ fieldClass, access: 'view' as const })),
});
const refusalClean = await syntheticProductWorkbook(
  [
    {
      'Style code': syntheticCode(`JOURNEY-REFUSAL-STYLE-${intakeSuffix}`),
      'SKU code': syntheticCode(`JOURNEY-REFUSAL-SKU-${intakeSuffix}`),
      'Brand code': intakeBrand.code,
      'Category code': intakeCategory.code,
      Size: undefined,
      'Stock unit': 'piece',
      Purpose: 'merchandise',
    },
  ],
  `REFUSAL-${intakeSuffix}`,
);
const refusalMacroFile = join(dirname(worldFile), syntheticProductFileName('journey-macro'));
writeFileSync(
  refusalMacroFile,
  withParts(refusalClean, { 'xl/vbaProject.bin': Buffer.from('SYNTHETIC macro project') }),
);
const refusalCleanFile = join(dirname(worldFile), syntheticProductFileName('journey-clean'));
writeFileSync(refusalCleanFile, refusalClean);

const costReader = await writeSyntheticUser(postingDatabase, postingCode, keys, {
  label: 'BROWSER-COST-READER',
  enrolled: true,
  personas: ['P-BKG'],
});
await grantSynthetic(postingDatabase, { kind: 'user', id: costReader.id }, intakeGrants, {
  fieldClasses: fieldClassSchema.options
    .filter((fieldClass) => fieldClass !== 'cost')
    .map((fieldClass) => ({ fieldClass, access: 'view' as const })),
});
const costedSheet = 'SYNTHETIC Costed Products';
const costedLayoutCode = syntheticCode('JOURNEY-COSTED-LAYOUT');
const costedMappingCode = syntheticCode('JOURNEY-COSTED-MAPPING');
await writeSyntheticLayout(
  postingDatabase,
  {
    layoutCode: costedLayoutCode,
    mappingCode: costedMappingCode,
    structure: {
      ...SYNTHETIC_PRODUCT_LAYOUT,
      sheet: costedSheet,
      columns: [
        ...SYNTHETIC_PRODUCT_LAYOUT.columns,
        { name: 'Cost', required: false, type: 'money', restrictedClass: 'cost' },
      ],
    },
    fields: SYNTHETIC_PRODUCT_MAPPING,
  },
  postingFixture.preparer.id,
  postingFixture.approver.id,
);
const costStyle = syntheticCode(`JOURNEY-COST-STYLE-${intakeSuffix}`);
const costValue = `${String(100_000 + randomBytes(2).readUInt16BE(0))}.37`;
const costFile = join(dirname(worldFile), syntheticProductFileName('journey-costed'));
writeFileSync(
  costFile,
  await syntheticWorkbook({
    sheet: costedSheet,
    header: [...SYNTHETIC_PRODUCT_COLUMNS, 'Cost'],
    rows: [
      [
        costStyle,
        syntheticCode(`JOURNEY-COST-SKU-${intakeSuffix}`),
        intakeBrand.code,
        intakeCategory.code,
        null,
        'piece',
        'merchandise',
        Number(costValue),
      ],
    ],
    marker: `COSTED-${intakeSuffix}`,
  }),
);

// The duplicate journey (import-duplicates.spec.ts; S1-F06-T04), in the same Organisation: its own Booking user, so no
// two journeys share an authenticator, and two SYNTHETIC product files: the first with one style, the second with
// that style again, unchanged, and a new one. After the first is published, the second's repeat is a duplicate
// (imports-and-opening-data 7.2). Every value is SYNTHETIC.
const duplicateBooking = await writeSyntheticUser(postingDatabase, postingCode, keys, {
  label: 'BROWSER-DUPLICATE-BOOKING',
  enrolled: true,
  personas: ['P-BKG'],
});
const importerGrants = [
  { recordType: 'files_imports.stored_file', action: 'create' as const },
  { recordType: 'files_imports.import_batch', action: 'view' as const },
  { recordType: 'files_imports.import_batch', action: 'create' as const },
  { recordType: 'files_imports.import_batch', action: 'edit' as const },
  ...productViews,
  { recordType: 'merchandise.product_proposal', action: 'create' as const },
  { recordType: 'files_imports.layout', action: 'view' as const },
  { recordType: 'files_imports.mapping', action: 'view' as const },
];
await grantSynthetic(postingDatabase, { kind: 'user', id: duplicateBooking.id }, importerGrants, {
  fieldClasses: fieldClassSchema.options.map((fieldClass) => ({ fieldClass, access: 'view' as const })),
});
const duplicateSuffix = randomBytes(3).toString('hex').toUpperCase();
const duplicateRow = (style: string, sku: string) => ({
  'Style code': style,
  'SKU code': sku,
  'Brand code': intakeBrand.code,
  'Category code': intakeCategory.code,
  Size: undefined,
  'Stock unit': 'piece',
  Purpose: 'merchandise',
});
const duplicateStyle = syntheticCode(`JOURNEY-DUP-STYLE-${duplicateSuffix}`);
const duplicateNewStyle = syntheticCode(`JOURNEY-DUP-NEW-${duplicateSuffix}`);
const duplicateFirstFile = join(dirname(worldFile), syntheticProductFileName('journey-duplicate-first'));
const duplicateSecondFile = join(dirname(worldFile), syntheticProductFileName('journey-duplicate-second'));
const duplicateSku = syntheticCode(`JOURNEY-DUP-SKU-${duplicateSuffix}`);
writeFileSync(
  duplicateFirstFile,
  await syntheticProductWorkbook([duplicateRow(duplicateStyle, duplicateSku)], `${duplicateSuffix}A`),
);
writeFileSync(
  duplicateSecondFile,
  await syntheticProductWorkbook(
    [
      duplicateRow(duplicateStyle, duplicateSku),
      duplicateRow(duplicateNewStyle, syntheticCode(`JOURNEY-DUP-SKU2-${duplicateSuffix}`)),
    ],
    `${duplicateSuffix}B`,
  ),
);
// The import outcomes report journey (import-duplicates.spec.ts; S1-F06-T04): two SYNTHETIC Stores at a SYNTHETIC
// Site, a batch for each, started through the API once the server listens by a seeding importer, and a reader whose
// assignment covers only the first Store, who sees only its batch (imports-and-opening-data 14; PRD-SEC-005).
const outcomesSite = uuidv7();
const outcomesStores = [uuidv7(), uuidv7()] as const;
await writeSyntheticSites(postingDatabase, [outcomesSite]);
{
  const owner = await connect(postingDatabase, 'migration');
  try {
    for (const [index, store] of outcomesStores.entries()) {
      await owner.query('insert into organisation.store (id, code) values ($1, $2)', [
        store,
        syntheticCode(`JOURNEY-OUTCOMES-STORE-${String(index + 1)}-${duplicateSuffix}`),
      ]);
      await owner.query(
        `insert into organisation.store_version (id, store_id, name, format, operating_model, site_id, status,
           valid_during, decision, prepared_by_user_id)
         values ($1, $2, $3, 'mbo', 'company-owned', $4, 'Active', '[2000-01-01,)', 'Approved', $5)`,
        [uuidv7(), store, syntheticName(`Journey Outcomes Store ${String(index + 1)}`), outcomesSite, uuidv7()],
      );
    }
  } finally {
    await owner.end();
  }
}
const outcomesSeeder = await writeSyntheticUser(postingDatabase, postingCode, keys, {
  label: 'BROWSER-OUTCOMES-SEEDER',
  enrolled: true,
  personas: ['P-BKG'],
});
await grantSynthetic(postingDatabase, { kind: 'user', id: outcomesSeeder.id }, importerGrants, {
  fieldClasses: fieldClassSchema.options.map((fieldClass) => ({ fieldClass, access: 'view' as const })),
});
const outcomesReader = await writeSyntheticUser(postingDatabase, postingCode, keys, {
  label: 'BROWSER-OUTCOMES-READER',
  enrolled: true,
  personas: ['P-STM'],
});
await grantSynthetic(
  postingDatabase,
  { kind: 'user', id: outcomesReader.id },
  [{ recordType: 'files_imports.import_batch', action: 'view' }],
  {
    scope: {
      kind: 'dimensions',
      legalEntity: { kind: 'all' },
      place: { kind: 'selected', members: [{ type: 'store', id: outcomesStores[0] }] },
      brand: { kind: 'all' },
    },
  },
);

// The opening publish journey (opening-publish.spec.ts; S1-F13-T03; imports-and-opening-data 4.2, 10.1, 17 test 22;
// stage 1 exit check 5): in this Organisation, where policy 14 is not signed, the opening manifest layout Confirmed by
// a different person from its proposer, and a preparer of opening batches who starts one through the API once the
// server listens, at the posting journey's Store unit, which has no approved switch. Publish shows unavailable, naming
// what is missing. The handler is the test-only one, composed into this test server only (GC6-18; DEC-116). Every
// value is SYNTHETIC.
const openingLayout = await writeSyntheticLayout(
  postingDatabase,
  {
    layoutCode: OPENING_LAYOUT_CODES.manifest.layout,
    mappingCode: OPENING_LAYOUT_CODES.manifest.mapping,
    structure: MANIFEST_LAYOUT,
    fields: MANIFEST_MAPPING,
    target: OPENING_STOCK_TARGET,
    kinds: ['opening-balance'],
    documentType: 'opening-stock',
  },
  postingFixture.preparer.id,
  postingFixture.approver.id,
);
// The test handler answers the unit's switch from the test-only stand-in of the test migration set (code-house-rules
// 11.4), applied here to this Organisation's database only, as the migration role; this file runs from
// dist-browser/test/browser, beside no copy of the set, so it reads the source's.
{
  const owner = await connect(postingDatabase, 'migration');
  try {
    await owner.query(
      readFileSync(
        fileURLToPath(new URL('../../../test/migrations/0005__test-opening-stock__switch.sql', import.meta.url)),
        'utf8',
      ),
    );
  } finally {
    await owner.end();
  }
}
// The preparer the journey signs in as, and a seeder of its own who starts the batch, so the journey's authenticator
// code is never one the seeding used (access-and-approvals 3.3).
const openingPreparer = await writeSyntheticUser(postingDatabase, postingCode, keys, {
  label: 'BROWSER-OPENING-PREPARER',
  enrolled: true,
  personas: ['P-OPS'],
});
const openingSeeder = await writeSyntheticUser(postingDatabase, postingCode, keys, {
  label: 'BROWSER-OPENING-SEEDER',
  enrolled: true,
  personas: ['P-OPS'],
});
for (const user of [openingPreparer, openingSeeder]) {
  await grantSynthetic(
    postingDatabase,
    { kind: 'user', id: user.id },
    [
      { recordType: 'files_imports.stored_file', action: 'create' },
      { recordType: 'files_imports.import_batch', action: 'view' },
      { recordType: 'files_imports.import_batch', action: 'create' },
      { recordType: 'files_imports.import_batch', action: 'edit' },
      { recordType: 'files_imports.layout', action: 'view' },
      { recordType: 'files_imports.mapping', action: 'view' },
    ],
    { fieldClasses: fieldClassSchema.options.map((fieldClass) => ({ fieldClass, access: 'view' as const })) },
  );
}

// The bank details journey's people (S1-F03-T03): a person who prepares a supplier's bank-detail change, holding the
// class bank-details to write it, and a different person who approves it from My work and shows the details with the
// class to read them. Who holds which is KDPS's (V-01, RR-064).
const bankPreparer = await writeSyntheticUser(settingsDatabase, settingsCode, keys, {
  label: 'BROWSER-BANK-PREPARER',
  enrolled: true,
  personas: ['P-ACC'],
});
await grantSynthetic(
  settingsDatabase,
  { kind: 'user', id: bankPreparer.id },
  [
    { recordType: 'merchandise.party', action: 'view' },
    { recordType: 'merchandise.party_bank_details', action: 'view' },
    { recordType: 'merchandise.party_bank_details', action: 'edit' },
    // Approve too, so the refusal of their own change is for the preparation alone (PRD-ACS-006).
    { recordType: 'merchandise.party_bank_details', action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
    { recordType: 'access.approval_reason', action: 'view' },
  ],
  { fieldClasses: [{ fieldClass: 'bank-details', access: 'view-and-edit' }] },
);
const bankApprover = await writeSyntheticUser(settingsDatabase, settingsCode, keys, {
  label: 'BROWSER-BANK-APPROVER',
  enrolled: true,
  personas: ['P-OWN'],
});
await grantSynthetic(
  settingsDatabase,
  { kind: 'user', id: bankApprover.id },
  [
    { recordType: 'merchandise.party', action: 'view' },
    { recordType: 'merchandise.party_bank_details', action: 'view' },
    { recordType: 'merchandise.party_bank_details', action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
    { recordType: 'access.approval_reason', action: 'view' },
  ],
  { fieldClasses: [{ fieldClass: 'bank-details', access: 'view' }] },
);

// The agreement journey's people (S2-F01-T01): Booking, who prepares an agreement with a supplier, and a different
// person who approves it from My work. Who holds which is the product owner's to decide, with facts from KDPS
// (DEC-125; V-01, RR-064); these SYNTHETIC grants decide nothing.
const agreementPreparer = await writeSyntheticUser(settingsDatabase, settingsCode, keys, {
  label: 'BROWSER-AGREEMENT-PREPARER',
  enrolled: true,
  personas: ['P-BKG'],
});
await grantSynthetic(settingsDatabase, { kind: 'user', id: agreementPreparer.id }, [
  { recordType: 'merchandise.party', action: 'view' },
  { recordType: 'merchandise.brand', action: 'view' },
  { recordType: 'merchandise.agreement', action: 'view' },
  { recordType: 'merchandise.agreement', action: 'create' },
  { recordType: 'merchandise.agreement', action: 'edit' },
  { recordType: 'access.approval_request', action: 'view' },
]);
const agreementApprover = await writeSyntheticUser(settingsDatabase, settingsCode, keys, {
  label: 'BROWSER-AGREEMENT-APPROVER',
  enrolled: true,
  personas: ['P-OWN'],
});
await grantSynthetic(settingsDatabase, { kind: 'user', id: agreementApprover.id }, [
  { recordType: 'merchandise.agreement', action: 'view' },
  { recordType: 'merchandise.agreement', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);

// The exceptions journey (exceptions.spec.ts; S1-F08-T02), in the settings Organisation, whose worker identities the
// setup step wrote: the test-only raising module's schema (code-house-rules 11.4), a SYNTHETIC exception-code series,
// a SYNTHETIC rule routing its SYNTHETIC type at no Site to an enrolled Operations user, approved here as a fixture
// (code-house-rules 11.2), and one exception raised on a test document that is not resolved, so closing is refused.
await createTestExceptionsSchema(settingsDatabase);
const exceptionsOps = await provisionUser('BROWSER-EXCEPTIONS-OPS', 'P-OPS', [
  { recordType: 'exceptions.exception', action: 'view' },
]);
// The evidence journey (evidence.spec.ts; S1-F08-T03): an Operations user of its own, who owns a SYNTHETIC exception
// at a Site of its own and adds a SYNTHETIC photograph to it (journeys run at once, and an authenticator code is taken
// once, so two journeys never sign in as one person); an Admin who prepares an exception rule change, here through the
// API once the server listens; and an approver who decides it with a SYNTHETIC PDF as evidence and an approve reason
// of its own in force.
const evidenceOps = await provisionUser('BROWSER-EVIDENCE-OPS', 'P-OPS', [
  { recordType: 'exceptions.exception', action: 'view' },
  { recordType: 'files_imports.stored_file', action: 'create' },
]);
const evidenceSite = uuidv7();
const evidenceRulesAdmin = await provisionUser('BROWSER-EVIDENCE-RULES', 'P-ADM', [
  { recordType: 'exceptions.exception_routing', action: 'view' },
  { recordType: 'exceptions.exception_routing', action: 'edit' },
]);
const evidenceApprover = await provisionUser('BROWSER-EVIDENCE-APPROVER', 'P-OWN', [
  { recordType: 'exceptions.exception_routing', action: 'view' },
  { recordType: 'exceptions.exception_routing', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
  { recordType: 'files_imports.stored_file', action: 'create' },
]);
const evidenceReasonId = await writeSyntheticReason(settingsDatabase, 'approve');
const fixtureLog = capturingLogger();
const fixtureRouter = new OrganisationRouter(
  { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 2 },
  fixtureLog.logger,
);
const fixtureRunner = new CommandRunner({
  clock: { now: () => new Date() },
  timezones: syntheticTimezone,
  logger: fixtureLog.logger,
});
const fixtureNumbering = new Numbering({ kinds: [EXCEPTION_CODE_KIND] });
const fixtureExceptions = new Exceptions({
  numbering: fixtureNumbering,
  inbox: new Inbox(),
  audit: new Audit(fixtureLog.logger),
  types: [syntheticMismatch],
});
const settingsRouted = await fixtureRouter.resolveForSignIn(settingsCode);
if (!settingsRouted.routed) throw new Error('The settings Organisation was not routed');
const fixtureCommand = <T>(work: Parameters<typeof fixtureRunner.run<T>>[1]) =>
  fixtureRunner.run(
    {
      commandName: 'test-syn-exceptions.fixture',
      organisation: settingsRouted.organisation,
      correlationId: newCorrelationId(),
      actor: { kind: 'actor', actorId: exceptionsOps.id },
    },
    work,
  );
await fixtureCommand((context) => defineSyntheticCodeSeries(context, fixtureNumbering));
const fixtureRouting = await fixtureCommand((context) =>
  fixtureExceptions.prepareRouting(
    context,
    { userId: exceptionsOps.id, roleAssignmentId: crypto.randomUUID() },
    {
      typeCode: syntheticMismatch.code,
      siteId: null,
      owner: { kind: 'user', userId: exceptionsOps.id },
      dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
      escalation: { kind: 'user', userId: exceptionsOps.id },
      validFrom: new Date().toISOString().slice(0, 10),
      origin: 'synthetic',
    },
  ),
);
if (fixtureRouting.kind !== 'done') throw new Error(`The synthetic rule was refused: ${fixtureRouting.refusal.code}`);
const evidenceRouting = await fixtureCommand((context) =>
  fixtureExceptions.prepareRouting(
    context,
    { userId: exceptionsOps.id, roleAssignmentId: crypto.randomUUID() },
    {
      typeCode: syntheticMismatch.code,
      siteId: evidenceSite,
      owner: { kind: 'user', userId: evidenceOps.id },
      dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
      escalation: { kind: 'user', userId: evidenceOps.id },
      validFrom: new Date().toISOString().slice(0, 10),
      origin: 'synthetic',
    },
  ),
);
if (evidenceRouting.kind !== 'done') throw new Error(`The evidence rule was refused: ${evidenceRouting.refusal.code}`);
const fixtureOwner = await connect(settingsDatabase, 'migration');
await fixtureOwner.query(
  `update exceptions.exception_routing_version set decision = 'Approved' where id = any($1::uuid[])`,
  [[fixtureRouting.value.versionId, evidenceRouting.value.versionId]],
);
await fixtureOwner.end();
const exceptionDocument = await fixtureCommand((context) => writeTestDocument(context));
const raisedException = await fixtureCommand((context) =>
  fixtureExceptions.raiseInOwnCommand(context, {
    raisingEvent: `${TEST_EXCEPTIONS_MODULE}.journey:${exceptionDocument}`,
    typeCode: syntheticMismatch.code,
    facts: { siteId: null, storeId: null, businessUnitId: null, brandId: null },
    links: [
      { module: TEST_EXCEPTIONS_MODULE, recordType: TEST_DOCUMENT_TYPE, recordId: exceptionDocument, versionId: null },
    ],
    exposure: { kind: 'unknown' },
    raisedBy: { kind: 'user', id: exceptionsOps.id },
  }),
);
if (raisedException.kind !== 'done')
  throw new Error(`The synthetic exception was refused: ${raisedException.refusal.code}`);
const evidenceDocument = await fixtureCommand((context) => writeTestDocument(context));
const evidenceException = await fixtureCommand((context) =>
  fixtureExceptions.raiseInOwnCommand(context, {
    raisingEvent: `${TEST_EXCEPTIONS_MODULE}.evidence-journey:${evidenceDocument}`,
    typeCode: syntheticMismatch.code,
    facts: { siteId: evidenceSite, storeId: null, businessUnitId: null, brandId: null },
    links: [
      { module: TEST_EXCEPTIONS_MODULE, recordType: TEST_DOCUMENT_TYPE, recordId: evidenceDocument, versionId: null },
    ],
    exposure: { kind: 'unknown' },
    // The fixture's commands run as the exceptions journey's user (code-house-rules 11.2).
    raisedBy: { kind: 'user', id: exceptionsOps.id },
  }),
);
if (evidenceException.kind !== 'done')
  throw new Error(`The evidence exception was refused: ${evidenceException.refusal.code}`);
// The live-update journey (live-updates.spec.ts; S1-F08-T04): an enrolled Operations user who owns, by a SYNTHETIC rule
// approved here as a fixture, the SYNTHETIC type at a SYNTHETIC Site; a person who may raise exceptions, whom the
// journey uses through the API while the Operations user watches My work; and an unresolved test document to link.
const liveSite = '01900000-0000-7000-8000-00000000b5e1';
const liveOps = await provisionUser('BROWSER-LIVE-OPS', 'P-OPS', [
  { recordType: 'exceptions.exception', action: 'view' },
]);
const liveRaiser = await provisionUser('BROWSER-LIVE-RAISER', 'P-OPS', [
  { recordType: 'exceptions.exception', action: 'view' },
  { recordType: 'exceptions.exception', action: 'create' },
]);
const liveRouting = await fixtureCommand((context) =>
  fixtureExceptions.prepareRouting(
    context,
    { userId: exceptionsOps.id, roleAssignmentId: crypto.randomUUID() },
    {
      typeCode: syntheticMismatch.code,
      siteId: liveSite,
      owner: { kind: 'user', userId: liveOps.id },
      dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
      escalation: { kind: 'user', userId: liveOps.id },
      validFrom: new Date().toISOString().slice(0, 10),
      origin: 'synthetic',
    },
  ),
);
if (liveRouting.kind !== 'done') throw new Error(`The live rule was refused: ${liveRouting.refusal.code}`);
const liveOwner = await connect(settingsDatabase, 'migration');
await liveOwner.query(`update exceptions.exception_routing_version set decision = 'Approved' where id = $1`, [
  liveRouting.value.versionId,
]);
await liveOwner.end();
const liveDocument = await fixtureCommand((context) => writeTestDocument(context));
// The operations view journey (operations-view.spec.ts; S1-F08-T04): an enrolled person holding view on `kernel.job`
// through a labelled SYNTHETIC role (who holds it is KDPS's: V-01, RR-064), and a SYNTHETIC consumer that always fails,
// handed one event, so its job exhausts its SYNTHETIC retries under the worker below.
const operationsViewer = await provisionUser('BROWSER-OPERATIONS', 'P-ADM', [
  { recordType: 'kernel.job', action: 'view' },
  // And backup status (S1-F14-T02): one SYNTHETIC complete backup recorded as the backup command records it, written
  // as the migration role, as a fixture (code-house-rules 11.2); no backup is taken here.
  { recordType: 'kernel.backup_record', action: 'view' },
  // And recovery status (S1-F14-T03): one SYNTHETIC restore, every check passed and reopened, recorded as the restore
  // and reopen commands record one, written as the migration role, as a fixture (code-house-rules 11.2); nothing is
  // restored here and the Organisation is not held.
  { recordType: 'kernel.recovery_event', action: 'view' },
]);
const backupFixture = await connect(settingsDatabase, 'migration');
const syntheticBackupId = uuidv7();
await backupFixture.query(
  `insert into kernel.backup_record (id, backup_id, environment, code_commit, snapshot_at, backup_key_version,
     manifest_sha256, result, failures, finished_at)
   values ($1, $2, 'local', null, now() - interval '1 minute', $3, $4, 'complete', '{}', now())`,
  [uuidv7(), syntheticBackupId, '5e'.repeat(16), '5e'.repeat(32)],
);
const syntheticRestoreId = uuidv7();
await backupFixture.query(
  `insert into kernel.recovery_event (id, restore_id, kind, backup_id, recovery_point, unit, name, passed, checked,
     failed, actor_id, role_assignment_id, check_run, occurred_at)
   values ($1, $5, 'restored', $6, now() - interval '1 minute', null, null, null, null, null, null, null, null, now()),
          ($2, $5, 'hold-placed', null, null, null, null, null, null, null, null, null, null, now()),
          ($3, $5, 'check', null, null, 'audit', 'audit seal chain verifies', true, 1, 0, null, null, 1, now()),
          ($4, $5, 'hold-lifted', null, null, null, null, null, null, null, $7, $8, null,
           now() + interval '1 second')`,
  [uuidv7(), uuidv7(), uuidv7(), uuidv7(), syntheticRestoreId, syntheticBackupId, operationsViewer.id, uuidv7()],
);
await backupFixture.end();
await writeSyntheticServiceIdentity(settingsDatabase, SYNTHETIC_FAILING_IDENTITY, [syntheticAlwaysFails.authorises]);
// The failing consumer's one event: the worker above has registered it (code-house-rules 12.8).
const settingsForWorker = await router.resolveForSignIn(settingsCode);
if (!settingsForWorker.routed) throw new Error('The settings Organisation was not routed');
const failingRecord = crypto.randomUUID();
await runner.run(
  {
    commandName: 'test-syn-operations.fixture',
    organisation: settingsForWorker.organisation,
    correlationId: newCorrelationId(),
    actor: { kind: 'actor', actorId: exceptionsOps.id },
  },
  (context) =>
    context.publish(syntheticFailing, {
      subject: { module: 'kernel', recordType: 'kernel.synthetic_record', recordId: failingRecord },
      payload: { recordId: failingRecord },
    }),
);
// The approval limits journey (approval-limits.spec.ts; S1-F05-T01), in the settings Organisation: an Admin who
// prepares approval limits; a person who approves them; and an approver of a test-only valued action type, booking
// approval on its value at cost (DM-8, DEC-105; code-house-rules 11.4), through a SYNTHETIC role that holds no limit
// yet. Two SYNTHETIC requests of it wait: one the journey's limit covers, one above every limit. Who holds which limit
// is KDPS's (V-02, RR-065); every limit, value and holder here is SYNTHETIC.
const limitsAdmin = await provisionUser('BROWSER-LIMITS-ADMIN', 'P-ADM', [
  { recordType: 'access.approval_limit', action: 'view' },
  { recordType: 'access.approval_limit', action: 'create' },
  { recordType: 'access.role', action: 'view' },
  { recordType: 'access.role_assignment', action: 'view' },
  { recordType: 'access.approval_request', action: 'view' },
]);
const limitsApprover = await provisionUser('BROWSER-LIMITS-APPROVER', 'P-OWN', [
  { recordType: 'access.approval_limit', action: 'view' },
  { recordType: 'access.approval_limit', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
const limitsReasonId = await writeSyntheticReason(settingsDatabase, 'approve');
const bookingRole = {
  code: syntheticCode('JOURNEY-BOOKING-APPROVER'),
  name: syntheticName('Journey Booking Approver'),
};
await writeSyntheticRole(settingsDatabase, {
  ...bookingRole,
  authorities: [
    { recordType: LIMITS_BOOKING_TYPE, action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
    { recordType: 'access.approval_reason', action: 'view' },
  ],
});
const bookingApprover = await writeSyntheticUser(settingsDatabase, settingsCode, keys, {
  label: 'BROWSER-BOOKING-APPROVER',
  enrolled: true,
  personas: ['P-OWN'],
});
await assignSyntheticRole(settingsDatabase, { kind: 'user', id: bookingApprover.id }, bookingRole.code);
const fixtureAccess = new Access({
  origins: localOrigins,
  audit: new Audit(fixtureLog.logger),
  registry: [...permissionRegistry, limitsBookingType],
  approvalRules: [limitsBookingRule],
  composition: TEST_COMPOSITION,
});
/** A SYNTHETIC booking whose approval the exceptions journey's user requests, with its value at cost in rupees. */
const bookingRequested = (rupees: number) =>
  fixtureCommand((context) =>
    fixtureAccess.requestApproval(context, {
      actionType: LIMITS_BOOKING,
      document: { module: LIMITS_MODULE, recordType: LIMITS_BOOKING_TYPE, recordId: uuidv7(), versionId: uuidv7() },
      value: { kind: 'known', amountPaise: paise(rupees * 100) },
      preparers: [exceptionsOps.id],
      requestedBy: { userId: exceptionsOps.id, roleAssignmentId: crypto.randomUUID() },
    }),
  );
await bookingRequested(1_500);
await bookingRequested(5_000_000);

// The bulk approval journey (bulk-approval.spec.ts; S1-F05-T02), in the settings Organisation: an approver of a
// test-only action type, booking approval on its value at cost (code-house-rules 11.4), through a SYNTHETIC role that
// holds a SYNTHETIC limit and no authority over an unknown value; the type on a SYNTHETIC bulk allowlist; and three
// SYNTHETIC requests waiting: two of known value within the limit, one of Unknown value, which nobody holds authority
// over, so it reaches the approver as one they would decide but for the limit (9.4). The allowlist, the limit and every
// value are SYNTHETIC: the real ones are KDPS's (B-9, V-02).
const bulkApprover = await provisionUser('BROWSER-BULK-APPROVER', 'P-OWN', [
  { recordType: BULK_BOOKING_TYPE, action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
{
  const owner = await connect(settingsDatabase, 'migration');
  try {
    const [assignment] = (
      await owner.query<{ role_id: string }>('select role_id from access.role_assignment where app_user_id = $1', [
        bulkApprover.id,
      ])
    ).rows;
    if (assignment === undefined) throw new Error('The bulk approver has no role assignment');
    const scope = { kind: 'dimensions', legalEntity: { kind: 'all' }, place: { kind: 'all' }, brand: { kind: 'all' } };
    const scopeKey = 'legal-entity=all;place=all;brand=all';
    // A SYNTHETIC limit of ₹5,000 on cost for the approver's role (access-and-approvals 9.2), approved as a fixture.
    await owner.query(
      `insert into access.approval_limit (id, action_type, basis, holder_kind, role_id, scope, scope_key, holder_key,
         amount, unlimited, covers_unknown, origin, valid_during, decision)
       values ($1, $2, 'cost', 'role', $3, $4, $5, $6, 500000, false, false, 'synthetic',
         daterange(current_date - 1, null), 'Approved')`,
      [
        uuidv7(),
        BULK_BOOKING,
        assignment.role_id,
        JSON.stringify(scope),
        scopeKey,
        `role:${assignment.role_id}:${scopeKey}`,
      ],
    );
    // The SYNTHETIC allowlist: the action type allowed in bulk (access-and-approvals 8, 9.9; POL-02.19).
    const settingId = uuidv7();
    await owner.query('insert into access.approval_rule_setting (id, action_type) values ($1, $2)', [
      settingId,
      BULK_BOOKING,
    ]);
    await owner.query(
      `insert into access.approval_rule_setting_version (id, approval_rule_setting_id, bulk_allowed, phone_allowed,
         valid_during, decision)
       values ($1, $2, true, false, daterange(current_date - 1, null), 'Approved')`,
      [uuidv7(), settingId],
    );
  } finally {
    await owner.end();
  }
}
const bulkAccess = new Access({
  origins: localOrigins,
  audit: new Audit(fixtureLog.logger),
  registry: [...permissionRegistry, bulkBookingType],
  approvalRules: [bulkBookingRule],
  composition: TEST_COMPOSITION,
});
/** A SYNTHETIC booking of the bulk journey, its value at cost in rupees or Unknown, requested by the exceptions user. */
const bulkRequested = (value: { kind: 'unknown' } | { kind: 'known'; rupees: number }) =>
  fixtureCommand((context) =>
    bulkAccess.requestApproval(context, {
      actionType: BULK_BOOKING,
      document: { module: BULK_MODULE, recordType: BULK_BOOKING_TYPE, recordId: uuidv7(), versionId: uuidv7() },
      value: value.kind === 'known' ? { kind: 'known', amountPaise: paise(value.rupees * 100) } : value,
      preparers: [exceptionsOps.id],
      requestedBy: { userId: exceptionsOps.id, roleAssignmentId: crypto.randomUUID() },
    }),
  );
await bulkRequested({ kind: 'known', rupees: 1_000 });
await bulkRequested({ kind: 'known', rupees: 2_500 });
await bulkRequested({ kind: 'unknown' });
await fixtureRouter.close();

/** How a journey signs a user in: login, name, password and authenticator secret. */
const credentialsOf = (user: SyntheticUser) => ({
  login: user.login,
  displayName: user.displayName,
  password: user.password,
  factorSecretHex: user.factorSecret?.toString('hex') ?? '',
});

// The policy readiness journey (policy-readiness.spec.ts; S1-F04-T01), in the settings Organisation: a test-only
// module's SYNTHETIC business-effect operation governed by policy 14, with a validity check whose one SYNTHETIC value a
// person of its own entered (code-house-rules 11.4; DM-6); an Admin who records policy 14 as Signed with a SYNTHETIC
// file and switches the capability on; and a person holding the validate permission who did not enter the value.
const POLICY_GATE = syntheticIdentifier('gate');
const policyEnterer = await provisionUser('BROWSER-POLICY-ENTERER', 'P-ADM', [
  { recordType: 'configuration.policy_status', action: 'view' },
]);
const policyValuesCheck: ValidityCheck = {
  code: `${POLICY_GATE}.synthetic-values`,
  policy: 14,
  check: () => Promise.resolve({ kind: 'valid' }),
  values: () =>
    Promise.resolve([{ key: 'syn-browser-value', version: 'v1', origin: 'synthetic', enteredBy: [policyEnterer.id] }]),
  locks: () => Promise.resolve([]),
};
const policyOperation: GatedOperation = {
  code: `${POLICY_GATE}.post-synthetic-effect`,
  policy: 14,
  capability: `${POLICY_GATE}.synthetic-effect`,
  activity: null,
  checks: [{ check: policyValuesCheck.code }],
};
const policyAdmin = await provisionUser('BROWSER-POLICY-ADMIN', 'P-ADM', [
  { recordType: 'configuration.policy_status', action: 'view' },
  { recordType: 'configuration.policy_status', action: 'create' },
  { recordType: 'configuration.policy_validation', action: 'view' },
  { recordType: 'configuration.capability', action: 'edit' },
  { recordType: 'files_imports.stored_file', action: 'create' },
]);
const policyValidator = await provisionUser('BROWSER-POLICY-VALIDATOR', 'P-ACC', [
  { recordType: 'configuration.policy_status', action: 'view' },
  { recordType: 'configuration.policy_validation', action: 'view' },
  { recordType: 'configuration.policy_validation', action: 'create' },
  { recordType: 'files_imports.stored_file', action: 'create' },
]);

// The readiness journey (site-readiness.spec.ts; S1-F04-T02), in the receiving Organisation below: a test-only
// module's SYNTHETIC receiving operation governed by policy 4, needing someone at the unit to run the checks and two
// different people to prepare and approve them. Its world is made with the receiving Organisation's (RR-558).
const READINESS_GATE = syntheticIdentifier('readiness');
/** One SYNTHETIC value of policy 4, so its SYNTHETIC validation covers something (RR-480). */
const readinessValuesCheck: ValidityCheck = {
  code: `${READINESS_GATE}.synthetic-values`,
  policy: 4,
  check: () => Promise.resolve({ kind: 'valid' }),
  values: () => Promise.resolve([{ key: 'syn-readiness-value', version: 'v1', origin: 'synthetic', enteredBy: [] }]),
  locks: () => Promise.resolve([]),
};
const readinessOperation: GatedOperation = {
  code: `${READINESS_GATE}.receive-synthetic`,
  policy: 4,
  capability: `${READINESS_GATE}.synthetic-receiving`,
  activity: 'receiving',
  checks: [],
  needs: {
    permissions: [{ action: 'create', recordType: 'site_lifecycle.readiness_record' }],
    approvals: [
      {
        actionType: `${READINESS_GATE}.synthetic-receipt`,
        prepare: { action: 'create', recordType: 'site_lifecycle.readiness_record' },
        approveRecordType: 'site_lifecycle.readiness_record',
      },
    ],
  },
};
// The devices journey's Admin (S1-F12-T01, S1-F12-T02): register, view, enrol, revoke and replace billing devices, and
// the Stores and units the form chooses from. SYNTHETIC grants: who registers devices is KDPS's (POL-02.03).
const devicesAdmin = await provisionUser('BROWSER-DEVICES-ADMIN', 'P-ADM', [
  { recordType: 'pos.billing_device', action: 'view' },
  { recordType: 'pos.billing_device', action: 'create' },
  { recordType: 'pos.billing_device', action: 'edit' },
  { recordType: 'organisation.store', action: 'view' },
  { recordType: 'organisation.business_unit', action: 'view' },
]);
// The devices lifecycle journey's Admin (S1-F12-T02), with the same SYNTHETIC grants, apart so the journeys run at once.
const devicesLifecycleAdmin = await provisionUser('BROWSER-DEVICES-LIFECYCLE', 'P-ADM', [
  { recordType: 'pos.billing_device', action: 'view' },
  { recordType: 'pos.billing_device', action: 'create' },
  { recordType: 'pos.billing_device', action: 'edit' },
  { recordType: 'organisation.store', action: 'view' },
  { recordType: 'organisation.business_unit', action: 'view' },
]);
// The bill numbering journey (S1-F12-T03): an Admin who registers and enrols a device and prepares the financial year
// and the bill-number format, and a different person who approves both from My work. SYNTHETIC grants: who prepares
// and who approves them is KDPS's (V-01; GC5-1, V-40).
const numberingAdmin = await provisionUser('BROWSER-NUMBERING-ADMIN', 'P-ADM', [
  { recordType: 'pos.billing_device', action: 'view' },
  { recordType: 'pos.billing_device', action: 'create' },
  { recordType: 'pos.billing_device', action: 'edit' },
  { recordType: 'organisation.store', action: 'view' },
  { recordType: 'organisation.business_unit', action: 'view' },
  { recordType: 'pos.financial_year_change', action: 'view' },
  { recordType: 'pos.financial_year_change', action: 'create' },
  { recordType: 'pos.bill_format_change', action: 'view' },
  { recordType: 'pos.bill_format_change', action: 'create' },
]);
const numberingApprover = await provisionUser('BROWSER-NUMBERING-APPROVER', 'P-OWN', [
  { recordType: 'pos.financial_year_change', action: 'view' },
  { recordType: 'pos.financial_year_change', action: 'approve' },
  { recordType: 'pos.bill_format_change', action: 'view' },
  { recordType: 'pos.bill_format_change', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
// The Receive Goods journeys (receive-goods.spec.ts; S2-F02-T02), in an Organisation of its own so its Sites, Stores
// and brands change no other journey's lists: made by the setup step like the ones above. Each journey has a world of
// its own, so neither sees the other's deliveries: a Site with two Stores, their units and receiving locations, their
// mappings verified, a brand with a linked supplier and an approved Agreement, a size list and a batch-tracked product,
// all through the real interfaces (support/receiving.ts); the capability switched on and policies 4 and 10 Signed and
// validated through configuration's commands, and receiving granted after readiness at the Stores' units through
// site-lifecycle's; a GRN series with a SYNTHETIC format (RR-449); a Warehouse receiver (P-WHS) over every place, and
// a Store's staff (P-STM) who receives at their Store only.
const receivingSetup = await runSetupStep({
  migrationConnectionString: databaseUrl(world.directory, 'migration'),
  runtimeConnectionString: databaseUrl(world.directory, 'runtime'),
  request: setupRequestSchema.parse({
    ...journeyRequest,
    organisationCode: receivingCode,
    databaseName: receivingDatabase,
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
if (receivingSetup.outcome !== 'created') {
  throw new Error(`The receiving setup step did not create: ${receivingSetup.outcome}`);
}
const receivingStructure = await structureSetup({
  directory: world.directory,
  database: receivingDatabase,
  organisationCode: receivingCode,
  keysEnvironment: keys,
  label: 'BROWSER-RCV',
  // The stock ledger's posting event kinds, as the application declares them, so the PT approval journey's book maps
  // `stock.cost-established` (books-and-posting 7.2; S2-F06-T01).
  eventKinds: STOCK_POSTING_EVENT_KINDS,
});
const receivingWorld = await receivingFixture(receivingStructure, receivingDatabase, 'JOURNEY-RCV');
const storeStaffWorld = await receivingFixture(receivingStructure, receivingDatabase, 'JOURNEY-STM');
// The damage journey's world (damage-reports.spec.ts; S2-F08-T01), its own so its deliveries and reports change no
// other journey's lists.
const damageWorld = await receivingFixture(receivingStructure, receivingDatabase, 'JOURNEY-DMG');
// The held-line journey's world (held-lines.spec.ts; S2-F02-T03), its own so its deliveries and decisions change no
// other journey's lists.
const heldWorld = await receivingFixture(receivingStructure, receivingDatabase, 'JOURNEY-HLD');
// The receive-against-booking journey's world (receive-against-booking.spec.ts; S2-F02-T04), its own so its booking,
// deliveries and links change no other journey's lists.
const againstWorld = await receivingFixture(receivingStructure, receivingDatabase, 'JOURNEY-RAB');
// The PT file journey's world (pt-upload.spec.ts; S2-F04-T02), its own so its GRN and PT change no other journey's lists.
const ptReceivingWorld = await receivingFixture(receivingStructure, receivingDatabase, 'JOURNEY-PTF');
// The PT approval journey's SYNTHETIC quantity tracking profile (pt-approval.spec.ts; S2-F06-T01), for the Sub category
// its PT names, a value of policy 4, so made before receiving's gate validates policy 4 (goods-in 10.5; catalogue's
// tracking-profiles check).
const ptQuantityProfile = await receivingStructure.asPreparerDo((c, p) =>
  receivingStructure.catalogue.prepareTrackingProfile(c, p, {
    code: syntheticCode('JOURNEY-PTA-QTY'),
    name: syntheticName('PT approval quantity profile'),
    pieceTracked: false,
    batchExpiryRequired: false,
    requiredIdentifiers: [],
    origin: 'synthetic',
    validFrom: receivingStructure.today(),
  }),
);
if (ptQuantityProfile.kind !== 'success') {
  throw new Error(`The PT approval tracking profile was refused: ${ptQuantityProfile.refusal.code}`);
}
// Policies 4 and 10 validated on the values the modules report, the receiving worlds', and on the readiness journey's
// SYNTHETIC value of policy 4, which the application registers for every Organisation.
await receivingGateOpen(receivingStructure, receivingDatabase, [readinessValuesCheck]);
for (const each of [receivingWorld, storeStaffWorld, damageWorld, heldWorld, againstWorld, ptReceivingWorld]) {
  await receivingGranted(
    receivingStructure,
    receivingDatabase,
    each.siteId,
    [each.wholeStore, each.otherStoreUnit],
    [readinessValuesCheck],
  );
}
// The booking journey (booking.spec.ts; goods-in 3.1 to 3.4, section 11; S2-F01-T03), in the receiving Organisation,
// on the Receive Goods world's Site, brand, linked supplier and approved Agreement: a SYNTHETIC season attribute marked
// as the Organisation's season with one value; a SYNTHETIC approved open-to-buy budget for the brand and that season;
// policies 5 and 1 Signed and validated on the TEST-ONLY values the application registers for them, since no module
// reports either policy's values yet (RR-561; support/booking.ts), and the bookings capability switched on; a booking
// series with a SYNTHETIC format (RR-449). Every value is SYNTHETIC.
const bookingSeason = await (async () => {
  const today = receivingStructure.today();
  const attribute = await receivingStructure.asPreparerDo((c, p) =>
    receivingStructure.catalogue.prepareAttribute(c, p, {
      code: syntheticCode('JOURNEY-BKG-SEASON'),
      valueKind: 'list',
      name: syntheticName('Booking season'),
      validFrom: today,
    }),
  );
  if (attribute.kind !== 'success')
    throw new Error(`The booking season attribute was refused: ${attribute.refusal.code}`);
  const code = syntheticCode('JOURNEY-BKG-SS1');
  const name = syntheticName('Booking SS1');
  const proposed = await receivingStructure.asPreparerDo((c, p) =>
    receivingStructure.catalogue.proposeVocabularyValue(c, p, { attributeId: attribute.answer.recordId, code, name }),
  );
  if (proposed.kind !== 'success') throw new Error(`The booking season value was refused: ${proposed.refusal.code}`);
  const confirmed = await receivingStructure.decide(proposed.answer.requestId, proposed.answer.proposalId);
  if (confirmed.kind !== 'success') throw new Error(`The booking season was not confirmed: ${confirmed.refusal.code}`);
  const proposal = await receivingStructure.run(receivingStructure.preparer.id, (c) =>
    receivingStructure.catalogue.proposal(c, proposed.answer.proposalId),
  );
  if (proposal?.valueId === undefined) throw new Error('The booking season value was not confirmed');
  const markingVersionId = await writeSyntheticMarking(
    receivingDatabase,
    'season',
    attribute.answer.recordId,
    receivingStructure.preparer.id,
  );
  return { attributeId: attribute.answer.recordId, valueId: proposal.valueId, code, name, markingVersionId };
})();
await writeSyntheticBudget(receivingDatabase, {
  brandId: receivingWorld.brand.id,
  seasonAttributeId: bookingSeason.attributeId,
  seasonValueId: bookingSeason.valueId,
  markingVersionId: bookingSeason.markingVersionId,
  // A SYNTHETIC ₹10,00,000.00.
  amountPaise: 100_000_000,
  preparedBy: receivingStructure.preparer.id,
});
// And for the receive-against-booking journey's brand and the same season, a SYNTHETIC budget of its own (S2-F02-T04).
await writeSyntheticBudget(receivingDatabase, {
  brandId: againstWorld.brand.id,
  seasonAttributeId: bookingSeason.attributeId,
  seasonValueId: bookingSeason.valueId,
  markingVersionId: bookingSeason.markingVersionId,
  // A SYNTHETIC ₹10,00,000.00.
  amountPaise: 100_000_000,
  preparedBy: receivingStructure.preparer.id,
});
await bookingGateOpen(receivingStructure, receivingDatabase);
// The damage journey (damage-reports.spec.ts; S2-F08-T01): policy 17 Signed and validated on the test-only check's one
// SYNTHETIC value, and the damage capability switched on (support/damage.ts), which records are policy 17's values
// being the product owner's to say (goods-in 10.5); a Store's staff (P-STM) who receive and report damage at their
// Store only (the lists of masters from a second assignment, below); and Operations (P-OPS), who decides reports over
// every place from My work, with an individual SYNTHETIC limit on the decision covering an Unknown cost, prepared and
// approved through `access`'s commands by the setup's two people (access-and-approvals 9.2). Who reports, who
// decides and the limit are the product owner's: SYNTHETIC here.
await damageGateOpen(receivingStructure, receivingDatabase);
const damageReporter = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-DAMAGE-REPORTER',
  enrolled: true,
  personas: ['P-STM'],
});
await grantSynthetic(receivingDatabase, { kind: 'user', id: damageReporter.id }, RECEIVER_REPORTER_AUTHORITY, {
  scope: placeScope([{ type: 'store', id: damageWorld.storeId }]),
});
const damageOperations = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-DAMAGE-OPS',
  enrolled: true,
  personas: ['P-OPS'],
});
const damageDecider = await grantSynthetic(
  receivingDatabase,
  { kind: 'user', id: damageOperations.id },
  DECIDER_AUTHORITY,
);
{
  const limitAccess = receivingStructure.accessWith({ rules: stockDocumentsApprovalRules, effects: new Map() });
  const preparer = receivingStructure.preparer;
  const preparing = await grantSynthetic(receivingDatabase, { kind: 'user', id: preparer.id }, LIMIT_ADMIN_AUTHORITY);
  await grantSynthetic(
    receivingDatabase,
    { kind: 'user', id: receivingStructure.approver.id },
    LIMIT_APPROVER_AUTHORITY,
  );
  const prepared = await receivingStructure.run(preparer.id, (context) =>
    limitAccess.prepareApprovalLimit(
      context,
      { userId: preparer.id, roleAssignmentId: preparing.assignmentId },
      {
        actionType: DAMAGE_DECISION,
        holder: { kind: 'individual', userId: damageOperations.id, roleAssignmentId: damageDecider.assignmentId },
        limit: { kind: 'none' },
        coversUnknown: true,
        origin: 'synthetic',
        validFrom: receivingStructure.today(),
      },
    ),
  );
  if (prepared.kind !== 'success') throw new Error(`The damage limit was refused: ${prepared.refusal.code}`);
  const decided = await receivingStructure.decideThrough(
    limitAccess,
    prepared.answer.requestId,
    prepared.answer.limitId,
  );
  if (decided.kind !== 'success') throw new Error(`The damage limit was not approved: ${decided.refusal.code}`);
}
// The held-line journey (held-lines.spec.ts; goods-in 4.4 to 4.6, section 11; S2-F02-T03): Warehouse (P-WHS), who
// counts excess on the world's Site, records it received and held and issues the GRN; and a Booking approver (P-BKG)
// named for the Site and brand by role (POL-17.11), who takes the excess in from My work within an individual SYNTHETIC
// limit on the decision covering an Unknown cost, prepared and approved through `access`'s commands by the setup's two
// people (access-and-approvals 9.2). Policy 17 is Signed and validated above, for the damage journey. Who receives,
// who decides and the limit are the product owner's: SYNTHETIC here.
const heldReceiver = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-HELD-RECEIVER',
  enrolled: true,
  personas: ['P-WHS'],
});
await grantSynthetic(receivingDatabase, { kind: 'user', id: heldReceiver.id }, RECEIVER_AUTHORITY);
const heldApprover = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-HELD-APPROVER',
  enrolled: true,
  personas: ['P-BKG'],
});
const heldDecider = await grantSynthetic(receivingDatabase, { kind: 'user', id: heldApprover.id }, [
  { recordType: 'receiving.arrival', action: 'view' },
  { recordType: 'receiving.held_line', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
{
  const limitAccess = receivingStructure.accessWith({ rules: receivingApprovalRules, effects: new Map() });
  const preparer = receivingStructure.preparer;
  const preparing = await grantSynthetic(receivingDatabase, { kind: 'user', id: preparer.id }, LIMIT_ADMIN_AUTHORITY);
  const prepared = await receivingStructure.run(preparer.id, (context) =>
    limitAccess.prepareApprovalLimit(
      context,
      { userId: preparer.id, roleAssignmentId: preparing.assignmentId },
      {
        actionType: HELD_LINE_DECISION,
        holder: { kind: 'individual', userId: heldApprover.id, roleAssignmentId: heldDecider.assignmentId },
        limit: { kind: 'none' },
        coversUnknown: true,
        origin: 'synthetic',
        validFrom: receivingStructure.today(),
      },
    ),
  );
  if (prepared.kind !== 'success') throw new Error(`The held-line limit was refused: ${prepared.refusal.code}`);
  const decided = await receivingStructure.decideThrough(
    limitAccess,
    prepared.answer.requestId,
    prepared.answer.limitId,
  );
  if (decided.kind !== 'success') throw new Error(`The held-line limit was not approved: ${decided.refusal.code}`);
}
// The recount journey (recount.spec.ts; goods-in 4.7, 4.11, section 11; S2-F02-T05), on the held-line world's Site:
// Warehouse (P-WHS), who counts, issues the GRN and proposes its recount; and the Owner (P-OWN), who approves recounts
// from My work within an individual SYNTHETIC limit covering an Unknown cost, prepared and approved through `access`'s
// commands by the setup's two people (access-and-approvals 9.2), and sees the stock the approval posts (stock-ledger
// 14.3). Who recounts, who approves and the limit are the product owner's: SYNTHETIC here.
const recountReceiver = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-RECOUNT-RECEIVER',
  enrolled: true,
  personas: ['P-WHS'],
});
await grantSynthetic(receivingDatabase, { kind: 'user', id: recountReceiver.id }, [
  ...RECEIVER_AUTHORITY,
  { recordType: 'receiving.recount', action: 'create' },
]);
const recountApprover = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-RECOUNT-APPROVER',
  enrolled: true,
  personas: ['P-OWN'],
});
const recountDecider = await grantSynthetic(receivingDatabase, { kind: 'user', id: recountApprover.id }, [
  { recordType: 'receiving.arrival', action: 'view' },
  { recordType: 'receiving.recount', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
  ...STOCK_VIEW,
]);
{
  const limitAccess = receivingStructure.accessWith({ rules: receivingApprovalRules, effects: new Map() });
  const preparer = receivingStructure.preparer;
  const preparing = await grantSynthetic(receivingDatabase, { kind: 'user', id: preparer.id }, LIMIT_ADMIN_AUTHORITY);
  const prepared = await receivingStructure.run(preparer.id, (context) =>
    limitAccess.prepareApprovalLimit(
      context,
      { userId: preparer.id, roleAssignmentId: preparing.assignmentId },
      {
        actionType: RECOUNT_APPROVAL,
        holder: { kind: 'individual', userId: recountApprover.id, roleAssignmentId: recountDecider.assignmentId },
        limit: { kind: 'none' },
        coversUnknown: true,
        origin: 'synthetic',
        validFrom: receivingStructure.today(),
      },
    ),
  );
  if (prepared.kind !== 'success') throw new Error(`The recount limit was refused: ${prepared.refusal.code}`);
  const decided = await receivingStructure.decideThrough(
    limitAccess,
    prepared.answer.requestId,
    prepared.answer.limitId,
  );
  if (decided.kind !== 'success') throw new Error(`The recount limit was not approved: ${decided.refusal.code}`);
}
const receivingRouter = new OrganisationRouter(
  { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 2 },
  fixtureLog.logger,
);
const receivingRouted = await receivingRouter.resolveForSignIn(receivingCode);
if (!receivingRouted.routed) throw new Error('The receiving Organisation was not routed');
const receivingReceiver = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-RECEIVER',
  enrolled: true,
  personas: ['P-WHS'],
});
/** The lists the Receive Goods screens choose from and name records by (structure-and-masters 8). */
const RECEIVING_LISTS = [
  { recordType: 'organisation.site', action: 'view' },
  { recordType: 'merchandise.brand', action: 'view' },
  { recordType: 'merchandise.party', action: 'view' },
  { recordType: 'merchandise.attribute', action: 'view' },
  { recordType: 'merchandise.marked_attribute', action: 'view' },
  { recordType: 'merchandise.vocabulary_value', action: 'view' },
  { recordType: 'merchandise.style', action: 'view' },
  { recordType: 'merchandise.sku', action: 'view' },
] as const;
await grantSynthetic(receivingDatabase, { kind: 'user', id: receivingReceiver.id }, [
  ...RECEIVER_AUTHORITY,
  ...RECEIVING_LISTS,
]);
// A Store's staff: receiving at their own Store only, and the lists of masters, which carry no place, from a second
// assignment (access-and-approvals 5.3; PRD-ACS-004). SYNTHETIC grants: who receives where is the product owner's.
const receivingStoreStaff = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-STORE-STAFF',
  enrolled: true,
  personas: ['P-STM'],
});
await grantSynthetic(receivingDatabase, { kind: 'user', id: receivingStoreStaff.id }, RECEIVER_AUTHORITY, {
  scope: placeScope([{ type: 'store', id: storeStaffWorld.storeId }]),
});
await grantSynthetic(receivingDatabase, { kind: 'user', id: receivingStoreStaff.id }, RECEIVING_LISTS);
await fixtureRunner.run(
  {
    commandName: 'test-syn-receiving.fixture',
    organisation: receivingRouted.organisation,
    correlationId: newCorrelationId(),
    actor: { kind: 'actor', actorId: receivingReceiver.id },
  },
  (context) => defineSyntheticGrnSeries(context, new Numbering({ kinds: [GRN_KIND] })),
);
// The booking journey's people (booking.spec.ts; S2-F01-T03): Booking (P-BKG), who records the booking with its grid,
// attaches its document and submits it; and the Owner (P-OWN), who approves it from My work within a SYNTHETIC booking
// limit on its value at cost (DM-8, DEC-105). SYNTHETIC grants and limit: who holds them is the product owner's (V-01,
// V-02).
const BOOKING_LISTS = [...RECEIVING_LISTS, { recordType: 'access.approval_request', action: 'view' }] as const;
const bookingBooker = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-BOOKING',
  enrolled: true,
  personas: ['P-BKG'],
});
await grantSynthetic(receivingDatabase, { kind: 'user', id: bookingBooker.id }, [
  ...BOOKING_LISTS,
  { recordType: 'booking.booking', action: 'view' },
  { recordType: 'booking.booking', action: 'create' },
  { recordType: 'booking.booking', action: 'edit' },
  { recordType: 'files_imports.stored_file', action: 'create' },
]);
const bookingOwner = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-BOOKING-OWNER',
  enrolled: true,
  personas: ['P-OWN'],
});
const bookingOwnerAssignment = await grantSynthetic(receivingDatabase, { kind: 'user', id: bookingOwner.id }, [
  ...BOOKING_LISTS,
  { recordType: 'booking.booking', action: 'view' },
  { recordType: 'booking.booking', action: 'approve' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
// A SYNTHETIC limit of ₹10,00,000.00 on cost, prepared and approved by two other people through access's commands.
await bookingLimitApproved(
  receivingStructure,
  receivingDatabase,
  { userId: bookingOwner.id, roleAssignmentId: bookingOwnerAssignment.assignmentId },
  100_000_000,
);
const bookingReasonId = await writeSyntheticReason(receivingDatabase, 'approve');
await fixtureRunner.run(
  {
    commandName: 'test-syn-booking.fixture',
    organisation: receivingRouted.organisation,
    correlationId: newCorrelationId(),
    actor: { kind: 'actor', actorId: bookingOwner.id },
  },
  (context) => defineSyntheticBookingSeries(context, new Numbering({ kinds: [BOOKING_KIND] })),
);
// The receive-against-booking journey's people (receive-against-booking.spec.ts; goods-in 4.10; S2-F02-T04): Warehouse
// (P-WHS), who receives against the booking and so sees bookings; Booking (P-BKG), who reviews the GRN's lines,
// proposes the excess into the booking and owns the review follow-up at the world's Site; and the Owner (P-OWN), who
// approves the excess from My work, with no limit since it has no value. Two more, who record and approve the booking
// the journey receives against through the API once the server listens (below), the Owner within a SYNTHETIC limit, so
// the journey's people sign in with authenticator codes nobody used. SYNTHETIC grants and limit: who holds them is the
// product owner's.
const againstReceiver = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-RAB-RECEIVER',
  enrolled: true,
  personas: ['P-WHS'],
});
await grantSynthetic(receivingDatabase, { kind: 'user', id: againstReceiver.id }, [
  ...RECEIVER_AUTHORITY,
  ...RECEIVING_LISTS,
  { recordType: 'booking.booking', action: 'view' },
]);
const againstBooker = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-RAB-BOOKING',
  enrolled: true,
  personas: ['P-BKG'],
});
await grantSynthetic(receivingDatabase, { kind: 'user', id: againstBooker.id }, [
  ...BOOKING_LISTS,
  { recordType: 'booking.booking', action: 'view' },
  { recordType: 'booking.booking', action: 'create' },
  { recordType: 'booking.booking', action: 'edit' },
  { recordType: 'files_imports.stored_file', action: 'create' },
  { recordType: 'receiving.arrival', action: 'view' },
  { recordType: 'receiving.grn', action: 'view' },
  { recordType: 'exceptions.exception', action: 'view' },
]);
const againstOwner = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-RAB-OWNER',
  enrolled: true,
  personas: ['P-OWN'],
});
await grantSynthetic(receivingDatabase, { kind: 'user', id: againstOwner.id }, [
  ...BOOKING_LISTS,
  { recordType: 'booking.booking', action: 'view' },
  { recordType: 'booking.booking', action: 'approve' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
const againstFixtureBooker = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-RAB-FIXTURE-BOOKING',
  enrolled: true,
  personas: ['P-BKG'],
});
await grantSynthetic(receivingDatabase, { kind: 'user', id: againstFixtureBooker.id }, [
  ...BOOKING_LISTS,
  { recordType: 'booking.booking', action: 'view' },
  { recordType: 'booking.booking', action: 'create' },
  { recordType: 'booking.booking', action: 'edit' },
  { recordType: 'files_imports.stored_file', action: 'create' },
]);
const againstFixtureOwner = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-RAB-FIXTURE-OWNER',
  enrolled: true,
  personas: ['P-OWN'],
});
const againstFixtureOwnerAssignment = await grantSynthetic(
  receivingDatabase,
  { kind: 'user', id: againstFixtureOwner.id },
  [
    ...BOOKING_LISTS,
    { recordType: 'booking.booking', action: 'view' },
    { recordType: 'booking.booking', action: 'approve' },
    { recordType: 'access.approval_reason', action: 'view' },
  ],
);
await bookingLimitApproved(
  receivingStructure,
  receivingDatabase,
  { userId: againstFixtureOwner.id, roleAssignmentId: againstFixtureOwnerAssignment.assignmentId },
  100_000_000,
);
// And for the damage journey: the reporter's lists of masters; an approve reason; the exception-code series and the damage-report series with SYNTHETIC
// formats (RR-449; DEC-118); and the damage exception routed at the world's Site to Operations by a SYNTHETIC rule
// approved here as a fixture (code-house-rules 11.2), as the other journeys' rules are. The routing is the product
// owner's: SYNTHETIC here.
await grantSynthetic(receivingDatabase, { kind: 'user', id: damageReporter.id }, RECEIVING_LISTS);
await grantSynthetic(receivingDatabase, { kind: 'user', id: heldReceiver.id }, RECEIVING_LISTS);
await grantSynthetic(receivingDatabase, { kind: 'user', id: heldApprover.id }, RECEIVING_LISTS);
await grantSynthetic(receivingDatabase, { kind: 'user', id: recountReceiver.id }, RECEIVING_LISTS);
await grantSynthetic(receivingDatabase, { kind: 'user', id: recountApprover.id }, RECEIVING_LISTS);
const damageReasonId = await writeSyntheticReason(receivingDatabase, 'approve');
const damageRouting = await fixtureRunner.run(
  {
    commandName: 'test-syn-damage.fixture',
    organisation: receivingRouted.organisation,
    correlationId: newCorrelationId(),
    actor: { kind: 'actor', actorId: damageOperations.id },
  },
  async (context) => {
    const numbering = new Numbering({ kinds: [EXCEPTION_CODE_KIND, DAMAGE_REPORT_KIND] });
    await defineSyntheticCodeSeries(context, numbering);
    await defineSyntheticDamageReportSeries(context, numbering);
    const exceptions = new Exceptions({
      numbering,
      inbox: new Inbox(),
      audit: new Audit(fixtureLog.logger),
      types: [damageExceptionType],
    });
    return exceptions.prepareRouting(
      context,
      { userId: damageOperations.id, roleAssignmentId: damageDecider.assignmentId },
      {
        typeCode: damageExceptionType.code,
        siteId: damageWorld.siteId,
        owner: { kind: 'user', userId: damageOperations.id },
        dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
        escalation: { kind: 'user', userId: damageOperations.id },
        validFrom: new Date().toISOString().slice(0, 10),
        origin: 'synthetic',
      },
    );
  },
);
if (damageRouting.kind !== 'done') throw new Error(`The damage rule was refused: ${damageRouting.refusal.code}`);
// The held-line journey's excess routed at its world's Site to the Booking approver by a SYNTHETIC rule. The routing is
// the product owner's: SYNTHETIC here.
const heldRouting = await fixtureRunner.run(
  {
    commandName: 'test-syn-held-lines.fixture',
    organisation: receivingRouted.organisation,
    correlationId: newCorrelationId(),
    actor: { kind: 'actor', actorId: damageOperations.id },
  },
  (context) =>
    new Exceptions({
      numbering: new Numbering({ kinds: [EXCEPTION_CODE_KIND] }),
      inbox: new Inbox(),
      audit: new Audit(fixtureLog.logger),
      types: [damageExceptionType, ...receivingExceptionTypes],
    }).prepareRouting(
      context,
      { userId: damageOperations.id, roleAssignmentId: damageDecider.assignmentId },
      {
        typeCode: 'receiving.excess',
        siteId: heldWorld.siteId,
        owner: { kind: 'user', userId: heldApprover.id },
        dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
        escalation: { kind: 'user', userId: heldApprover.id },
        validFrom: new Date().toISOString().slice(0, 10),
        origin: 'synthetic',
      },
    ),
);
if (heldRouting.kind !== 'done') throw new Error(`The excess rule was refused: ${heldRouting.refusal.code}`);
// The recount journey's shortage routed at the held-line world's Site to the Owner who approves recounts by a SYNTHETIC
// rule: its GRN counts short, and every follow-up needs an owner (goods-in 4.9). The routing is the product owner's:
// SYNTHETIC here.
const recountRouting = await fixtureRunner.run(
  {
    commandName: 'test-syn-recount.fixture',
    organisation: receivingRouted.organisation,
    correlationId: newCorrelationId(),
    actor: { kind: 'actor', actorId: damageOperations.id },
  },
  (context) =>
    new Exceptions({
      numbering: new Numbering({ kinds: [EXCEPTION_CODE_KIND] }),
      inbox: new Inbox(),
      audit: new Audit(fixtureLog.logger),
      types: [damageExceptionType, ...receivingExceptionTypes],
    }).prepareRouting(
      context,
      { userId: damageOperations.id, roleAssignmentId: damageDecider.assignmentId },
      {
        typeCode: 'receiving.shortage',
        siteId: heldWorld.siteId,
        owner: { kind: 'user', userId: recountApprover.id },
        dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
        escalation: { kind: 'user', userId: recountApprover.id },
        validFrom: new Date().toISOString().slice(0, 10),
        origin: 'synthetic',
      },
    ),
);
if (recountRouting.kind !== 'done') throw new Error(`The shortage rule was refused: ${recountRouting.refusal.code}`);
// The receive-against-booking journey's review of GRN lines routed at its world's Site to its Booking user by a
// SYNTHETIC rule (goods-in 4.10). The routing is the product owner's: SYNTHETIC here.
const againstRouting = await fixtureRunner.run(
  {
    commandName: 'test-syn-against-booking.fixture',
    organisation: receivingRouted.organisation,
    correlationId: newCorrelationId(),
    actor: { kind: 'actor', actorId: damageOperations.id },
  },
  (context) =>
    new Exceptions({
      numbering: new Numbering({ kinds: [EXCEPTION_CODE_KIND] }),
      inbox: new Inbox(),
      audit: new Audit(fixtureLog.logger),
      types: [damageExceptionType, ...receivingExceptionTypes],
    }).prepareRouting(
      context,
      { userId: damageOperations.id, roleAssignmentId: damageDecider.assignmentId },
      {
        typeCode: 'receiving.booking-review',
        siteId: againstWorld.siteId,
        owner: { kind: 'user', userId: againstBooker.id },
        dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
        escalation: { kind: 'user', userId: againstBooker.id },
        validFrom: receivingStructure.today(),
        origin: 'synthetic',
      },
    ),
);
if (againstRouting.kind !== 'done') throw new Error(`The review rule was refused: ${againstRouting.refusal.code}`);
// A GRN received without a booking goes to Booking for review too (goods-in 4.10; 12 test 6; RR-580), so each other
// receiving journey's Site has the review routed to the receive-against-booking journey's Booking user by a SYNTHETIC
// rule, as a GRN with findings waits for its follow-ups' routing (goods-in 4.9). The routing is the product owner's:
// SYNTHETIC here.
const unbookedRoutings: { readonly routingId: string; readonly versionId: string }[] = [];
for (const world of [receivingWorld, storeStaffWorld, damageWorld, heldWorld, ptReceivingWorld]) {
  const routed = await fixtureRunner.run(
    {
      commandName: 'test-syn-unbooked-review.fixture',
      organisation: receivingRouted.organisation,
      correlationId: newCorrelationId(),
      actor: { kind: 'actor', actorId: damageOperations.id },
    },
    (context) =>
      new Exceptions({
        numbering: new Numbering({ kinds: [EXCEPTION_CODE_KIND] }),
        inbox: new Inbox(),
        audit: new Audit(fixtureLog.logger),
        types: [damageExceptionType, ...receivingExceptionTypes],
      }).prepareRouting(
        context,
        { userId: damageOperations.id, roleAssignmentId: damageDecider.assignmentId },
        {
          typeCode: 'receiving.booking-review',
          siteId: world.siteId,
          owner: { kind: 'user', userId: againstBooker.id },
          dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
          escalation: { kind: 'user', userId: againstBooker.id },
          validFrom: receivingStructure.today(),
          origin: 'synthetic',
        },
      ),
  );
  if (routed.kind !== 'done') throw new Error(`An unbooked review rule was refused: ${routed.refusal.code}`);
  unbookedRoutings.push(routed.value);
}
// The rules approved through the real commands, as Setup › Exception rules has them approved (access-and-approvals
// 12.2; code-house-rules 11.2): each asked of `access` for a different person, the setup's approver, holding approve on
// the rules, who decides it through Decide.
{
  const routingAccess = receivingStructure.accessWith(routingApprovals(new Audit(fixtureLog.logger)));
  await grantSynthetic(receivingDatabase, { kind: 'user', id: receivingStructure.approver.id }, [
    { recordType: 'exceptions.exception_routing', action: 'view' },
    { recordType: 'exceptions.exception_routing', action: 'approve' },
  ]);
  for (const rule of [
    damageRouting.value,
    heldRouting.value,
    againstRouting.value,
    recountRouting.value,
    ...unbookedRoutings,
  ]) {
    const requestId = await receivingStructure.run(damageOperations.id, (context) =>
      routingAccess.requestApproval(context, {
        actionType: ROUTING_ACTION_TYPE,
        document: {
          module: 'exceptions',
          recordType: 'exceptions.exception_routing',
          recordId: rule.routingId,
          versionId: rule.versionId,
        },
        value: { kind: 'none' },
        preparers: [damageOperations.id],
        requestedBy: { userId: damageOperations.id, roleAssignmentId: damageDecider.assignmentId },
      }),
    );
    const decided = await receivingStructure.decideThrough(routingAccess, requestId, rule.versionId);
    if (decided.kind !== 'success') throw new Error(`An exception rule was not approved: ${decided.refusal.code}`);
  }
}
// The PT file journey (pt-upload.spec.ts; goods-in 5, section 11; S2-F04-T02), in the receiving Organisation, in a
// world of its own: the master sheet's lists as SYNTHETIC vocabularies, each value confirmed by a different person and
// each list marked as the Organisation's, the season being the booking journey's marked one; the Sub category list as
// categories; the PT template's SYNTHETIC layout and mapping, Confirmed by a different person (support/pt.ts); the
// import batch series with a SYNTHETIC format (RR-449); and Warehouse (P-WHS), also assigned to make PTs and granted
// the cost and margin field classes, who counts, issues the GRN and uploads its PT file. Two SYNTHETIC files of the
// GRN's style and size: one refused, its MARGIN wrong and its QTY one short of the count, and one that passes. Who
// makes PTs, the lists and the template are the product owner's: SYNTHETIC here.
const ptLists = await ptWorld(
  receivingStructure,
  receivingDatabase,
  'JOURNEY-PTF',
  { proposer: receivingStructure.preparer.id, confirmer: receivingStructure.approver.id },
  // The size sets of the categories, the PT approval journey's sizes, which its approval asks (S2-F06-T01).
  { sizes: ptReceivingWorld.sizes.values.map((each) => each.code) },
);
const ptMaker = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-PT-MAKER',
  enrolled: true,
  personas: ['P-WHS'],
});
await grantSynthetic(
  receivingDatabase,
  { kind: 'user', id: ptMaker.id },
  [
    ...RECEIVER_AUTHORITY,
    ...RECEIVING_LISTS,
    { recordType: 'files_imports.import_batch', action: 'view' },
    { recordType: 'files_imports.import_batch', action: 'create' },
    { recordType: 'files_imports.import_batch', action: 'edit' },
    { recordType: 'merchandise.pt', action: 'view' },
    { recordType: 'merchandise.pt', action: 'create' },
    { recordType: 'merchandise.pt', action: 'edit' },
    { recordType: 'access.approval_request', action: 'view' },
  ],
  {
    fieldClasses: [
      { fieldClass: 'cost', access: 'view' },
      { fieldClass: 'margin', access: 'view' },
    ],
  },
);
await fixtureRunner.run(
  {
    commandName: 'test-syn-pt.fixture',
    organisation: receivingRouted.organisation,
    correlationId: newCorrelationId(),
    actor: { kind: 'actor', actorId: ptMaker.id },
  },
  (context) => defineSyntheticImportBatchSeries(context, new Numbering({ kinds: [IMPORT_BATCH_KIND] })),
);
const ptStyle = syntheticCode(`JOURNEY-PTF-STYLE-${randomBytes(3).toString('hex').toUpperCase()}`);
const ptSize = ptReceivingWorld.sizes.values[0]?.code ?? '';
/** A row of the GRN's brand, style and size, one piece at MRP 1,999.00 and P RATE 945.00: MARGIN 52.73, by hand. */
const ptRowOf = (barcode: string, values: SyntheticPtRow = {}): SyntheticPtRow => ({
  SEASON: ptLists.season.values.SPRING?.code,
  BRAND: ptReceivingWorld.brand.code,
  COLOR: ptLists.colour.values.NAVY?.code,
  GENDER: ptLists.gender.values.MALE?.code,
  'SUB CATEGORY': ptLists.categories.CASUAL?.code,
  TYPE: ptLists.type.values.TOP?.code,
  ITEM: ptLists.item.values.TSHIRT?.code,
  FIT: ptLists.fit.values.SLIM?.code,
  SIZE: ptSize,
  BARCODE: barcode,
  DESIGN: ptStyle,
  HSN: 61091000,
  QTY: 1,
  MRP: 1999,
  BASIC: 700,
  'P RATE': 945,
  'INPUT TAX': ptLists.gstRate.values['GST-5']?.code,
  'OUTPUT TAX': ptLists.gstRate.values['GST-18']?.code,
  NAG: 1,
  MARGIN: 52.73,
  ...values,
});
const ptRefusedFile = join(dirname(worldFile), syntheticPtFileName('journey-pt-refused'));
writeFileSync(
  ptRefusedFile,
  await syntheticPtWorkbook({ rows: [ptRowOf('8900000000011', { MARGIN: 50 })], marker: 'JOURNEY-PT-REFUSED' }),
);
const ptGoodFile = join(dirname(worldFile), syntheticPtFileName('journey-pt'));
writeFileSync(
  ptGoodFile,
  await syntheticPtWorkbook({
    rows: [ptRowOf('8900000000011'), ptRowOf('8900000000028')],
    marker: 'JOURNEY-PT-GOOD',
  }),
);
// The PT approval journey (pt-approval.spec.ts; goods-in 6, section 11; S2-F06-T01), in the receiving Organisation, in
// the PT file journey's world, on its lists and template, with a style of its own, since a world of its own would add
// the many approvals of a receiving world to the events My work is fed from before the journeys start: the casual Sub
// category takes the SYNTHETIC quantity tracking profile made above; the world's book a SYNTHETIC cost setting, chart, period, journal series and map of
// `stock.cost-established` to a SYNTHETIC receipt account (support/pt-gate.ts; DEC-140); the PT and SKU code series
// with SYNTHETIC formats (RR-449, RR-585); policies 3 and 9 Signed and validated, 1 and 10 being already, and the PT
// approval capability switched on (goods-in 10.5); Warehouse (P-WHS), also assigned to make PTs, who counts, issues
// the GRN and uploads its PT file; and Operations (P-OPS), assigned to approve PTs and to see cost and margin, within an
// individual SYNTHETIC limit on the PT's cost, prepared and approved through `access`'s commands by the setup's two
// people (access-and-approvals 9.2). One SYNTHETIC file of the world's style and first size. Who makes and who
// approves PTs, the limit, the accounts and the series' formats are the product owner's: SYNTHETIC here.
{
  const casual = ptLists.categories.CASUAL?.id ?? '';
  const link = await receivingStructure.run(receivingStructure.preparer.id, (c) =>
    receivingStructure.catalogue.record(c, 'category_tracking_profile', casual, receivingStructure.today()),
  );
  const linked = await receivingStructure.asPreparerDo((c, p) =>
    receivingStructure.catalogue.prepareCategoryTrackingProfileVersion(c, p, casual, {
      trackingProfileId: ptQuantityProfile.answer.recordId,
      validFrom: receivingStructure.today(),
      versionToken: link?.versionToken,
    }),
  );
  if (linked.kind !== 'success') throw new Error(`The PT approval tracking link was refused: ${linked.refusal.code}`);
}
await syntheticPtBook(receivingStructure, 'JOURNEY-PTA', ptReceivingWorld.bookId);
await fixtureRunner.run(
  {
    commandName: 'test-syn-pt-series.fixture',
    organisation: receivingRouted.organisation,
    correlationId: newCorrelationId(),
    actor: { kind: 'actor', actorId: receivingStructure.preparer.id },
  },
  async (context) => {
    const numbering = new Numbering({ kinds: [PT_KIND, SKU_CODE_KIND] });
    await defineSyntheticPtSeries(context, numbering);
    await defineSyntheticSkuCodeSeries(context, numbering);
  },
);
await ptGateOpen(receivingStructure, receivingDatabase, [3, 9]);
const ptApprovalMaker = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-PTA-MAKER',
  enrolled: true,
  personas: ['P-WHS'],
});
await grantSynthetic(
  receivingDatabase,
  { kind: 'user', id: ptApprovalMaker.id },
  [
    ...RECEIVER_AUTHORITY,
    ...RECEIVING_LISTS,
    // And scans the pieces in once the PT is approved (goods-in 7.1; S2-F07-T01).
    { recordType: 'receiving.scan', action: 'create' },
    // And reports damage on a product at its location from Stock search (goods-in 8.1, 9.2; S2-F11-T01).
    { recordType: 'stock.damage_report', action: 'create' },
    { recordType: 'files_imports.import_batch', action: 'view' },
    { recordType: 'files_imports.import_batch', action: 'create' },
    { recordType: 'files_imports.import_batch', action: 'edit' },
    { recordType: 'merchandise.pt', action: 'view' },
    { recordType: 'merchandise.pt', action: 'create' },
    { recordType: 'merchandise.pt', action: 'edit' },
    { recordType: 'access.approval_request', action: 'view' },
  ],
  {
    fieldClasses: [
      { fieldClass: 'cost', access: 'view' },
      { fieldClass: 'margin', access: 'view' },
    ],
  },
);
const ptApprovalApprover = await writeSyntheticUser(receivingDatabase, receivingCode, keys, {
  label: 'BROWSER-PTA-APPROVER',
  enrolled: true,
  personas: ['P-OPS'],
});
const ptApprovalDecider = await grantSynthetic(
  receivingDatabase,
  { kind: 'user', id: ptApprovalApprover.id },
  [
    { recordType: 'merchandise.pt', action: 'view' },
    { recordType: 'merchandise.pt', action: 'approve' },
    { recordType: 'receiving.arrival', action: 'view' },
    { recordType: 'receiving.grn', action: 'view' },
    { recordType: 'access.approval_request', action: 'view' },
    { recordType: 'access.approval_reason', action: 'view' },
    // The users, so My work names who prepared each PT: the PT file journey submits one in this world too.
    { recordType: 'access.user', action: 'view' },
    ...STOCK_VIEW,
  ],
  {
    fieldClasses: [
      { fieldClass: 'cost', access: 'view' },
      { fieldClass: 'margin', access: 'view' },
    ],
  },
);
{
  const limitAccess = receivingStructure.accessWith({ rules: ptApprovalRules, effects: new Map() });
  const preparer = receivingStructure.preparer;
  const preparing = await grantSynthetic(receivingDatabase, { kind: 'user', id: preparer.id }, LIMIT_ADMIN_AUTHORITY);
  const prepared = await receivingStructure.run(preparer.id, (context) =>
    limitAccess.prepareApprovalLimit(
      context,
      { userId: preparer.id, roleAssignmentId: preparing.assignmentId },
      {
        actionType: PT_APPROVAL,
        holder: {
          kind: 'individual',
          userId: ptApprovalApprover.id,
          roleAssignmentId: ptApprovalDecider.assignmentId,
        },
        // A SYNTHETIC ₹10,00,000.00 on the PT's total proposed acquisition cost.
        limit: { kind: 'amount', amount: paise(100_000_000) },
        coversUnknown: false,
        origin: 'synthetic',
        validFrom: receivingStructure.today(),
      },
    ),
  );
  if (prepared.kind !== 'success') throw new Error(`The PT limit was refused: ${prepared.refusal.code}`);
  const decided = await receivingStructure.decideThrough(
    limitAccess,
    prepared.answer.requestId,
    prepared.answer.limitId,
  );
  if (decided.kind !== 'success') throw new Error(`The PT limit was not approved: ${decided.refusal.code}`);
}
const ptApprovalStyle = syntheticCode(`JOURNEY-PTA-STYLE-${randomBytes(3).toString('hex').toUpperCase()}`);
const ptApprovalFile = join(dirname(worldFile), syntheticPtFileName('journey-pt-approval'));
// Two rows of the journey's style and the world's first size, each one piece at MRP 1,999.00, BASIC 700.00 and P RATE
// 945.00.
writeFileSync(
  ptApprovalFile,
  await syntheticPtWorkbook({
    rows: [
      ptRowOf('8900000000035', { DESIGN: ptApprovalStyle }),
      ptRowOf('8900000000042', { DESIGN: ptApprovalStyle }),
    ],
    marker: 'JOURNEY-PT-APPROVAL',
  }),
);
// The scan-in's destination at the Store (goods-in 7.2; S2-F07-T01): a floor of the PT world's Store unit, SYNTHETIC,
// apart from the receiving zone the goods are received into.
const ptApprovalFloor = await approved(receivingStructure, (c, p) =>
  receivingStructure.organisation.prepareLocation(c, p, {
    code: syntheticCode('JOURNEY-PTA-FLOOR'),
    siteId: ptReceivingWorld.siteId,
    businessUnitId: ptReceivingWorld.wholeStore,
    name: syntheticName('Journey shop floor'),
    kind: 'floor',
    validFrom: receivingStructure.today(),
  }),
);
// The setup's people approved the exception rules above, so its connections end only now.
await receivingStructure.close();
await receivingRouter.close();

// The readiness journey's world (site-readiness.spec.ts; S1-F04-T02), in its own Organisation made by the setup step:
// an approved SYNTHETIC Site with one warehouse unit of its own legal entity, its mapping verified as a fixture, since
// that journey is S1-F02-T02's (code-house-rules 11.2), and one location, so every check but the stock plan passes;
// policies 4 and 10 Signed and validated as SYNTHETIC fixtures, since that journey is S1-F04-T01's, the validations
// covering the values the modules report, the unit's verified mapping among them, and the journey's SYNTHETIC value of
// policy 4 (RR-558); an Operations user who runs the checks and declares the unit holds no stock, a different approver,
// and someone at the unit who records Arrivals, counts and issues GRNs (PRD-ACS-006).
const readinessSetup = await runSetupStep({
  migrationConnectionString: databaseUrl(world.directory, 'migration'),
  runtimeConnectionString: databaseUrl(world.directory, 'runtime'),
  request: setupRequestSchema.parse({
    ...journeyRequest,
    organisationCode: readinessCode,
    databaseName: readinessDatabase,
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
if (readinessSetup.outcome !== 'created') {
  throw new Error(`The readiness setup step did not create: ${readinessSetup.outcome}`);
}
const readinessStructure = await structureSetup({
  directory: world.directory,
  database: readinessDatabase,
  organisationCode: readinessCode,
  keysEnvironment: keys,
  label: 'BROWSER-READY',
});
const readyGeography = await approvedGeography(readinessStructure, 'READY');
const readyEntity = await approved(readinessStructure, (c, p) =>
  readinessStructure.organisation.prepareLegalEntity(c, p, {
    code: syntheticCode('JOURNEY-READY-LE'),
    legalName: syntheticName('Journey Ready Entity'),
    validFrom: readinessStructure.today(),
  }),
);
const readyRegistration = await approved(readinessStructure, (c, p) =>
  readinessStructure.organisation.prepareTaxRegistration(c, p, {
    code: syntheticCode('JOURNEY-READY-GSTIN'),
    legalEntityId: readyEntity.recordId,
    registrationNumber: 'SYNTHETIC-GSTIN-READY',
    stateId: readyGeography.state.recordId,
    validityFrom: readinessStructure.today(),
    validFrom: readinessStructure.today(),
  }),
);
const readyBook = await approved(readinessStructure, (c, p) =>
  readinessStructure.organisation.prepareAccountingBook(c, p, {
    code: syntheticCode('JOURNEY-READY-BK'),
    legalEntityId: readyEntity.recordId,
    name: syntheticName('Journey Ready Book'),
    validFrom: readinessStructure.today(),
  }),
);
const readinessSite = await approved(readinessStructure, (c, p) =>
  readinessStructure.organisation.prepareSite(c, p, {
    code: syntheticCode('JOURNEY-READY-SITE'),
    name: syntheticName('Journey Ready Site'),
    physicalKind: 'regional-warehouse',
    areaId: readyGeography.area.recordId,
    addresses: [syntheticName('1 Ready Road')],
    aliases: [],
    validFrom: readinessStructure.today(),
  }),
);
const readinessUnit = { code: syntheticCode('JOURNEY-READY-UNIT'), name: syntheticName('Journey Ready Unit') };
const readinessUnitAnswer = await approved(readinessStructure, (c, p) =>
  readinessStructure.organisation.prepareBusinessUnit(c, p, {
    ...readinessUnit,
    siteId: readinessSite.recordId,
    kind: 'warehouse',
    legalEntityId: readyEntity.recordId,
    taxRegistrationId: readyRegistration.recordId,
    accountingBookId: readyBook.recordId,
    origin: 'synthetic',
    validFrom: readinessStructure.today(),
  }),
);
await approved(readinessStructure, (c, p) =>
  readinessStructure.organisation.prepareLocation(c, p, {
    code: syntheticCode('JOURNEY-READY-LOC'),
    siteId: readinessSite.recordId,
    businessUnitId: readinessUnitAnswer.recordId,
    name: syntheticName('Journey Ready Floor'),
    kind: 'floor',
    validFrom: readinessStructure.today(),
  }),
);
// Its mapping verified through organisation's command by the setup's approver, who did not make it, with a SYNTHETIC
// stored file as its evidence (structure-and-masters 3.4; POL-10.08; code-house-rules 11.2).
await mappingsVerified(readinessStructure, readinessDatabase, [readinessUnitAnswer.recordId]);
/** An enrolled SYNTHETIC user of the readiness Organisation holding one persona and the authorities given. */
async function provisionReadinessUser(
  label: string,
  persona: PersonaId,
  authorities: Parameters<typeof grantSynthetic>[2],
): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(readinessDatabase, readinessCode, keys, {
    label,
    enrolled: true,
    personas: [persona],
  });
  await grantSynthetic(readinessDatabase, { kind: 'user', id: user.id }, authorities);
  return user;
}
const readinessOps = await provisionReadinessUser('BROWSER-READINESS-OPS', 'P-OPS', [
  { recordType: 'site_lifecycle.readiness_record', action: 'view' },
  { recordType: 'site_lifecycle.readiness_record', action: 'create' },
  { recordType: 'site_lifecycle.zero_stock_declaration', action: 'view' },
  { recordType: 'site_lifecycle.zero_stock_declaration', action: 'create' },
  // The unit list the screen chooses from (structure-and-masters 8).
  { recordType: 'organisation.business_unit', action: 'view' },
]);
const readinessApprover = await provisionReadinessUser('BROWSER-READINESS-APPROVER', 'P-OWN', [
  { recordType: 'site_lifecycle.readiness_record', action: 'view' },
  { recordType: 'site_lifecycle.readiness_record', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
const readinessReasonId = await writeSyntheticReason(readinessDatabase, 'approve');
await provisionReadinessUser('BROWSER-READINESS-RECEIVER', 'P-WHS', [
  { recordType: 'receiving.arrival', action: 'create' },
  { recordType: 'receiving.arrival', action: 'edit' },
  { recordType: 'receiving.grn', action: 'create' },
]);
for (const policy of [4, 10] as const) {
  await signedFixture(readinessDatabase, policy, [
    ...(policy === 4 ? [`${readinessValuesCheck.code}:syn-readiness-value@v1`] : []),
    ...(await reportedValues(
      (work) => readinessStructure.run(readinessStructure.preparer.id, work),
      RECEIVING_POLICY_CHECKS.filter((check) => check.policy === policy),
    )),
  ]);
}
await readinessStructure.close();

// The built web app from the same origin as the API, as the `app` service serves it (deployment.md section 3;
// S1-F01-T27): this file runs from apps/server/dist-browser/test/browser/.
const webApp = fileURLToPath(new URL('../../../../web/dist', import.meta.url));
// The built counter app at /counter/ beside it (offline-counter 5.2; RR-420; S1-F12-T02).
const counterApp = fileURLToPath(new URL('../../../../counter/dist', import.meta.url));
// A MinIO container for the evidence files of the business units journey (code-house-rules 12.10).
const fileStore = await startTestFileStore();
const app = await startAccessApp(
  world,
  {
    ...keys,
    AOS_ENVIRONMENT: 'local',
    AOS_DEMO_SIGN_IN: JSON.stringify([{ organisationCode: settingsCode, login: demoUser.login, label: demoLabel }]),
  },
  {
    origin,
    port,
    webApp,
    counterApp,
    fileStoreEnvironment: fileStore.environment,
    // And the damage exception, receiving's follow-ups and the overdue booking balance the application registers
    // (S2-F08-T01, S2-F02-T03, S2-F01-T04).
    exceptionTypes: [syntheticMismatch, damageExceptionType, ...receivingExceptionTypes, overdueExceptionType],
    // The approval limits journey's test-only valued action type (S1-F05-T01; code-house-rules 11.4).
    extraRecordTypes: [limitsBookingType, bulkBookingType],
    extraApprovalRules: [limitsBookingRule, bulkBookingRule],
    // The policy readiness journey's test-only operation and validity check (S1-F04-T01; code-house-rules 11.4), the
    // booking journey's TEST-ONLY values of policies 5 and 1 (RR-561; S2-F01-T03) and policy 17's test-only check of the
    // damage journey (support/damage.ts; S2-F08-T01).
    gatedOperations: [policyOperation, readinessOperation],
    validityChecks: [
      policyValuesCheck,
      readinessValuesCheck,
      ...BOOKING_POLICY_CHECKS,
      SYNTHETIC_POLICY_17_VALUES,
      // Policy 3's TEST-ONLY value, for the PT approval journey, as no module reports policy 3's values yet (RR-605).
      syntheticPolicyValues(3),
    ],
    // The stock ledger's event kinds, as the application declares them, which the PT approval journey posts
    // (S2-F06-T01), and the posting maps journey's SYNTHETIC event kinds (S1-F09-T02; code-house-rules 11.4).
    postingEventKinds: [...STOCK_POSTING_EVENT_KINDS, ...POSTING_JOURNEY_KINDS],
  },
);

// The evidence journey's exception rule change, prepared through the API by its Admin once the server listens, so
// its approval request reaches the approver's My work through the worker (S1-F08-T03). It routes at the business units
// journey's Site, since a routed Site must exist (RR-451). Every value is SYNTHETIC.
{
  const at = { 'content-type': 'application/json', origin, 'x-forwarded-for': '10.8.8.31' };
  const signedIn = await fetch(`${app.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: at,
    body: JSON.stringify({
      organisationCode: settingsCode,
      login: evidenceRulesAdmin.login,
      password: evidenceRulesAdmin.password,
      totpCode: codeFor(evidenceRulesAdmin.factorSecret ?? Buffer.alloc(0)),
    }),
  });
  if (signedIn.status !== 200)
    throw new Error(`The evidence rules Admin was not signed in: ${String(signedIn.status)}`);
  const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const prepared = await fetch(`${app.baseUrl}/api/exceptions/routing`, {
    method: 'POST',
    headers: { ...at, cookie, 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      typeCode: syntheticMismatch.code,
      siteId: unitsSite.recordId,
      owner: { kind: 'user', userId: exceptionsOps.id },
      dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
      escalation: { kind: 'user', userId: exceptionsOps.id },
      validFrom: structureFixture.today(),
      origin: 'synthetic',
    }),
  });
  if (prepared.status !== 200) throw new Error(`The evidence rule change was refused: ${await prepared.text()}`);
}

// The booking the receive-against-booking journey receives against (S2-F02-T04): recorded with its document and
// submitted by the fixture's Booking user, and approved by the fixture's Owner, through the API once the server listens, as the booking
// journey proves on screen (booking.spec.ts): two pieces of one style and size, so a delivery of three is excess
// (POL-05.08). Each authenticator code is for a step not used before: sign-in one step back, the decision now, both
// within the step either side of now the server accepts (access-and-approvals 3.1). Every value is SYNTHETIC.
const againstStyle = syntheticCode('JOURNEY-RAB-STYLE');
const againstBookingNumber = await (async (): Promise<string> => {
  const at = { 'content-type': 'application/json', origin, 'x-forwarded-for': '10.8.8.51' };
  const signIn = async (user: SyntheticUser) => {
    const signedIn = await fetch(`${app.baseUrl}/api/access/sign-in`, {
      method: 'POST',
      headers: at,
      body: JSON.stringify({
        organisationCode: receivingCode,
        login: user.login,
        password: user.password,
        totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0), -1),
      }),
    });
    if (signedIn.status !== 200)
      throw new Error(`A booking fixture user was not signed in: ${String(signedIn.status)}`);
    return (signedIn.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  };
  const call = async (cookie: string, path: string, body: unknown) => {
    const answer = await fetch(`${app.baseUrl}${path}`, {
      method: 'POST',
      headers: { ...at, cookie, 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(body),
    });
    if (answer.status !== 200) throw new Error(`The booking fixture was refused at ${path}: ${await answer.text()}`);
    return (await answer.json()) as Record<string, string>;
  };
  const booker = await signIn(againstFixtureBooker);
  const stored = await call(booker, STORE_FILE_PATH, syntheticPdfUpload('BOOKING', 'JOURNEY-RAB'));
  const made = await call(booker, '/api/booking/bookings', {
    brandId: againstWorld.brand.id,
    destinationSiteId: againstWorld.siteId,
    supplierPartyId: againstWorld.supplier.id,
    seasonValueId: bookingSeason.valueId,
    deliveryWindow: { from: receivingStructure.today(), to: receivingStructure.day(30) },
    lines: [
      {
        styleCode: againstStyle,
        colour: 'SYNTHETIC NAVY',
        size: againstWorld.sizes.values[0]?.code ?? null,
        quantity: 2,
        indicativeCost: 50_000,
        mrp: 99_900,
        deliveryDate: null,
      },
    ],
  });
  const bookingId = made.bookingId ?? '';
  const attached = await call(booker, `/api/booking/bookings/${bookingId}/documents`, {
    files: [{ storedFileId: stored.storedFileId, fileReceiptId: stored.receiptId }],
    versionToken: made.versionToken,
  });
  const submitted = await call(booker, `/api/booking/bookings/${bookingId}/submission`, {
    versionToken: attached.versionToken,
  });
  const owner = await signIn(againstFixtureOwner);
  await call(owner, `/api/access/approval-requests/${submitted.requestId ?? ''}/decision`, {
    versionId: submitted.versionId,
    outcome: 'approve',
    reason: { kind: 'listed', reasonId: bookingReasonId },
    totpCode: codeFor(againstFixtureOwner.factorSecret ?? Buffer.alloc(0)),
  });
  const read = await fetch(`${app.baseUrl}/api/booking/bookings/${bookingId}`, { headers: { cookie: owner } });
  const number = ((await read.json()) as { booking: { number?: string } }).booking.number;
  if (number === undefined) throw new Error('The booking of the receive-against-booking journey has no number');
  return number;
})();

// The import outcomes report journey's two batches, one in each Store, started through the API by the seeding
// importer once the server listens (imports-and-opening-data 13.1; S1-F06-T04). Every value is SYNTHETIC.
const outcomesBatchCodes: string[] = [];
{
  const at = { 'content-type': 'application/json', origin, 'x-forwarded-for': '10.8.8.41' };
  const signedIn = await fetch(`${app.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: at,
    body: JSON.stringify({
      organisationCode: postingCode,
      login: outcomesSeeder.login,
      password: outcomesSeeder.password,
      totpCode: codeFor(outcomesSeeder.factorSecret ?? Buffer.alloc(0)),
    }),
  });
  if (signedIn.status !== 200) throw new Error(`The outcomes seeder was not signed in: ${String(signedIn.status)}`);
  const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  for (const [index, store] of outcomesStores.entries()) {
    const marker = `${duplicateSuffix}S${String(index + 1)}`;
    const bytes = await syntheticProductWorkbook(
      [
        duplicateRow(
          syntheticCode(`JOURNEY-OUTCOMES-STYLE-${marker}`),
          syntheticCode(`JOURNEY-OUTCOMES-SKU-${marker}`),
        ),
      ],
      marker,
    );
    const stored = await fetch(`${app.baseUrl}/api/files-imports/import-files`, {
      method: 'POST',
      headers: { ...at, cookie, 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        sourceSystem: 'manual-upload',
        originalName: syntheticProductFileName(`journey-outcomes-${String(index + 1)}`),
        contentBase64: bytes.toString('base64'),
      }),
    });
    if (stored.status !== 200) throw new Error(`The outcomes file was refused: ${await stored.text()}`);
    const file = (await stored.json()) as { storedFileId: string; receiptId: string };
    const started = await fetch(`${app.baseUrl}/api/files-imports/batches`, {
      method: 'POST',
      headers: { ...at, cookie, 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        storedFileId: file.storedFileId,
        fileReceiptId: file.receiptId,
        kind: 'create',
        target: 'merchandise',
        layoutVersionId: intakeLayout.layoutVersionId,
        mappingVersionId: intakeLayout.mappingVersionId,
        scope: { siteId: outcomesSite, storeId: store },
      }),
    });
    if (started.status !== 200) throw new Error(`The outcomes batch was refused: ${await started.text()}`);
    outcomesBatchCodes.push(((await started.json()) as { code: string }).code);
  }
}

// The opening publish journey's batch (S1-F13-T03): the test-only opening-stock handler composed into this server,
// with no ledger, since nothing posts here; then a SYNTHETIC manifest of one row, started by its preparer through the
// API at the posting journey's Store unit.
app.app.get<ImportHandlers>(IMPORT_HANDLERS).register(
  openingStockHandler({
    organisation: app.app.get<OrganisationInterface>(ORGANISATION),
    catalogue: app.app.get<CatalogueInterface>(CATALOGUE),
    // No season is chosen in the journey; its attribute is SYNTHETIC and names nothing.
    seasonAttributeId: uuidv7(),
  }),
);
let openingBatchCode: string;
{
  const at = { 'content-type': 'application/json', origin, 'x-forwarded-for': '10.8.8.51' };
  const signedIn = await fetch(`${app.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: at,
    body: JSON.stringify({
      organisationCode: postingCode,
      login: openingSeeder.login,
      password: openingSeeder.password,
      totpCode: codeFor(openingSeeder.factorSecret ?? Buffer.alloc(0)),
    }),
  });
  if (signedIn.status !== 200) throw new Error(`The opening seeder was not signed in: ${String(signedIn.status)}`);
  const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const bytes = await syntheticWorkbook({
    sheet: MANIFEST_SHEET,
    header: Object.values(MANIFEST_FIELDS),
    rows: [
      cellsOf(MANIFEST_FIELDS, {
        manifestReference: 'SYN-JOURNEY-M-1',
        section: 'opening-stock',
        quantity: '1',
        condition: 'good',
        barcode: 'SYN-JOURNEY-BC-1',
      }),
    ],
    marker: `opening-${duplicateSuffix}`,
  });
  const stored = await fetch(`${app.baseUrl}/api/files-imports/import-files`, {
    method: 'POST',
    headers: { ...at, cookie, 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      sourceSystem: 'manual-upload',
      originalName: syntheticProductFileName('journey-opening'),
      contentBase64: bytes.toString('base64'),
    }),
  });
  if (stored.status !== 200) throw new Error(`The opening file was refused: ${await stored.text()}`);
  const file = (await stored.json()) as { storedFileId: string; receiptId: string };
  const started = await fetch(`${app.baseUrl}/api/files-imports/batches`, {
    method: 'POST',
    headers: { ...at, cookie, 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      storedFileId: file.storedFileId,
      fileReceiptId: file.receiptId,
      kind: 'opening-balance',
      target: OPENING_STOCK_TARGET,
      layoutVersionId: openingLayout.layoutVersionId,
      mappingVersionId: openingLayout.mappingVersionId,
      scope: { siteId: postingSite.recordId, businessUnitId: postingStoreUnit.recordId },
    }),
  });
  if (started.status !== 200) throw new Error(`The opening batch was refused: ${await started.text()}`);
  openingBatchCode = ((await started.json()) as { code: string }).code;
}

/**
 * Waits until the worker has delivered every event the fixtures recorded for its consumers, in every Organisation the
 * directory lists: none left undispatched since its consumer registered, and no delivery job created, retried or
 * active. So no journey waits in My work behind another's fixtures (code-house-rules 10.1; code review 7 of stage 2).
 * At most ten minutes, a technical bound of this test plumbing.
 */
async function fixtureEventsDelivered(): Promise<void> {
  const directory = await connect(world.directory, 'migration');
  let databases: string[];
  try {
    databases = (
      await directory.query<{ name: string }>('select database_name as name from kernel.directory_entry')
    ).rows.map((row) => row.name);
  } finally {
    await directory.end();
  }
  const until = Date.now() + 600_000;
  for (;;) {
    let waiting = 0;
    for (const database of databases) {
      const owner = await connect(database, 'migration');
      try {
        const [undispatched] = (
          await owner.query<{ count: number }>(
            `select count(*)::int as count from kernel.outbox_event e
               join kernel.outbox_consumer c on c.event_type = e.event_type and e.recorded_at >= c.recorded_at
              where not exists (select 1 from kernel.outbox_dispatch d
                                 where d.outbox_event_id = e.id and d.outbox_consumer_id = c.id)`,
          )
        ).rows;
        const [delivering] = (
          await owner.query<{ count: number }>(
            `select count(*)::int as count from pgboss.job where state in ('created', 'retry', 'active')`,
          )
        ).rows;
        waiting += (undispatched?.count ?? 0) + (delivering?.count ?? 0);
      } finally {
        await owner.end();
      }
    }
    if (waiting === 0) return;
    if (Date.now() > until) throw new Error(`The worker still had ${String(waiting)} fixture events to deliver`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}
await fixtureEventsDelivered();

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
      classifyAdmin: credentialsOf(classifyAdmin),
      classifyApprover: credentialsOf(classifyApprover),
      accounts: credentialsOf(structureAccounts),
      siteId: unitsSite.recordId,
      siteOption: `${syntheticCode('JOURNEY-UNITS-SITE')} · ${syntheticName('Journey Units Site')}`,
      entities: unitsEntities,
    },
    vocabularies: {
      organisationCode: settingsCode,
      booking: credentialsOf(vocabularyBooking),
      confirmer: credentialsOf(vocabularyConfirmer),
      attributeName: vocabularyAttribute.name,
    },
    markedAttributes: {
      organisationCode: settingsCode,
      admin: credentialsOf(markingAdmin),
      owner: credentialsOf(markingOwner),
      // How the attribute form names the SYNTHETIC size list (budget.option).
      attributeOption: `${markingAttribute.code} · ${markingAttribute.name}`,
    },
    products: {
      organisationCode: settingsCode,
      booking: credentialsOf(productsBooking),
      confirmer: credentialsOf(productsConfirmer),
      // How the proposal form names the brand and the category: code and name (useNames).
      brandOption: `${productsBrand.code} · ${productsBrand.name}`,
      categoryOption: `${productsCategory.code} · ${productsCategory.name}`,
      freeSize: productsFreeSize,
      seasonName: productsSeason.name,
      seasonValueOption: `${productsSeasonValue.code} · ${productsSeasonValue.name}`,
      fitName: productsFit.name,
    },
    receiving: {
      organisationCode: receivingCode,
      receiver: credentialsOf(receivingReceiver),
      // How the screens name the SYNTHETIC Site, units, location, supplier, brand and size (receive.option).
      options: receivingWorld.options,
      storeStaff: credentialsOf(receivingStoreStaff),
      storeOptions: storeStaffWorld.options,
      storeBatchStyleCode: storeStaffWorld.batchSku.styleCode,
    },
    booking: {
      organisationCode: receivingCode,
      booker: credentialsOf(bookingBooker),
      owner: credentialsOf(bookingOwner),
      reasonId: bookingReasonId,
      // How the booking form names the SYNTHETIC brand, Site, supplier and season (receive.option).
      brandOption: receivingWorld.options.brand,
      siteOption: receivingWorld.options.site,
      supplierOption: receivingWorld.options.supplier,
      seasonOption: `${bookingSeason.code} · ${bookingSeason.name}`,
    },
    damage: {
      organisationCode: receivingCode,
      reporter: credentialsOf(damageReporter),
      operations: credentialsOf(damageOperations),
      reasonId: damageReasonId,
      options: damageWorld.options,
    },
    heldLines: {
      organisationCode: receivingCode,
      receiver: credentialsOf(heldReceiver),
      approver: credentialsOf(heldApprover),
      reasonId: damageReasonId,
      options: heldWorld.options,
    },
    recount: {
      organisationCode: receivingCode,
      receiver: credentialsOf(recountReceiver),
      approver: credentialsOf(recountApprover),
      reasonId: damageReasonId,
      options: heldWorld.options,
    },
    againstBooking: {
      organisationCode: receivingCode,
      receiver: credentialsOf(againstReceiver),
      booker: credentialsOf(againstBooker),
      owner: credentialsOf(againstOwner),
      reasonId: bookingReasonId,
      options: againstWorld.options,
      bookingNumber: againstBookingNumber,
      styleCode: againstStyle,
    },
    ptUpload: {
      organisationCode: receivingCode,
      maker: credentialsOf(ptMaker),
      options: ptReceivingWorld.options,
      styleCode: ptStyle,
      refusedFile: ptRefusedFile,
      goodFile: ptGoodFile,
    },
    ptApproval: {
      organisationCode: receivingCode,
      maker: credentialsOf(ptApprovalMaker),
      approver: credentialsOf(ptApprovalApprover),
      reasonId: bookingReasonId,
      options: ptReceivingWorld.options,
      styleCode: ptApprovalStyle,
      file: ptApprovalFile,
      // The file's two barcodes, one a piece, and the floor the scan-in puts them on, as the screen names it.
      barcodes: ['8900000000035', '8900000000042'],
      floor: `Floor: ${syntheticCode('JOURNEY-PTA-FLOOR')} · ${syntheticName('Journey shop floor')}`,
      floorId: ptApprovalFloor.recordId,
      floorName: `${syntheticCode('JOURNEY-PTA-FLOOR')} · ${syntheticName('Journey shop floor')}`,
    },
    openToBuy: {
      organisationCode: settingsCode,
      booking: credentialsOf(openToBuyBooking),
      accounts: credentialsOf(openToBuyAccounts),
      owner: credentialsOf(openToBuyOwner),
      reasonId: openToBuyReasonId,
      // How the budget form names the products journey's SYNTHETIC brand and season, a value of the attribute marked
      // as the season (budget.option; RR-550).
      brandOption: `${productsBrand.code} · ${productsBrand.name}`,
      seasonOption: `${productsSeasonValue.code} · ${productsSeasonValue.name}`,
    },
    fileIntake: {
      organisationCode: postingCode,
      booking: credentialsOf(intakeBooking),
      filePath: intakeFile,
      // How the screen names the saved layout and mapping (intake.layout.option).
      layoutOption: `${SYNTHETIC_PRODUCT_LAYOUT_CODE}-CONFIRMED version 1 · ${SYNTHETIC_PRODUCT_MAPPING_CODE}-CONFIRMED version 1 (Confirmed)`,
      styleCode: intakeStyle,
      skuCode: intakeSku,
      ruleBooking: credentialsOf(ruleBooking),
      confirmer: credentialsOf(intakeConfirmer),
      brandCode: intakeBrand.code,
      today: postingFixture.today(),
      duplicate: {
        booking: credentialsOf(duplicateBooking),
        firstFile: duplicateFirstFile,
        secondFile: duplicateSecondFile,
        style: duplicateStyle,
        newStyle: duplicateNewStyle,
      },
      outcomes: {
        reader: credentialsOf(outcomesReader),
        storeBatchCode: outcomesBatchCodes[0] ?? '',
        otherBatchCode: outcomesBatchCodes[1] ?? '',
      },
      refusal: {
        booking: credentialsOf(refusalBooking),
        macroFilePath: refusalMacroFile,
        cleanFilePath: refusalCleanFile,
      },
      opening: {
        preparer: credentialsOf(openingPreparer),
        batchCode: openingBatchCode,
      },
      cost: {
        reader: credentialsOf(costReader),
        filePath: costFile,
        layoutOption: `${costedLayoutCode} version 1 · ${costedMappingCode} version 1 (Confirmed)`,
        styleCode: costStyle,
        costValue,
      },
    },
    bankDetails: {
      organisationCode: settingsCode,
      preparer: credentialsOf(bankPreparer),
      approver: credentialsOf(bankApprover),
      supplierCode: bankSupplier.code,
    },
    agreement: {
      organisationCode: settingsCode,
      preparer: credentialsOf(agreementPreparer),
      approver: credentialsOf(agreementApprover),
      supplierCode: agreementSupplier.code,
      supplierName: agreementSupplier.legalName,
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
    exceptions: {
      organisationCode: settingsCode,
      operations: credentialsOf(exceptionsOps),
      code: raisedException.value.code,
    },
    live: {
      organisationCode: settingsCode,
      operations: credentialsOf(liveOps),
      raiser: credentialsOf(liveRaiser),
      siteId: liveSite,
      typeCode: syntheticMismatch.code,
      link: { module: TEST_EXCEPTIONS_MODULE, recordType: TEST_DOCUMENT_TYPE, recordId: liveDocument },
    },
    operationsView: {
      organisationCode: settingsCode,
      viewer: credentialsOf(operationsViewer),
      backupId: syntheticBackupId,
      jobKind: syntheticAlwaysFails.name,
    },
    // S1-F05-T01: the Admin who prepares a limit for the booking approver's role, the person who approves it, and the
    // booking approver, with how the forms name the role and the action type.
    limits: {
      organisationCode: settingsCode,
      admin: credentialsOf(limitsAdmin),
      approver: credentialsOf(limitsApprover),
      bookingApprover: credentialsOf(bookingApprover),
      roleOption: `${bookingRole.code} · ${bookingRole.name}`,
      actionOption: `${LIMITS_BOOKING} · limited on cost`,
      reasonId: limitsReasonId,
    },
    // S1-F05-T02: the bulk approver, and the reason they give.
    bulk: {
      organisationCode: settingsCode,
      approver: credentialsOf(bulkApprover),
      reasonId: limitsReasonId,
    },
    // S1-F08-T03: the Operations user who owns the evidence exception, by its code, and the approver who decides the
    // rule change with evidence, with the reason they give.
    evidence: {
      organisationCode: settingsCode,
      operations: credentialsOf(evidenceOps),
      code: evidenceException.value.code,
      approver: credentialsOf(evidenceApprover),
      reasonId: evidenceReasonId,
    },
    // S1-F04-T01: the Admin who records policy 14 as Signed, the person who validates its values, and the operation.
    policyReadiness: {
      organisationCode: settingsCode,
      admin: credentialsOf(policyAdmin),
      validator: credentialsOf(policyValidator),
      operation: policyOperation.code,
      capability: policyOperation.capability,
    },
    // S1-F04-T02: the Operations user who runs the checks, the approver who decides from My work, the reason they
    // give, and how the screen names the unit.
    readiness: {
      organisationCode: readinessCode,
      operations: credentialsOf(readinessOps),
      approver: credentialsOf(readinessApprover),
      reasonId: readinessReasonId,
      unitOption: `${readinessUnit.code} · ${readinessUnit.name}`,
    },
    // S1-F12-T01: the devices journey's Admin, and how the screen names the Stores and units.
    devices: {
      organisationCode: settingsCode,
      admin: credentialsOf(devicesAdmin),
      lifecycleAdmin: credentialsOf(devicesLifecycleAdmin),
      // S1-F12-T03: the bill numbering journey's Admin and approver.
      numberingAdmin: credentialsOf(numberingAdmin),
      numberingApprover: credentialsOf(numberingApprover),
      storeOption: `${devicesStore.code} · ${devicesStore.name}`,
      otherStoreOption: `${devicesOtherStore.code} · ${devicesOtherStore.name}`,
      units: devicesUnits.map((unit) => ({ code: unit.code, name: unit.name, store: unit.store })),
    },
    // S1-F09-T02: the posting maps journey's two Accounts users, the reason the approver gives, the Store-scoped
    // reader, and how the screens name the book, the event kind, the accounts and the period.
    postingMaps: {
      organisationCode: postingCode,
      preparer: credentialsOf(postingMapsPreparer),
      approver: credentialsOf(postingMapsApprover),
      storeReader: credentialsOf(postingStoreReader),
      reasonId: postingReasonId,
      bookOption: `${postingBookCode} · ${postingBookName}`,
      eventKind: POSTING_JOURNEY_KIND.kind,
      periodCode: syntheticCode('JOURNEY-P1'),
      periodId: postingPeriod.periodId,
    },
    // S1-F09-T03: the period close journey's two Accounts users, the reason the approver gives, how the screen names
    // the book and the periods, the correction a reopening names, and the harness that posts it.
    periodClose: {
      organisationCode: postingCode,
      requester: credentialsOf(periodRequester),
      approver: credentialsOf(periodApprover),
      reasonId: postingReasonId,
      bookOption: `${periodBookCode} · ${periodBookName}`,
      periodCodes: [...periodCodes],
      correction: periodCorrection,
      harnessUrl: `http://127.0.0.1:${String(harnessPort)}/post-period-correction`,
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
worldWritten = true;
process.stdout.write(`Browser journey server listening on port ${String(port)} for ${origin}\n`);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await worker.stop().catch(() => undefined);
  harness.close();
  await postingFixture.close().catch(() => undefined);
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
  await dropDatabase(postingDatabase).catch(() => undefined);
  await dropDatabase(receivingDatabase).catch(() => undefined);
  await dropDatabase(readinessDatabase).catch(() => undefined);
  await world.reset().catch(() => undefined);
  await postgres.stop().catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
