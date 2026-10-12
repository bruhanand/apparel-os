import { uuidv7 } from '@apparel-os/domain';
import {
  ACCOUNT_TYPE,
  BOOK_SETTING_TYPE,
  POSTING_MAP_TYPE,
  type CostFormula,
  type CostPoolMode,
  type FinanceChanged,
} from '@apparel-os/schemas';
import { JOURNAL_KIND } from '../../src/modules/finance/books/index.js';
import { EXCEPTION_CODE_KIND, Exceptions, type ExceptionTypeRegistration } from '../../src/modules/exceptions/index.js';
import { Inbox } from '../../src/modules/inbox/index.js';
import { Numbering } from '../../src/modules/numbering/index.js';
import { Audit } from '../../src/modules/audit/index.js';
import {
  STOCK_POSTING_EVENT_KINDS,
  type CallerRegistration,
  type SkuFacts,
  type UnitFacts,
} from '../../src/modules/stock/ledger/index.js';
import type { CommandRefusal } from '../../src/kernel/index.js';
import { syntheticCode, syntheticName } from '../fixtures/synthetic.js';
import { recorded } from './books.js';
import { defineSyntheticCodeSeries } from './exceptions.js';
import { approved, approvedGeography, decided, prepared, structureSetup, type StructureSetup } from './organisation.js';
import { allowVerifier, connect } from './postgres.js';
import { StockWorld, SYNTHETIC_DOCUMENT_TYPE, SYNTHETIC_MODULE, syntheticCaller } from './stock-ledger.js';

// S1-F10-T03: the stock ledger composed with the real `finance` · books and `organisation` (books-and-posting 8, 9.1;
// stock-ledger 7.11, 13.1). Books, legal entities, registrations, Sites, Stores and business units with their mappings
// are made through `organisation`'s and `finance`'s interfaces and approvals; the ledger reads them through stand-ins
// of its declared reads that answer those real records (ports.ts; the place read is not wired yet, RR-436), and its
// locations are SYNTHETIC identifiers. The chart and maps follow the labelled synthetic chart of books-and-posting
// 16.1. Every value is SYNTHETIC: none is KDPS's, and none becomes a default (V-08, V-09, V-10, GC4-1, GC5-1).

/** The accounts of books-and-posting 16.1. */
export type SyntheticAccount = 'INV' | 'TRN' | 'RSH' | 'CLM' | 'PUR' | 'COGS' | 'LOSS' | 'VAR';
const NATURES: Record<SyntheticAccount, 'asset' | 'liability' | 'expense'> = {
  INV: 'asset',
  TRN: 'asset',
  RSH: 'asset',
  CLM: 'asset',
  PUR: 'liability',
  COGS: 'expense',
  LOSS: 'expense',
  VAR: 'expense',
};

/** The synthetic maps of books-and-posting 16.1, with the arrival and the rejection return that 16.1 leaves out. */
export const SYNTHETIC_MAPS: readonly (readonly [string, string, SyntheticAccount, SyntheticAccount])[] = [
  ['stock.cost-established', 'to-pool', 'INV', 'PUR'],
  ['stock.cost-established', 'to-dispatch', 'TRN', 'PUR'],
  ['stock.cost-adjustment', 'to-pool', 'INV', 'PUR'],
  ['stock.cost-adjustment', 'to-dispatch', 'TRN', 'PUR'],
  ['stock.cost-adjustment', 'to-cogs', 'COGS', 'PUR'],
  ['stock.cost-adjustment', 'to-supplier-claim', 'CLM', 'PUR'],
  ['stock.cost-adjustment', 'to-loss', 'LOSS', 'PUR'],
  ['stock.cost-adjustment', 'excess-to-cogs', 'COGS', 'PUR'],
  ['stock.pool-dispatch', 'cost', 'TRN', 'INV'],
  ['stock.pool-arrival', 'cost', 'INV', 'TRN'],
  ['stock.sale-issue', 'cost', 'COGS', 'INV'],
  ['stock.customer-return', 'cost', 'INV', 'COGS'],
  ['stock.supplier-return-departure', 'cost', 'RSH', 'INV'],
  ['stock.supplier-handover', 'cost', 'CLM', 'RSH'],
  ['stock.supplier-rejection-return', 'cost', 'INV', 'RSH'],
  // The reversal of an inflow made in error, as 16.1 lists it (P2, G13).
  ['stock.cost-established-reversal', 'to-pool', 'PUR', 'INV'],
  ['stock.cost-established-reversal', 'to-dispatch', 'PUR', 'TRN'],
  ['stock.cost-established-reversal', 'variance', 'PUR', 'VAR'],
  // Not in 16.1; SYNTHETIC maps the further scenarios need (S1-F10-T06), which settle no account or recognition rule
  // (V-10, POL-09.03, SL-3, SL-4): a loss to SYN-LOSS and its reversal back; a pass-through to cost of goods sold,
  // with purchase clearing on the other side.
  ['stock.count-loss', 'cost', 'LOSS', 'INV'],
  ['stock.count-loss-reversal', 'cost', 'INV', 'LOSS'],
  ['stock.disposal-loss', 'cost', 'LOSS', 'INV'],
  ['stock.pass-through', 'cost', 'COGS', 'PUR'],
];

/** One place the ledger posts at: a Site, a business unit and a SYNTHETIC location identifier. */
export interface At {
  readonly siteId: string;
  readonly businessUnitId: string;
  readonly locationId: string;
}

/** A SYNTHETIC book with its chart, maps, a period around today and a journal series, and a warehouse and a Store. */
export interface SyntheticCombination {
  readonly bookId: string;
  readonly legalEntityId: string;
  readonly costVersionId: string;
  readonly accounts: Record<SyntheticAccount, string>;
  readonly periodId: string;
  /** Warehouse W1: a Site with a warehouse unit, which belongs to no Store. */
  readonly w1: At;
  /** Store S1: a Site with a Store and its whole-store unit. */
  readonly s1: At;
}

/** The SYNTHETIC exception type the synthetic caller registers for a posting refused (SL-23; DEC-105). */
export const POSTING_REFUSED: ExceptionTypeRegistration = {
  code: `${SYNTHETIC_MODULE}.posting-refused`,
  category: 'unfinished-operation',
  module: SYNTHETIC_MODULE,
  linksTo: [SYNTHETIC_DOCUMENT_TYPE],
  evidenceClasses: [],
  resolutionCheck: () => Promise.resolve({ kind: 'verified' }),
};

export class ValuedWorld extends StockWorld {
  setup!: StructureSetup;
  exceptions!: Exceptions;
  private geography!: { stateId: string; areaId: string };
  private readonly units = new Map<string, UnitFacts>();
  private readonly locations = new Map<string, { siteId: string; businessUnitId: string }>();
  private readonly skuFacts = new Map<string, SkuFacts>();
  private counter = 0;
  protected override readonly registrations: readonly CallerRegistration[] = [syntheticCaller];

  protected next(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${String(this.counter)}`;
  }

  protected override async compose(): Promise<void> {
    const [organisation] = this.world.organisations;
    // The raw invariant queries of the shared checks read as the read-only test role (stock-ledger 15.4).
    await allowVerifier(organisation.database);
    this.setup = await structureSetup({
      directory: this.world.directory,
      database: organisation.database,
      organisationCode: organisation.code,
      keysEnvironment: this.keysEnvironment,
      label: 'VALUED',
      eventKinds: STOCK_POSTING_EVENT_KINDS,
    });
    this.places = {
      unitAt: (_context, place) => Promise.resolve(this.units.get(`${place.siteId}|${place.businessUnitId}`)),
      locationOf: (_context, locationId) => Promise.resolve(this.locations.get(locationId)),
    };
    this.skus = { skuAt: (_context, skuId) => Promise.resolve(this.skuFacts.get(skuId)) };
    this.books = this.setup.books;
    const geography = await approvedGeography(this.setup, 'VAL');
    this.geography = { stateId: geography.state.recordId, areaId: geography.area.recordId };
    // The exception the synthetic caller raises after a rollback (SL-23 Outcome A; DEC-105): a SYNTHETIC code series
    // and routing, approved as a fixture.
    const numbering = new Numbering({ kinds: [EXCEPTION_CODE_KIND, JOURNAL_KIND] });
    this.exceptions = new Exceptions({
      numbering,
      inbox: new Inbox(),
      audit: new Audit(this.log.logger),
      types: this.exceptionTypes(),
    });
    await this.setup.run(this.setup.preparer.id, (context) => defineSyntheticCodeSeries(context, numbering));
  }

  /** The exception types the world's callers raise after a refused posting (SL-23; DEC-105). */
  protected exceptionTypes(): ExceptionTypeRegistration[] {
    return [POSTING_REFUSED];
  }

  /** A SYNTHETIC SKU of a new brand, piece-tracked or quantity-tracked. */
  sku(pieceTracked: boolean): SkuFacts {
    const sku: SkuFacts = {
      skuId: uuidv7(),
      versionId: uuidv7(),
      brandId: uuidv7(),
      stockUnit: 'piece',
      pieceTracked,
      batchTracked: false,
    };
    this.skuFacts.set(sku.skuId, sku);
    return sku;
  }

  /** Routes the SYNTHETIC posting-refused type at a Site to the preparer, approved as a fixture (V-03). */
  async routePostingRefused(siteId: string, typeCode: string = POSTING_REFUSED.code): Promise<void> {
    const routing = await this.setup.run(this.setup.preparer.id, (context) =>
      this.exceptions.prepareRouting(
        context,
        { userId: this.setup.preparer.id, roleAssignmentId: this.setup.asPreparer.roleAssignmentId },
        {
          typeCode,
          siteId,
          owner: { kind: 'user', userId: this.setup.preparer.id },
          dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
          escalation: { kind: 'user', userId: this.setup.preparer.id },
          validFrom: this.setup.today(),
          origin: 'synthetic',
        },
      ),
    );
    if (routing.kind !== 'done') throw new Error(routing.refusal.code);
    const owner = await connect(this.database, 'migration');
    try {
      await owner.query(`update exceptions.exception_routing_version set decision = 'Approved' where id = $1`, [
        routing.value.versionId,
      ]);
    } finally {
      await owner.end();
    }
  }

  /**
   * The caller's exception after a refused posting rolled its command back (books-and-posting 10 step 3; SL-23):
   * raised in a command of its own, keyed by the command's idempotency key, linking the document.
   */
  raisePostingRefused(
    key: string,
    siteId: string,
    document: { recordId: string; versionId: string },
    refusal: CommandRefusal,
  ) {
    return this.run(this.poster.user.id, (context) =>
      this.exceptions.raiseInOwnCommand(context, {
        raisingEvent: key,
        typeCode: POSTING_REFUSED.code,
        facts: { siteId, storeId: null, businessUnitId: null, brandId: null },
        links: [
          {
            module: SYNTHETIC_MODULE,
            recordType: SYNTHETIC_DOCUMENT_TYPE,
            recordId: document.recordId,
            versionId: document.versionId,
          },
        ],
        exposure: { kind: 'unknown' },
        raisedBy: { kind: 'user', id: this.poster.user.id },
        comment: `${refusal.code} ${JSON.stringify(refusal.missing)}`,
      }),
    );
  }

  private async inForce(
    change: FinanceChanged,
    recordType: typeof ACCOUNT_TYPE | typeof BOOK_SETTING_TYPE | typeof POSTING_MAP_TYPE,
  ) {
    recorded(
      await this.setup.asPreparerDo((c, p) =>
        this.setup.books.recordCaEvidence(c, p, {
          versions: [{ recordType, versionId: change.versionId }],
          evidence: {
            kind: 'reference',
            what: syntheticName('CA approval letter'),
            givenBy: syntheticName('CA'),
            givenOn: this.setup.today(),
            keptAt: syntheticName('Accounts file'),
          },
        }),
      ),
    );
    decided(await this.setup.decide(change.requestId ?? '', change.versionId));
  }

  /** Moves the world's clocks on, as days pass: the setup's and the ledger commands' (SYNTHETIC time). */
  advanceDays(days: number): void {
    this.setup.advanceDays(days);
    this.offsetMs += days * 24 * 60 * 60 * 1000;
  }

  /**
   * Retires an account by a version in force from today, prepared by Accounts and approved by a different person with
   * the CA's evidence (books-and-posting 3.1, 6.3), so a map naming it is no longer valid (6.2 condition 3).
   */
  async retireAccount(accountId: string): Promise<void> {
    const read = await this.setup.run(this.setup.preparer.id, (c) =>
      this.setup.books.readAccount(c, accountId, this.setup.today()),
    );
    if (read === undefined) throw new Error(`No account ${accountId}`);
    const change = recorded(
      await this.setup.asPreparerDo((c, p) =>
        this.setup.books.prepareAccountVersion(c, p, accountId, {
          name: read.versions.at(-1)?.name ?? '',
          retired: true,
          origin: 'synthetic',
          validFrom: this.setup.today(),
          ...(read.versionToken === undefined ? {} : { versionToken: read.versionToken }),
        }),
      ),
    );
    await this.inForce(change, ACCOUNT_TYPE);
  }

  /** A SYNTHETIC map for an event kind in a book, in force from today (6.1, 6.3). */
  async map(bookId: string, accounts: Record<SyntheticAccount, string>, eventKind: string): Promise<void> {
    const lines = SYNTHETIC_MAPS.filter(([kind]) => kind === eventKind).flatMap(([, component, debit, credit]) => [
      { component, side: 'debit' as const, accountId: accounts[debit], requiresStore: false, requiresBrand: false },
      { component, side: 'credit' as const, accountId: accounts[credit], requiresStore: false, requiresBrand: false },
    ]);
    const change = recorded(
      await this.setup.asPreparerDo((c, p) =>
        this.setup.books.preparePostingMap(c, p, {
          bookId,
          eventKind,
          origin: 'synthetic',
          validFrom: this.setup.today(),
          lines,
        }),
      ),
    );
    await this.inForce(change, POSTING_MAP_TYPE);
  }

  /** A business unit at a Site, mapped to the book, with a SYNTHETIC location the ledger's place read answers. */
  async unit(
    book: { bookId: string; legalEntityId: string; registrationId: string },
    siteId: string,
    kind: 'warehouse' | 'whole-store' | 'brand-counter',
    storeId?: string,
  ): Promise<At> {
    const answer = prepared(
      await this.setup.prepare((c, p) =>
        this.setup.organisation.prepareBusinessUnit(c, p, {
          code: syntheticCode(this.next('BU')),
          siteId,
          kind,
          ...(storeId === undefined ? {} : { storeId }),
          name: syntheticName('Stock unit'),
          legalEntityId: book.legalEntityId,
          taxRegistrationId: book.registrationId,
          accountingBookId: book.bookId,
          validFrom: this.setup.today(),
        }),
      ),
    );
    decided(await this.setup.decide(answer.requestId, answer.versionId));
    this.units.set(`${siteId}|${answer.recordId}`, {
      siteId,
      storeId: storeId ?? null,
      businessUnitId: answer.recordId,
      legalEntityId: book.legalEntityId,
      bookId: book.bookId,
      taxRegistrationId: book.registrationId,
      mappingVersionId: answer.versionId,
    });
    const locationId = await this.location(siteId, answer.recordId);
    return { siteId, businessUnitId: answer.recordId, locationId };
  }

  /** A location of the unit: a SYNTHETIC identifier the stand-in place read answers; the harness makes a real one. */
  protected location(siteId: string, businessUnitId: string): Promise<string> {
    const locationId = uuidv7();
    this.locations.set(locationId, { siteId, businessUnitId });
    return Promise.resolve(locationId);
  }

  async site(physicalKind: 'central-warehouse' | 'retail-site'): Promise<string> {
    const site = await approved(this.setup, (c, p) =>
      this.setup.organisation.prepareSite(c, p, {
        code: syntheticCode(this.next('SITE')),
        name: syntheticName('Stock site'),
        physicalKind,
        areaId: this.geography.areaId,
        addresses: [syntheticName('Address')],
        aliases: [],
        validFrom: this.setup.today(),
      }),
    );
    return site.recordId;
  }

  async store(siteId: string): Promise<string> {
    const store = await approved(this.setup, (c, p) =>
      this.setup.organisation.prepareStore(c, p, {
        code: syntheticCode(this.next('STORE')),
        name: syntheticName('Stock store'),
        format: 'ebo',
        operatingModel: 'company-owned',
        siteId,
        aliases: [],
        validFrom: this.setup.today(),
      }),
    );
    return store.recordId;
  }

  /**
   * A SYNTHETIC book (BK-SYN of stock-ledger 11.1) under one cost formula and pool mode: legal entity, registration,
   * the book, its approved cost setting, the chart and maps of 16.1 (or only the event kinds named), one open period
   * around today and a journal series; then warehouse W1 and Store S1, each a Site with its unit in the book.
   */
  async book(
    formula: CostFormula | null,
    poolMode: CostPoolMode,
    options: { readonly maps?: readonly string[] } = {},
  ): Promise<SyntheticCombination & { registrationId: string }> {
    const legalEntity = await approved(this.setup, (c, p) =>
      this.setup.organisation.prepareLegalEntity(c, p, {
        code: syntheticCode(this.next('LE')),
        legalName: syntheticName('Stock legal entity'),
        validFrom: this.setup.today(),
      }),
    );
    const registration = await approved(this.setup, (c, p) =>
      this.setup.organisation.prepareTaxRegistration(c, p, {
        code: syntheticCode(this.next('GSTIN')),
        legalEntityId: legalEntity.recordId,
        registrationNumber: `0${String(this.counter)}SYNTHETIC`,
        stateId: this.geography.stateId,
        validityFrom: this.setup.today(),
        validFrom: this.setup.today(),
      }),
    );
    const book = await approved(this.setup, (c, p) =>
      this.setup.organisation.prepareAccountingBook(c, p, {
        code: syntheticCode(this.next('BK')),
        legalEntityId: legalEntity.recordId,
        name: syntheticName('BK-SYN'),
        validFrom: this.setup.today(),
      }),
    );
    const bookId = book.recordId;
    let costVersionId = '';
    if (formula !== null) {
      const cost = recorded(
        await this.setup.asPreparerDo((c, p) =>
          this.setup.books.prepareBookSetting(c, p, bookId, {
            kind: 'cost',
            formula,
            poolMode,
            origin: 'synthetic',
            validFrom: this.setup.today(),
          }),
        ),
      );
      await this.inForce(cost, BOOK_SETTING_TYPE);
      costVersionId = cost.versionId;
    }
    const accounts = {} as Record<SyntheticAccount, string>;
    for (const code of Object.keys(NATURES) as SyntheticAccount[]) {
      const change = recorded(
        await this.setup.asPreparerDo((c, p) =>
          this.setup.books.prepareAccount(c, p, {
            bookId,
            code: syntheticCode(this.next(`SYN-${code}`.replace('SYN-', ''))),
            nature: NATURES[code],
            origin: 'synthetic',
            name: syntheticName(`Account ${code}`),
            validFrom: this.setup.today(),
          }),
        ),
      );
      await this.inForce(change, ACCOUNT_TYPE);
      accounts[code] = change.recordId;
    }
    const kinds = options.maps ?? [...new Set(SYNTHETIC_MAPS.map(([kind]) => kind))];
    for (const kind of kinds) await this.map(bookId, accounts, kind);
    const financialYear = syntheticCode(this.next('FY'));
    const period = recorded(
      await this.setup.asPreparerDo((c, p) =>
        this.setup.books.definePeriod(c, p, bookId, {
          code: syntheticCode(this.next('P')),
          financialYear,
          firstDay: this.setup.day(-5),
          lastDay: this.setup.day(30),
        }),
      ),
    );
    const formatCode = syntheticCode(this.next('JV-FMT'));
    await this.setup.run(this.setup.preparer.id, (c) =>
      this.setup.numbering.defineFormatVersion(c, formatCode, [
        { kind: 'text', text: `SYN-ST${String(this.counter)}-` },
        { kind: 'sequence', width: 5 },
      ]),
    );
    const series = await this.setup.run(this.setup.preparer.id, (c) =>
      this.setup.numbering.defineSeries(c, {
        kind: JOURNAL_KIND.kind,
        scopeKey: bookId,
        financialYear,
        displayScopeKey: bookId,
        formatCode,
      }),
    );
    if (series.kind !== 'done') throw new Error(`Series refused: ${series.refusal.code}`);
    const facts = { bookId, legalEntityId: legalEntity.recordId, registrationId: registration.recordId };
    const w1 = await this.unit(facts, await this.site('central-warehouse'), 'warehouse');
    const storeSite = await this.site('retail-site');
    const s1 = await this.unit(facts, storeSite, 'whole-store', await this.store(storeSite));
    return {
      bookId,
      legalEntityId: legalEntity.recordId,
      registrationId: registration.recordId,
      costVersionId,
      accounts,
      periodId: period.periodId,
      w1,
      s1,
    };
  }
}
