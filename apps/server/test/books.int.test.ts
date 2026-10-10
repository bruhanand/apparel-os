import {
  ACCOUNT_TYPE,
  accountVersionDraftSchema,
  BOOK_SETTING_TYPE,
  type BusinessUnitDraft,
  type FinanceChanged,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BookHeldStock } from '../src/modules/finance/books/index.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { syntheticKeysEnvironment } from './support/access.js';
import { grantSynthetic } from './support/grants.js';
import {
  approved,
  approvedGeography,
  decided,
  prepared,
  structureSetup,
  type StructureSetup,
} from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';

// S1-F09-T01: book settings, the chart of accounts, the CA's approval evidence and the dimensions of a line, through
// the books part's interface and access's Decide, on real PostgreSQL (books-and-posting 2, 3, 6.3, 15 test 15a for
// accounts, cost settings and voucher-model settings; POL-09.01; DEC-112, GC4-2). Every value here is SYNTHETIC: the
// accounts follow the labelled synthetic chart of 16.1, and no formula, pool mode or voucher model is KDPS's (V-08,
// V-09, V-10, V-46).

/** A test-only answer to "has this book held stock?" (books-and-posting 2.2), which a test turns on and off. */
class SyntheticBookStock implements BookHeldStock {
  readonly held = new Set<string>();
  hasHeldStock(_context: unknown, bookId: string): Promise<boolean> {
    return Promise.resolve(this.held.has(bookId));
  }
}

let world: SyntheticWorld;
let setup: StructureSetup;
let unanswered: StructureSetup;
let other: StructureSetup;
const stock = new SyntheticBookStock();
let counter = 0;
const next = (prefix: string) => `${prefix}-${String(++counter)}`;
let stateId: string;
let areaId: string;

beforeAll(async () => {
  world = await createSyntheticOrganisations('books');
  const [orgA, orgB] = world.organisations;
  const keysEnvironment = syntheticKeysEnvironment(world);
  const options = { directory: world.directory, database: orgA.database, organisationCode: orgA.code, keysEnvironment };
  setup = await structureSetup({ ...options, label: 'BOOKS-A', bookHeldStock: stock });
  unanswered = await structureSetup({ ...options, label: 'BOOKS-NONE' });
  other = await structureSetup({
    directory: world.directory,
    database: orgB.database,
    organisationCode: orgB.code,
    keysEnvironment,
    label: 'BOOKS-B',
  });
  const geography = await approvedGeography(setup, 'BOOKS');
  stateId = geography.state.recordId;
  // The preparer may approve too, so a refusal of their own preparation is for the preparation alone (PRD-ACS-006).
  await grantSynthetic(orgA.database, { kind: 'user', id: setup.preparer.id }, [
    { recordType: ACCOUNT_TYPE, action: 'approve' },
    { recordType: BOOK_SETTING_TYPE, action: 'approve' },
  ]);
  areaId = geography.area.recordId;
}, 120_000);

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (unanswered as StructureSetup | undefined)?.close();
  await (other as StructureSetup | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

type Outcome<T> = { kind: 'success'; answer: T } | { kind: 'refusal'; refusal: { code: string } };

function recorded<T>(outcome: Outcome<T>): T {
  if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
  return outcome.answer;
}

/** A SYNTHETIC legal entity with a registration and a book, approved from today (structure-and-masters 3.2). */
async function entity() {
  const legalEntity = await approved(setup, (c, p) =>
    setup.organisation.prepareLegalEntity(c, p, {
      code: syntheticCode(next('LE')),
      legalName: syntheticName('Books legal entity'),
      validFrom: setup.today(),
    }),
  );
  const registration = await approved(setup, (c, p) =>
    setup.organisation.prepareTaxRegistration(c, p, {
      code: syntheticCode(next('GSTIN')),
      legalEntityId: legalEntity.recordId,
      registrationNumber: `0${String(counter)}SYNTHETIC`,
      stateId,
      validityFrom: setup.today(),
      validFrom: setup.today(),
    }),
  );
  const book = await approved(setup, (c, p) =>
    setup.organisation.prepareAccountingBook(c, p, {
      code: syntheticCode(next('BK')),
      legalEntityId: legalEntity.recordId,
      name: syntheticName('Book'),
      validFrom: setup.today(),
    }),
  );
  return {
    legalEntityId: legalEntity.recordId,
    taxRegistrationId: registration.recordId,
    accountingBookId: book.recordId,
  };
}

const book = async () => (await entity()).accountingBookId;

/** A SYNTHETIC account of the chart of 16.1 in the book, awaiting its decision. */
const prepareAccount = (bookId: string, code: string, nature: 'asset' | 'liability' | 'expense' = 'asset') =>
  setup.asPreparerDo((c, p) =>
    setup.books.prepareAccount(c, p, {
      bookId,
      code: syntheticCode(code),
      nature,
      origin: 'synthetic',
      name: syntheticName(`Account ${code}`),
      validFrom: setup.today(),
    }),
  );

const prepareCost = (
  on: StructureSetup,
  bookId: string,
  formula: 'moving-average' | 'fifo',
  poolMode: 'book' | 'site',
  validFrom = on.today(),
  versionToken?: string,
) =>
  on.asPreparerDo((c, p) =>
    on.books.prepareBookSetting(c, p, bookId, {
      kind: 'cost',
      formula,
      poolMode,
      origin: 'synthetic',
      validFrom,
      ...(versionToken === undefined ? {} : { versionToken }),
    }),
  );

/** The CA's evidence, a SYNTHETIC reference, covering the versions named (6.3). */
const reference = (
  on: StructureSetup,
  versions: readonly { recordType: typeof ACCOUNT_TYPE | typeof BOOK_SETTING_TYPE; versionId: string }[],
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

/** A version prepared, covered by the CA's evidence and approved by the other Accounts user. */
async function inForce(
  on: StructureSetup,
  change: FinanceChanged,
  recordType: typeof ACCOUNT_TYPE | typeof BOOK_SETTING_TYPE,
) {
  recorded(await reference(on, [{ recordType, versionId: change.versionId }]));
  decided(await on.decide(change.requestId ?? '', change.versionId));
}

const costOn = (bookId: string, date: string, on: StructureSetup = setup) =>
  on.run(on.preparer.id, (c) => on.books.costSettingOn(c, bookId, date));

describe('approval of versions (books-and-posting 6.3, 15 test 15a; POL-09.01; DEC-112, GC4-2)', () => {
  it('POL-09.01 a version decided by its preparer is refused; decided without the CA evidence it takes no effect', async () => {
    const bookId = await book();
    const account = recorded(await prepareAccount(bookId, 'INV'));
    const cost = recorded(await prepareCost(setup, bookId, 'moving-average', 'book'));
    const voucher = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.books.prepareBookSetting(c, p, bookId, {
          kind: 'voucher-model',
          voucherModel: 'without-items',
          origin: 'synthetic',
          validFrom: setup.today(),
        }),
      ),
    );
    for (const change of [account, cost, voucher]) {
      const own = await setup.decide(change.requestId ?? '', change.versionId, 'approve', setup.preparer);
      expect(own).toMatchObject({ kind: 'refusal', refusal: { code: 'access.self-preparation' } });
      const noEvidence = await setup.decide(change.requestId ?? '', change.versionId);
      expect(noEvidence).toMatchObject({ kind: 'refusal', refusal: { code: 'finance.no-ca-evidence' } });
    }
    const read = await setup.run(setup.preparer.id, (c) => setup.books.readAccount(c, account.recordId, setup.today()));
    expect(read?.versions).toEqual([expect.objectContaining({ state: 'Awaiting approval', caEvidence: [] })]);
    expect(await costOn(bookId, setup.today())).toEqual({ kind: 'not-set' });
  });

  it('POL-09.01 one piece of CA evidence naming several versions covers each of them', async () => {
    const bookId = await book();
    const account = recorded(await prepareAccount(bookId, 'PUR', 'liability'));
    const cost = recorded(await prepareCost(setup, bookId, 'fifo', 'site'));
    const voucher = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.books.prepareBookSetting(c, p, bookId, {
          kind: 'voucher-model',
          voucherModel: 'with-items',
          origin: 'synthetic',
          validFrom: setup.today(),
        }),
      ),
    );
    const evidence = recorded(
      await reference(setup, [
        { recordType: ACCOUNT_TYPE, versionId: account.versionId },
        { recordType: BOOK_SETTING_TYPE, versionId: cost.versionId },
        { recordType: BOOK_SETTING_TYPE, versionId: voucher.versionId },
      ]),
    );
    for (const change of [account, cost, voucher])
      decided(await setup.decide(change.requestId ?? '', change.versionId));
    const read = await setup.run(setup.preparer.id, (c) => setup.books.readAccount(c, account.recordId, setup.today()));
    expect(read?.versions).toEqual([
      expect.objectContaining({
        state: 'In force',
        caEvidence: [expect.objectContaining({ id: evidence.evidenceId, kind: 'reference' })],
      }),
    ]);
    const settings = await setup.run(setup.preparer.id, (c) => setup.books.listSettings(c, bookId, setup.today()));
    expect(settings.map((each) => [each.kind, each.versions[0]?.state, each.versions[0]?.caEvidence[0]?.id])).toEqual([
      ['cost', 'In force', evidence.evidenceId],
      ['voucher-model', 'In force', evidence.evidenceId],
    ]);
    // Read the cost setting on a date (2.2; stock-ledger 13.1): its version, with its identifier.
    expect(await costOn(bookId, setup.today())).toEqual({
      kind: 'set',
      versionId: cost.versionId,
      formula: 'fifo',
      poolMode: 'site',
      origin: 'synthetic',
      validFrom: setup.today(),
    });
  });

  it('refuses CA evidence for a version already decided', async () => {
    const bookId = await book();
    const account = recorded(await prepareAccount(bookId, 'COGS', 'expense'));
    await inForce(setup, account, ACCOUNT_TYPE);
    expect(await reference(setup, [{ recordType: ACCOUNT_TYPE, versionId: account.versionId }])).toMatchObject({
      refusal: { code: 'finance.version-not-awaiting' },
    });
  });
});

describe('book settings (books-and-posting 2.2, 2.3; PRD-LED-014, PRD-LED-015, PRD-SEC-017)', () => {
  it('PRD-SEC-017 with no approved cost setting, Read answers not set', async () => {
    const bookId = await book();
    expect(await costOn(bookId, setup.today())).toEqual({ kind: 'not-set' });
    recorded(await prepareCost(setup, bookId, 'moving-average', 'book'));
    expect(await costOn(bookId, setup.today())).toEqual({ kind: 'not-set' });
  });

  it('PRD-MOD-010 GC2-7 refuses a version starting on a past date', async () => {
    const bookId = await book();
    expect(await prepareCost(setup, bookId, 'fifo', 'book', setup.day(-1))).toMatchObject({
      refusal: { code: 'finance.starts-in-past' },
    });
    expect(
      await setup.asPreparerDo((c, p) =>
        setup.books.prepareAccount(c, p, {
          bookId,
          code: syntheticCode('PAST'),
          nature: 'asset',
          origin: 'synthetic',
          name: syntheticName('Past account'),
          validFrom: setup.day(-1),
        }),
      ),
    ).toMatchObject({ refusal: { code: 'finance.starts-in-past' } });
  });

  it('SL-6 refuses a formula or pool change on a book that has held stock, as the contract answers', async () => {
    const bookId = await book();
    const first = recorded(await prepareCost(setup, bookId, 'moving-average', 'book'));
    await inForce(setup, first, BOOK_SETTING_TYPE);
    stock.held.add(bookId);
    const settings = await setup.run(setup.preparer.id, (c) => setup.books.listSettings(c, bookId, setup.today()));
    const token = settings[0]?.versionToken;
    for (const [formula, poolMode] of [
      ['fifo', 'book'],
      ['moving-average', 'site'],
    ] as const) {
      const change = await prepareCost(setup, bookId, formula, poolMode, setup.day(1), token);
      expect(change).toMatchObject({ kind: 'refusal', refusal: { code: 'finance.cost-change-after-stock' } });
      const missing = change.kind === 'refusal' ? change.refusal.missing : [];
      expect(missing).toContainEqual({ kind: 'open-question', question: 'SL-6' });
    }
    // The same method again is no change: a later version may follow it.
    recorded(await prepareCost(setup, bookId, 'moving-average', 'book', setup.day(1), token));
  });

  it('SL-6 refuses a change prepared before the book held stock, when it is decided after', async () => {
    const bookId = await book();
    const first = recorded(await prepareCost(setup, bookId, 'moving-average', 'book'));
    await inForce(setup, first, BOOK_SETTING_TYPE);
    const settings = await setup.run(setup.preparer.id, (c) => setup.books.listSettings(c, bookId, setup.today()));
    const change = recorded(await prepareCost(setup, bookId, 'fifo', 'book', setup.day(1), settings[0]?.versionToken));
    recorded(await reference(setup, [{ recordType: BOOK_SETTING_TYPE, versionId: change.versionId }]));
    stock.held.add(bookId);
    expect(await setup.decide(change.requestId ?? '', change.versionId)).toMatchObject({
      refusal: { code: 'finance.cost-change-after-stock' },
    });
  });

  it('DEC-116 refuses a formula or pool change while no implementation answers', async () => {
    const bookId = await book();
    const first = recorded(await prepareCost(unanswered, bookId, 'fifo', 'book'));
    await inForce(unanswered, first, BOOK_SETTING_TYPE);
    const settings = await unanswered.run(unanswered.preparer.id, (c) =>
      unanswered.books.listSettings(c, bookId, unanswered.today()),
    );
    expect(
      await prepareCost(unanswered, bookId, 'fifo', 'site', unanswered.day(1), settings[0]?.versionToken),
    ).toMatchObject({ refusal: { code: 'finance.book-stock-unanswered' } });
  });
});

describe('the chart of accounts (books-and-posting 3.1; PRD-LED-001)', () => {
  it('PRD-LED-001 refuses a second account with the same code in one book, but not in another book', async () => {
    const bookId = await book();
    recorded(await prepareAccount(bookId, 'TRN'));
    expect(await prepareAccount(bookId, 'TRN')).toMatchObject({ refusal: { code: 'finance.code-taken' } });
    recorded(await prepareAccount(await book(), 'TRN'));
  });

  it('PRD-LED-001 an account’s nature cannot change: no version carries it, and its row refuses every change', async () => {
    const bookId = await book();
    const account = recorded(await prepareAccount(bookId, 'RSH'));
    expect(
      accountVersionDraftSchema.safeParse({ name: 'x', retired: false, validFrom: setup.today(), nature: 'income' })
        .success,
    ).toBe(false);
    const client = await connect(world.organisations[0].database, 'runtime');
    try {
      await expect(
        client.query(`update finance.account set nature = 'income' where id = $1`, [account.recordId]),
      ).rejects.toThrow();
    } finally {
      await client.end();
    }
  });

  it('PRD-LED-001 a retired account stays readable, with its retirement', async () => {
    const bookId = await book();
    const account = recorded(await prepareAccount(bookId, 'CLM'));
    await inForce(setup, account, ACCOUNT_TYPE);
    const retire = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.books.prepareAccountVersion(c, p, account.recordId, {
          name: syntheticName('Account SYN-CLM'),
          retired: true,
          origin: 'synthetic',
          validFrom: setup.day(1),
          versionToken: account.versionId,
        }),
      ),
    );
    await inForce(setup, retire, ACCOUNT_TYPE);
    setup.advanceDays(1);
    const chart = await setup.run(setup.preparer.id, (c) => setup.books.listAccounts(c, bookId, setup.today()));
    expect(chart.map((each) => [each.code, each.versions.map((v) => [v.state, v.retired])])).toEqual([
      [
        syntheticCode('CLM'),
        [
          ['In force', true],
          ['Ended', false],
        ],
      ],
    ]);
  });
});

describe('dimensions (books-and-posting 2.1, 3.2; POL-09.11, PRD-ORG-005, PRD-ORG-006, PRD-ACP-013)', () => {
  async function unit(
    mapping: Awaited<ReturnType<typeof entity>>,
    siteId: string,
    kind: 'whole-store' | 'warehouse',
    storeId?: string,
  ) {
    const draft: BusinessUnitDraft = {
      code: syntheticCode(next('BU')),
      siteId,
      kind,
      ...(storeId === undefined ? {} : { storeId }),
      name: syntheticName('Books unit'),
      ...mapping,
      validFrom: setup.today(),
    };
    const answer = prepared(await setup.prepare((c, p) => setup.organisation.prepareBusinessUnit(c, p, draft)));
    decided(await setup.decide(answer.requestId, answer.versionId));
    return answer.recordId;
  }

  it('PRD-ORG-005 PRD-ORG-006 PRD-ACP-013 the unit’s book and mapping version on the date, its Store, the brand named; none on a date with no mapping', async () => {
    const mapping = await entity();
    const site = await approved(setup, (c, p) =>
      setup.organisation.prepareSite(c, p, {
        code: syntheticCode(next('SITE')),
        name: syntheticName('Books site'),
        physicalKind: 'retail-site',
        areaId,
        addresses: [syntheticName('Address')],
        aliases: [],
        validFrom: setup.today(),
      }),
    );
    const store = await approved(setup, (c, p) =>
      setup.organisation.prepareStore(c, p, {
        code: syntheticCode(next('STORE')),
        name: syntheticName('Books store'),
        format: 'ebo',
        operatingModel: 'company-owned',
        siteId: site.recordId,
        aliases: [],
        validFrom: setup.today(),
      }),
    );
    const storeUnit = await unit(mapping, site.recordId, 'whole-store', store.recordId);
    const warehouse = await unit(mapping, site.recordId, 'warehouse');
    const brandId = '01900000-0000-7000-8000-00000000b0b0';
    const look = (businessUnitId: string, date: string) =>
      setup.run(setup.preparer.id, (c) => setup.books.dimensionsOn(c, { businessUnitId, brandId }, date));
    const mappingVersion = recorded(
      await setup.run(setup.preparer.id, (c) => setup.organisation.mappingOn(c, storeUnit, setup.today())),
    ).mappingVersionId;
    expect(await look(storeUnit, setup.today())).toEqual({
      kind: 'success',
      answer: {
        businessUnitId: storeUnit,
        bookId: mapping.accountingBookId,
        legalEntityId: mapping.legalEntityId,
        mappingVersionId: mappingVersion,
        siteId: site.recordId,
        storeId: store.recordId,
        brandId,
      },
    });
    expect(await look(warehouse, setup.today())).toMatchObject({ kind: 'success', answer: { storeId: null } });
    expect(await look(storeUnit, setup.day(-1))).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'organisation.no-mapping-in-force' },
    });
  });
});

describe('Organisation isolation (PRD-MOD-001)', () => {
  it('PRD-MOD-001 a second synthetic Organisation sees none of these records', async () => {
    const bookId = await book();
    const account = recorded(await prepareAccount(bookId, 'VAR', 'expense'));
    await inForce(setup, account, ACCOUNT_TYPE);
    const cost = recorded(await prepareCost(setup, bookId, 'fifo', 'book'));
    await inForce(setup, cost, BOOK_SETTING_TYPE);
    const seen = await other.run(other.preparer.id, async (c) => ({
      accounts: await other.books.listAccounts(c, bookId, other.today()),
      account: await other.books.readAccount(c, account.recordId, other.today()),
      settings: await other.books.listSettings(c, bookId, other.today()),
      cost: await other.books.costSettingOn(c, bookId, other.today()),
    }));
    expect(seen).toEqual({ accounts: [], account: undefined, settings: [], cost: { kind: 'not-set' } });
  });
});
