import { known, paise, unknownValue, uuidv7 } from '@apparel-os/domain';
import {
  ACCOUNT_TYPE,
  JOURNAL_TYPE,
  POSTING_MAP_TYPE,
  type FinanceChanged,
  type MapLineDraft,
  type PeriodDraft,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOCK_STEP, type TransactionContext } from '../src/kernel/index.js';
import { Audit } from '../src/modules/audit/index.js';
import { Configuration } from '../src/modules/configuration/index.js';
import {
  JOURNAL_KIND,
  postingConfigurationCheck,
  type PostingEventKind,
  type PostItem,
  type PostRequest,
  type PostResult,
} from '../src/modules/finance/books/index.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { syntheticKeysEnvironment, writeSyntheticUser } from './support/access.js';
import { TEST_COMPOSITION } from './support/composition.js';
import { grantSynthetic } from './support/grants.js';
import { capturingLogger } from './support/jobs.js';
import {
  approved,
  approvedGeography,
  decided,
  prepared,
  structureSetup,
  type StructureSetup,
} from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { reverseIn } from './support/books.js';
import { connect } from './support/postgres.js';

// S1-F09-T02: periods, posting maps, Check postable, Hold periods, Post, Reverse, the policy 9 check and the trial
// balance, through the books part's interface and access's Decide, on real PostgreSQL (books-and-posting 4.1, 5, 6, 8,
// 9, 11, 12, 15 tests 2, 3, 6, 13 (overlap and gap), 14, 15, 15a and 18). The caller is a SYNTHETIC one, composed only
// here (DEC-112 H2): it checks before any lock, holds the periods at step 7 and the journal series at step 8, then
// posts. Every value is SYNTHETIC: the kinds, accounts and maps follow the labelled synthetic chart of 16.1, and the
// periods, financial year and number format are synthetic (GC4-1, GC5-1, V-10); none is KDPS's.

/** A SYNTHETIC posting event kind and its reversal kind, test- labelled, declared in the test composition (7.1). */
const VALUE_IN: PostingEventKind = {
  kind: 'test-synthetic.value-in',
  components: ['to-pool', 'to-dispatch'],
  reversalKind: 'test-synthetic.value-in-reversal',
  liveStage: 1,
};
const VALUE_IN_REVERSAL: PostingEventKind = {
  kind: 'test-synthetic.value-in-reversal',
  components: ['to-pool', 'to-dispatch', 'variance'],
  reversalKind: null,
  liveStage: 1,
};
/** The same kind as a later build declares it, with one more component its maps have no line for (6.2 cond. 2). */
const VALUE_IN_LATER: PostingEventKind = { ...VALUE_IN, components: [...VALUE_IN.components, 'to-loss'] };
const VALUE_IN_REVERSAL_LATER: PostingEventKind = {
  ...VALUE_IN_REVERSAL,
  components: [...VALUE_IN_REVERSAL.components, 'to-loss'],
};
const SOURCE = 'test-synthetic';
const FINANCIAL_YEAR = syntheticCode('FY-1');

let world: SyntheticWorld;
let setup: StructureSetup;
let later: StructureSetup;
let other: StructureSetup;
let stateId: string;
let areaId: string;
let counter = 0;
const next = (prefix: string) => `${prefix}-${String(++counter)}`;

beforeAll(async () => {
  world = await createSyntheticOrganisations('posting');
  const [orgA, orgB] = world.organisations;
  const keysEnvironment = syntheticKeysEnvironment(world);
  const options = { directory: world.directory, database: orgA.database, organisationCode: orgA.code, keysEnvironment };
  setup = await structureSetup({ ...options, label: 'POST-A', eventKinds: [VALUE_IN, VALUE_IN_REVERSAL] });
  later = await structureSetup({
    ...options,
    label: 'POST-LATER',
    eventKinds: [VALUE_IN_LATER, VALUE_IN_REVERSAL_LATER],
  });
  other = await structureSetup({
    directory: world.directory,
    database: orgB.database,
    organisationCode: orgB.code,
    keysEnvironment,
    label: 'POST-B',
    eventKinds: [VALUE_IN, VALUE_IN_REVERSAL],
  });
  const geography = await approvedGeography(setup, 'POST');
  stateId = geography.state.recordId;
  areaId = geography.area.recordId;
  // The preparer may approve too, so a refusal of their own preparation is for the preparation alone (PRD-ACS-006).
  await grantSynthetic(orgA.database, { kind: 'user', id: setup.preparer.id }, [
    { recordType: POSTING_MAP_TYPE, action: 'approve' },
  ]);
}, 180_000);

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (later as StructureSetup | undefined)?.close();
  await (other as StructureSetup | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

type Outcome<T> = { kind: 'success'; answer: T } | { kind: 'refusal'; refusal: { code: string } };

function recorded<T>(outcome: Outcome<T>): T {
  if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
  return outcome.answer;
}

/** The CA's evidence, a SYNTHETIC reference, covering the versions named (6.3). */
const reference = (
  versions: readonly { recordType: typeof ACCOUNT_TYPE | typeof POSTING_MAP_TYPE; versionId: string }[],
  on: StructureSetup = setup,
) =>
  on.asPreparerDo((c, p) =>
    on.books.recordCaEvidence(c, p, {
      versions: [...versions],
      evidence: {
        kind: 'reference',
        what: syntheticName('CA approval letter'),
        givenBy: syntheticName('CA'),
        givenOn: on.today(),
        keptAt: syntheticName('Accounts file'),
      },
    }),
  );

async function inForce(
  change: FinanceChanged,
  recordType: typeof ACCOUNT_TYPE | typeof POSTING_MAP_TYPE,
  on: StructureSetup = setup,
) {
  recorded(await reference([{ recordType, versionId: change.versionId }], on));
  decided(await on.decide(change.requestId ?? '', change.versionId));
}

/**
 * A SYNTHETIC book with the chart of 16.1's accounts in force, a Site with a Store, a whole-store unit and a warehouse
 * unit mapped to the book, one Open period from today for ten days, and a journal series for its financial year.
 */
async function book(on: StructureSetup = setup, geography = { stateId, areaId }) {
  const legalEntity = await approved(on, (c, p) =>
    on.organisation.prepareLegalEntity(c, p, {
      code: syntheticCode(next('LE')),
      legalName: syntheticName('Posting legal entity'),
      validFrom: on.today(),
    }),
  );
  const registration = await approved(on, (c, p) =>
    on.organisation.prepareTaxRegistration(c, p, {
      code: syntheticCode(next('GSTIN')),
      legalEntityId: legalEntity.recordId,
      registrationNumber: `0${String(counter)}SYNTHETIC`,
      stateId: geography.stateId,
      validityFrom: on.today(),
      validFrom: on.today(),
    }),
  );
  const bookRecord = await approved(on, (c, p) =>
    on.organisation.prepareAccountingBook(c, p, {
      code: syntheticCode(next('BK')),
      legalEntityId: legalEntity.recordId,
      name: syntheticName('Book'),
      validFrom: on.today(),
    }),
  );
  const bookId = bookRecord.recordId;
  const mapping = {
    legalEntityId: legalEntity.recordId,
    taxRegistrationId: registration.recordId,
    accountingBookId: bookId,
  };
  const site = await approved(on, (c, p) =>
    on.organisation.prepareSite(c, p, {
      code: syntheticCode(next('SITE')),
      name: syntheticName('Posting site'),
      physicalKind: 'retail-site',
      areaId: geography.areaId,
      addresses: [syntheticName('Address')],
      aliases: [],
      validFrom: on.today(),
    }),
  );
  const store = await approved(on, (c, p) =>
    on.organisation.prepareStore(c, p, {
      code: syntheticCode(next('STORE')),
      name: syntheticName('Posting store'),
      format: 'ebo',
      operatingModel: 'company-owned',
      siteId: site.recordId,
      aliases: [],
      validFrom: on.today(),
    }),
  );
  const unit = async (kind: 'whole-store' | 'warehouse', storeId?: string) => {
    const answer = prepared(
      await on.prepare((c, p) =>
        on.organisation.prepareBusinessUnit(c, p, {
          code: syntheticCode(next('BU')),
          siteId: site.recordId,
          kind,
          ...(storeId === undefined ? {} : { storeId }),
          name: syntheticName('Posting unit'),
          ...mapping,
          validFrom: on.today(),
        }),
      ),
    );
    decided(await on.decide(answer.requestId, answer.versionId));
    return answer.recordId;
  };
  const storeUnit = await unit('whole-store', store.recordId);
  const warehouse = await unit('warehouse');
  const accounts: Record<'INV' | 'TRN' | 'PUR', string> = { INV: '', TRN: '', PUR: '' };
  for (const [code, nature] of [
    ['INV', 'asset'],
    ['TRN', 'asset'],
    ['PUR', 'liability'],
  ] as const) {
    const change = recorded(
      await on.asPreparerDo((c, p) =>
        on.books.prepareAccount(c, p, {
          bookId,
          code: syntheticCode(`${code}-${String(counter)}`),
          nature,
          origin: 'synthetic',
          name: syntheticName(`Account ${code}`),
          validFrom: on.today(),
        }),
      ),
    );
    await inForce(change, ACCOUNT_TYPE, on);
    accounts[code] = change.recordId;
  }
  const period = recorded(await definePeriod(on, bookId, period1(on)));
  await journalSeries(on, bookId);
  return {
    bookId,
    legalEntityId: legalEntity.recordId,
    siteId: site.recordId,
    storeId: store.recordId,
    storeUnit,
    warehouse,
    accounts,
    periodId: period.periodId,
  };
}

type Book = Awaited<ReturnType<typeof book>>;

const period1 = (on: StructureSetup): PeriodDraft => ({
  code: syntheticCode('P1'),
  financialYear: FINANCIAL_YEAR,
  firstDay: on.today(),
  lastDay: on.day(9),
});

const definePeriod = (on: StructureSetup, bookId: string, draft: PeriodDraft) =>
  on.asPreparerDo((c, p) => on.books.definePeriod(c, p, bookId, draft));

/** The book's journal series for the synthetic financial year, in a SYNTHETIC format (5.4; numbering 3.5). */
async function journalSeries(on: StructureSetup, bookId: string) {
  const formatCode = syntheticCode(next('JV-FMT'));
  await on.run(on.preparer.id, (c) =>
    on.numbering.defineFormatVersion(c, formatCode, [
      { kind: 'text', text: `SYN-JV${String(counter)}-` },
      { kind: 'year' },
      { kind: 'text', text: '-' },
      { kind: 'sequence', width: 5 },
    ]),
  );
  const defined = await on.run(on.preparer.id, (c) =>
    on.numbering.defineSeries(c, {
      kind: JOURNAL_KIND.kind,
      scopeKey: bookId,
      financialYear: FINANCIAL_YEAR,
      displayScopeKey: bookId,
      formatCode,
    }),
  );
  if (defined.kind !== 'done') throw new Error(`Series refused: ${defined.refusal.code}`);
}

/** The map of 16.1 for the synthetic kind: to-pool INV/PUR, to-dispatch TRN/PUR; brand required on the INV line. */
const mapOf = (accounts: Book['accounts'], options: { storeOnTransit?: boolean } = {}): MapLineDraft[] => [
  { component: 'to-pool', side: 'debit', accountId: accounts.INV, requiresStore: false, requiresBrand: true },
  { component: 'to-pool', side: 'credit', accountId: accounts.PUR, requiresStore: false, requiresBrand: false },
  {
    component: 'to-dispatch',
    side: 'debit',
    accountId: accounts.TRN,
    requiresStore: options.storeOnTransit ?? false,
    requiresBrand: false,
  },
  { component: 'to-dispatch', side: 'credit', accountId: accounts.PUR, requiresStore: false, requiresBrand: false },
];

const prepareMap = (
  on: StructureSetup,
  bookId: string,
  lines: MapLineDraft[],
  validFrom = on.today(),
  versionToken?: string,
) =>
  on.asPreparerDo((c, p) =>
    on.books.preparePostingMap(c, p, {
      bookId,
      eventKind: VALUE_IN.kind,
      origin: 'synthetic',
      validFrom,
      ...(versionToken === undefined ? {} : { versionToken }),
      lines,
    }),
  );

const BRAND = '01900000-0000-7000-8000-00000000b0b0';

const item = (b: Book, amounts: { pool?: number; dispatch?: number }, overrides: Partial<PostItem> = {}): PostItem => ({
  itemKey: uuidv7(),
  eventKind: VALUE_IN.kind,
  businessUnitId: b.storeUnit,
  brandId: BRAND,
  businessDate: setup.today(),
  components: [
    { component: 'to-pool', amount: known(paise(amounts.pool ?? 0)) },
    { component: 'to-dispatch', amount: known(paise(amounts.dispatch ?? 0)) },
  ],
  ...overrides,
});

const document = (items: PostItem[], on: StructureSetup = setup): PostRequest => ({
  sourceModule: SOURCE,
  document: { recordType: 'test-synthetic.document', recordId: uuidv7() },
  actor: { kind: 'user', id: on.preparer.id },
  items,
});

/**
 * The SYNTHETIC caller (DEC-112 H2): Check postable before any lock, a refusal ending the command with nothing locked;
 * then Hold periods at step 7, the journal series at step 8 and Post, all in one transaction.
 */
async function postDocument(request: PostRequest, on: StructureSetup = setup): Promise<PostResult> {
  return on.run(on.preparer.id, async (context: TransactionContext) => {
    const checks = await on.books.checkPostable(context, request);
    const refused = checks.filter((each) => each.kind === 'refused');
    if (refused.length > 0) return { kind: 'refused', items: refused };
    const held = await on.books.holdPeriods(context, checks);
    if (held.kind === 'refused') throw new Error(held.refusal.code);
    await context.lock(LOCK_STEP.numberSeries, held.seriesTargets);
    return on.books.post(context, request);
  });
}

function posted(result: PostResult) {
  if (result.kind !== 'posted') throw new Error(`Not posted: ${JSON.stringify(result)}`);
  return result.journals;
}

async function mapInForce(b: Book, on: StructureSetup = setup, lines = mapOf(b.accounts)) {
  const change = recorded(await prepareMap(on, b.bookId, lines));
  await inForce(change, POSTING_MAP_TYPE, on);
  return change;
}

const linesOf = async (journalId: string, database = world.organisations[0].database) => {
  const client = await connect(database, 'migration');
  try {
    const result = await client.query<{ account_id: string; side: string; amount_paise: string; store_id: string }>(
      'select account_id, side, amount_paise, store_id from finance.journal_line where journal_id = $1 order by account_id, side',
      [journalId],
    );
    return result.rows.map((row) => [row.account_id, row.side, Number(row.amount_paise)]);
  } finally {
    await client.end();
  }
};

describe('periods (books-and-posting 4.1, 15 test 13; PRD-LED-001)', () => {
  it('PRD-LED-009 books-and-posting 15 test 13 periods of a book cannot overlap or leave a gap; a code is unique in the book', async () => {
    const b = await book();
    const p2 = {
      code: syntheticCode('P2'),
      financialYear: FINANCIAL_YEAR,
      firstDay: setup.day(10),
      lastDay: setup.day(19),
    };
    expect(await definePeriod(setup, b.bookId, { ...p2, firstDay: setup.day(9) })).toMatchObject({
      refusal: { code: 'finance.period-overlaps' },
    });
    expect(await definePeriod(setup, b.bookId, { ...p2, firstDay: setup.day(11) })).toMatchObject({
      refusal: { code: 'finance.period-gap' },
    });
    expect(await definePeriod(setup, b.bookId, { ...p2, code: syntheticCode('P1') })).toMatchObject({
      refusal: { code: 'finance.period-code-taken' },
    });
    expect(await definePeriod(setup, b.bookId, { ...p2, lastDay: setup.day(5) })).toMatchObject({
      refusal: { code: 'finance.period-dates-invalid' },
    });
    recorded(await definePeriod(setup, b.bookId, p2));
    const periods = await setup.run(setup.preparer.id, (c) => setup.books.listPeriods(c, b.bookId));
    expect(periods.map((each) => [each.code, each.firstDay, each.lastDay, each.state])).toEqual([
      [syntheticCode('P1'), setup.today(), setup.day(9), 'Open'],
      [syntheticCode('P2'), setup.day(10), setup.day(19), 'Open'],
    ]);
  });

  it('books-and-posting 15 test 13 the database refuses a gap even when written past the service', async () => {
    const b = await book();
    const client = await connect(world.organisations[0].database, 'runtime');
    try {
      await expect(
        client.query(
          `insert into finance.financial_period (id, book_id, code, financial_year, dates, defined_by_user_id)
           values ($1, $2, 'SYN-GAP', 'SYN-FY', daterange($3::date, $4::date), $5)`,
          [uuidv7(), b.bookId, setup.day(20), setup.day(30), setup.preparer.id],
        ),
      ).rejects.toThrow(/no gap/);
    } finally {
      await client.end();
    }
  });
});

describe('posting maps and their approval (books-and-posting 6, 15 test 15a; POL-09.01, POL-09.12; DEC-112, GC4-2)', () => {
  it('POL-09.01 a map version decided by its preparer is refused; decided without the CA evidence it takes no effect', async () => {
    const b = await book();
    const change = recorded(await prepareMap(setup, b.bookId, mapOf(b.accounts)));
    expect(await setup.decide(change.requestId ?? '', change.versionId, 'approve', setup.preparer)).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.self-preparation' },
    });
    expect(await setup.decide(change.requestId ?? '', change.versionId)).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'finance.no-ca-evidence' },
    });
    const maps = await setup.run(setup.preparer.id, (c) =>
      setup.books.listPostingMaps(c, b.bookId, setup.today(), setup.today()),
    );
    expect(maps).toEqual([
      expect.objectContaining({
        eventKind: VALUE_IN.kind,
        components: ['to-pool', 'to-dispatch'],
        versions: [expect.objectContaining({ state: 'Awaiting approval', caEvidence: [] })],
      }),
    ]);
    expect(maps[0]?.inForceOn).toBeUndefined();
  });

  it('POL-09.01 one piece of CA evidence naming an account version and a map version covers each', async () => {
    const b = await book();
    const account = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.books.prepareAccount(c, p, {
          bookId: b.bookId,
          code: syntheticCode('CLM'),
          nature: 'asset',
          origin: 'synthetic',
          name: syntheticName('Account CLM'),
          validFrom: setup.today(),
        }),
      ),
    );
    const map = recorded(await prepareMap(setup, b.bookId, mapOf(b.accounts)));
    const evidence = recorded(
      await reference([
        { recordType: ACCOUNT_TYPE, versionId: account.versionId },
        { recordType: POSTING_MAP_TYPE, versionId: map.versionId },
      ]),
    );
    decided(await setup.decide(account.requestId ?? '', account.versionId));
    decided(await setup.decide(map.requestId ?? '', map.versionId));
    const [read] = await setup.run(setup.preparer.id, (c) =>
      setup.books.listPostingMaps(c, b.bookId, setup.today(), setup.today()),
    );
    expect(read?.inForceOn).toBe(map.versionId);
    expect(read?.versions[0]).toMatchObject({
      state: 'In force',
      caEvidence: [{ id: evidence.evidenceId, kind: 'reference' }],
      lines: expect.arrayContaining([expect.objectContaining({ component: 'to-pool', side: 'debit' })]) as unknown,
    });
  });

  it('POL-09.11 refuses a version with a component that has no line, or an account of another book', async () => {
    const b = await book();
    const elsewhere = await book();
    expect(await prepareMap(setup, b.bookId, mapOf(b.accounts).slice(0, 2))).toMatchObject({
      refusal: { code: 'finance.component-without-line' },
    });
    expect(await prepareMap(setup, b.bookId, mapOf(elsewhere.accounts))).toMatchObject({
      refusal: { code: 'finance.account-not-in-book' },
    });
    expect(await prepareMap(setup, b.bookId, mapOf(b.accounts), setup.day(-1))).toMatchObject({
      refusal: { code: 'finance.starts-in-past' },
    });
  });

  it('PRD-MOD-010 POL-09.12 books-and-posting 15 test 6 a posting before a new version uses the old one, after it the new; each journal keeps its own', async () => {
    const b = await book();
    const first = await mapInForce(b);
    // The new version credits the transit account's other side to INV instead of PUR, from day 3 (synthetic).
    const lines = mapOf(b.accounts).map((line) =>
      line.component === 'to-pool' && line.side === 'credit' ? { ...line, accountId: b.accounts.TRN } : line,
    );
    const second = recorded(await prepareMap(setup, b.bookId, lines, setup.day(3), first.versionId));
    await inForce(second, POSTING_MAP_TYPE);
    const before = posted(await postDocument(document([item(b, { pool: 10_000 })])));
    const after = posted(await postDocument(document([item(b, { pool: 10_000 }, { businessDate: setup.day(4) })])));
    expect(before.map((each) => each.mapVersionId)).toEqual([first.versionId]);
    expect(after.map((each) => each.mapVersionId)).toEqual([second.versionId]);
    expect(await linesOf(after[0]?.journalId ?? '')).toContainEqual([b.accounts.TRN, 'credit', 10_000]);
    expect(await linesOf(before[0]?.journalId ?? '')).toContainEqual([b.accounts.PUR, 'credit', 10_000]);
  });
});

describe('Post (books-and-posting 8, 9.1 to 9.3; PRD-LED-003, PRD-LED-004, PRD-MOD-013)', () => {
  it('PRD-LED-004 posts one journal per book, kind and date, its lines summed, numbered from the book’s series', async () => {
    const b = await book();
    const map = await mapInForce(b);
    const result = posted(
      await postDocument(
        document([item(b, { pool: 100_000 }), item(b, { pool: 78_000, dispatch: 40_000 }), item(b, { pool: -5_000 })]),
      ),
    );
    expect(result).toEqual([
      expect.objectContaining({
        bookId: b.bookId,
        eventKind: VALUE_IN.kind,
        accountingDate: setup.today(),
        mapVersionId: map.versionId,
        number: expect.stringMatching(/^SYN-JV\d+-SYN-FY-1-00001$/) as unknown,
      }),
    ]);
    // 100,000 + 78,000 to INV, 5,000 back out of it, 40,000 to TRN; PUR the other side, summed per side.
    expect(await linesOf(result[0]?.journalId ?? '')).toEqual(
      [
        [b.accounts.INV, 'credit', 5_000],
        [b.accounts.INV, 'debit', 178_000],
        [b.accounts.PUR, 'credit', 218_000],
        [b.accounts.PUR, 'debit', 5_000],
        [b.accounts.TRN, 'debit', 40_000],
      ].sort((x, y) => `${String(x[0])}${String(x[1])}`.localeCompare(`${String(y[0])}${String(y[1])}`)),
    );
  });

  it('PRD-INT-002 PRD-INT-008 the same item twice gives one journal and the first result; changed content is refused', async () => {
    const b = await book();
    await mapInForce(b);
    const once = item(b, { pool: 12_345 });
    const first = posted(await postDocument(document([once])));
    const again = posted(await postDocument(document([once])));
    expect(again).toEqual(first);
    const changed = await postDocument(
      document([{ ...once, components: [{ component: 'to-pool', amount: known(paise(12_346)) }] }]),
    );
    expect(changed).toMatchObject({
      kind: 'refused',
      items: [
        {
          itemKey: once.itemKey,
          refusal: { code: 'finance.item-changed' },
          changed: { sourceModule: SOURCE, itemKey: once.itemKey, postedHash: expect.any(String) as unknown },
        },
      ],
    });
  });

  it('PRD-MOD-015 an Unknown amount is refused; all-zero components answer Nothing to post', async () => {
    const b = await book();
    await mapInForce(b);
    const unknown = await postDocument(
      document([{ ...item(b, {}), components: [{ component: 'to-pool', amount: unknownValue() }] }]),
    );
    expect(unknown).toMatchObject({ kind: 'refused', items: [{ refusal: { code: 'finance.unknown-amount' } }] });
    expect(await postDocument(document([item(b, {}), item(b, {})]))).toEqual({ kind: 'nothing-to-post' });
  });

  it('PRD-LED-009 a date in no period is refused with its reason, and one refused item refuses the whole document', async () => {
    const b = await book();
    await mapInForce(b);
    const result = await postDocument(
      document([item(b, { pool: 100 }), item(b, { pool: 100 }, { businessDate: setup.day(15) })]),
    );
    expect(result).toMatchObject({
      kind: 'refused',
      items: [{ refusal: { code: 'finance.no-period', missing: [{ kind: 'financial-period', bookId: b.bookId }] } }],
    });
  });

  it('POL-09.12 SL-23 no approved map refuses the item, naming the book and event kind', async () => {
    const b = await book();
    expect(await postDocument(document([item(b, { pool: 100 })]))).toMatchObject({
      kind: 'refused',
      items: [
        {
          refusal: {
            code: 'finance.no-posting-map',
            missing: [{ kind: 'posting-map', bookId: b.bookId, eventKind: VALUE_IN.kind }],
          },
        },
      ],
    });
  });

  it('POL-09.12 books-and-posting 15 test 14 a component with no line, a retired account or a missing dimension: Check postable gives Post’s reason', async () => {
    const b = await book();
    await mapInForce(b, setup, mapOf(b.accounts, { storeOnTransit: true }));
    // Retire TRN from tomorrow (3.1).
    const token = (await setup.run(setup.preparer.id, (c) => setup.books.readAccount(c, b.accounts.TRN, setup.today())))
      ?.versionToken;
    const retire = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.books.prepareAccountVersion(c, p, b.accounts.TRN, {
          name: syntheticName('Account TRN'),
          retired: true,
          origin: 'synthetic',
          validFrom: setup.day(1),
          ...(token === undefined ? {} : { versionToken: token }),
        }),
      ),
    );
    await inForce(retire, ACCOUNT_TYPE);
    const cases: [StructureSetup, PostItem, string][] = [
      // A later build's kind carries `to-loss`, which the map has no line for (6.2 condition 2).
      [
        later,
        { ...item(b, {}), components: [{ component: 'to-loss', amount: known(paise(100)) }] },
        'finance.component-without-line',
      ],
      [setup, item(b, { dispatch: 100 }, { businessDate: setup.day(1) }), 'finance.map-account-not-in-force'],
      [setup, item(b, { dispatch: 100 }, { businessUnitId: b.warehouse }), 'finance.missing-dimension'],
      [setup, item(b, { pool: 100 }, { brandId: null }), 'finance.missing-dimension'],
    ];
    for (const [on, each, code] of cases) {
      const checked = await on.run(on.preparer.id, (c) =>
        on.books.checkPostable(c, { sourceModule: SOURCE, items: [each] }),
      );
      expect(checked, code).toMatchObject([{ kind: 'refused', refusal: { code } }]);
      const result = await on.run(on.preparer.id, (c) => on.books.post(c, document([each], on)));
      expect(result, code).toMatchObject({
        kind: 'refused',
        items: [{ refusal: checked[0]?.kind === 'refused' ? checked[0].refusal : {} }],
      });
    }
  });

  it('refuses a Store that is not the unit’s', async () => {
    const b = await book();
    await mapInForce(b);
    expect(await postDocument(document([item(b, { pool: 100 }, { storeId: null })]))).toMatchObject({
      kind: 'refused',
      items: [{ refusal: { code: 'finance.store-mismatch' } }],
    });
  });
});

describe('journals never change (books-and-posting 5.2, 5.3, 9.4; 15 tests 2 and 3)', () => {
  it('PRD-MOD-013 POL-09.13 books-and-posting 15 test 2 a journal that does not balance never commits, written past the service', async () => {
    const b = await book();
    const map = await mapInForce(b);
    const client = await connect(world.organisations[0].database, 'runtime');
    const journalId = uuidv7();
    try {
      await client.query('begin');
      await client.query(
        `insert into finance.journal (id, book_id, legal_entity_id, financial_period_id, accounting_date, business_date,
           event_kind, source_module, source_record_type, source_record_id, posting_map_version_id,
           number_allocation_id, number, actor_user_id, occurred_at)
         values ($1, $2, $3, $4, $5, $5, $6, 'test-synthetic', 'test-synthetic.document', $7, $8, $9, $10, $11, now())`,
        [
          journalId,
          b.bookId,
          b.legalEntityId,
          b.periodId,
          setup.today(),
          VALUE_IN.kind,
          uuidv7(),
          map.versionId,
          uuidv7(),
          `SYN-UNBALANCED-${String(counter)}`,
          setup.preparer.id,
        ],
      );
      for (const [accountId, side, amount] of [
        [b.accounts.INV, 'debit', 100],
        [b.accounts.PUR, 'credit', 99],
      ] as const) {
        await client.query(
          `insert into finance.journal_line (id, journal_id, account_id, side, amount_paise, legal_entity_id, site_id,
             store_id, business_unit_id, brand_id, mapping_version_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, $10)`,
          [uuidv7(), journalId, accountId, side, amount, b.legalEntityId, b.siteId, b.storeId, b.storeUnit, uuidv7()],
        );
      }
      await expect(client.query('commit')).rejects.toThrow(/debits equal its credits/);
    } finally {
      await client.end();
    }
  });

  it('POL-09.13 books-and-posting 5.2 a journal is checked once at commit: no line joins it in a later transaction', async () => {
    const b = await book();
    await mapInForce(b);
    const [journal] = posted(await postDocument(document([item(b, { pool: 5_000 })])));
    const client = await connect(world.organisations[0].database, 'runtime');
    try {
      await expect(
        client.query(
          `insert into finance.journal_line (id, journal_id, account_id, side, amount_paise, legal_entity_id, site_id,
             store_id, business_unit_id, brand_id, mapping_version_id)
           values ($1, $2, $3, 'debit', 1, $4, $5, $6, $7, null, $8)`,
          [uuidv7(), journal?.journalId, b.accounts.INV, b.legalEntityId, b.siteId, b.storeId, b.storeUnit, uuidv7()],
        ),
      ).rejects.toThrow(/written with its journal, in the same transaction/);
    } finally {
      await client.end();
    }
  });

  it('PRD-LED-004 PRD-MOD-011 books-and-posting 15 test 3 the runtime role cannot change a journal or a line; a reversal is linked, at most once', async () => {
    const b = await book();
    const map = await mapInForce(b);
    const [journal] = posted(await postDocument(document([item(b, { pool: 40_000 })])));
    const client = await connect(world.organisations[0].database, 'runtime');
    try {
      for (const statement of [
        `update finance.journal set number = 'SYN-X' where id = $1`,
        `delete from finance.journal where id = $1`,
        `update finance.journal_line set amount_paise = 1 where journal_id = $1`,
        `delete from finance.journal_line where journal_id = $1`,
        `delete from finance.posting_source where journal_id = $1`,
      ]) {
        await expect(client.query(statement, [journal?.journalId]), statement).rejects.toThrow();
      }
    } finally {
      await client.end();
    }
    const reverse = () =>
      setup.run(setup.preparer.id, async (context) => {
        return reverseIn(setup, context, {
          journalId: journal?.journalId ?? '',
          businessDate: setup.day(2),
          actorId: setup.preparer.id,
        });
      });
    const reversal = await reverse();
    if (reversal.kind !== 'reversed') throw new Error('not reversed');
    expect(reversal.journal).toMatchObject({ accountingDate: setup.day(2), mapVersionId: map.versionId });
    expect(await linesOf(reversal.journal.journalId)).toEqual(
      (await linesOf(journal?.journalId ?? ''))
        .map(([account, side, amount]) => [account, side === 'debit' ? 'credit' : 'debit', amount])
        .sort((x, y) => `${String(x[0])}${String(x[1])}`.localeCompare(`${String(y[0])}${String(y[1])}`)),
    );
    expect(await reverse()).toMatchObject({ kind: 'refused', refusal: { code: 'finance.already-reversed' } });
  });
});

describe('the policy gate (books-and-posting 11, 15 test 15; PRD-SEC-017, PRD-UXP-003)', () => {
  it('PRD-SEC-017 PRD-UXP-003 books-and-posting 15 test 15 a book with no approved cost setting or map leaves the operation unavailable, naming what is missing', async () => {
    const b = await book();
    const configuration = new Configuration({
      audit: new Audit(capturingLogger().logger),
      environment: { name: 'local' },
    });
    configuration.registerCheck(postingConfigurationCheck);
    configuration.registerOperation(
      {
        code: 'test-synthetic.post-value-in',
        policy: 9,
        capability: 'test-synthetic.posting',
        activity: null,
        checks: [{ check: 'finance.posting-configuration', subject: VALUE_IN.kind }],
      },
      TEST_COMPOSITION,
    );
    const answer = await setup.run(setup.preparer.id, (c) =>
      configuration.checkAvailability(c, 'test-synthetic.post-value-in', { businessUnitId: b.storeUnit }),
    );
    expect(answer?.state).toBe('unavailable');
    expect(answer?.missing).toEqual(
      expect.arrayContaining([
        { kind: 'book-setting', bookId: b.bookId, setting: 'cost' },
        { kind: 'posting-map', bookId: b.bookId, eventKind: VALUE_IN.kind },
      ]),
    );
    // With a cost setting and a map in force, only what the policy itself lacks is left.
    const cost = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.books.prepareBookSetting(c, p, b.bookId, {
          kind: 'cost',
          formula: 'moving-average',
          poolMode: 'book',
          origin: 'synthetic',
          validFrom: setup.today(),
        }),
      ),
    );
    recorded(
      await setup.asPreparerDo((c, p) =>
        setup.books.recordCaEvidence(c, p, {
          versions: [{ recordType: 'finance.book_setting', versionId: cost.versionId }],
          evidence: {
            kind: 'reference',
            what: syntheticName('CA letter'),
            givenBy: syntheticName('CA'),
            givenOn: setup.today(),
            keptAt: syntheticName('File'),
          },
        }),
      ),
    );
    decided(await setup.decide(cost.requestId ?? '', cost.versionId));
    await mapInForce(b);
    const check = await setup.run(setup.preparer.id, (c) =>
      postingConfigurationCheck.check(c, { subject: VALUE_IN.kind, siteId: null, businessUnitId: b.storeUnit }),
    );
    expect(check).toEqual({ kind: 'valid' });
    // RR-487 (product owner, 10 Oct 2026): the account versions in force are policy 9's values too, with their origin
    // and their preparer, who cannot validate them (DM-6; code-house-rules 12.14).
    const values = await setup.run(setup.preparer.id, (c) => postingConfigurationCheck.values(c));
    const accounts = await setup.run(setup.preparer.id, (c) => setup.books.listAccounts(c, b.bookId, setup.today()));
    for (const account of accounts) {
      expect(values).toContainEqual(
        expect.objectContaining({
          key: account.versions[0]?.id,
          origin: 'synthetic',
          enteredBy: [setup.preparer.id],
        }),
      );
    }
    expect(accounts[0]?.versions[0]?.origin).toBe('synthetic');
  });
});

describe('the trial balance and the ledger (books-and-posting 12, 15 test 18; PRD-SEC-005, PRD-PRF-004, POL-11.01)', () => {
  it('PRD-SEC-005 PRD-PRF-004 books-and-posting 15 test 18 a reader scoped to one Store sees only its lines, and the trial balance says it is partial', async () => {
    const b = await book();
    await mapInForce(b, setup, mapOf(b.accounts));
    posted(
      await postDocument(
        document([item(b, { pool: 100_000 }), item(b, { pool: 50_000 }, { businessUnitId: b.warehouse })]),
      ),
    );
    const database = world.organisations[0].database;
    // Readers holding view on journals only, so their one grant decides what they see (access-and-approvals 7.2).
    const reader = (label: string) =>
      writeSyntheticUser(database, world.organisations[0].code, syntheticKeysEnvironment(world), {
        label: next(label),
        enrolled: true,
      });
    const whole = await reader('TB-WHOLE');
    await grantSynthetic(database, { kind: 'user', id: whole.id }, [{ recordType: JOURNAL_TYPE, action: 'view' }]);
    const storeReader = await reader('TB-STORE');
    await grantSynthetic(
      database,
      { kind: 'user', id: storeReader.id },
      [{ recordType: JOURNAL_TYPE, action: 'view' }],
      {
        scope: {
          kind: 'dimensions',
          legalEntity: { kind: 'all' },
          place: { kind: 'selected', members: [{ type: 'store', id: b.storeId }] },
          brand: { kind: 'all' },
        },
      },
    );
    const read = (userId: string) => setup.run(userId, (c) => setup.books.trialBalance(c, b.bookId, b.periodId));
    const full = await read(whole.id);
    expect(full).toMatchObject({
      ledger: 'internal',
      partial: false,
      totals: { debitPaise: 150_000, creditPaise: 150_000 },
    });
    expect(full?.asOf).toEqual(expect.any(String));
    expect(full?.rows.find((row) => row.accountId === b.accounts.INV)).toMatchObject({
      openingPaise: 0,
      debitPaise: 150_000,
      creditPaise: 0,
      closingPaise: 150_000,
    });
    const part = await read(storeReader.id);
    expect(part).toMatchObject({
      ledger: 'internal',
      partial: true,
      totals: { debitPaise: 100_000, creditPaise: 100_000 },
    });
    const ledger = await setup.run(storeReader.id, (c) =>
      setup.books.ledger(c, b.accounts.INV, setup.today(), setup.day(9)),
    );
    expect(ledger).toMatchObject({ partial: true, openingPaise: 0, closingPaise: 100_000 });
    expect(ledger?.lines.map((line) => [line.businessUnitId, line.amountPaise])).toEqual([[b.storeUnit, 100_000]]);
  });

  it('PRD-LED-004 PRD-MOD-011 books-and-posting 9.4 a reverser who sees only part of a journal reverses all of it', async () => {
    const b = await book();
    await mapInForce(b, setup, mapOf(b.accounts));
    const [journal] = posted(
      await postDocument(
        document([item(b, { pool: 70_000 }), item(b, { pool: 30_000 }, { businessUnitId: b.warehouse })]),
      ),
    );
    const database = world.organisations[0].database;
    const reverser = await writeSyntheticUser(database, world.organisations[0].code, syntheticKeysEnvironment(world), {
      label: next('REVERSER'),
      enrolled: true,
    });
    // SYNTHETIC: view on journals at the Store only, so the warehouse's lines are hidden from the reverser (12).
    await grantSynthetic(database, { kind: 'user', id: reverser.id }, [{ recordType: JOURNAL_TYPE, action: 'view' }], {
      scope: {
        kind: 'dimensions',
        legalEntity: { kind: 'all' },
        place: { kind: 'selected', members: [{ type: 'store', id: b.storeId }] },
        brand: { kind: 'all' },
      },
    });
    const seen = await setup.run(reverser.id, (c) => setup.books.trialBalance(c, b.bookId, b.periodId));
    expect(seen?.partial).toBe(true);
    const reversal = await setup.run(reverser.id, (context) =>
      reverseIn(setup, context, {
        journalId: journal?.journalId ?? '',
        businessDate: setup.day(1),
        actorId: reverser.id,
      }),
    );
    if (reversal.kind !== 'reversed') throw new Error(`not reversed: ${JSON.stringify(reversal)}`);
    const unitLines = async (journalId: string) => {
      const client = await connect(database, 'migration');
      try {
        const result = await client.query<{ account_id: string; side: string; amount: string; unit: string }>(
          `select account_id, side, amount_paise::text as amount, business_unit_id as unit from finance.journal_line
           where journal_id = $1 order by account_id, business_unit_id, side`,
          [journalId],
        );
        return result.rows.map((row) => [row.account_id, row.unit, row.side, Number(row.amount)]);
      } finally {
        await client.end();
      }
    };
    const original = await unitLines(journal?.journalId ?? '');
    expect(original).toHaveLength(4);
    expect(await unitLines(reversal.journal.journalId)).toEqual(
      original.map(([account, unit, side, amount]) => [account, unit, side === 'debit' ? 'credit' : 'debit', amount]),
    );
  });
});

describe('Organisation isolation (PRD-MOD-001)', () => {
  it('PRD-MOD-001 a second synthetic Organisation sees none of these records', async () => {
    const b = await book();
    await mapInForce(b);
    posted(await postDocument(document([item(b, { pool: 1_000 })])));
    const seen = await other.run(other.preparer.id, async (c) => ({
      periods: await other.books.listPeriods(c, b.bookId),
      maps: await other.books.listPostingMaps(c, b.bookId, other.today(), other.today()),
      trial: await other.books.trialBalance(c, b.bookId, b.periodId),
    }));
    expect(seen).toEqual({ periods: [], maps: [], trial: undefined });
  });
});
