import { randomInt } from 'node:crypto';
import { paise, uuidv7 } from '@apparel-os/domain';
import {
  arrivalReadSchema,
  DAMAGE_DECISION,
  grnPtReadSchema,
  HELD_LINE_DECISION,
  PT_APPROVAL,
  ptPreviewSchema,
  ptRevisionReadSchema,
  type Arrival,
  type AssignmentScope,
  type FieldClass,
  type GrnPtRead,
  type PtRevisionRead,
} from '@apparel-os/schemas';
import { expect } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  CLOCK,
  LOGGER,
  ORGANISATION_TIMEZONE_SOURCE,
  OrganisationRouter,
  ROUTING_ENVIRONMENT,
  WORKER,
  WORKER_ENVIRONMENT,
  WORKER_SETTINGS_VARIABLE,
  type RoutedOrganisation,
  type Worker,
} from '../../src/kernel/index.js';
import { ACCESS, ACCESS_ENVIRONMENT, type AccessInterface } from '../../src/modules/access/index.js';
import {
  CONFIGURATION,
  CONFIGURATION_ENVIRONMENT,
  type ConfigurationInterface,
} from '../../src/modules/configuration/index.js';
import { FILE_STORE_ENVIRONMENT, FILES_IMPORTS_ENVIRONMENT } from '../../src/modules/files-imports/index.js';
import type { PtPostingQueue } from '../../src/modules/merchandise/pt/index.js';
import { serviceIdentitiesOf } from '../../src/setup-organisation.js';
import { jobRegistry, WorkerModule } from '../../src/worker.module.js';
import { SYNTHETIC_INTAKE_CAPS_ENVIRONMENT } from '../fixtures/intake-caps.js';
import { TEST_COMPOSITION } from './composition.js';
import { NUMBERING, type NumberingInterface } from '../../src/modules/numbering/index.js';
import { STOCK_POSTING_EVENT_KINDS } from '../../src/modules/stock/ledger/index.js';
import { defineSyntheticDamageReportSeries } from '../fixtures/damage-report-series.js';
import { defineSyntheticGrnSeries } from '../fixtures/grn-series.js';
import { syntheticPtFileName, syntheticPtWorkbook, type SyntheticPtRow } from '../fixtures/pt.js';
import { defineSyntheticPtSeries, defineSyntheticSkuCodeSeries } from '../fixtures/pt-series.js';
import { syntheticCode, syntheticName } from '../fixtures/synthetic.js';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  SyntheticClock,
  SYNTHETIC_ORIGIN,
  syntheticTimezone,
  writeSyntheticReason,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './access.js';
import { asUserIn, damageGateOpen, DECIDER_AUTHORITY, RECEIVER_REPORTER_AUTHORITY } from './damage.js';
import { defineSyntheticCodeSeries } from './exceptions.js';
import { grantSynthetic, type SyntheticAuthority } from './grants.js';
import { defineSyntheticImportBatchSeries } from './imports.js';
import { capturingLogger, writeSyntheticServiceIdentity } from './jobs.js';
import { syntheticWorkerSettings } from '../fixtures/worker-settings.js';
import { startTestFileStore, type TestFileStore } from './minio.js';
import { STORE_FILE_PATH, syntheticPdfUpload } from './opening-app.js';
import { decided, structureSetup, type StructureSetup } from './organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './organisations.js';
import { connect, databaseUrl } from './postgres.js';
import { ptWorld, type PtWorld } from './pt.js';
import { ptGateOpen, PT_TEST_CHECKS, syntheticPtBook, type SyntheticAccount } from './pt-gate.js';
import {
  agreementTerms,
  receivingFixture,
  receivingGateOpen,
  receivingGranted,
  STOCK_VIEW,
  type ReceivingFixture,
} from './receiving.js';

// The SYNTHETIC world of a PT's approval (goods-in 6; S2-F06-T01), on the world of a PT upload (support/pt.ts), made
// through the real commands where a person would make them (code-house-rules 11.2): the receiving world, the template's
// lists and layout, and the casual category with its size set, the colour list as its identity and a quantity tracking
// profile; a second brand whose Agreement passes ownership at the supplier's dispatch, so its goods are the
// Organisation's when counted (DEC-141), beside the receiving world's brand, whose goods the brand owns until sold;
// the book of the units with a SYNTHETIC cost setting, chart, period and journal series and a SYNTHETIC posting map of
// `stock.cost-established` to a SYNTHETIC receipt account (DEC-140); a second receiving world whose book has none, so its
// map is missing; then, apart, the gates: receiving, damage, and PT approval under policies 1, 3, 9 and 10, policies 1
// and 3 on the one value of a TEST-ONLY check each, labelled synthetic (goods-in 10.5; RR-561, RR-565); the series,
// SYNTHETIC; and the people. Every person, place, list, product, account, amount and number is SYNTHETIC.

export { ptGateOpen, PT_TEST_CHECKS } from './pt-gate.js';

export interface Person {
  readonly user: SyntheticUser;
  readonly assignmentId: string;
}

export interface Call {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/** What a Booking approver holds: reading the Arrival, deciding its held lines and the approval panel. */
const BOOKING_APPROVER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'receiving.arrival', action: 'view' },
  { recordType: 'receiving.held_line', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
  ...STOCK_VIEW,
];

/** What whoever makes PTs holds (goods-in 5.1, section 11): the GRN, the import, the PT and its approval request. */
export const PT_MAKER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'receiving.arrival', action: 'view' },
  { recordType: 'receiving.grn', action: 'view' },
  { recordType: 'files_imports.stored_file', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'view' },
  { recordType: 'files_imports.import_batch', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'edit' },
  { recordType: 'merchandise.pt', action: 'view' },
  { recordType: 'merchandise.pt', action: 'create' },
  { recordType: 'merchandise.pt', action: 'edit' },
  { recordType: 'access.approval_request', action: 'view' },
  ...STOCK_VIEW,
];

/**
 * What a PT approver holds (goods-in 6.1, 11): the PT and its approval, the GRN it covers, and the stock it writes,
 * which row-level security scopes (stock-ledger 14.3).
 */
export const PT_APPROVER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'merchandise.pt', action: 'view' },
  { recordType: 'merchandise.pt', action: 'approve' },
  { recordType: 'receiving.arrival', action: 'view' },
  { recordType: 'receiving.grn', action: 'view' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
  ...STOCK_VIEW,
];

export interface PtApprovalWorld {
  readonly world: SyntheticWorld;
  readonly database: string;
  /** The world's SYNTHETIC Organisation keys, as `app` and `worker` read them (ACCESS_ENVIRONMENT). */
  readonly keysEnvironment: Readonly<Record<string, string>>;
  readonly api: AccessTestApp;
  readonly organisation: RoutedOrganisation;
  readonly clock: SyntheticClock;
  readonly setup: StructureSetup;
  readonly fixture: ReceivingFixture;
  /** A receiving world whose book has no cost setting, map or period (the missing posting map). */
  readonly unmapped: ReceivingFixture;
  readonly lists: PtWorld;
  /** The brand whose Agreement passes ownership at the supplier's dispatch: its goods are owned when counted. */
  readonly owned: { readonly brandId: string; readonly code: string; readonly supplierId: string };
  readonly accounts: Readonly<Record<SyntheticAccount, string>>;
  readonly periodId: string;
  readonly people: {
    readonly receiver: Person;
    readonly bookingApprover: Person;
    /** Booking (P-BKG), who names the product of unidentified goods, so does not decide that version (goods-in 4.6). */
    readonly booker: Person;
    readonly operations: Person;
    readonly ptMaker: Person;
    readonly ptApprover: Person;
    readonly secondApprover: Person;
    readonly lowLimitApprover: Person;
    readonly ptReader: Person;
    readonly accountsReader: Person;
  };
  readonly code: {
    season(): string;
    colour(name: 'NAVY' | 'PREMIUM'): string;
    gender(): string;
    category(name?: 'CASUAL' | 'FORMAL'): string;
    gst(name?: 'GST-5' | 'GST-18'): string;
    size(at: 0 | 1): string;
  };
  post(person: Person, path: string, body: unknown, key?: string): Promise<Call>;
  get(person: Person, path: string): Promise<Call>;
  barcode(): string;
  ptRow(design: string, sizeAt: 0 | 1, values?: SyntheticPtRow, brandCode?: string): SyntheticPtRow;
  issuedGrn(
    lines: readonly {
      readonly style: string;
      readonly sizeAt: 0 | 1;
      readonly counted: number;
      readonly invoice?: number;
      readonly extra?: 'received' | 'not-received';
      readonly damaged?: number;
      /** Unidentified goods, described, not sized, with no invoice quantity (goods-in 4.4, 4.9). */
      readonly unidentified?: string;
    }[],
    at?: { readonly brand?: 'fixture' | 'owned'; readonly world?: ReceivingFixture },
  ): Promise<{ readonly arrivalId: string; readonly grnId: string }>;
  /** Hands a file of the rows in, starts its batch for the GRN, validates, submits and publishes it. */
  submittedPt(grnId: string, rows: readonly SyntheticPtRow[]): Promise<{ revisionId: string; requestId: string }>;
  grnPt(grnId: string, person?: Person): Promise<GrnPtRead>;
  arrival(arrivalId: string): Promise<Arrival>;
  revision(revisionId: string, person?: Person, query?: string): Promise<PtRevisionRead>;
  decide(person: Person, requestId: string, versionId: string, outcome?: 'approve' | 'reject'): Promise<Call>;
  /** The exceptions raised on the records or versions given, oldest first, as their owner role reads them. */
  exceptionsOn(recordIds: readonly string[]): Promise<readonly RaisedException[]>;
  /** Locks the book's period, as Accounts (books-and-posting 4.2; PRD-LED-009). */
  lockPeriod(): Promise<void>;
  /**
   * Reopens the book's locked period naming the PT revision as its one correction, requested by Accounts and approved
   * by a different person, both SYNTHETIC (books-and-posting 4.3; PRD-LED-019, PRD-LED-020).
   */
  reopenFor(revisionId: string): Promise<void>;
  close(): Promise<void>;
}

/** An exception as the verifier reads it: its type, state, owner, what raised it and its comment. */
export interface RaisedException {
  readonly id: string;
  readonly type: string;
  readonly state: string;
  readonly ownerUserId: string | null;
  readonly raisingEvent: string;
  readonly recordId: string;
  readonly versionId: string | null;
  readonly comment: string | null;
}

function ok<A>(outcome: { kind: 'success'; answer: A } | { kind: 'refusal'; refusal: { readonly code: string } }): A {
  if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
  return outcome.answer;
}

/** The world, its application started with the PT queue given, or posting every PT with its decision. */
export async function ptApprovalWorld(
  label: string,
  options: { readonly queue?: PtPostingQueue } = {},
): Promise<PtApprovalWorld> {
  const world = await createSyntheticOrganisations(label.toLowerCase());
  const database = world.organisations[0].database;
  const organisationCode = world.organisations[0].code;
  const keys = syntheticKeysEnvironment(world);
  await writeSyntheticSetting(database, 'access.sign-in-throttling', { failureLimit: 50, windowSeconds: 600 });
  await writeSyntheticSetting(database, 'access.password-rules', { minimumLength: 12 });
  await writeSyntheticSetting(database, 'access.office-session-limits', {
    idleLockSeconds: 1800,
    absoluteSeconds: 28800,
  });
  const minio: TestFileStore = await startTestFileStore();
  const clock = new SyntheticClock();
  const api = await startAccessApp(world, keys, {
    clock,
    fileStoreEnvironment: minio.environment,
    validityChecks: PT_TEST_CHECKS,
    ...(options.queue === undefined ? {} : { ptPostingQueue: options.queue }),
  });
  const router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    capturingLogger().logger,
  );
  const routed = await router.resolveForSignIn(organisationCode);
  if (!routed.routed) throw new Error('not routed');
  const organisation = routed.organisation;
  const setup = await structureSetup({
    directory: world.directory,
    database,
    organisationCode,
    keysEnvironment: keys,
    label: `${label}-SETUP`,
    // The stock ledger's posting event kinds, as the application declares them (books-and-posting 7.2).
    eventKinds: STOCK_POSTING_EVENT_KINDS,
  });
  const cookies = new Map<string, string>();

  const fixture = await receivingFixture(setup, database, label);
  const unmapped = await receivingFixture(setup, database, `${label}-X`);
  const lists = await ptWorld(setup, database, label, { proposer: setup.preparer.id, confirmer: setup.approver.id });
  const code = {
    season: () => lists.season.values.SPRING?.code ?? '',
    colour: (name: 'NAVY' | 'PREMIUM') => lists.colour.values[name]?.code ?? '',
    gender: () => lists.gender.values.MALE?.code ?? '',
    category: (name: 'CASUAL' | 'FORMAL' = 'CASUAL') => lists.categories[name]?.code ?? '',
    gst: (name: 'GST-5' | 'GST-18' = 'GST-5') => lists.gstRate.values[name]?.code ?? '',
    size: (at: 0 | 1) => fixture.sizes.values[at]?.code ?? '',
  };

  // The casual category's size set, from tomorrow, as a category's next version never shares its start (2.2); and a
  // quantity tracking profile linked to it, a value of policy 4, so before receiving's gate opens (goods-in 10.5).
  const casual = lists.categories.CASUAL?.id ?? '';
  const sizeSet = ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareSizeSet(c, p, {
        code: syntheticCode(`${label}-SIZES`),
        categoryId: casual,
        name: syntheticName(`${label} sizes`),
        sizes: [code.size(0), code.size(1)],
        validFrom: setup.today(),
      }),
    ),
  );
  const category = await setup.run(setup.preparer.id, (c) =>
    setup.catalogue.record(c, 'category', casual, setup.today()),
  );
  ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareCategoryVersion(c, p, casual, {
        name: syntheticName(`${label} casual`),
        sizeSetId: sizeSet.recordId,
        identityAttributeIds: [lists.colour.attributeId],
        validFrom: setup.day(1),
        versionToken: category?.versionToken,
      }),
    ),
  );
  const profileId = ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareTrackingProfile(c, p, {
        code: syntheticCode(`${label}-QTY`),
        name: syntheticName('Quantity profile'),
        pieceTracked: false,
        batchExpiryRequired: false,
        requiredIdentifiers: [],
        origin: 'synthetic',
        validFrom: setup.today(),
      }),
    ),
  ).recordId;
  const link = await setup.run(setup.preparer.id, (c) =>
    setup.catalogue.record(c, 'category_tracking_profile', casual, setup.today()),
  );
  ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareCategoryTrackingProfileVersion(c, p, casual, {
        trackingProfileId: profileId,
        validFrom: setup.today(),
        versionToken: link?.versionToken,
      }),
    ),
  );

  // The owned brand: linked to the receiving world's supplier, its Agreement passing ownership at dispatch (DEC-141).
  const ownedCode = syntheticCode(`${label}-OWNED`);
  const ownedId = ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareBrand(c, p, {
        code: ownedCode,
        name: syntheticName(`${label} owned brand`),
        aliases: [],
        validFrom: setup.today(),
      }),
    ),
  ).recordId;
  ok(
    await setup.asPreparerDo((c, p) =>
      setup.parties.prepareBrandSupplierLink(c, p, {
        brandId: ownedId,
        partyId: fixture.supplier.id,
        linked: true,
        validFrom: setup.today(),
      }),
    ),
  );
  const agreement = ok(
    await setup.asPreparerDo((c, p) =>
      setup.parties.prepareAgreement(c, p, {
        code: syntheticCode(`${label}-OWNED-AGR`),
        counterparty: { kind: 'brand', brandId: ownedId },
        terms: agreementTerms({ kind: 'supplier-dispatch' }),
        margins: null,
        signedAgreement: [],
        validFrom: setup.today(),
      }),
    ),
  );
  if (agreement.requestId === undefined) throw new Error('The Agreement version was not sent for approval');
  decided(await setup.decide(agreement.requestId, agreement.versionId));

  // The book: a SYNTHETIC cost setting, chart, map, period and journal series (books-and-posting 2.2, 3.1, 4.1, 6.1).
  const { accounts, periodId } = await syntheticPtBook(setup, label, fixture.bookId);

  // Both clocks a day on, so the size set is in force for every command of the test.
  setup.advanceDays(1);
  clock.advance(86_400);

  // The gates (goods-in 10.5): receiving at both worlds' units, damage, and PT approval under policies 1, 3, 9 and 10.
  await receivingGateOpen(setup, database, PT_TEST_CHECKS);
  await receivingGranted(setup, database, fixture.siteId, [fixture.wholeStore], PT_TEST_CHECKS);
  await receivingGranted(setup, database, unmapped.siteId, [unmapped.wholeStore], PT_TEST_CHECKS);
  await damageGateOpen(setup, database);
  await ptGateOpen(setup, database);
  const approveReason = await writeSyntheticReason(database, 'approve');
  const rejectReason = await writeSyntheticReason(database, 'reject');
  const numbering = api.app.get<NumberingInterface>(NUMBERING);
  await asUserIn(api.app, organisation, setup.preparer.id, async (context) => {
    await defineSyntheticGrnSeries(context, numbering);
    await defineSyntheticCodeSeries(context, numbering);
    await defineSyntheticDamageReportSeries(context, numbering);
    await defineSyntheticImportBatchSeries(context, numbering);
    await defineSyntheticPtSeries(context, numbering);
    await defineSyntheticSkuCodeSeries(context, numbering);
  });

  const freshCode = (user: SyntheticUser) => {
    clock.advance(30);
    return codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now());
  };
  const enrolled = async (
    name: string,
    authorities: readonly SyntheticAuthority[],
    choices: { scope?: AssignmentScope; fieldClasses?: readonly FieldClass[] } = {},
  ): Promise<Person> => {
    const user = await writeSyntheticUser(database, organisationCode, keys, {
      label: `${name}${String(randomInt(1_000_000))}`,
      enrolled: true,
    });
    const once = [...new Map(authorities.map((each) => [`${each.recordType}:${each.action}`, each])).values()];
    const { assignmentId } = await grantSynthetic(database, { kind: 'user', id: user.id }, once, {
      ...(choices.scope === undefined ? {} : { scope: choices.scope }),
      ...(choices.fieldClasses === undefined
        ? {}
        : { fieldClasses: choices.fieldClasses.map((fieldClass) => ({ fieldClass, access: 'view' as const })) }),
    });
    const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.81' },
      body: JSON.stringify({ organisationCode, login: user.login, password: user.password, totpCode: freshCode(user) }),
    });
    expect(response.status).toBe(200);
    cookies.set(user.id, (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '');
    return { user, assignmentId };
  };
  const post = async (person: Person, path: string, body: unknown, key: string = uuidv7()): Promise<Call> => {
    const response = await fetch(`${api.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: SYNTHETIC_ORIGIN,
        cookie: cookies.get(person.user.id) ?? '',
        'idempotency-key': key,
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const get = async (person: Person, path: string): Promise<Call> => {
    const response = await fetch(`${api.baseUrl}${path}`, { headers: { cookie: cookies.get(person.user.id) ?? '' } });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const decide = (person: Person, requestId: string, versionId: string, outcome: 'approve' | 'reject' = 'approve') =>
    post(person, `/api/access/approval-requests/${requestId}/decision`, {
      versionId,
      outcome,
      reason: { kind: 'listed', reasonId: outcome === 'approve' ? approveReason : rejectReason },
      totpCode: freshCode(person.user),
    });

  const receiver = await enrolled(`${label}-RECEIVER`, [
    ...RECEIVER_REPORTER_AUTHORITY,
    { recordType: 'receiving.recount', action: 'create' },
  ]);
  const bookingApprover = await enrolled(`${label}-BOOKING-APPROVER`, BOOKING_APPROVER_AUTHORITY);
  const booker = await enrolled(`${label}-BOOKER`, [
    ...BOOKING_APPROVER_AUTHORITY,
    { recordType: 'receiving.held_line', action: 'edit' },
    { recordType: 'merchandise.vocabulary_value', action: 'view' },
  ]);
  // Operations (P-OPS), who confirms or rejects damage reported by someone else (goods-in 8.3).
  const operations = await enrolled(`${label}-OPS`, [
    ...DECIDER_AUTHORITY,
    { recordType: 'receiving.arrival', action: 'view' },
  ]);
  // Whoever makes PTs holds approve on them too, so only their having uploaded it keeps them from deciding it.
  const ptMaker = await enrolled(`${label}-MAKER`, [...PT_MAKER_AUTHORITY, ...PT_APPROVER_AUTHORITY], {
    fieldClasses: ['cost', 'margin'],
  });
  const ptApprover = await enrolled(`${label}-APPROVER`, PT_APPROVER_AUTHORITY, { fieldClasses: ['cost', 'margin'] });
  const secondApprover = await enrolled(`${label}-SECOND`, PT_APPROVER_AUTHORITY, { fieldClasses: ['cost', 'margin'] });
  const lowLimitApprover = await enrolled(`${label}-LOW`, PT_APPROVER_AUTHORITY);
  const ptReader = await enrolled(`${label}-READER`, [
    { recordType: 'merchandise.pt', action: 'view' },
    { recordType: 'receiving.arrival', action: 'view' },
  ]);
  const accountsReader = await enrolled(`${label}-ACCOUNTS`, [
    { recordType: 'finance.journal', action: 'view' },
    { recordType: 'finance.account', action: 'view' },
  ]);
  const settingsAdmin = await enrolled(`${label}-SETTINGS`, [
    { recordType: 'access.approval_limit', action: 'view' },
    { recordType: 'access.approval_limit', action: 'create' },
    { recordType: 'access.approval_request', action: 'view' },
    { recordType: 'exceptions.exception_routing', action: 'view' },
    { recordType: 'exceptions.exception_routing', action: 'edit' },
  ]);
  const settingsApprover = await enrolled(`${label}-SETTINGS-APPROVER`, [
    { recordType: 'access.approval_limit', action: 'view' },
    { recordType: 'access.approval_limit', action: 'approve' },
    { recordType: 'exceptions.exception_routing', action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
    { recordType: 'access.approval_reason', action: 'view' },
  ]);
  // SYNTHETIC limits (access-and-approvals 9.2; V-02): on a PT's cost, a high one and one of 10.00; on Unknown value
  // for the held lines and the damage decisions.
  const limit = async (
    person: Person,
    actionType: string,
    amount: { kind: 'amount'; amount: number } | { kind: 'none' },
    coversUnknown: boolean,
  ) => {
    const access = api.app.get<AccessInterface>(ACCESS);
    const prepared = await asUserIn(api.app, organisation, settingsAdmin.user.id, (context) =>
      access.prepareApprovalLimit(
        context,
        { userId: settingsAdmin.user.id, roleAssignmentId: settingsAdmin.assignmentId },
        {
          actionType,
          holder: { kind: 'individual', userId: person.user.id, roleAssignmentId: person.assignmentId },
          limit: amount.kind === 'none' ? { kind: 'none' } : { kind: 'amount', amount: paise(amount.amount) },
          coversUnknown,
          origin: 'synthetic',
          validFrom: setup.today(),
        },
      ),
    );
    if (prepared.kind !== 'success') throw new Error(`limit refused: ${prepared.refusal.code}`);
    const done = await decide(settingsApprover, prepared.answer.requestId, prepared.answer.limitId);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
  };
  for (const person of [ptMaker, ptApprover, secondApprover]) {
    await limit(person, PT_APPROVAL, { kind: 'amount', amount: 1_000_000_000 }, false);
  }
  await limit(lowLimitApprover, PT_APPROVAL, { kind: 'amount', amount: 1_000 }, false);
  await limit(bookingApprover, HELD_LINE_DECISION, { kind: 'none' }, true);
  await limit(operations, DAMAGE_DECISION, { kind: 'none' }, true);
  // Every follow-up routed by a SYNTHETIC rule at both worlds' Sites (goods-in 4.9, 4.10; V-03): to Booking, and the
  // unfinished operation of a refused posting (books-and-posting 10 step 3; code review 7) to a PT approver, who reads
  // the PT and the recount its resolution check reads.
  const followUps: readonly (readonly [string, Person])[] = [
    ['receiving.shortage', bookingApprover],
    ['receiving.excess', bookingApprover],
    ['receiving.wrong-goods', bookingApprover],
    ['receiving.unidentified-goods', bookingApprover],
    ['receiving.booking-review', bookingApprover],
    ['stock.damage', bookingApprover],
    ['merchandise.pt-posting-refused', ptApprover],
    ['receiving.recount-posting-refused', ptApprover],
  ];
  for (const siteId of [fixture.siteId, unmapped.siteId]) {
    for (const [type, owner] of followUps) {
      const prepared = await post(settingsAdmin, '/api/exceptions/routing', {
        typeCode: type,
        siteId,
        owner: { kind: 'user', userId: owner.user.id },
        dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
        escalation: { kind: 'user', userId: owner.user.id },
        validFrom: setup.today(),
        origin: 'synthetic',
      });
      expect(prepared.status, JSON.stringify(prepared.body)).toBe(200);
      const { requestId, versionId } = prepared.body as { requestId: string; versionId: string };
      const done = await decide(settingsApprover, requestId, versionId);
      expect(done.status, JSON.stringify(done.body)).toBe(200);
    }
  }

  let barcodeCount = 0;
  const barcode = () => {
    barcodeCount += 1;
    return `89${String(barcodeCount + 1_000_000 * randomInt(1, 9)).padStart(11, '0')}`;
  };
  // A good PT row: one piece at MRP 1,999.00, BASIC 700.00 and P RATE 945.00, so MARGIN 52.7263..., worked out by hand
  // (shared-calculations 12.4 CG-22); each value on its list.
  const ptRow = (design: string, sizeAt: 0 | 1, values: SyntheticPtRow = {}, brandCode?: string): SyntheticPtRow => ({
    SEASON: code.season(),
    BRAND: brandCode ?? fixture.brand.code,
    COLOR: code.colour('NAVY'),
    GENDER: code.gender(),
    'SUB CATEGORY': code.category(),
    TYPE: lists.type.values.TOP?.code ?? '',
    ITEM: lists.item.values.TSHIRT?.code ?? '',
    FIT: lists.fit.values.SLIM?.code ?? '',
    SIZE: code.size(sizeAt),
    BARCODE: barcode(),
    DESIGN: design,
    HSN: 61091000,
    QTY: 1,
    MRP: 1999,
    BASIC: 700,
    'P RATE': 945,
    'INPUT TAX': code.gst(),
    'OUTPUT TAX': code.gst('GST-18'),
    NAG: 1,
    MARGIN: 52.7263,
    ...values,
  });
  let fileCount = 0;
  const issuedGrn: PtApprovalWorld['issuedGrn'] = async (lines, at = {}) => {
    const place = at.world ?? fixture;
    const brandId = at.brand === 'owned' ? ownedId : place.brand.id;
    const made = await post(receiver, '/api/receiving/arrivals', {
      businessUnitId: place.wholeStore,
      receivingLocationId: place.storeLocation,
      supplierPartyId: at.brand === 'owned' ? fixture.supplier.id : place.supplier.id,
      brandId,
      transporter: syntheticName('Transporter'),
      lorryReceipt: { number: 'SYN-LR-PTA', date: setup.today() },
      cartons: 2,
      arrivedAt: new Date(clock.now().getTime() - 3_600_000).toISOString(),
    });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const arrivalId = (made.body as { arrivalId: string }).arrivalId;
    fileCount += 1;
    const stored = await post(
      receiver,
      STORE_FILE_PATH,
      syntheticPdfUpload('PT-APPROVAL', `FILE-${String(fileCount)}`),
    );
    expect(stored.status, JSON.stringify(stored.body)).toBe(200);
    const { storedFileId, receiptId } = stored.body as { storedFileId: string; receiptId: string };
    const invoice = await post(receiver, `/api/receiving/arrivals/${arrivalId}/invoices`, {
      number: `SYN-INV-PTA-${String(randomInt(1_000_000))}`,
      date: setup.today(),
      file: { storedFileId, fileReceiptId: receiptId },
    });
    expect(invoice.status, JSON.stringify(invoice.body)).toBe(200);
    for (const line of lines) {
      const unidentified = line.unidentified !== undefined;
      const saved = await post(receiver, `/api/receiving/arrivals/${arrivalId}/count-lines`, {
        goods: unidentified ? 'unidentified' : 'on-invoice',
        styleCode: unidentified ? null : line.style,
        colour: unidentified ? null : 'SYNTHETIC NAVY',
        sizeValueId: unidentified ? null : (fixture.sizes.values[line.sizeAt]?.id ?? null),
        skuId: null,
        description: line.unidentified ?? null,
        invoiceQuantity: line.invoice ?? line.counted,
        countedQuantity: line.counted,
        extra: line.extra ?? null,
        damage:
          line.damaged === undefined
            ? null
            : { quantity: line.damaged, description: 'SYNTHETIC tear seen at the count', photo: null },
        batch: null,
      });
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    }
    const read = await get(receiver, `/api/receiving/arrivals/${arrivalId}`);
    const { versionToken } = arrivalReadSchema.parse(read.body).arrival;
    const issued = await post(receiver, `/api/receiving/arrivals/${arrivalId}/grn`, { versionToken });
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    return { arrivalId, grnId: (issued.body as { grnId: string }).grnId };
  };
  let marker = 0;
  const grnPt = async (grnId: string, person: Person = ptMaker): Promise<GrnPtRead> => {
    const read = await get(person, `/api/merchandise/pt/grns/${grnId}`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    return grnPtReadSchema.parse(read.body);
  };
  const submittedPt: PtApprovalWorld['submittedPt'] = async (grnId, rows) => {
    marker += 1;
    const bytes = await syntheticPtWorkbook({ rows, marker: `PTA-${label}-${String(marker)}` });
    const handed = await post(ptMaker, '/api/files-imports/import-files', {
      sourceSystem: 'manual-upload',
      originalName: syntheticPtFileName(`pta-${String(marker)}`),
      contentBase64: bytes.toString('base64'),
    });
    expect(handed.status, JSON.stringify(handed.body)).toBe(200);
    const { storedFileId, receiptId } = handed.body as { storedFileId: string; receiptId: string };
    const started = await post(ptMaker, '/api/files-imports/batches', {
      storedFileId,
      fileReceiptId: receiptId,
      kind: 'transaction',
      target: 'merchandise.pt',
      layoutVersionId: lists.layoutVersionId,
      mappingVersionId: lists.mappingVersionId,
      subject: { recordId: grnId },
    });
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const batchId = (started.body as { batchId: string }).batchId;
    const validated = await post(ptMaker, `/api/files-imports/batches/${batchId}/validate`, {});
    expect(validated.status, JSON.stringify(validated.body)).toBe(200);
    const preview = await get(ptMaker, `/api/merchandise/pt/uploads/${batchId}/preview`);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    const { batchVersionId, issues } = ptPreviewSchema.parse(preview.body);
    expect(issues.filter((issue) => issue.severity === 'Blocking')).toEqual([]);
    const submit = await post(ptMaker, `/api/files-imports/batches/${batchId}/submit`, { versionId: batchVersionId });
    expect(submit.status, JSON.stringify(submit.body)).toBe(200);
    const published = await post(ptMaker, `/api/files-imports/batches/${batchId}/publish`, {
      versionId: batchVersionId,
    });
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    const [revision] = (await grnPt(grnId)).pt?.revisions ?? [];
    if (revision?.request === undefined) throw new Error('The PT revision has no approval request');
    return { revisionId: revision.revisionId, requestId: revision.request.id };
  };
  const revision = async (revisionId: string, person: Person = ptApprover, query = ''): Promise<PtRevisionRead> => {
    const read = await get(person, `/api/merchandise/pt/revisions/${revisionId}${query}`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    return ptRevisionReadSchema.parse(read.body);
  };

  return {
    world,
    database,
    keysEnvironment: keys,
    api,
    organisation,
    clock,
    setup,
    fixture,
    unmapped,
    lists,
    owned: { brandId: ownedId, code: ownedCode, supplierId: fixture.supplier.id },
    accounts,
    periodId,
    people: {
      receiver,
      bookingApprover,
      booker,
      operations,
      ptMaker,
      ptApprover,
      secondApprover,
      lowLimitApprover,
      ptReader,
      accountsReader,
    },
    code,
    post,
    get,
    barcode,
    ptRow,
    issuedGrn,
    submittedPt,
    grnPt,
    arrival: async (arrivalId) => {
      const read = await get(receiver, `/api/receiving/arrivals/${arrivalId}`);
      expect(read.status, JSON.stringify(read.body)).toBe(200);
      return arrivalReadSchema.parse(read.body).arrival;
    },
    revision,
    decide,
    lockPeriod: async () => {
      const locked = await setup.asPreparerDo((c, p) => setup.books.lockPeriod(c, p, periodId));
      if (locked.kind !== 'success') throw new Error(`lock refused: ${locked.refusal.code}`);
    },
    reopenFor: async (revisionId) => {
      const asked = ok(
        await setup.asPreparerDo((c, p) =>
          setup.books.requestReopening(c, p, periodId, {
            reason: 'SYNTHETIC reopening for a PT refused in a locked period',
            corrections: [{ module: 'merchandise', recordType: 'merchandise.pt_revision', recordId: revisionId }],
          }),
        ),
      );
      decided(await setup.decide(asked.requestId, asked.reopeningId));
    },
    exceptionsOn: async (recordIds) => {
      const verify = await connect(database, 'migration');
      try {
        const result = await verify.query<{
          id: string;
          type: string;
          state: string;
          owner_user_id: string | null;
          raising_event: string;
          record_id: string;
          version_id: string | null;
          comment: string | null;
        }>(
          `select e.id, t.code as type, e.state, e.owner_user_id, e.raising_event, l.record_id, l.version_id,
                  (select c.comment from exceptions.exception_event c
                    where c.exception_id = e.id and c.kind = 'comment' order by c.occurred_at limit 1) as comment
             from exceptions.exception e
             join exceptions.exception_type t on t.id = e.exception_type_id
             join exceptions.exception_link l on l.exception_id = e.id
            where l.record_id = any($1::uuid[]) or l.version_id = any($1::uuid[])
            order by e.raised_at, e.id`,
          [recordIds],
        );
        return result.rows.map((row) => ({
          id: row.id,
          type: row.type,
          state: row.state,
          ownerUserId: row.owner_user_id,
          raisingEvent: row.raising_event,
          recordId: row.record_id,
          versionId: row.version_id,
          comment: row.comment,
        }));
      } finally {
        await verify.end();
      }
    },
    close: async () => {
      await setup.close();
      await router.close();
      await api.close();
      await minio.stop();
      await world.reset();
    },
  };
}

/** A running worker serving the world's Organisation, as the application composes it. */
export interface PtPostingWorker {
  stop(): Promise<void>;
}

/**
 * Starts the worker as the application composes it (worker.module.ts; deployment.md section 2), its PT the
 * application's own modules', with the PT's posting consumers (goods-in 6.6; stock-ledger 10.6; code-house-rules 12.9;
 * code review 7): its service identities written with what the worker's registry gives each, as the setup step and
 * `add-service-identities` do; the start variables the application's modules read, the world's; the SYNTHETIC worker
 * settings at the test speed; the world's clock and timezone; and the test-only validity checks the world's
 * application was given, labelled synthetic (PT_TEST_CHECKS; RR-561, RR-565).
 */
export async function startPtPostingWorker(world: PtApprovalWorld): Promise<PtPostingWorker> {
  for (const identity of serviceIdentitiesOf(jobRegistry)) {
    await writeSyntheticServiceIdentity(world.database, identity.code, identity.authorities);
  }
  const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
    .overrideProvider(LOGGER)
    .useValue(capturingLogger().logger)
    .overrideProvider(CLOCK)
    .useValue(world.clock)
    .overrideProvider(ROUTING_ENVIRONMENT)
    .useValue({ AOS_RUNTIME_DATABASE_URL: databaseUrl(world.world.directory, 'runtime'), AOS_DATABASE_POOL_MAX: '8' })
    .overrideProvider(WORKER_ENVIRONMENT)
    .useValue({
      [WORKER_SETTINGS_VARIABLE]: JSON.stringify(syntheticWorkerSettings(jobRegistry, { fast: true })),
    })
    .overrideProvider(ORGANISATION_TIMEZONE_SOURCE)
    .useValue(syntheticTimezone)
    .overrideProvider(ACCESS_ENVIRONMENT)
    .useValue(world.keysEnvironment)
    .overrideProvider(CONFIGURATION_ENVIRONMENT)
    .useValue({ AOS_ENVIRONMENT: 'local' })
    .overrideProvider(FILES_IMPORTS_ENVIRONMENT)
    .useValue({ AOS_ENVIRONMENT: 'local', ...SYNTHETIC_INTAKE_CAPS_ENVIRONMENT })
    .overrideProvider(FILE_STORE_ENVIRONMENT)
    .useValue({})
    .compile();
  await moduleRef.init();
  const configuration = moduleRef.get<ConfigurationInterface>(CONFIGURATION);
  for (const check of PT_TEST_CHECKS) configuration.registerCheck(check, TEST_COMPOSITION);
  await moduleRef.get<Worker>(WORKER).start();
  return { stop: () => moduleRef.close() };
}
