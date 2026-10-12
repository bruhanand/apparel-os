import { paise, uuidv7 } from '@apparel-os/domain';
import {
  businessDateSchema,
  IMPORT_BATCH_TYPE,
  OPENING_BALANCES_APPROVAL,
  OPENING_BALANCES_TYPE,
  type DocumentPreview,
} from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import type { TransactionContext } from '../../src/kernel/index.js';
import {
  knownValue,
  optionSuggestions,
  type BalanceRow,
  type HandlerDocument,
  type HandlerRow,
  type ImportField,
  type ImportHandler,
  type OpeningKind,
} from '../../src/modules/files-imports/index.js';
import type { OrganisationInterface } from '../../src/modules/organisation/index.js';
import { syntheticIdentifier } from '../fixtures/synthetic.js';
import { connect } from './postgres.js';

// S1-F13-T02: the opening-balance test handlers of dues, advances and deposits, and the closed-books balances they
// reconcile with (imports-and-opening-data 10.4, 10.5, 11, 12, 13.2; PRD-LIF-009, PRD-LIF-011, PRD-ORG-005,
// PRD-PAY-008, PRD-MOD-014, PRD-MOD-015, POL-14.03). Like the opening-stock handler of `opening-stock.ts`, they are
// composed only into a test application (code-house-rules 11.4; GC6-18, DEC-116): no code under `src/` names them. They
// stage and validate; nothing publishes, and nothing here creates a delivery, invoice, liability or journal (10.5;
// PRD-LIF-008): financial opening balances post only at a Store's switch, in stage 4 (books-and-posting 7.3), through
// the stage 4 `site-lifecycle` handlers that replace these.
//
// Each opening kind is its own handler, layout and target, imported separately (PRD-LIF-009). One document is one
// opening of the batch's unit, its reference the opening reference. Every row:
// - names the batch's unit by code and the cutoff date, one cutoff for the whole document;
// - carries its legal entity and book through the unit's mapping in force on the cutoff date (PRD-ORG-005); a supplier
//   due names them too, and they must be the mapping's;
// - holds its amount in integer paise, staged by the `paise` transform (PRD-MOD-014), more than zero, since a row is
//   an open amount; an amount with digits finer than paise stays Unknown (GC6-13) and is Blocking as a required value;
// - falls in one account, named by its kind and, for advances and deposits, whether given or received, so deposits and
//   advances stay apart from each other and from expenses (PRD-PAY-008). Which ledger account of the closed books each
//   is, is OPEN with the form of those books (GC6-10, RR-133);
// - is Blocking when it is also open as a live document (PRD-LIF-011): the same book, account, party and reference
//   in the live open items, which no stage 1 module holds, so a test-only stand-in answers (`LiveOpenItems`).
// Parties are kept as the codes given: resolving them to party records, and which party roles each kind accepts, is
// the stage 4 handlers'. A customer's name is customer contact (section 11; layout class) and is read by nothing here.
//
// Every value they are given is SYNTHETIC.

/** The accounts the opening kinds of 10.4 fall in (design choice for these test handlers; GC6-10 keeps the ledger's). */
export const OPENING_ACCOUNTS = [
  'supplier-dues',
  'customer-dues',
  'advances-given',
  'advances-received',
  'deposits-given',
  'deposits-received',
] as const;
export type OpeningAccount = (typeof OPENING_ACCOUNTS)[number];

const DIRECTIONS = ['given', 'received'] as const;

/** The handlers' targets, test-only identifiers (code-house-rules 11.1). */
export const OPENING_BALANCE_TARGETS = {
  'supplier-dues': syntheticIdentifier('opening-supplier-dues'),
  'customer-dues': syntheticIdentifier('opening-customer-dues'),
  advances: syntheticIdentifier('opening-advances'),
  deposits: syntheticIdentifier('opening-deposits'),
} as const;
export const CLOSED_BOOKS_TARGET = syntheticIdentifier('closed-books');

type BalanceKind = Exclude<OpeningKind, 'stock'>;

/** The key of a live open item (10.4): book, account, party and reference. */
export interface OpenItemKey {
  readonly accountingBookId: string;
  readonly account: OpeningAccount;
  readonly party: string;
  readonly reference: string;
}

/**
 * Whether a row is also open as a live document (10.4; PRD-LIF-011). The stage 5 payables and receivables answer it
 * for the stage 4 handler (GC6-11); here, the stand-in of `test_opening_balances`.
 */
export interface LiveOpenItems {
  isOpen(context: TransactionContext, key: OpenItemKey): Promise<boolean>;
}

/** The test-only stand-in (code-house-rules 11.4): the live open items the test wrote, read in the caller's transaction. */
export const standInOpenItems: LiveOpenItems = {
  async isOpen(context, key) {
    const result = await context.tx.execute<{ open: boolean }>(
      sql`select exists (select 1 from test_opening_balances.live_open_item
            where accounting_book_id = ${key.accountingBookId} and account = ${key.account}
              and party = ${key.party} and reference = ${key.reference}) as open`,
    );
    return result.rows[0]?.open === true;
  },
};

/** Writes a SYNTHETIC live open item into the stand-in, as the live module would (code-house-rules 11.4). */
export async function writeLiveOpenItem(database: string, key: OpenItemKey): Promise<void> {
  const client = await connect(database, 'migration');
  try {
    await client.query(
      `insert into test_opening_balances.live_open_item (id, accounting_book_id, account, party, reference)
       values ($1, $2, $3, $4, $5)`,
      [uuidv7(), key.accountingBookId, key.account, key.party, key.reference],
    );
  } finally {
    await client.end();
  }
}

export interface OpeningBalanceDependencies {
  readonly organisation: Pick<OrganisationInterface, 'structureOn' | 'mappingOn'>;
  readonly openItems: LiveOpenItems;
}

type Issue = Extract<DocumentPreview, { kind: 'issues' }>['issues'][number];

/** How one kind reads its rows. */
interface KindSpec {
  readonly fields: readonly ImportField[];
  /** The field holding the open amount. */
  readonly amount: string;
  /** The field naming the party. */
  readonly party: string;
  /** The field whose value is the reference a live document would share. */
  readonly reference: string;
  /** The accounts the kind holds. */
  readonly accounts: readonly OpeningAccount[];
  /** A row's account, or undefined where its direction is not accepted. */
  account(row: HandlerRow): OpeningAccount | undefined;
  /** The kind's own checks of a row. */
  checks(row: HandlerRow, cutoff: string | undefined, mapping: MappingCodes | undefined): Issue[];
}

const field = (name: string, required: boolean): ImportField => ({ name, required });
const COMMON = [field('openingReference', true), field('unitCode', true), field('cutoffDate', true)];
const WHOLE = /^\d+$/;
const SIGNED = /^-?\d+$/;

const isDate = (value: string | undefined) => value !== undefined && businessDateSchema.safeParse(value).success;

interface MappingCodes {
  readonly legalEntityCode: string | undefined;
  readonly bookCode: string | undefined;
}

/** The checks of a dated open document (supplier and customer dues): its date by the cutoff, its due date a date. */
function documentChecks(code: (reason: string) => string, row: HandlerRow, cutoff: string | undefined): Issue[] {
  const issues: Issue[] = [];
  const at = (name: string) => ({ field: name, rowNumber: row.rowNumber });
  const documentDate = knownValue(row.values.documentDate);
  if (documentDate !== undefined) {
    if (!isDate(documentDate)) issues.push({ code: code('date-not-accepted'), ...at('documentDate') });
    else if (cutoff !== undefined && documentDate > cutoff)
      issues.push({ code: code('document-after-cutoff'), ...at('documentDate') });
  }
  const dueDate = knownValue(row.values.dueDate);
  if (dueDate !== undefined && !isDate(dueDate)) issues.push({ code: code('date-not-accepted'), ...at('dueDate') });
  return issues;
}

const directed = (prefix: 'advances' | 'deposits') => (row: HandlerRow) => {
  const direction = knownValue(row.values.direction);
  return direction === 'given' || direction === 'received' ? (`${prefix}-${direction}` as const) : undefined;
};

function specs(code: (kind: BalanceKind) => (reason: string) => string): Record<BalanceKind, KindSpec> {
  return {
    'supplier-dues': {
      fields: [
        ...COMMON,
        field('partyCode', true),
        field('legalEntityCode', true),
        field('bookCode', true),
        field('documentReference', true),
        field('documentDate', true),
        field('originalAmount', false),
        field('openAmount', true),
        field('dueDate', false),
      ],
      amount: 'openAmount',
      party: 'partyCode',
      reference: 'documentReference',
      accounts: ['supplier-dues'],
      account: () => 'supplier-dues',
      checks(row, cutoff, mapping) {
        const reason = code('supplier-dues');
        const at = (name: string) => ({ field: name, rowNumber: row.rowNumber });
        const issues = documentChecks(reason, row, cutoff);
        // The legal entity and book a supplier due names must be its unit's mapping's (PRD-ORG-005).
        if (mapping !== undefined && knownValue(row.values.legalEntityCode) !== mapping.legalEntityCode)
          issues.push({ code: reason('legal-entity-not-the-unit-mapping'), ...at('legalEntityCode') });
        if (mapping !== undefined && knownValue(row.values.bookCode) !== mapping.bookCode)
          issues.push({ code: reason('book-not-the-unit-mapping'), ...at('bookCode') });
        const original = knownValue(row.values.originalAmount);
        const open = knownValue(row.values.openAmount);
        if (original !== undefined && open !== undefined && WHOLE.test(original) && WHOLE.test(open)) {
          if (Number(open) > Number(original))
            issues.push({ code: reason('open-exceeds-original'), ...at('openAmount') });
        }
        return issues;
      },
    },
    'customer-dues': {
      fields: [
        ...COMMON,
        field('customerCode', true),
        field('customerName', false),
        field('documentReference', true),
        field('documentDate', true),
        field('openAmount', true),
        field('dueDate', false),
      ],
      amount: 'openAmount',
      party: 'customerCode',
      reference: 'documentReference',
      accounts: ['customer-dues'],
      account: () => 'customer-dues',
      checks: (row, cutoff) => documentChecks(code('customer-dues'), row, cutoff),
    },
    advances: {
      fields: [
        ...COMMON,
        field('direction', true),
        field('partyCode', true),
        field('purpose', true),
        field('amount', true),
        field('evidence', true),
      ],
      amount: 'amount',
      party: 'partyCode',
      reference: 'evidence',
      accounts: ['advances-given', 'advances-received'],
      account: directed('advances'),
      checks: () => [],
    },
    deposits: {
      fields: [
        ...COMMON,
        field('direction', true),
        field('partyCode', true),
        field('agreementReference', true),
        field('amount', true),
        field('evidence', true),
      ],
      amount: 'amount',
      party: 'partyCode',
      reference: 'agreementReference',
      accounts: ['deposits-given', 'deposits-received'],
      account: directed('deposits'),
      checks: () => [],
    },
  };
}

async function today(context: TransactionContext): Promise<string> {
  const date = await context.businessDate();
  if (date.kind !== 'set') throw new Error('The synthetic Organisation has no timezone');
  return date.date;
}

/** The document's one cutoff date, or undefined when its rows give none, several, or one that is no date. */
function cutoffOf(document: HandlerDocument): string | undefined {
  const cutoffs = new Set(document.rows.map((row) => knownValue(row.values.cutoffDate)));
  const [only] = cutoffs;
  return cutoffs.size === 1 && isDate(only) ? only : undefined;
}

/** The unit's mapping on the cutoff date, with its legal entity's and book's codes (PRD-ORG-005). */
async function mappingAt(
  context: TransactionContext,
  organisation: OpeningBalanceDependencies['organisation'],
  unitId: string | undefined,
  cutoff: string | undefined,
): Promise<{ readonly accountingBookId: string; readonly codes: MappingCodes } | undefined> {
  if (unitId === undefined || cutoff === undefined) return undefined;
  const mapping = await organisation.mappingOn(context, unitId, cutoff);
  if (mapping.kind !== 'success') return undefined;
  const structure = await organisation.structureOn(context, cutoff);
  return {
    accountingBookId: mapping.answer.accountingBookId,
    codes: {
      legalEntityCode: structure.legalEntities.find((each) => each.id === mapping.answer.legalEntityId)?.code,
      bookCode: structure.accountingBooks.find((each) => each.id === mapping.answer.accountingBookId)?.code,
    },
  };
}

/** One opening kind's test handler (10.4). Publishing is the stage 4 switch's; it throws here. */
export function openingBalanceHandler(kind: BalanceKind, dependencies: OpeningBalanceDependencies): ImportHandler {
  const target = OPENING_BALANCE_TARGETS[kind];
  const code = (of: BalanceKind) => (reason: string) => `${OPENING_BALANCE_TARGETS[of]}.${reason}`;
  const reason = code(kind);
  const spec = specs(code)[kind];

  async function issuesOf(context: TransactionContext, document: HandlerDocument): Promise<Issue[]> {
    const unitId = document.place.businessUnitId;
    if (document.place.siteId === undefined || unitId === undefined) return [{ code: reason('unit-not-named') }];
    const issues: Issue[] = [];
    const structure = await dependencies.organisation.structureOn(context, await today(context));
    const cutoff = cutoffOf(document);
    if (cutoff === undefined) issues.push({ code: reason('cutoff-not-one-date'), field: 'cutoffDate' });
    const mapping = await mappingAt(context, dependencies.organisation, unitId, cutoff);
    if (cutoff !== undefined && mapping === undefined)
      issues.push({ code: reason('no-unit-mapping-on-cutoff'), field: 'cutoffDate' });
    for (const row of document.rows) {
      const at = (name: string) => ({ field: name, rowNumber: row.rowNumber });
      const value = (name: string) => knownValue(row.values[name]);
      if (structure.businessUnits.find((each) => each.code === value('unitCode'))?.id !== unitId)
        issues.push({ code: reason('unit-not-the-batch-unit'), ...at('unitCode') });
      const amount = value(spec.amount);
      if (amount !== undefined && (!WHOLE.test(amount) || Number(amount) === 0))
        issues.push({ code: reason('amount-not-positive'), ...at(spec.amount) });
      const account = spec.account(row);
      if (account === undefined) issues.push({ code: reason('direction-not-accepted'), ...at('direction') });
      issues.push(...spec.checks(row, cutoff, mapping?.codes));
      // A row also open as a live document would be counted twice (PRD-LIF-011).
      const party = value(spec.party);
      const reference = value(spec.reference);
      if (mapping !== undefined && account !== undefined && party !== undefined && reference !== undefined) {
        const key = { accountingBookId: mapping.accountingBookId, account, party, reference };
        if (await dependencies.openItems.isOpen(context, key))
          issues.push({ code: reason('also-open-as-live-document'), ...at(spec.reference) });
      }
    }
    return issues;
  }

  return {
    target,
    recordType: IMPORT_BATCH_TYPE,
    kinds: ['opening-balance'],
    effects: 'money',
    openingKind: kind,
    fields: spec.fields,
    measures: [{ field: spec.amount, kind: 'value' }],
    // An opening's source identity is the unit and the opening kind (7.1), with the opening reference.
    sourceScope: (document) => JSON.stringify([target, kind, document.place.businessUnitId ?? null]),
    revisions: 'none',
    publishNeeds: (_context, document) =>
      Promise.resolve({ action: 'edit', recordType: IMPORT_BATCH_TYPE, facts: document.place }),
    lockTargets: () => Promise.resolve([]),
    // Accounts verifies the values (POL-14.03): an independent approval of the batch version, under the verification
    // of opening balances, apart from Operations' of opening stock (product owner, 12 Oct 2026).
    review: () => ({ kind: 'approval', actionType: OPENING_BALANCES_APPROVAL, recordType: OPENING_BALANCES_TYPE }),
    suggestions: (_context, name, value) =>
      Promise.resolve(name === 'direction' ? optionSuggestions(DIRECTIONS, value) : []),
    async checkRuleTarget(context, name, ruleTarget) {
      if (name !== 'unitCode') {
        return {
          kind: 'refused',
          code: 'files-imports.rule-attribute-unknown',
          missing: [{ kind: 'rule-attribute', field: name }],
        };
      }
      const structure = await dependencies.organisation.structureOn(context, await today(context));
      return structure.businessUnits.some((each) => each.code === ruleTarget)
        ? undefined
        : {
            kind: 'refused',
            code: 'organisation.record-not-found',
            missing: [{ kind: 'rule-target', field: name, target: ruleTarget }],
          };
    },
    async preview(context, document) {
      const issues = await issuesOf(context, document);
      if (issues.length > 0) return { kind: 'issues', issues };
      return {
        kind: 'would-create',
        records: [{ recordType: reason('opening-balance'), codes: [document.reference] }],
      };
    },
    publish() {
      throw new Error('Financial opening balances post only at a Store switch, in stage 4 (books-and-posting 7.3)');
    },
    comparison: {
      set: 'opening-balances',
      fields: [spec.party, spec.amount, 'cutoffDate', 'direction'].filter((each) =>
        spec.fields.some((one) => one.name === each),
      ),
      accounts: spec.accounts,
      async balances(context, documents): Promise<BalanceRow[]> {
        const rows: BalanceRow[] = [];
        for (const document of documents) {
          const mapping = await mappingAt(
            context,
            dependencies.organisation,
            document.place.businessUnitId,
            cutoffOf(document),
          );
          for (const row of document.rows) {
            const amount = knownValue(row.values[spec.amount]);
            rows.push({
              rowId: row.stagedRowId,
              accountingBookId: mapping?.accountingBookId ?? null,
              account: spec.account(row) ?? null,
              party: knownValue(row.values[spec.party]) ?? null,
              paise: amount !== undefined && WHOLE.test(amount) ? paise(Number(amount)) : null,
            });
          }
        }
        return rows;
      },
    },
  };
}

/**
 * The closed-books balances, a test handler of the historical-reference kind (4.1, 10.4): facts kept for the check
 * only, never published here. One document is one set of balances, its reference the balances reference; one row is
 * one balance of a book's account, of one party or of the account alone, signed as given, on the date the books
 * closed. Their real form, such as a Tally export, is OPEN (GC6-10, RR-133); the account is one of the opening
 * accounts, which a confirmed mapping rule may fill from the ledger's own word (6.3).
 */
export function closedBooksHandler(dependencies: Pick<OpeningBalanceDependencies, 'organisation'>): ImportHandler {
  const reason = (why: string) => `${CLOSED_BOOKS_TARGET}.${why}`;
  const fields: ImportField[] = [
    field('balancesReference', true),
    field('closedOn', true),
    field('bookCode', true),
    field('account', true),
    field('partyCode', false),
    field('balance', true),
  ];
  const isAccount = (value: string | undefined): value is OpeningAccount =>
    (OPENING_ACCOUNTS as readonly (string | undefined)[]).includes(value);
  const bookOf = async (context: TransactionContext, row: HandlerRow) => {
    const closedOn = knownValue(row.values.closedOn);
    if (!isDate(closedOn) || closedOn === undefined) return undefined;
    const structure = await dependencies.organisation.structureOn(context, closedOn);
    return structure.accountingBooks.find((each) => each.code === knownValue(row.values.bookCode))?.id;
  };
  return {
    target: CLOSED_BOOKS_TARGET,
    recordType: IMPORT_BATCH_TYPE,
    kinds: ['historical-reference'],
    effects: 'reference-records',
    fields,
    measures: [{ field: 'balance', kind: 'value' }],
    sourceScope: (document) => JSON.stringify([CLOSED_BOOKS_TARGET, document.place.legalEntityId ?? null]),
    revisions: 'none',
    publishNeeds: (_context, document) =>
      Promise.resolve({ action: 'edit', recordType: IMPORT_BATCH_TYPE, facts: document.place }),
    lockTargets: () => Promise.resolve([]),
    review: () => ({ kind: 'submission' }),
    suggestions: (_context, name, value) =>
      Promise.resolve(name === 'account' ? optionSuggestions(OPENING_ACCOUNTS, value) : []),
    checkRuleTarget: (_context, name, ruleTarget) =>
      Promise.resolve(
        name === 'account' && isAccount(ruleTarget)
          ? undefined
          : name === 'account'
            ? {
                kind: 'refused',
                code: reason('account-not-accepted'),
                missing: [{ kind: 'rule-target', field: name, target: ruleTarget }],
              }
            : {
                kind: 'refused',
                code: 'files-imports.rule-attribute-unknown',
                missing: [{ kind: 'rule-attribute', field: name }],
              },
      ),
    async preview(context, document) {
      const issues: Issue[] = [];
      for (const row of document.rows) {
        const at = (name: string) => ({ field: name, rowNumber: row.rowNumber });
        if (!isDate(knownValue(row.values.closedOn)))
          issues.push({ code: reason('date-not-accepted'), ...at('closedOn') });
        else if ((await bookOf(context, row)) === undefined)
          issues.push({ code: reason('book-not-found'), ...at('bookCode') });
        if (!isAccount(knownValue(row.values.account)))
          issues.push({ code: reason('account-not-accepted'), ...at('account') });
        const balance = knownValue(row.values.balance);
        if (balance !== undefined && !SIGNED.test(balance))
          issues.push({ code: reason('balance-not-paise'), ...at('balance') });
      }
      if (issues.length > 0) return { kind: 'issues', issues };
      return {
        kind: 'would-create',
        records: [{ recordType: reason('closed-books-balance'), codes: [document.reference] }],
      };
    },
    publish() {
      throw new Error('The closed-books balances are kept for the check only (10.4)');
    },
    comparison: {
      set: 'closed-books',
      fields: ['bookCode', 'account', 'partyCode', 'balance', 'closedOn'],
      async balances(context, documents): Promise<BalanceRow[]> {
        const rows: BalanceRow[] = [];
        for (const document of documents) {
          for (const row of document.rows) {
            const account = knownValue(row.values.account);
            const balance = knownValue(row.values.balance);
            rows.push({
              rowId: row.stagedRowId,
              accountingBookId: (await bookOf(context, row)) ?? null,
              account: isAccount(account) ? account : null,
              party: knownValue(row.values.partyCode) ?? null,
              paise: balance !== undefined && SIGNED.test(balance) ? paise(Number(balance)) : null,
            });
          }
        }
        return rows;
      },
    },
  };
}
