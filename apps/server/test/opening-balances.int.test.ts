import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  comparisonRunReadSchema,
  fieldClassSchema,
  importBatchReadSchema,
  importFileStoredSchema,
  type ComparisonRunRead,
  type ImportBatchRead,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMAND_RUNNER,
  ORGANISATION_ROUTER,
  type CommandRunner,
  type OrganisationRouter,
} from '../src/kernel/index.js';
import { IMPORT_HANDLERS, type ImportHandlers } from '../src/modules/files-imports/index.js';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import { ORGANISATION, type OrganisationInterface } from '../src/modules/organisation/index.js';
import { asVerifier } from './harness/stock/checks.js';
import { StockHarness, type HarnessFixtures } from './harness/stock/harness.js';
import {
  ADVANCES_FIELDS,
  ADVANCES_LAYOUT,
  ADVANCES_MAPPING,
  ADVANCES_SHEET,
  cellsOf,
  CLOSED_BOOKS_FIELDS,
  CLOSED_BOOKS_LAYOUT,
  CLOSED_BOOKS_MAPPING,
  CLOSED_BOOKS_SHEET,
  CUSTOMER_DUES_FIELDS,
  CUSTOMER_DUES_LAYOUT,
  CUSTOMER_DUES_MAPPING,
  CUSTOMER_DUES_SHEET,
  DEPOSITS_FIELDS,
  DEPOSITS_LAYOUT,
  DEPOSITS_MAPPING,
  DEPOSITS_SHEET,
  OPENING_LAYOUT_CODES,
  SUPPLIER_DUES_FIELDS,
  SUPPLIER_DUES_LAYOUT,
  SUPPLIER_DUES_MAPPING,
  SUPPLIER_DUES_SHEET,
} from './fixtures/opening-data.js';
import { syntheticWorkbook } from './fixtures/imports.js';
import { syntheticCode, syntheticFileName } from './fixtures/synthetic.js';
import {
  codeFor,
  startAccessApp,
  SyntheticClock,
  SYNTHETIC_ORIGIN,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { defineSyntheticImportBatchSeries, writeSyntheticLayout } from './support/imports.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import {
  CLOSED_BOOKS_TARGET,
  closedBooksHandler,
  OPENING_BALANCE_TARGETS,
  openingBalanceHandler,
  standInOpenItems,
  writeLiveOpenItem,
} from './support/opening-balances.js';

// S1-F13-T02: opening dues, advances and deposits, each its own layout and opening kind, staged, validated and
// reconciled with SYNTHETIC closed-books balances, through the whole application on real PostgreSQL and MinIO
// (imports-and-opening-data 10.4, 10.5, 11, 13.1, 14, 17 test 21; PRD-LIF-008, PRD-LIF-009, PRD-LIF-011,
// PRD-ORG-005, PRD-PAY-008, PRD-MOD-014, PRD-MOD-015, PRD-ACS-008, POL-14.03). The handlers are the test-only ones of
// `support/opening-balances.ts`, composed into this test application only (GC6-18; code-house-rules 11.4), and the live
// open items a stand-in in the test-only schema `test_opening_balances`. Nothing publishes. Every file, code and value
// is SYNTHETIC; every expected value is written by hand from the files below.

/** The harness, with the keys its users were written under, which the application here must share. */
class OpeningHarness extends StockHarness {
  keys(): Record<string, string> {
    return this.keysEnvironment;
  }
}

type LayoutName = 'supplierDues' | 'customerDues' | 'advances' | 'deposits' | 'closedBooks';

let harness: OpeningHarness;
let fixtures: HarnessFixtures;
let minio: TestFileStore;
let api: AccessTestApp;
let clock: SyntheticClock;
const cookies = new Map<string, string>();
let counter = 0;
const next = (label: string) => syntheticCode(`${label}-${String(++counter)}`);

let preparer: SyntheticUser;
/** A reader granted every class but customer contact (section 11). */
let noContactReader: SyntheticUser;

let codes: { unit: string; legalEntity: string; book: string; otherBook: string };
let layouts: Record<LayoutName, { layoutVersionId: string; mappingVersionId: string }>;
let CUTOFF: string;

const ALL_CLASSES = fieldClassSchema.options;
const PREPARER: SyntheticAuthority[] = [
  { recordType: 'files_imports.stored_file', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'view' },
  { recordType: 'files_imports.import_batch', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'edit' },
  { recordType: 'files_imports.comparison_run', action: 'view' },
  { recordType: 'files_imports.comparison_run', action: 'create' },
];

async function enrolled(
  label: string,
  authorities: readonly SyntheticAuthority[],
  classes: readonly (typeof ALL_CLASSES)[number][] = ALL_CLASSES,
): Promise<SyntheticUser> {
  const organisation = harness.world.organisations[0];
  const user = await writeSyntheticUser(organisation.database, organisation.code, harness.keys(), {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
  });
  await grantSynthetic(organisation.database, { kind: 'user', id: user.id }, authorities, {
    fieldClasses: classes.map((fieldClass) => ({ fieldClass, access: 'view' as const })),
  });
  clock.advance(30);
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.42' },
    body: JSON.stringify({
      organisationCode: organisation.code,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now()),
    }),
  });
  expect(response.status).toBe(200);
  cookies.set(user.id, (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '');
  return user;
}

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

async function ok(user: SyntheticUser, method: 'GET' | 'POST', path: string, body?: unknown): Promise<Answer> {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method,
    headers: {
      cookie: cookies.get(user.id) ?? '',
      origin: SYNTHETIC_ORIGIN,
      ...(method === 'POST' ? { 'content-type': 'application/json', 'idempotency-key': uuidv7() } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  const answer = { status: response.status, body: (await response.json()) as Record<string, unknown> };
  expect(answer.status, `${path}: ${JSON.stringify(answer.body)}`).toBe(200);
  return answer;
}

const readBatch = async (batchId: string, reader: SyntheticUser = preparer): Promise<ImportBatchRead> =>
  importBatchReadSchema.parse((await ok(reader, 'GET', `/api/files-imports/batches/${batchId}`)).body);

const TARGETS: Record<LayoutName, string> = {
  supplierDues: OPENING_BALANCE_TARGETS['supplier-dues'],
  customerDues: OPENING_BALANCE_TARGETS['customer-dues'],
  advances: OPENING_BALANCE_TARGETS.advances,
  deposits: OPENING_BALANCE_TARGETS.deposits,
  closedBooks: CLOSED_BOOKS_TARGET,
};
const SHEETS: Record<LayoutName, { sheet: string; fields: Readonly<Record<string, string>> }> = {
  supplierDues: { sheet: SUPPLIER_DUES_SHEET, fields: SUPPLIER_DUES_FIELDS },
  customerDues: { sheet: CUSTOMER_DUES_SHEET, fields: CUSTOMER_DUES_FIELDS },
  advances: { sheet: ADVANCES_SHEET, fields: ADVANCES_FIELDS },
  deposits: { sheet: DEPOSITS_SHEET, fields: DEPOSITS_FIELDS },
  closedBooks: { sheet: CLOSED_BOOKS_SHEET, fields: CLOSED_BOOKS_FIELDS },
};

/** Uploads a SYNTHETIC workbook of the layout's rows and starts a batch on it at the place given; answers the batch. */
async function started(layout: LayoutName, rows: readonly Readonly<Record<string, string>>[]): Promise<string> {
  const { sheet, fields } = SHEETS[layout];
  const bytes = await syntheticWorkbook({
    sheet,
    header: Object.values(fields),
    rows: rows.map((row) => cellsOf(fields, row)),
    marker: next('FILE'),
  });
  const stored = importFileStoredSchema.parse(
    (
      await ok(preparer, 'POST', '/api/files-imports/import-files', {
        sourceSystem: 'manual-upload',
        originalName: syntheticFileName(`balances-${String(++counter)}`, 'xlsx'),
        contentBase64: bytes.toString('base64'),
      })
    ).body,
  );
  const closedBooks = layout === 'closedBooks';
  const answer = await ok(preparer, 'POST', '/api/files-imports/batches', {
    storedFileId: stored.storedFileId,
    fileReceiptId: stored.receiptId,
    kind: closedBooks ? 'historical-reference' : 'opening-balance',
    target: TARGETS[layout],
    layoutVersionId: layouts[layout].layoutVersionId,
    mappingVersionId: layouts[layout].mappingVersionId,
    scope: closedBooks
      ? { legalEntityId: fixtures.legalEntityId }
      : { siteId: fixtures.s1.siteId, businessUnitId: fixtures.s1.businessUnitId },
  });
  return answer.body.batchId as string;
}

async function validated(batchId: string): Promise<ImportBatchRead> {
  await ok(preparer, 'POST', `/api/files-imports/batches/${batchId}/validate`, {});
  return readBatch(batchId);
}

/** Each document's issues as `code@row`, and the report's Blocking issues as `code@row`. */
function issuesOf(read: ImportBatchRead): string[] {
  const preview = read.documents.flatMap((document) =>
    document.preview?.kind === 'issues'
      ? document.preview.issues.map((each) => `${each.code}@${String(each.rowNumber ?? '')}`)
      : [],
  );
  const report = (read.report?.issues ?? [])
    .filter((issue) => issue.severity === 'Blocking')
    .map((issue) => `${issue.code}@${String(issue.rowNumber ?? '')}`);
  return [...new Set([...preview, ...report])].sort();
}

const supplierDue = (values: Record<string, string>) => ({
  openingReference: 'SYN-OPEN-SD',
  unitCode: codes.unit,
  cutoffDate: CUTOFF,
  legalEntityCode: codes.legalEntity,
  bookCode: codes.book,
  documentDate: CUTOFF,
  ...values,
});

/**
 * The number of rows of every table outside `files_imports`, as the read-only role reads them (H6), but the
 * plumbing every command writes: the audit records and the access records (`audit`), the idempotency keys and the
 * outbox (`kernel`), the batch code allocated (`numbering`) and the sessions (`access`).
 */
function recordsOutsideImports() {
  return asVerifier(harness.database, async (client) => {
    const tables = await client.query<{ name: string }>(
      `select n.nspname || '.' || c.relname as name
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r', 'p') and not c.relispartition
         and n.nspname not in ('pg_catalog', 'information_schema', 'files_imports', 'audit', 'kernel', 'numbering',
           'access', 'pgboss')
         and n.nspname not like 'pg\\_%' order by 1`,
    );
    const counts: Record<string, number> = {};
    for (const { name } of tables.rows) {
      const [schema, table] = name.split('.');
      const result = await client.query<{ rows: number }>(
        `select count(*)::int as rows from "${schema ?? ''}"."${table ?? ''}"`,
      );
      counts[name] = result.rows[0]?.rows ?? -1;
    }
    return counts;
  });
}

beforeAll(async () => {
  harness = new OpeningHarness();
  await harness.start('balances');
  fixtures = await harness.fixtures('moving-average', 'book');
  const { setup } = harness;
  CUTOFF = setup.today();
  const structure = await setup.run(setup.preparer.id, (c) => setup.organisation.structureOn(c, CUTOFF));
  const codeOf = (list: readonly { id: string; code: string }[], id: string) =>
    list.find((each) => each.id === id)?.code ?? '';
  const otherBook = structure.accountingBooks.find((each) => each.id !== fixtures.bookId);
  codes = {
    unit: codeOf(structure.businessUnits, fixtures.s1.businessUnitId),
    legalEntity: codeOf(structure.legalEntities, fixtures.legalEntityId),
    book: codeOf(structure.accountingBooks, fixtures.bookId),
    otherBook: otherBook?.code ?? syntheticCode('NO-SUCH-BOOK'),
  };

  minio = await startTestFileStore();
  clock = new SyntheticClock();
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
  api = await startAccessApp(harness.world, harness.keys(), { fileStoreEnvironment: minio.environment, clock });
  // The test-only handlers, composed into this test application only (GC6-18; code-house-rules 11.4).
  const handlers = api.app.get<ImportHandlers>(IMPORT_HANDLERS);
  const dependencies = {
    organisation: api.app.get<OrganisationInterface>(ORGANISATION),
    openItems: standInOpenItems,
  };
  for (const kind of ['supplier-dues', 'customer-dues', 'advances', 'deposits'] as const) {
    handlers.register(openingBalanceHandler(kind, dependencies));
  }
  handlers.register(closedBooksHandler(dependencies));
  preparer = await enrolled('BALANCES-PREPARER', PREPARER);
  noContactReader = await enrolled(
    'BALANCES-READER',
    [{ recordType: 'files_imports.import_batch', action: 'view' }],
    ALL_CLASSES.filter((each) => each !== 'customer-contact'),
  );
  const layoutOf = async (
    name: LayoutName,
    structureOf: unknown,
    fields: unknown,
    documentType: string,
  ): Promise<{ layoutVersionId: string; mappingVersionId: string }> =>
    writeSyntheticLayout(
      organisation.database,
      {
        layoutCode: OPENING_LAYOUT_CODES[name].layout,
        mappingCode: OPENING_LAYOUT_CODES[name].mapping,
        structure: structureOf,
        fields,
        target: TARGETS[name],
        kinds: [name === 'closedBooks' ? 'historical-reference' : 'opening-balance'],
        documentType,
      },
      setup.preparer.id,
      setup.approver.id,
    );
  layouts = {
    supplierDues: await layoutOf('supplierDues', SUPPLIER_DUES_LAYOUT, SUPPLIER_DUES_MAPPING, 'opening-supplier-dues'),
    customerDues: await layoutOf('customerDues', CUSTOMER_DUES_LAYOUT, CUSTOMER_DUES_MAPPING, 'opening-customer-dues'),
    advances: await layoutOf('advances', ADVANCES_LAYOUT, ADVANCES_MAPPING, 'opening-advances'),
    deposits: await layoutOf('deposits', DEPOSITS_LAYOUT, DEPOSITS_MAPPING, 'opening-deposits'),
    closedBooks: await layoutOf('closedBooks', CLOSED_BOOKS_LAYOUT, CLOSED_BOOKS_MAPPING, 'closed-books-balances'),
  };
  const router = api.app.get<OrganisationRouter>(ORGANISATION_ROUTER);
  const routed = await router.resolveForSignIn(organisation.code);
  if (!routed.routed) throw new Error('The synthetic Organisation was not routed');
  await api.app.get<CommandRunner>(COMMAND_RUNNER).run(
    {
      commandName: 'test.define-series',
      organisation: routed.organisation,
      correlationId: uuidv7(),
      actor: { kind: 'actor', actorId: setup.preparer.id },
    },
    (context) => defineSyntheticImportBatchSeries(context, api.app.get<NumberingInterface>(NUMBERING)),
  );
}, 600_000);

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (harness as OpeningHarness | undefined)?.stop();
});

const batches: Partial<Record<LayoutName, string>> = {};

describe('the four opening kinds of 10.4 (PRD-LIF-009, PRD-LIF-011, POL-14.03)', () => {
  it('GC-6 17 test 21 PRD-LIF-009 PRD-LIF-008: the four kinds stage and validate as separate kinds, and nothing outside files-imports is written', async () => {
    const before = await recordsOutsideImports();
    batches.supplierDues = await started('supplierDues', [
      supplierDue({
        partyCode: 'SYN-SUP-1',
        documentReference: 'SYN-INV-1',
        originalAmount: '1500.00',
        openAmount: '1000.00',
      }),
      supplierDue({ partyCode: 'SYN-SUP-1', documentReference: 'SYN-INV-2', openAmount: '250.50', dueDate: CUTOFF }),
      supplierDue({ partyCode: 'SYN-SUP-2', documentReference: 'SYN-INV-3', openAmount: '400.00' }),
    ]);
    batches.customerDues = await started('customerDues', [
      {
        openingReference: 'SYN-OPEN-CD',
        unitCode: codes.unit,
        cutoffDate: CUTOFF,
        customerCode: 'SYN-CUS-1',
        customerName: 'SYNTHETIC Customer One',
        documentReference: 'SYN-BILL-1',
        documentDate: CUTOFF,
        openAmount: '99.99',
      },
    ]);
    batches.advances = await started('advances', [
      {
        openingReference: 'SYN-OPEN-AD',
        unitCode: codes.unit,
        cutoffDate: CUTOFF,
        direction: 'given',
        partyCode: 'SYN-SUP-1',
        purpose: 'SYNTHETIC purpose',
        amount: '300.00',
        evidence: 'SYN-EV-1',
      },
      {
        openingReference: 'SYN-OPEN-AD',
        unitCode: codes.unit,
        cutoffDate: CUTOFF,
        direction: 'received',
        partyCode: 'SYN-CUS-2',
        purpose: 'SYNTHETIC purpose',
        amount: '50.00',
        evidence: 'SYN-EV-2',
      },
    ]);
    batches.deposits = await started('deposits', [
      {
        openingReference: 'SYN-OPEN-DP',
        unitCode: codes.unit,
        cutoffDate: CUTOFF,
        direction: 'given',
        partyCode: 'SYN-LANDLORD-1',
        agreementReference: 'SYN-AGR-1',
        amount: '20000.00',
        evidence: 'SYN-EV-3',
      },
    ]);
    const reads: ImportBatchRead[] = [];
    for (const name of ['supplierDues', 'customerDues', 'advances', 'deposits'] as const) {
      const read = await validated(batches[name] ?? '');
      expect(read.batch.state, `${name}: ${JSON.stringify(issuesOf(read))}`).toBe('Validated');
      reads.push(read);
    }
    // Each kind is its own batch, of the opening-balance kind, for its own target (PRD-LIF-009).
    expect(reads.map((read) => [read.batch.kind, read.batch.target])).toEqual([
      ['opening-balance', OPENING_BALANCE_TARGETS['supplier-dues']],
      ['opening-balance', OPENING_BALANCE_TARGETS['customer-dues']],
      ['opening-balance', OPENING_BALANCE_TARGETS.advances],
      ['opening-balance', OPENING_BALANCE_TARGETS.deposits],
    ]);
    // Amounts are staged as integer paise (PRD-MOD-014).
    expect(reads[0]?.documents[0]?.rows.map((row) => row.values.openAmount)).toEqual([
      expect.objectContaining({ kind: 'supplied', value: '100000' }),
      expect.objectContaining({ kind: 'supplied', value: '25050' }),
      expect.objectContaining({ kind: 'supplied', value: '40000' }),
    ]);
    // No journal, liability, delivery, invoice or any other record outside files-imports (10.5; PRD-LIF-008).
    expect(before).toHaveProperty(['finance.journal']);
    expect(await recordsOutsideImports()).toEqual(before);
  }, 600_000);

  it('GC-6 17 test 21 POL-14.03: each kind’s totals compare per party and per account with synthetic closed-books balances, every difference listed', async () => {
    batches.closedBooks = await started('closedBooks', [
      // Supplier dues: SUP-1 agrees; SUP-2 differs; SUP-3 is in the books only; and the account's own total.
      {
        balancesReference: 'SYN-TB-1',
        closedOn: CUTOFF,
        bookCode: codes.book,
        account: 'supplier-dues',
        partyCode: 'SYN-SUP-1',
        balance: '1250.50',
      },
      {
        balancesReference: 'SYN-TB-1',
        closedOn: CUTOFF,
        bookCode: codes.book,
        account: 'supplier-dues',
        partyCode: 'SYN-SUP-2',
        balance: '350.00',
      },
      {
        balancesReference: 'SYN-TB-1',
        closedOn: CUTOFF,
        bookCode: codes.book,
        account: 'supplier-dues',
        partyCode: 'SYN-SUP-3',
        balance: '75.00',
      },
      // Advances: one given, as the opening has it; none received.
      {
        balancesReference: 'SYN-TB-1',
        closedOn: CUTOFF,
        bookCode: codes.book,
        account: 'advances-given',
        partyCode: 'SYN-SUP-1',
        balance: '300.00',
      },
      // A deposit of another kind, which a run of supplier dues does not read.
      {
        balancesReference: 'SYN-TB-1',
        closedOn: CUTOFF,
        bookCode: codes.book,
        account: 'deposits-given',
        partyCode: 'SYN-LANDLORD-1',
        balance: '20000.00',
      },
    ]);
    const closed = await validated(batches.closedBooks);
    expect(closed.batch.state, JSON.stringify(issuesOf(closed))).toBe('Validated');

    const run = async (left: LayoutName): Promise<ComparisonRunRead> => {
      const started = await ok(preparer, 'POST', '/api/files-imports/comparison-runs', {
        run: 'balances-against-closed-books',
        balances: { batchId: batches[left] },
        closedBooks: { batchId: batches.closedBooks },
      });
      return comparisonRunReadSchema.parse(
        (await ok(preparer, 'GET', `/api/files-imports/comparison-runs/${started.body.runId as string}`)).body,
      );
    };
    const book = fixtures.bookId;
    const dues = await run('supplierDues');
    expect(dues.lines).toEqual([]);
    expect(dues.left).toMatchObject({ kind: 'batch', set: 'opening-balances', batchId: batches.supplierDues });
    expect(dues.right).toMatchObject({ kind: 'batch', set: 'closed-books', batchId: batches.closedBooks });
    // The rows each total came from: the opening's three dues and the books' three supplier balances, the deposit not read.
    expect(dues.balanceLines.map((line) => [line.leftRows.length, line.rightRows.length])).toEqual([
      [2, 1],
      [1, 1],
      [0, 1],
      [3, 3],
    ]);
    expect(dues.balanceLines).toMatchObject([
      {
        lineNumber: 1,
        keyedBy: 'party',
        accountingBookId: book,
        account: 'supplier-dues',
        party: 'SYN-SUP-1',
        left: { state: 'listed', paise: 125_050 },
        right: { state: 'listed', paise: 125_050 },
        result: 'same',
      },
      {
        lineNumber: 2,
        keyedBy: 'party',
        accountingBookId: book,
        account: 'supplier-dues',
        party: 'SYN-SUP-2',
        left: { state: 'listed', paise: 40_000 },
        right: { state: 'listed', paise: 35_000 },
        result: 'different',
      },
      {
        lineNumber: 3,
        keyedBy: 'party',
        accountingBookId: book,
        account: 'supplier-dues',
        party: 'SYN-SUP-3',
        left: { state: 'not-listed' },
        right: { state: 'listed', paise: 7_500 },
        result: 'not-listed-left',
      },
      {
        lineNumber: 4,
        keyedBy: 'account',
        accountingBookId: book,
        account: 'supplier-dues',
        left: { state: 'listed', paise: 165_050 },
        right: { state: 'listed', paise: 167_550 },
        result: 'different',
      },
    ]);
    expect(dues.counts).toEqual({
      same: 1,
      different: 2,
      'not-listed-left': 1,
      'not-listed-right': 0,
      unknown: 0,
      unresolved: 0,
    });

    // Advances given and received stay apart (PRD-PAY-008): the one received is not in the books.
    const advances = await run('advances');
    expect(advances.balanceLines.map((line) => [line.keyedBy, line.account, line.party ?? null, line.result])).toEqual([
      ['party', 'advances-given', 'SYN-SUP-1', 'same'],
      ['party', 'advances-received', 'SYN-CUS-2', 'not-listed-right'],
      ['account', 'advances-given', null, 'same'],
      ['account', 'advances-received', null, 'not-listed-right'],
    ]);
    // Neither side changed (10.3): both batches read as before.
    expect((await readBatch(batches.supplierDues ?? '')).batch.state).toBe('Validated');
    expect((await readBatch(batches.closedBooks)).batch.state).toBe('Validated');
  }, 600_000);

  it('GC-6 17 test 21 PRD-LIF-011: a due also open as a live document is Blocking', async () => {
    await writeLiveOpenItem(harness.database, {
      accountingBookId: fixtures.bookId,
      account: 'supplier-dues',
      party: 'SYN-SUP-9',
      reference: 'SYN-INV-LIVE',
    });
    const batchId = await started('supplierDues', [
      supplierDue({ partyCode: 'SYN-SUP-9', documentReference: 'SYN-INV-LIVE', openAmount: '10.00' }),
      // The same reference of another party is not the live document.
      supplierDue({ partyCode: 'SYN-SUP-8', documentReference: 'SYN-INV-LIVE', openAmount: '10.00' }),
    ]);
    const read = await validated(batchId);
    expect(read.batch.state).toBe('Staged');
    expect(issuesOf(read)).toEqual([`${OPENING_BALANCE_TARGETS['supplier-dues']}.also-open-as-live-document@2`]);
  }, 600_000);

  it('PRD-ORG-005 PRD-MOD-015: a due naming a book not its unit’s mapping’s is Blocking; an amount finer than paise stays Unknown, never zero', async () => {
    const target = OPENING_BALANCE_TARGETS['supplier-dues'];
    const wrong = await validated(
      await started('supplierDues', [
        supplierDue({
          partyCode: 'SYN-SUP-1',
          documentReference: 'SYN-INV-7',
          bookCode: codes.otherBook,
          openAmount: '10.00',
        }),
        supplierDue({ partyCode: 'SYN-SUP-1', documentReference: 'SYN-INV-9', openAmount: '0.00' }),
      ]),
    );
    expect(wrong.batch.state).toBe('Staged');
    expect(issuesOf(wrong)).toEqual([`${target}.amount-not-positive@3`, `${target}.book-not-the-unit-mapping@2`]);
    const finer = await validated(
      await started('supplierDues', [
        supplierDue({ partyCode: 'SYN-SUP-1', documentReference: 'SYN-INV-8', openAmount: '10.005' }),
      ]),
    );
    expect(finer.batch.state).toBe('Staged');
    expect(finer.documents[0]?.rows[0]?.values.openAmount).toMatchObject({ kind: 'unknown' });
    expect(issuesOf(finer)).toEqual(['files-imports.required-value-unknown@2']);
  }, 600_000);

  it('section 11 PRD-ACS-008: a customer’s name on a customer due is masked for a reader without customer contact', async () => {
    const read = await readBatch(batches.customerDues ?? '', noContactReader);
    expect(read.batch.maskedClasses).toEqual(['customer-contact']);
    const row = read.documents[0]?.rows[0];
    expect(row?.values.customerName).toEqual({ kind: 'masked', fieldClass: 'customer-contact' });
    expect(row?.values.customerCode).toMatchObject({ kind: 'supplied', value: 'SYN-CUS-1' });
    expect(row?.cells.find((cell) => cell.text === 'SYNTHETIC Customer One')).toBeUndefined();
  }, 600_000);
});
