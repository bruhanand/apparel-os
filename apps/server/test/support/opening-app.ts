import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  errorEnvelopeSchema,
  fieldClassSchema,
  IMPORT_BATCH_TYPE,
  importBatchReadSchema,
  importFileStoredSchema,
  permissionRegistry,
  type AssignmentScope,
  type PersonaId,
  type ImportBatchRead,
} from '@apparel-os/schemas';
import {
  COMMAND_RUNNER,
  CommandRunner,
  defineConsumer,
  IdempotencyHelper,
  ORGANISATION_ROUTER,
  OrganisationRouter,
  OUTBOX_AUTHORITY,
  OUTBOX_PROCESSOR_IDENTITY,
  restrictedValueCipherNotConfigured,
  secretCheckNotImplemented,
  Worker,
  type RoutedOrganisation,
  type TransactionContext,
} from '../../src/kernel/index.js';
import { jobIdentities } from '../../src/modules/access/index.js';
import { AUDIT, type AuditInterface } from '../../src/modules/audit/index.js';
import {
  CONFIGURATION,
  type ConfigurationInterface,
  type ValidityCheck,
} from '../../src/modules/configuration/index.js';
import { BOOKS, type BooksInterface } from '../../src/modules/finance/books/index.js';
import {
  IMPORT_HANDLERS,
  OPENING_PUBLISHING,
  publishRequested,
  QUEUED_PUBLISHING,
  type ImportHandlers,
  type QueuedPublishingInterface,
} from '../../src/modules/files-imports/index.js';
import { CATALOGUE, type CatalogueInterface } from '../../src/modules/merchandise/catalogue/index.js';
import { NUMBERING, type NumberingInterface } from '../../src/modules/numbering/index.js';
import { ORGANISATION, type OrganisationInterface } from '../../src/modules/organisation/index.js';
import { catalogueSkus, organisationPlaces, StockLedger } from '../../src/modules/stock/ledger/index.js';
import { StockHarness, type HarnessFixtures } from '../harness/stock/harness.js';
import { syntheticWorkbook } from '../fixtures/imports.js';
import {
  cellsOf,
  MANIFEST_FIELDS,
  MANIFEST_LAYOUT,
  MANIFEST_MAPPING,
  MANIFEST_SHEET,
  OPENING_LAYOUT_CODES,
  type ManifestRow,
} from '../fixtures/opening-data.js';
import { syntheticCode, syntheticFileName, syntheticIdentifier, syntheticName } from '../fixtures/synthetic.js';
import { syntheticWorkerSettings } from '../fixtures/worker-settings.js';
import {
  codeFor,
  startAccessApp,
  SyntheticClock,
  SYNTHETIC_ORIGIN,
  syntheticTimezone,
  writeSyntheticReason,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './access.js';
import { TEST_COMPOSITION } from './composition.js';
import { grantSynthetic, type SyntheticAuthority } from './grants.js';
import { defineSyntheticImportBatchSeries, writeSyntheticLayout } from './imports.js';
import { writeSyntheticServiceIdentity } from './jobs.js';
import { startTestFileStore, type TestFileStore } from './minio.js';
import { OPENING_STOCK_CALLER, OPENING_STOCK_TARGET, openingStockHandler } from './opening-stock.js';
import { decided } from './organisation.js';
import { connect, databaseUrl } from './postgres.js';

// S1-F13-T03: the whole application on real PostgreSQL and MinIO over a stock harness world, with the test-only
// opening-stock handler composed into it with its posting half and a ledger of its own registration (code-house-rules
// 11.4; GC6-18, DEC-116), the opening-publishing gate's policy 14 to sign as SYNTHETIC (code-house-rules 11.1), the
// synthetic switch to approve, and a worker serving the test-only posting consumer of a queued publish
// (imports-and-opening-data 10.6; stock-ledger 10.6). Every file, code and value is SYNTHETIC.

/** The harness, with the keys its users were written under, which the application here must share. */
class OpeningHarness extends StockHarness {
  keys(): Record<string, string> {
    return this.keysEnvironment;
  }
}

/** The SYNTHETIC internal service identity the posting consumer runs as (PRD-SEC-018). */
export const OPENING_POSTING_IDENTITY = syntheticIdentifier('opening-posting');

/** The SYNTHETIC policy 14 value a validation covers (DM-6; RR-480): no KDPS value. */
const POLICY_FOURTEEN_VALUES: ValidityCheck = {
  code: `${syntheticIdentifier('opening')}.synthetic-values`,
  policy: 14,
  check: () => Promise.resolve({ kind: 'valid' }),
  values: () => Promise.resolve([{ key: 'syn-opening-value', version: 'v1', origin: 'synthetic', enteredBy: [] }]),
  locks: () => Promise.resolve([]),
};

const ALL_CLASSES = fieldClassSchema.options;
const DECIDER: SyntheticAuthority[] = [
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
];
const PREPARER: SyntheticAuthority[] = [
  { recordType: 'files_imports.stored_file', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'view' },
  { recordType: 'files_imports.import_batch', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'edit' },
  { recordType: 'files_imports.import_batch', action: 'approve' },
  ...DECIDER,
];
/** Operations: verifies opening stock (POL-14.02). */
const APPROVER: SyntheticAuthority[] = [
  { recordType: 'files_imports.import_batch', action: 'view' },
  { recordType: 'files_imports.opening_stock', action: 'approve' },
  ...DECIDER,
];

export interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export const codeOf = (answer: Answer) => errorEnvelopeSchema.parse(answer.body).error.code;

export interface OpeningCodes {
  readonly site: string;
  readonly unit: string;
  readonly location: string;
  readonly legalEntity: string;
  readonly season: string;
}

/** Where a file is stored through files-imports (Store a file, imports 13.1). */
export const STORE_FILE_PATH = '/api/files-imports/files';

/** The body that stores a SYNTHETIC PDF, its text naming the label and a unique mark (code-house-rules 11.2). */
export function syntheticPdfUpload(
  label: string,
  mark: string,
): { sourceSystem: 'manual-upload'; originalName: string; contentBase64: string } {
  const bytes = Buffer.from(
    `%PDF-1.4\n% SYNTHETIC ${label} ${mark}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n`,
    'latin1',
  );
  return {
    sourceSystem: 'manual-upload',
    originalName: syntheticFileName(label, 'pdf'),
    contentBase64: bytes.toString('base64'),
  };
}

/**
 * Signs a SYNTHETIC user in to the application at `baseUrl` with an authenticator code for `at` (access-and-approvals
 * 3.3), and answers the session cookie; throws when it is refused.
 */
export async function signInTo(
  baseUrl: string,
  organisationCode: string,
  user: SyntheticUser,
  at: Date = new Date(),
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.43' },
    body: JSON.stringify({
      organisationCode,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0), 0, at),
    }),
  });
  if (response.status !== 200) throw new Error(`${user.login} was not signed in: ${String(response.status)}`);
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

/** Calls the application at `baseUrl` in a session, a write with a fresh idempotency key (code-house-rules 12.4). */
export async function callAs(
  baseUrl: string,
  cookie: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<Answer> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      cookie,
      origin: SYNTHETIC_ORIGIN,
      ...(method === 'POST' ? { 'content-type': 'application/json', 'idempotency-key': uuidv7() } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  const text = await response.text();
  return { status: response.status, body: (text === '' ? {} : JSON.parse(text)) as Record<string, unknown> };
}

/** A running worker serving the test-only posting consumer. */
export interface OpeningWorker {
  stop(): Promise<void>;
}

/** What an opening world is made with (S1-F14-T04). */
export interface OpeningAppOptions {
  /**
   * A world that is backed up and restored holds only what a restore can prove (backup-and-restore 5.1): every
   * policy's evidence is a real file stored through files-imports by a SYNTHETIC clerk, not a SYNTHETIC row with no
   * object (code-house-rules 11.2).
   */
  readonly restorable?: boolean;
}

export class OpeningApp {
  readonly harness: OpeningHarness;
  fixtures!: HarnessFixtures;
  api!: AccessTestApp;
  codes!: OpeningCodes;
  preparer!: SyntheticUser;
  approver!: SyntheticUser;
  /** The posting's phases, in milliseconds, as the handler marks them (10.6; RR-189). */
  readonly timings: Record<string, number> = {};
  private minio!: TestFileStore;
  private clock!: SyntheticClock;
  private approveReason!: string;
  private routed!: RoutedOrganisation;
  private readonly cookies = new Map<string, string>();
  /** Every SYNTHETIC user `enrolled` wrote, so a test can look for their secrets where none may be (S1-F14-T04). */
  readonly enrolledUsers: SyntheticUser[] = [];
  private layout!: { layoutVersionId: string; mappingVersionId: string };
  private counter = 0;
  private clerk: SyntheticUser | undefined;
  private serviceIdentityId: string | undefined;
  private readonly workers: OpeningWorker[] = [];
  /** The book a test names for a document instead of its unit's, SYNTHETIC (`files-imports.several-books`). */
  bookOf: ((reference: string) => string | undefined) | undefined;

  constructor(options: OpeningAppOptions = {}) {
    this.harness = new OpeningHarness(
      options.restorable === true ? { evidenceFile: () => this.storedFile('policy-evidence') } : {},
    );
  }

  get database(): string {
    return this.harness.database;
  }

  /** The session cookies of the users signed in to the application. */
  sessionCookies(): string[] {
    return [...this.cookies.values()];
  }

  /** The MinIO file store the application stores into. */
  get fileStore(): TestFileStore {
    return this.minio;
  }

  /** An authenticator code of the user for the application's clock, moved on 30 seconds so it is fresh (3.3). */
  freshCode(user: SyntheticUser): string {
    this.clock.advance(30);
    return codeFor(user.factorSecret ?? Buffer.alloc(0), 0, this.clock.now());
  }

  /**
   * A SYNTHETIC PDF stored through files-imports (Store a file, imports 13.1) by a SYNTHETIC clerk who may store files;
   * answers the stored file and its receipt, as evidence is handed to a record.
   */
  async storedFile(label: string): Promise<{ readonly storedFileId: string; readonly fileReceiptId: string }> {
    this.clerk ??= await this.enrolled('FILE-CLERK', [{ recordType: 'files_imports.stored_file', action: 'create' }]);
    const stored = await this.ok(this.clerk, 'POST', STORE_FILE_PATH, syntheticPdfUpload(label, this.next('FILE')));
    const { storedFileId, receiptId } = stored.body as { storedFileId: string; receiptId: string };
    return { storedFileId, fileReceiptId: receiptId };
  }

  next(label: string): string {
    this.counter += 1;
    return syntheticCode(`${label}-${String(this.counter)}`);
  }

  /**
   * Starts the world: the harness, the application on it, then the harness's fixtures, so a restorable world's policy
   * evidence can be stored through the application (S1-F14-T04).
   */
  async start(label: string): Promise<void> {
    const { harness } = this;
    await harness.start(label);
    this.minio = await startTestFileStore();
    this.clock = new SyntheticClock();
    const organisation = harness.world.organisations[0];
    await writeSyntheticSetting(organisation.database, 'access.sign-in-throttling', {
      failureLimit: 50,
      windowSeconds: 600,
    });
    await writeSyntheticSetting(organisation.database, 'access.password-rules', { minimumLength: 12 });
    await writeSyntheticSetting(organisation.database, 'access.office-session-limits', {
      idleLockSeconds: 1800,
      absoluteSeconds: 28800,
    });
    this.api = await startAccessApp(harness.world, harness.keys(), {
      fileStoreEnvironment: this.minio.environment,
      clock: this.clock,
      validityChecks: [POLICY_FOURTEEN_VALUES],
    });
    this.fixtures = await harness.fixtures('moving-average', 'book', { pieceTracked: false });
    const { setup } = harness;
    const seasonAttribute = await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareAttribute(c, p, {
        code: this.next('SEASON'),
        valueKind: 'list',
        name: syntheticName('Season'),
        validFrom: setup.today(),
      }),
    );
    if (seasonAttribute.kind !== 'success') throw new Error('The SYNTHETIC season attribute was refused');
    const season = this.next('SS');
    const proposed = await setup.asPreparerDo((c, p) =>
      setup.catalogue.proposeVocabularyValue(c, p, {
        attributeId: seasonAttribute.answer.recordId,
        code: season,
        name: syntheticName('Season value'),
      }),
    );
    if (proposed.kind !== 'success') throw new Error('The SYNTHETIC season value was refused');
    decided(await setup.decide(proposed.answer.requestId, proposed.answer.proposalId));
    const structure = await setup.run(setup.preparer.id, (c) => setup.organisation.structureOn(c, setup.today()));
    const codeOfId = (list: readonly { id: string; code: string }[], id: string) =>
      list.find((each) => each.id === id)?.code ?? '';
    this.codes = {
      site: codeOfId(structure.sites, this.fixtures.s1.siteId),
      unit: codeOfId(structure.businessUnits, this.fixtures.s1.businessUnitId),
      location: codeOfId(structure.locations, this.fixtures.s1.locationId),
      legalEntity: codeOfId(structure.legalEntities, this.fixtures.legalEntityId),
      season,
    };
    const { app } = this.api;
    // The handler's own ledger, composed with its synthetic registration only (stock-ledger 13.2; H2, H5).
    const ledger = new StockLedger({
      audit: app.get<AuditInterface>(AUDIT),
      places: organisationPlaces,
      skus: catalogueSkus,
      books: app.get<BooksInterface>(BOOKS),
      registrations: [OPENING_STOCK_CALLER],
      composition: TEST_COMPOSITION,
    });
    app.get<ImportHandlers>(IMPORT_HANDLERS).register(
      openingStockHandler({
        organisation: app.get<OrganisationInterface>(ORGANISATION),
        catalogue: app.get<CatalogueInterface>(CATALOGUE),
        seasonAttributeId: seasonAttribute.answer.recordId,
        ledger,
        timings: this.timings,
        bookOf: (document, unitBookId) => this.bookOf?.(document.reference) ?? unitBookId,
      }),
    );
    this.approveReason = await writeSyntheticReason(organisation.database, 'approve');
    this.preparer = await this.enrolled('OPENING-PREPARER', PREPARER);
    this.approver = await this.enrolled('OPENING-APPROVER', APPROVER);
    this.layout = await writeSyntheticLayout(
      organisation.database,
      {
        layoutCode: OPENING_LAYOUT_CODES.manifest.layout,
        mappingCode: OPENING_LAYOUT_CODES.manifest.mapping,
        structure: MANIFEST_LAYOUT,
        fields: MANIFEST_MAPPING,
        target: OPENING_STOCK_TARGET,
        kinds: ['opening-balance'],
        documentType: 'opening-stock',
      },
      setup.preparer.id,
      setup.approver.id,
    );
    const router = app.get<OrganisationRouter>(ORGANISATION_ROUTER);
    const routed = await router.resolveForSignIn(organisation.code);
    if (!routed.routed) throw new Error('The synthetic Organisation was not routed');
    this.routed = routed.organisation;
    await this.command(setup.preparer.id, (context) =>
      defineSyntheticImportBatchSeries(context, app.get<NumberingInterface>(NUMBERING)),
    );
  }

  async stop(): Promise<void> {
    for (const worker of this.workers.splice(0)) await worker.stop();
    await (this.api as AccessTestApp | undefined)?.close();
    await (this.minio as TestFileStore | undefined)?.stop();
    await this.harness.stop();
  }

  /** Runs work as a command of the application, as the actor named (code-house-rules 8.1). */
  command<T>(actorId: string, work: (context: TransactionContext) => Promise<T>): Promise<T> {
    return this.api.app.get<CommandRunner>(COMMAND_RUNNER).run(
      {
        commandName: 'test.opening-fixture',
        organisation: this.routed,
        correlationId: uuidv7(),
        actor: { kind: 'actor', actorId },
      },
      work,
    );
  }

  async enrolled(
    label: string,
    authorities: readonly SyntheticAuthority[],
    scope?: AssignmentScope,
    personas?: readonly PersonaId[],
  ): Promise<SyntheticUser> {
    const organisation = this.harness.world.organisations[0];
    const user = await writeSyntheticUser(organisation.database, organisation.code, this.harness.keys(), {
      label: `${label}${String(randomInt(1_000_000))}`,
      enrolled: true,
      ...(personas === undefined ? {} : { personas }),
    });
    await grantSynthetic(organisation.database, { kind: 'user', id: user.id }, authorities, {
      fieldClasses: ALL_CLASSES.map((fieldClass) => ({ fieldClass, access: 'view' as const })),
      ...(scope === undefined ? {} : { scope }),
    });
    this.clock.advance(30);
    this.enrolledUsers.push(user);
    this.cookies.set(user.id, await signInTo(this.api.baseUrl, organisation.code, user, this.clock.now()));
    return user;
  }

  async call(user: SyntheticUser, method: 'GET' | 'POST', path: string, body?: unknown): Promise<Answer> {
    return callAs(this.api.baseUrl, this.cookies.get(user.id) ?? '', method, path, body);
  }

  async ok(user: SyntheticUser, method: 'GET' | 'POST', path: string, body?: unknown): Promise<Answer> {
    const answer = await this.call(user, method, path, body);
    if (answer.status !== 200) throw new Error(`${path}: ${String(answer.status)} ${JSON.stringify(answer.body)}`);
    return answer;
  }

  async readBatch(batchId: string, user: SyntheticUser = this.preparer): Promise<ImportBatchRead> {
    return importBatchReadSchema.parse((await this.ok(user, 'GET', `/api/files-imports/batches/${batchId}`)).body);
  }

  /** A manifest row at S1's location, with every required value, the values given standing for them. */
  manifestRow(manifest: string, values: ManifestRow): (string | null)[] {
    return cellsOf(MANIFEST_FIELDS, {
      manifestReference: manifest,
      section: 'opening-stock',
      siteCode: this.codes.site,
      unitCode: this.codes.unit,
      locationCode: this.codes.location,
      condition: 'good',
      ownerCode: this.codes.legalEntity,
      season: this.codes.season,
      ...values,
    });
  }

  /** Uploads a SYNTHETIC manifest and starts an opening batch of S1's unit on it; answers the start's answer. */
  async start_(rows: readonly (string | null)[][]): Promise<Answer> {
    const bytes = await syntheticWorkbook({
      sheet: MANIFEST_SHEET,
      header: Object.values(MANIFEST_FIELDS),
      rows,
      marker: this.next('FILE'),
    });
    const stored = importFileStoredSchema.parse(
      (
        await this.ok(this.preparer, 'POST', '/api/files-imports/import-files', {
          sourceSystem: 'manual-upload',
          originalName: syntheticFileName(`opening-${String(this.counter)}`, 'xlsx'),
          contentBase64: bytes.toString('base64'),
        })
      ).body,
    );
    return this.call(this.preparer, 'POST', '/api/files-imports/batches', {
      storedFileId: stored.storedFileId,
      fileReceiptId: stored.receiptId,
      kind: 'opening-balance',
      target: OPENING_STOCK_TARGET,
      layoutVersionId: this.layout.layoutVersionId,
      mappingVersionId: this.layout.mappingVersionId,
      scope: { siteId: this.fixtures.s1.siteId, businessUnitId: this.fixtures.s1.businessUnitId },
    });
  }

  /** Starts an opening batch on the rows; answers the batch. */
  async opening(rows: readonly (string | null)[][]): Promise<string> {
    const answer = await this.start_(rows);
    if (answer.status !== 200) throw new Error(`The opening was not started: ${JSON.stringify(answer.body)}`);
    return answer.body.batchId as string;
  }

  /**
   * Validates, marks every Warning seen, submits, and has Operations verify the batch version (POL-14.02); answers the
   * version and the decision.
   */
  async verified(batchId: string): Promise<{ versionId: string; decisionId: string }> {
    await this.ok(this.preparer, 'POST', `/api/files-imports/batches/${batchId}/validate`, {});
    let read = await this.readBatch(batchId);
    if (read.batch.state !== 'Validated') {
      throw new Error(`Not validated: ${JSON.stringify(read.documents.map((each) => each.preview))}`);
    }
    for (const issueClass of new Set(
      (read.report?.issues ?? []).filter((issue) => issue.severity === 'Warning').map((issue) => issue.class),
    )) {
      await this.ok(this.preparer, 'POST', `/api/files-imports/batches/${batchId}/issues/seen`, {
        versionId: read.batch.versionId,
        class: issueClass,
      });
    }
    const submitted = await this.ok(this.preparer, 'POST', `/api/files-imports/batches/${batchId}/submit`, {
      versionId: read.batch.versionId,
    });
    read = await this.readBatch(batchId);
    const requestId = submitted.body.requestId as string;
    const decision = await this.decide(this.approver, requestId, read.batch.versionId);
    if (decision.status !== 200) throw new Error(`Not verified: ${JSON.stringify(decision.body)}`);
    return { versionId: read.batch.versionId, decisionId: decision.body.decisionId as string };
  }

  /** A decision on an approval request, with a fresh authenticator code (access-and-approvals 9.3). */
  async decide(user: SyntheticUser, requestId: string, versionId: string): Promise<Answer> {
    this.clock.advance(30);
    return this.call(user, 'POST', `/api/access/approval-requests/${requestId}/decision`, {
      versionId,
      outcome: 'approve',
      reason: { kind: 'listed', reasonId: this.approveReason },
      totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0), 0, this.clock.now()),
    });
  }

  /** Publish of the batch version, naming the decision (13.1). */
  publish(batchId: string, versionId: string, decisionId: string): Promise<Answer> {
    return this.call(this.preparer, 'POST', `/api/files-imports/batches/${batchId}/publish`, {
      versionId,
      approvalDecisionId: decisionId,
    });
  }

  /**
   * Policy 14 recorded Signed with its SYNTHETIC value validated by a person who did not enter it, and the
   * opening-publishing capability switched on, through the application's own policy gate as labelled synthetic
   * status (code-house-rules 11.1, 12.14; DM-6; DEC-092). Nothing is SYNTHETIC-signed outside tests.
   */
  async policyFourteenSigned(): Promise<void> {
    const configuration = this.api.app.get<ConfigurationInterface>(CONFIGURATION);
    const { setup } = this.harness;
    const signer = setup.preparer;
    const validator = setup.approver;
    const signing = await grantSynthetic(this.database, { kind: 'user', id: signer.id }, [
      { recordType: 'configuration.policy_status', action: 'create' },
      { recordType: 'configuration.capability', action: 'edit' },
    ]);
    const validating = await grantSynthetic(this.database, { kind: 'user', id: validator.id }, [
      { recordType: 'configuration.policy_validation', action: 'create' },
    ]);
    const signed = await this.command(signer.id, async (context) =>
      configuration.recordSignature(context, { userId: signer.id, roleAssignmentId: signing.assignmentId }, 14, {
        signatory: syntheticName('policy 14 signatory'),
        signedOn: setup.today(),
        origin: 'synthetic',
        evidence: [await this.harness.evidenceFile(signer.id)],
      }),
    );
    if (signed.kind !== 'success') throw new Error(`Policy 14 was not signed: ${signed.refusal.code}`);
    const validated = await this.command(validator.id, async (context) =>
      configuration.recordValidation(context, { userId: validator.id, roleAssignmentId: validating.assignmentId }, 14, {
        origin: 'synthetic',
        evidence: [await this.harness.evidenceFile(validator.id)],
      }),
    );
    if (validated.kind !== 'success') throw new Error(`Policy 14 was not validated: ${validated.refusal.code}`);
    const switched = await this.command(signer.id, (context) =>
      configuration.switchCapability(
        context,
        { userId: signer.id, roleAssignmentId: signing.assignmentId },
        OPENING_PUBLISHING.capability,
        true,
      ),
    );
    if (switched.kind !== 'success') throw new Error(`The capability was not switched on: ${switched.refusal.code}`);
  }

  /** An approved SYNTHETIC switch of S1's unit, as the stage 4 switch flow would record it (10.1). */
  async switchApproved(): Promise<string> {
    const id = uuidv7();
    const owner = await connect(this.database, 'migration');
    try {
      await owner.query(
        'insert into test_opening_stock.switch (id, site_id, business_unit_id, approved_at) values ($1, $2, $3, now())',
        [id, this.fixtures.s1.siteId, this.fixtures.s1.businessUnitId],
      );
    } finally {
      await owner.end();
    }
    return id;
  }

  /** The switch's day-close cutover completed (10.1; PRD-LIF-011). */
  async cutoverCompleted(switchId: string): Promise<void> {
    const owner = await connect(this.database, 'migration');
    try {
      await owner.query('insert into test_opening_stock.cutover (id, switch_id, completed_at) values ($1, $2, now())', [
        uuidv7(),
        switchId,
      ]);
    } finally {
      await owner.end();
    }
  }

  /**
   * Starts a worker serving the test-only posting consumer of a queued publish (10.6; code-house-rules 12.9): its
   * deliveries go to the posting queue, one at a time per book, and its step calls files-imports' queued publish under
   * a SYNTHETIC internal service identity on behalf of the person who asked. `beforeStep` may hold the step. A worker
   * started before stops first.
   */
  async worker(hooks: { beforeStep?: () => Promise<void> } = {}): Promise<OpeningWorker> {
    // One worker at a time, so the hooks given are the ones the next delivery meets.
    await this.stopWorkers();
    const serviceIdentityId = await this.postingIdentity();
    const queued = this.api.app.get<QueuedPublishingInterface>(QUEUED_PUBLISHING);
    const consumer = defineConsumer({
      name: `${syntheticIdentifier('opening-stock')}.post-opening`,
      event: publishRequested,
      serviceIdentity: OPENING_POSTING_IDENTITY,
      authorises: { action: 'edit', recordType: IMPORT_BATCH_TYPE },
      postingBook: (event) => event.payload.bookId,
      handle: async (context, event) => {
        await hooks.beforeStep?.();
        const answer = await queued.publishRequested(context, { serviceIdentityId }, event.payload.publishRequestId);
        return answer.kind === 'refused' ? { kind: 'refused', refusal: answer.refusal } : { kind: 'done' };
      },
    });
    const registry = { events: [publishRequested], consumers: [consumer], jobKinds: [] };
    const log = this.harness.log.logger;
    const router = new OrganisationRouter(
      { directoryConnectionString: databaseUrl(this.harness.world.directory, 'runtime'), poolMax: 8 },
      log,
    );
    const runner = new CommandRunner({
      clock: { now: () => this.clock.now() },
      timezones: syntheticTimezone,
      logger: log,
    });
    const worker = new Worker({
      router,
      runner,
      helper: new IdempotencyHelper({
        runner,
        logger: log,
        secretCheck: secretCheckNotImplemented,
        cipher: restrictedValueCipherNotConfigured,
      }),
      identities: jobIdentities(permissionRegistry),
      logger: log,
      registry,
      settings: syntheticWorkerSettings(registry, { fast: true }),
    });
    await worker.start();
    const running = {
      stop: async () => {
        await worker.stop();
        await router.close();
      },
    };
    this.workers.push(running);
    return running;
  }

  /** Stops every worker, so a request to post waits until a test runs its job itself. */
  async stopWorkers(): Promise<void> {
    for (const running of this.workers.splice(0)) await running.stop();
  }

  /**
   * The SYNTHETIC internal service identity the posting consumer runs as, written once: view on every record type but
   * `access`'s, and edit on import batches (PRD-SEC-018); with the outbox processor's own.
   */
  async postingIdentity(): Promise<string> {
    if (this.serviceIdentityId !== undefined) return this.serviceIdentityId;
    const organisation = this.harness.world.organisations[0];
    await writeSyntheticServiceIdentity(organisation.database, OUTBOX_PROCESSOR_IDENTITY, [OUTBOX_AUTHORITY]);
    const id = await writeSyntheticServiceIdentity(organisation.database, OPENING_POSTING_IDENTITY);
    await grantSynthetic(organisation.database, { kind: 'service-identity', id }, [
      ...permissionRegistry
        .filter((declaration) => declaration.actions.includes('view') && !declaration.code.startsWith('access.'))
        .map((declaration) => ({ recordType: declaration.code, action: 'view' as const })),
      { recordType: IMPORT_BATCH_TYPE, action: 'edit' },
    ]);
    this.serviceIdentityId = id;
    return id;
  }

  /** A further SYNTHETIC internal service identity holding only the authorities given. */
  identity(label: string, authorities: readonly SyntheticAuthority[]): Promise<string> {
    return writeSyntheticServiceIdentity(this.database, syntheticIdentifier(label), authorities);
  }

  /**
   * Runs the queued publish of a request to post as the job's step would, in one command as the service identity
   * named (10.6; code-house-rules 12.9), without the worker: so a test can deliver a request twice, or one it wrote.
   */
  publishRequested(serviceIdentityId: string, publishRequestId: string) {
    const queued = this.api.app.get<QueuedPublishingInterface>(QUEUED_PUBLISHING);
    return this.command(serviceIdentityId, (context) =>
      queued.publishRequested(context, { serviceIdentityId }, publishRequestId),
    );
  }

  /**
   * A further request to post the batch an earlier one names, written directly as the migration role, as a Publish
   * would write one, a second later, with the batch version given: SYNTHETIC, for the job's rechecks under its locks.
   */
  async requestAgain(publishRequestId: string, batchVersionId?: string): Promise<string> {
    const id = uuidv7();
    const owner = await connect(this.database, 'migration');
    try {
      await owner.query(
        `insert into files_imports.publish_request
           (id, batch_id, batch_version_id, approval_decision_id, accounting_book_id, requested_by_user_id, requested_at,
            legal_entity_id, site_id, store_id, business_unit_id)
         select $1, batch_id, coalesce($3, batch_version_id), approval_decision_id, accounting_book_id,
                requested_by_user_id, requested_at + interval '1 second', legal_entity_id, site_id, store_id,
                business_unit_id
           from files_imports.publish_request where id = $2`,
        [id, publishRequestId, batchVersionId ?? null],
      );
    } finally {
      await owner.end();
    }
    return id;
  }
}
