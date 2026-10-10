import { known, paise, uuidv7 } from '@apparel-os/domain';
import { ACCOUNT_TYPE, POSTING_MAP_TYPE, type FinanceChanged, type PeriodDraft } from '@apparel-os/schemas';
import { LOCK_STEP, type TransactionContext } from '../../src/kernel/index.js';
import {
  JOURNAL_KIND,
  type PostingEventKind,
  type PostItem,
  type PostRequest,
  type PostResult,
} from '../../src/modules/finance/books/index.js';
import { syntheticCode, syntheticName } from '../fixtures/synthetic.js';
import { approved, decided, prepared, type StructureSetup } from './organisation.js';

// SYNTHETIC books for the tests of finance · books (books-and-posting 15; S1-F09-T03): a book with the chart of
// 16.1's accounts in force, a Site with a Store and a whole-store unit mapped to it, periods and a journal series, a
// map in force for a test-only posting event kind, and the SYNTHETIC caller of DEC-112 H2, which checks before any
// lock, holds the periods at step 7 and the journal series at step 8, then posts. Every value is SYNTHETIC: the
// periods, financial year and number format are none of KDPS's (GC4-1, GC5-1, V-10).

/** A SYNTHETIC posting event kind, test- labelled, declared in the test composition only (7.1). */
export const SYNTHETIC_VALUE_IN: PostingEventKind = {
  kind: 'test-synthetic.value-in',
  components: ['to-pool'],
  reversalKind: null,
  liveStage: 1,
};
export const SYNTHETIC_SOURCE = 'test-synthetic';
export const SYNTHETIC_DOCUMENT_TYPE = 'test-synthetic.document';

type Outcome<T> = { kind: 'success'; answer: T } | { kind: 'refusal'; refusal: { code: string } };

export function recorded<T>(outcome: Outcome<T>): T {
  if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
  return outcome.answer;
}

export interface SyntheticBook {
  readonly bookId: string;
  readonly unit: string;
  readonly financialYear: string;
  /** The book's periods in date order, each ten days long, the first from today. */
  readonly periods: readonly { readonly id: string; readonly firstDay: string }[];
}

/**
 * The SYNTHETIC books of one test file, on its setup and geography, with a counter so that every code is new. Each
 * book's map credits a purchase clearing account and debits a stock account for the one component.
 */
export function syntheticBooks(setup: StructureSetup, geography: { stateId: string; areaId: string }) {
  let counter = 0;
  const next = (prefix: string) => `${prefix}-${String(++counter)}`;

  async function inForce(change: FinanceChanged, recordType: typeof ACCOUNT_TYPE | typeof POSTING_MAP_TYPE) {
    recorded(
      await setup.asPreparerDo((c, p) =>
        setup.books.recordCaEvidence(c, p, {
          versions: [{ recordType, versionId: change.versionId }],
          evidence: {
            kind: 'reference',
            what: syntheticName('CA approval letter'),
            givenBy: syntheticName('CA'),
            givenOn: setup.today(),
            keptAt: syntheticName('Accounts file'),
          },
        }),
      ),
    );
    decided(await setup.decide(change.requestId ?? '', change.versionId));
  }

  /** A book with `periodCount` periods of ten days from today, its series and its map in force. */
  async function book(periodCount = 2): Promise<SyntheticBook> {
    const legalEntity = await approved(setup, (c, p) =>
      setup.organisation.prepareLegalEntity(c, p, {
        code: syntheticCode(next('LE')),
        legalName: syntheticName('Period close legal entity'),
        validFrom: setup.today(),
      }),
    );
    const registration = await approved(setup, (c, p) =>
      setup.organisation.prepareTaxRegistration(c, p, {
        code: syntheticCode(next('GSTIN')),
        legalEntityId: legalEntity.recordId,
        registrationNumber: `0${String(counter)}SYNTHETIC`,
        stateId: geography.stateId,
        validityFrom: setup.today(),
        validFrom: setup.today(),
      }),
    );
    const bookRecord = await approved(setup, (c, p) =>
      setup.organisation.prepareAccountingBook(c, p, {
        code: syntheticCode(next('BK')),
        legalEntityId: legalEntity.recordId,
        name: syntheticName('Period close book'),
        validFrom: setup.today(),
      }),
    );
    const bookId = bookRecord.recordId;
    const site = await approved(setup, (c, p) =>
      setup.organisation.prepareSite(c, p, {
        code: syntheticCode(next('SITE')),
        name: syntheticName('Period close site'),
        physicalKind: 'retail-site',
        areaId: geography.areaId,
        addresses: [syntheticName('Address')],
        aliases: [],
        validFrom: setup.today(),
      }),
    );
    const store = await approved(setup, (c, p) =>
      setup.organisation.prepareStore(c, p, {
        code: syntheticCode(next('STORE')),
        name: syntheticName('Period close store'),
        format: 'ebo',
        operatingModel: 'company-owned',
        siteId: site.recordId,
        aliases: [],
        validFrom: setup.today(),
      }),
    );
    const unitAnswer = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareBusinessUnit(c, p, {
          code: syntheticCode(next('BU')),
          siteId: site.recordId,
          kind: 'whole-store',
          storeId: store.recordId,
          name: syntheticName('Period close unit'),
          legalEntityId: legalEntity.recordId,
          taxRegistrationId: registration.recordId,
          accountingBookId: bookId,
          validFrom: setup.today(),
        }),
      ),
    );
    decided(await setup.decide(unitAnswer.requestId, unitAnswer.versionId));
    const accounts: Record<'INV' | 'PUR', string> = { INV: '', PUR: '' };
    for (const [code, nature] of [
      ['INV', 'asset'],
      ['PUR', 'liability'],
    ] as const) {
      const change = recorded(
        await setup.asPreparerDo((c, p) =>
          setup.books.prepareAccount(c, p, {
            bookId,
            code: syntheticCode(next(code)),
            nature,
            name: syntheticName(`Account ${code}`),
            validFrom: setup.today(),
          }),
        ),
      );
      await inForce(change, ACCOUNT_TYPE);
      accounts[code] = change.recordId;
    }
    const financialYear = syntheticCode(next('FY'));
    const periods: { id: string; firstDay: string }[] = [];
    for (let index = 0; index < periodCount; index += 1) {
      const draft: PeriodDraft = {
        code: syntheticCode(`P${String(index + 1)}`),
        financialYear,
        firstDay: setup.day(index * 10),
        lastDay: setup.day(index * 10 + 9),
      };
      const defined = recorded(await setup.asPreparerDo((c, p) => setup.books.definePeriod(c, p, bookId, draft)));
      periods.push({ id: defined.periodId, firstDay: draft.firstDay });
    }
    const formatCode = syntheticCode(next('JV-FMT'));
    await setup.run(setup.preparer.id, (c) =>
      setup.numbering.defineFormatVersion(c, formatCode, [
        { kind: 'text', text: `SYN-PC${String(counter)}-` },
        { kind: 'sequence', width: 5 },
      ]),
    );
    const series = await setup.run(setup.preparer.id, (c) =>
      setup.numbering.defineSeries(c, {
        kind: JOURNAL_KIND.kind,
        scopeKey: bookId,
        financialYear,
        displayScopeKey: bookId,
        formatCode,
      }),
    );
    if (series.kind !== 'done') throw new Error(`Series refused: ${series.refusal.code}`);
    const line = (side: 'debit' | 'credit', accountId: string) => ({
      component: 'to-pool',
      side,
      accountId,
      requiresStore: false,
      requiresBrand: false,
    });
    const map = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.books.preparePostingMap(c, p, {
          bookId,
          eventKind: SYNTHETIC_VALUE_IN.kind,
          origin: 'synthetic',
          validFrom: setup.today(),
          lines: [line('debit', accounts.INV), line('credit', accounts.PUR)],
        }),
      ),
    );
    await inForce(map, POSTING_MAP_TYPE);
    return { bookId, unit: unitAnswer.recordId, financialYear, periods };
  }

  return { book };
}

/** A SYNTHETIC document of one item into the book's unit on the date, with its own source record unless named. */
export function syntheticDocument(
  setup: StructureSetup,
  book: SyntheticBook,
  options: { readonly businessDate: string; readonly amount?: number; readonly recordId?: string },
): PostRequest {
  const item: PostItem = {
    itemKey: uuidv7(),
    eventKind: SYNTHETIC_VALUE_IN.kind,
    businessUnitId: book.unit,
    brandId: null,
    businessDate: options.businessDate,
    components: [{ component: 'to-pool', amount: known(paise(options.amount ?? 10_000)) }],
  };
  return {
    sourceModule: SYNTHETIC_SOURCE,
    document: { recordType: SYNTHETIC_DOCUMENT_TYPE, recordId: options.recordId ?? uuidv7() },
    actor: { kind: 'user', id: setup.preparer.id },
    items: [item],
  };
}

/**
 * The SYNTHETIC caller (DEC-112 H2), in the transaction given: Check postable before any lock, a refusal ending the
 * command with nothing locked; then Hold periods at step 7, the journal series at step 8 and Post. `atStep8` is told
 * how long the step 8 lock call took, the wait on the journal series (5.4; GC4-4).
 */
export async function postIn(
  setup: StructureSetup,
  context: TransactionContext,
  request: PostRequest,
  hooks: { readonly afterHold?: () => Promise<void>; readonly atStep8?: (waitedMs: number) => void } = {},
): Promise<PostResult> {
  const checks = await setup.books.checkPostable(context, request);
  const refused = checks.filter((each) => each.kind === 'refused');
  if (refused.length > 0) return { kind: 'refused', items: refused };
  const held = await setup.books.holdPeriods(context, checks);
  if (held.kind === 'refused') {
    return { kind: 'refused', items: [{ kind: 'refused', itemKey: '', refusal: held.refusal }] };
  }
  await hooks.afterHold?.();
  const started = performance.now();
  await context.lock(LOCK_STEP.numberSeries, held.seriesTargets);
  hooks.atStep8?.(performance.now() - started);
  return setup.books.post(context, request);
}

export const postDocument = (setup: StructureSetup, request: PostRequest) =>
  setup.run(setup.preparer.id, (context) => postIn(setup, context, request));
