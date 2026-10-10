import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { known, paise, uuidv7 } from '@apparel-os/domain';
import {
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
import { EXCEPTION_CODE_KIND, Exceptions } from '../../src/modules/exceptions/index.js';
import { Inbox, inboxConsumers } from '../../src/modules/inbox/index.js';
import { Numbering } from '../../src/modules/numbering/index.js';
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
import { capturingLogger, writeSyntheticServiceIdentity } from '../support/jobs.js';
import { startTestFileStore } from '../support/minio.js';
import { approved, approvedGeography, structureSetup } from '../support/organisation.js';
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
// The readiness journey (site-readiness.spec.ts; S1-F04-T02): an approved SYNTHETIC Site with one warehouse unit of
// its own legal entity, its mapping verified as a fixture and one location, so every check but the stock plan passes.
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
const readinessSite = await approved(structureFixture, (c, p) =>
  structureFixture.organisation.prepareSite(c, p, {
    code: syntheticCode('JOURNEY-READY-SITE'),
    name: syntheticName('Journey Ready Site'),
    physicalKind: 'regional-warehouse',
    areaId: structureGeography.area.recordId,
    addresses: [syntheticName('1 Ready Road')],
    aliases: [],
    validFrom: structureFixture.today(),
  }),
);
const readinessUnit = { code: syntheticCode('JOURNEY-READY-UNIT'), name: syntheticName('Journey Ready Unit') };
const readinessUnitAnswer = await approved(structureFixture, (c, p) =>
  structureFixture.organisation.prepareBusinessUnit(c, p, {
    ...readinessUnit,
    siteId: readinessSite.recordId,
    kind: 'warehouse',
    legalEntityId: readinessEntity.recordId,
    taxRegistrationId: readinessRegistration.recordId,
    accountingBookId: readinessBook.recordId,
    validFrom: structureFixture.today(),
  }),
);
await approved(structureFixture, (c, p) =>
  structureFixture.organisation.prepareLocation(c, p, {
    code: syntheticCode('JOURNEY-READY-LOC'),
    siteId: readinessSite.recordId,
    businessUnitId: readinessUnitAnswer.recordId,
    name: syntheticName('Journey Ready Floor'),
    kind: 'floor',
    validFrom: structureFixture.today(),
  }),
);
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
    document: { recordType: 'test-synthetic.document', recordId: uuidv7() },
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
    document: { recordType: periodCorrection.recordType, recordId: periodCorrection.recordId },
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
// local port of its own beside the server of the journeys.
const harnessPort = port + 11;
const harness = createServer((request, response) => {
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
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
const productsConfirmer = await provisionUser('BROWSER-PRODUCTS-CONFIRMER', 'P-BKG', [
  ...productViews,
  { recordType: 'merchandise.product_proposal', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);

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
]);
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

// The readiness journey (site-readiness.spec.ts; S1-F04-T02), in the settings Organisation: a test-only module's
// SYNTHETIC receiving operation governed by policy 4, needing someone at the unit to run the checks and two different
// people to prepare and approve them; policy 4 Signed and validated as SYNTHETIC fixtures, since that journey is
// S1-F04-T01's; the unit's mapping verified as a fixture, since that journey is S1-F02-T02's (code-house-rules 11.2);
// an Operations user who runs the checks and declares the unit holds no stock; and a different approver.
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
{
  const owner = await connect(settingsDatabase, 'migration');
  try {
    await owner.query(
      `insert into organisation.business_unit_mapping_verification
         (id, business_unit_mapping_id, verified_by_user_id, verified_at, attachment_ids)
       select $1, id, $2, now(), array[$3::uuid] from organisation.business_unit_mapping
        where business_unit_id = $4 and decision = 'Approved'`,
      [uuidv7(), uuidv7(), uuidv7(), readinessUnitAnswer.recordId],
    );
    await owner.query(
      `insert into configuration.policy_signature (id, policy_number, signatory, signed_on, origin,
         evidence_attachment_ids, recorded_by_user_id, role_assignment_id, recorded_at)
       values ($1, 4, 'SYNTHETIC signatory', current_date, 'synthetic', array[$2::uuid], $3, $4, now())`,
      [uuidv7(), uuidv7(), uuidv7(), uuidv7()],
    );
    await owner.query(
      `insert into configuration.policy_validation (id, policy_number, origin, validated_values,
         evidence_attachment_ids, validated_by_user_id, role_assignment_id, validated_at)
       values ($1, 4, 'synthetic', array[$5], array[$2::uuid], $3, $4, now())`,
      [uuidv7(), uuidv7(), uuidv7(), uuidv7(), `${readinessValuesCheck.code}:syn-readiness-value@v1`],
    );
  } finally {
    await owner.end();
  }
}
const readinessOps = await provisionUser('BROWSER-READINESS-OPS', 'P-OPS', [
  { recordType: 'site_lifecycle.readiness_record', action: 'view' },
  { recordType: 'site_lifecycle.readiness_record', action: 'create' },
  { recordType: 'site_lifecycle.zero_stock_declaration', action: 'view' },
  { recordType: 'site_lifecycle.zero_stock_declaration', action: 'create' },
  // The unit list the screen chooses from (structure-and-masters 8).
  { recordType: 'organisation.business_unit', action: 'view' },
]);
const readinessApprover = await provisionUser('BROWSER-READINESS-APPROVER', 'P-OWN', [
  { recordType: 'site_lifecycle.readiness_record', action: 'view' },
  { recordType: 'site_lifecycle.readiness_record', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
]);
const readinessReasonId = await writeSyntheticReason(settingsDatabase, 'approve');

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
  {
    origin,
    port,
    webApp,
    fileStoreEnvironment: fileStore.environment,
    exceptionTypes: [syntheticMismatch],
    // The approval limits journey's test-only valued action type (S1-F05-T01; code-house-rules 11.4).
    extraRecordTypes: [limitsBookingType, bulkBookingType],
    extraApprovalRules: [limitsBookingRule, bulkBookingRule],
    // The policy readiness journey's test-only operation and validity check (S1-F04-T01; code-house-rules 11.4).
    gatedOperations: [policyOperation, readinessOperation],
    validityChecks: [policyValuesCheck, readinessValuesCheck],
    // The posting maps journey's SYNTHETIC event kinds (S1-F09-T02; code-house-rules 11.4).
    postingEventKinds: POSTING_JOURNEY_KINDS,
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
      validFrom: new Date().toISOString().slice(0, 10),
      origin: 'synthetic',
    }),
  });
  if (prepared.status !== 200) throw new Error(`The evidence rule change was refused: ${await prepared.text()}`);
}

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
    bankDetails: {
      organisationCode: settingsCode,
      preparer: credentialsOf(bankPreparer),
      approver: credentialsOf(bankApprover),
      supplierCode: bankSupplier.code,
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
      organisationCode: settingsCode,
      operations: credentialsOf(readinessOps),
      approver: credentialsOf(readinessApprover),
      reasonId: readinessReasonId,
      unitOption: `${readinessUnit.code} · ${readinessUnit.name}`,
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
  await world.reset().catch(() => undefined);
  await postgres.stop().catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
