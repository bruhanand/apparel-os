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
import { writeSyntheticStoredFile } from './tax-rules.js';

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

/** A running worker serving the test-only posting consumer. */
export interface OpeningWorker {
  stop(): Promise<void>;
}

export class OpeningApp {
  readonly harness = new OpeningHarness();
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
  private layout!: { layoutVersionId: string; mappingVersionId: string };
  private counter = 0;
  private serviceIdentityId: string | undefined;
  private readonly workers: OpeningWorker[] = [];

  get database(): string {
    return this.harness.database;
  }

  next(label: string): string {
    this.counter += 1;
    return syntheticCode(`${label}-${String(this.counter)}`);
  }

  async start(label: string): Promise<void> {
    const { harness } = this;
    await harness.start(label);
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
  ): Promise<SyntheticUser> {
    const organisation = this.harness.world.organisations[0];
    const user = await writeSyntheticUser(organisation.database, organisation.code, this.harness.keys(), {
      label: `${label}${String(randomInt(1_000_000))}`,
      enrolled: true,
    });
    await grantSynthetic(organisation.database, { kind: 'user', id: user.id }, authorities, {
      fieldClasses: ALL_CLASSES.map((fieldClass) => ({ fieldClass, access: 'view' as const })),
      ...(scope === undefined ? {} : { scope }),
    });
    this.clock.advance(30);
    const response = await fetch(`${this.api.baseUrl}/api/access/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.43' },
      body: JSON.stringify({
        organisationCode: organisation.code,
        login: user.login,
        password: user.password,
        totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0), 0, this.clock.now()),
      }),
    });
    if (response.status !== 200) throw new Error(`${label} was not signed in: ${String(response.status)}`);
    this.cookies.set(user.id, (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '');
    return user;
  }

  async call(user: SyntheticUser, method: 'GET' | 'POST', path: string, body?: unknown): Promise<Answer> {
    const response = await fetch(`${this.api.baseUrl}${path}`, {
      method,
      headers: {
        cookie: this.cookies.get(user.id) ?? '',
        origin: SYNTHETIC_ORIGIN,
        ...(method === 'POST' ? { 'content-type': 'application/json', 'idempotency-key': uuidv7() } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
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
        evidence: [await writeSyntheticStoredFile(this.database, signer.id)],
      }),
    );
    if (signed.kind !== 'success') throw new Error(`Policy 14 was not signed: ${signed.refusal.code}`);
    const validated = await this.command(validator.id, async (context) =>
      configuration.recordValidation(context, { userId: validator.id, roleAssignmentId: validating.assignmentId }, 14, {
        origin: 'synthetic',
        evidence: [await writeSyntheticStoredFile(this.database, validator.id)],
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
    for (const running of this.workers.splice(0)) await running.stop();
    const organisation = this.harness.world.organisations[0];
    if (this.serviceIdentityId === undefined) {
      await writeSyntheticServiceIdentity(organisation.database, OUTBOX_PROCESSOR_IDENTITY, [OUTBOX_AUTHORITY]);
      this.serviceIdentityId = await writeSyntheticServiceIdentity(organisation.database, OPENING_POSTING_IDENTITY);
      await grantSynthetic(organisation.database, { kind: 'service-identity', id: this.serviceIdentityId }, [
        ...permissionRegistry
          .filter((declaration) => declaration.actions.includes('view') && !declaration.code.startsWith('access.'))
          .map((declaration) => ({ recordType: declaration.code, action: 'view' as const })),
        { recordType: IMPORT_BATCH_TYPE, action: 'edit' },
      ]);
    }
    const serviceIdentityId = this.serviceIdentityId;
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
}
