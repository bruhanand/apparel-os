import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { paise, uuidv7 } from '@apparel-os/domain';
import type { CostFormula, CostPoolMode } from '@apparel-os/schemas';
import { expect } from 'vitest';
import type { LedgerItem, Written } from '../../../src/modules/stock/ledger/index.js';
import { HARNESS_ACTIONS } from '../../fixtures/stock-harness.js';
import { syntheticCode } from '../../fixtures/synthetic.js';
import type { At, SyntheticAccount } from '../../support/stock-valued.js';
import {
  accountsMatchLedger,
  asVerifier,
  heldValue,
  invariantsHold,
  rebuilds,
  reconciles,
  trialBalance,
} from './checks.js';
import type { HarnessDocument, HarnessFixtures, StepOutcome, StockHarness } from './harness.js';

// The scenario files of the stock harness and their runner (S1-F10 spec 3.4, 3.5; stock-ledger 15.1). A file is one
// scenario under one combination, in the style of the shared golden cases (shared-calculations 12.1): `synthetic`, the
// IDs it covers, its steps as the driver's document commands, the movement kinds and journals each command must
// produce, the stock values after each step and the end trial balance. Its expected values are written by hand from
// stock-ledger 11.2 to 11.6 and books-and-posting 16.2 and 16.3, never produced by the code under test; amounts are
// integer paise (PRD-MOD-014). The files outlive the driver: when a later stage builds a real document, the same file
// runs with that document in place of the command (DEC-112).

export const SCENARIO_FOLDER = join(import.meta.dirname, 'scenarios');

/** A place of the story (11.1): warehouse W1 or Store S1. */
export type PlaceName = 'W1' | 'S1';

/**
 * Pieces of a receipt by position, such as `R1:0-3` (R1's first four) or `R1:0-2,R2:0-1`; positions are those of the
 * receipt's piece codes, in the order counted.
 */
export type PieceSet = string;

export type ScenarioCommand =
  | { readonly command: 'receipt'; readonly receipt: string; readonly at: PlaceName; readonly pieces: number }
  | { readonly command: 'receipt-acceptance' | 'pt-coverage'; readonly receipt: string }
  | { readonly command: 'pt-approval'; readonly receipt: string; readonly pRatePaise: number }
  | {
      readonly command: 'transfer-approval';
      readonly transfer: string;
      readonly from: PlaceName;
      readonly to: PlaceName;
      readonly pieces: PieceSet;
    }
  | { readonly command: 'dispatch' | 'arrival' | 'acceptance'; readonly transfer: string }
  | { readonly command: 'sale'; readonly sale: string; readonly at: PlaceName; readonly pieces: PieceSet }
  | {
      readonly command: 'customer-return';
      readonly return: string;
      readonly sale: string;
      readonly at: PlaceName;
      readonly pieces: PieceSet;
    }
  | { readonly command: 'cost-change'; readonly change: string; readonly receipt: string; readonly amountPaise: number }
  | {
      readonly command: 'supplier-return-approval';
      readonly return: string;
      readonly at: PlaceName;
      readonly pieces: PieceSet;
    }
  | { readonly command: 'departure' | 'handover'; readonly return: string };

/** One component of one journal a command posts (books-and-posting 16.2). */
export interface ExpectedJournal {
  readonly eventKind: string;
  readonly component: string;
  readonly debit: SyntheticAccount;
  readonly credit: SyntheticAccount;
  readonly amountPaise: number;
  /** Where the inventory account's side of it lies, by place, when it lies at more than one (16.2 step 6). */
  readonly inventoryAt?: Partial<Record<PlaceName, number>>;
}

export type ScenarioStepCommand = ScenarioCommand & {
  /** The movement kinds the command must produce, in any order (stock-ledger 2.3). */
  readonly movements: readonly string[];
  readonly journals: readonly ExpectedJournal[];
};

/** A pool after a step: the book's, or a Site's (7.1), with its FIFO layers left as [quantity, value] (7.4). */
export interface ExpectedPool {
  readonly pool: 'book' | PlaceName;
  readonly quantity: number;
  readonly valuePaise: number;
  readonly layers?: readonly (readonly [number, number])[];
}

export interface ScenarioStep {
  /** The step of the story it plays, such as `3 dispatch` (11.1). */
  readonly step: string;
  readonly commands: readonly ScenarioStepCommand[];
  readonly after: {
    readonly pools: readonly ExpectedPool[];
    /** Value held on open dispatches and supplier-return shipments (7.8). */
    readonly transitPaise: number;
    /** Cost of goods sold so far (11.2 to 11.5). */
    readonly cogsPaise: number;
  };
}

export interface Scenario {
  readonly id: string;
  readonly title: string;
  readonly synthetic: true;
  readonly covers: readonly string[];
  readonly sources: readonly string[];
  readonly combination: { readonly formula: CostFormula; readonly poolMode: CostPoolMode };
  readonly sku: { readonly pieceTracked: boolean };
  readonly steps: readonly ScenarioStep[];
  /** The end trial balance (books-and-posting 16.3), debit positive, credit negative. */
  readonly trialBalance: Readonly<Record<SyntheticAccount, number>>;
}

/** Every scenario file of the folder, by file name. */
export function loadScenarios(): { readonly file: string; readonly scenario: Scenario }[] {
  return readdirSync(SCENARIO_FOLDER)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((file) => ({ file, scenario: JSON.parse(readFileSync(join(SCENARIO_FOLDER, file), 'utf8')) as Scenario }));
}

/** What the run knows by the names the scenario gives. */
interface RunState {
  readonly receipts: Map<string, { document: HarnessDocument; originId: string; pieces: string[]; at: At }>;
  /** Each receipt's PT revision and the PT approval document prepared at its coverage. */
  readonly ptRevisions: Map<string, { readonly ptRevisionId: string; readonly document: HarnessDocument }>;
  readonly transfers: Map<string, { document: HarnessDocument; reservationId: string; pieces: string[] }>;
  readonly sales: Map<string, { document: HarnessDocument; movementId: string }>;
  readonly returns: Map<string, { document: HarnessDocument; reservationId: string; pieces: string[] }>;
}

let pieceNumber = 0;

/**
 * Runs a scenario through the driver in its own fixtures (S1-F10 spec 3.4, 3.5): each command posts, then its movement
 * kinds and journals are compared with the file, the checks of 3.5 run, and the same request sent again under its key
 * changes nothing (16.5; PRD-INT-002); after each step its stock values are compared; at the end, the trial balance.
 */
export async function runScenario(harness: StockHarness, scenario: Scenario): Promise<HarnessFixtures> {
  expect(scenario.synthetic).toBe(true);
  const fixtures = await harness.fixtures(scenario.combination.formula, scenario.combination.poolMode);
  const places: Record<PlaceName, At> = { W1: fixtures.w1, S1: fixtures.s1 };
  const state: RunState = {
    receipts: new Map(),
    ptRevisions: new Map(),
    transfers: new Map(),
    sales: new Map(),
    returns: new Map(),
  };
  const actorId = harness.preparer.user.id;
  for (const step of scenario.steps) {
    for (const command of step.commands) {
      const label = `step ${step.step}, ${command.command}`;
      const journalsBefore = await journalIds(harness.database, fixtures.bookId);
      const outcome = await perform(harness, fixtures, places, state, command);
      expect(await movementKinds(harness.database, outcome.written), label).toEqual([...command.movements].sort());
      const journals = [...(await journalIds(harness.database, fixtures.bookId))].filter(
        (id) => !journalsBefore.has(id),
      );
      await journalsAre(harness.database, fixtures, places, journals, command.journals, label);
      await rebuilds(harness, actorId);
      await reconciles(harness, actorId, fixtures);
      const balance = await accountsMatchLedger(harness, actorId, fixtures);
      await invariantsHold(harness.database);
      // A replay of the step changes nothing and answers the same identifiers (16.5; PRD-INT-002, PRD-INT-008).
      const replayed = await outcome.replay();
      expect(replayed, label).toMatchObject({
        kind: 'success',
        replayed: true,
        answer: { movementIds: outcome.written.movementIds },
      });
      expect(await trialBalance(harness, fixtures), label).toEqual(balance);
    }
    const held = await heldValue(harness, actorId, fixtures.bookId);
    const pools = held.pools
      .filter((pool) => pool.skuId === fixtures.sku.skuId)
      .map((pool) => ({
        pool: pool.siteId === null ? 'book' : pool.siteId === fixtures.w1.siteId ? 'W1' : 'S1',
        quantity: pool.quantity,
        valuePaise: pool.valuePaise,
        ...(pool.formula === 'fifo'
          ? {
              layers: pool.layers
                .filter((layer) => layer.quantityLeft > 0)
                .map((layer) => [layer.quantityLeft, layer.valueLeftPaise]),
            }
          : {}),
      }))
      .sort((a, b) => a.pool.localeCompare(b.pool));
    const expected = [...step.after.pools].sort((a, b) => a.pool.localeCompare(b.pool));
    expect(pools, `pools after step ${step.step}`).toEqual(expected);
    expect(
      held.transits.reduce((sum, each) => sum + each.valuePaise, 0),
      `transit after ${step.step}`,
    ).toBe(step.after.transitPaise);
    expect((await trialBalance(harness, fixtures)).COGS, `cost of goods sold after ${step.step}`).toBe(
      step.after.cogsPaise,
    );
  }
  expect(await trialBalance(harness, fixtures)).toEqual(scenario.trialBalance);
  return fixtures;
}

/** The pieces a set names (`R1:0-3,R2:0-1`), from the receipts counted so far. */
function piecesOf(state: RunState, set: PieceSet): string[] {
  return set.split(',').flatMap((part) => {
    const [receipt = '', range = ''] = part.split(':');
    const [first = 0, last = first] = range.split('-').map(Number);
    const pieces = state.receipts.get(receipt)?.pieces ?? [];
    const named = pieces.slice(first, last + 1);
    if (named.length !== last - first + 1) throw new Error(`No pieces ${part}`);
    return named;
  });
}

function named<T>(map: Map<string, T>, name: string): T {
  const found = map.get(name);
  if (found === undefined) throw new Error(`Nothing named ${name} yet`);
  return found;
}

const unitOf = (at: At) => ({ siteId: at.siteId, businessUnitId: at.businessUnitId });

/** One command of the driver (S1-F10 spec 3.2), with the ledger items its document's step sends. */
async function perform(
  harness: StockHarness,
  fixtures: HarnessFixtures,
  places: Record<PlaceName, At>,
  state: RunState,
  command: ScenarioCommand,
): Promise<StepOutcome> {
  const skuId = fixtures.sku.skuId;
  const line = () => uuidv7();
  switch (command.command) {
    case 'receipt': {
      // A GRN count: the pieces counted at the receiving Site (2.3).
      const at = places[command.at];
      const pieceCodes = Array.from({ length: command.pieces }, () => syntheticCode(`HPIECE-${String(++pieceNumber)}`));
      const document = await harness.prepare('receipt', at, [
        { lineId: line(), skuId, quantity: command.pieces, locationId: at.locationId, pieceCodes },
      ]);
      const outcome = await harness.step(document, 'count', { from: 'prepared', to: 'counted' }, [
        {
          kind: 'receipt-count',
          lineId: line(),
          skuId,
          quantity: command.pieces,
          to: at,
          condition: 'good',
          owner: { kind: 'organisation', legalEntityId: fixtures.legalEntityId },
          pieceCodes,
        },
      ]);
      const originId = outcome.written.receiptOriginIds[0];
      if (originId === undefined) throw new Error('no receipt origin');
      state.receipts.set(command.receipt, { document, originId, pieces: pieceCodes, at });
      return outcome;
    }
    case 'receipt-acceptance': {
      // The counted pieces barcode-verified and physically accepted at the receiving Site (13.5; PRD-REC-021).
      const receipt = named(state.receipts, command.receipt);
      const goods = { skuId, quantity: receipt.pieces.length, pieceCodes: receipt.pieces };
      return harness.step(receipt.document, 'accept', { from: 'counted', to: 'accepted' }, [
        { kind: 'record-acceptance', lineId: line(), at: receipt.at, goods },
      ]);
    }
    case 'pt-coverage': {
      // The PT revision covering the receipt (13.5; PRD-PTW-010): recorded before its approval establishes cost.
      const receipt = named(state.receipts, command.receipt);
      const ptRevisionId = uuidv7();
      const document = await harness.prepare('pt-approval', receipt.at, [
        {
          lineId: line(),
          skuId,
          quantity: receipt.pieces.length,
          receiptOriginId: receipt.originId,
          pieceCodes: receipt.pieces,
        },
      ]);
      state.ptRevisions.set(command.receipt, { ptRevisionId, document });
      return harness.step(document, 'cover', { from: 'prepared', to: 'covered' }, [
        {
          kind: 'record-coverage',
          lineId: line(),
          ptRevisionId,
          receiptOriginId: receipt.originId,
          pieceCodes: receipt.pieces,
        },
      ]);
    }
    case 'pt-approval': {
      // PT approval establishes the origin's cost at the P RATE: independent, on the covered quantity's cost (7.6).
      const receipt = named(state.receipts, command.receipt);
      const { ptRevisionId, document } = named(state.ptRevisions, command.receipt);
      const decisionId = await harness.approveDocument(document, HARNESS_ACTIONS.ptApproval, {
        kind: 'known',
        amountPaise: paise(command.pRatePaise * receipt.pieces.length),
      });
      return harness.step(
        document,
        'approve',
        { from: 'covered', to: 'approved' },
        [
          {
            kind: 'cost-established',
            lineId: line(),
            receiptOriginId: receipt.originId,
            ptRevisionId,
            pRatePaise: paise(command.pRatePaise),
          },
        ],
        { decisionId, actionType: HARNESS_ACTIONS.ptApproval },
      );
    }
    case 'transfer-approval': {
      // A transfer approved on cost reserves its pieces at the source (6.1; PRD-TRF-011).
      const from = places[command.from];
      const to = places[command.to];
      const pieces = piecesOf(state, command.pieces);
      const document = await harness.prepare(
        'transfer',
        from,
        [
          {
            lineId: line(),
            skuId,
            quantity: pieces.length,
            locationId: from.locationId,
            toLocationId: to.locationId,
            pieceCodes: pieces,
          },
        ],
        to,
      );
      const decisionId = await harness.approveDocument(document, HARNESS_ACTIONS.transfer, { kind: 'unknown' });
      const outcome = await harness.step(
        document,
        'approve',
        { from: 'prepared', to: 'approved' },
        [
          {
            kind: 'reserve',
            lineId: line(),
            reservationKind: 'transfer',
            at: from,
            goods: [{ skuId, quantity: pieces.length, pieceCodes: pieces }],
          },
        ],
        { decisionId, actionType: HARNESS_ACTIONS.transfer },
      );
      const reservationId = outcome.written.reservationIds[0];
      if (reservationId === undefined) throw new Error('no reservation');
      state.transfers.set(command.transfer, { document, reservationId, pieces });
      return outcome;
    }
    case 'dispatch':
    case 'arrival':
    case 'acceptance': {
      const transfer = named(state.transfers, command.transfer);
      const { document, pieces } = transfer;
      const to = document.to;
      if (to === undefined) throw new Error('A transfer has a destination');
      const goods = { skuId, quantity: pieces.length, pieceCodes: pieces };
      // The dispatch's identifier, the transit reference, is the transfer document's (13.10).
      const items: Record<typeof command.command, [string, string, LedgerItem]> = {
        dispatch: [
          'approved',
          'dispatched',
          {
            kind: 'dispatch',
            lineId: line(),
            dispatchId: document.id,
            reservationId: transfer.reservationId,
            from: document.from,
            to: unitOf(to),
            goods,
          },
        ],
        arrival: [
          'dispatched',
          'arrived',
          { kind: 'arrival-count', lineId: line(), dispatchId: document.id, from: unitOf(document.from), to, goods },
        ],
        acceptance: ['arrived', 'accepted', { kind: 'record-acceptance', lineId: line(), at: to, goods }],
      };
      const [from, next, item] = items[command.command];
      return harness.step(document, command.command, { from, to: next }, [item]);
    }
    case 'sale': {
      const at = places[command.at];
      const pieces = piecesOf(state, command.pieces);
      const document = await harness.prepare('sale', at, [
        { lineId: line(), skuId, quantity: pieces.length, locationId: at.locationId, pieceCodes: pieces },
      ]);
      const outcome = await harness.step(document, 'bill', { from: 'prepared', to: 'billed' }, [
        {
          kind: 'sale-issue',
          lineId: line(),
          at,
          handover: 'now',
          goods: { skuId, quantity: pieces.length, pieceCodes: pieces },
        },
      ]);
      const movementId = outcome.written.movementIds[0];
      if (movementId === undefined) throw new Error('no sale movement');
      state.sales.set(command.sale, { document, movementId });
      return outcome;
    }
    case 'customer-return': {
      const at = places[command.at];
      const sale = named(state.sales, command.sale);
      const pieces = piecesOf(state, command.pieces);
      const document = await harness.prepare('customer-return', at, [
        {
          lineId: line(),
          skuId,
          quantity: pieces.length,
          locationId: at.locationId,
          movementId: sale.movementId,
          pieceCodes: pieces,
        },
      ]);
      return harness.step(document, 'return', { from: 'prepared', to: 'returned' }, [
        {
          kind: 'customer-return',
          lineId: line(),
          saleMovementId: sale.movementId,
          to: at,
          condition: 'good',
          goods: { skuId, quantity: pieces.length, pieceCodes: pieces },
        },
      ]);
    }
    case 'cost-change': {
      // A late cost change, approved on its absolute amount (7.7; PRD-LED-016, POL-09.08).
      const receipt = named(state.receipts, command.receipt);
      const document = await harness.prepare('cost-change', receipt.at, [
        {
          lineId: line(),
          skuId,
          quantity: receipt.pieces.length,
          receiptOriginId: receipt.originId,
          amountPaise: command.amountPaise,
        },
      ]);
      const decisionId = await harness.approveDocument(document, HARNESS_ACTIONS.costChange, {
        kind: 'known',
        amountPaise: paise(Math.abs(command.amountPaise)),
      });
      return harness.step(
        document,
        'approve',
        { from: 'prepared', to: 'approved' },
        [
          {
            kind: 'cost-adjustment',
            lineId: line(),
            receiptOriginId: receipt.originId,
            amountPaise: paise(command.amountPaise),
          },
        ],
        { decisionId, actionType: HARNESS_ACTIONS.costChange },
      );
    }
    case 'supplier-return-approval': {
      const at = places[command.at];
      const pieces = piecesOf(state, command.pieces);
      const document = await harness.prepare('supplier-return', at, [
        { lineId: line(), skuId, quantity: pieces.length, locationId: at.locationId, pieceCodes: pieces },
      ]);
      const decisionId = await harness.approveDocument(document, HARNESS_ACTIONS.supplierReturn, {
        kind: 'unknown',
      });
      const outcome = await harness.step(
        document,
        'approve',
        { from: 'prepared', to: 'approved' },
        [
          {
            kind: 'reserve',
            lineId: line(),
            reservationKind: 'supplier-return',
            at,
            goods: [{ skuId, quantity: pieces.length, pieceCodes: pieces }],
          },
        ],
        { decisionId, actionType: HARNESS_ACTIONS.supplierReturn },
      );
      const reservationId = outcome.written.reservationIds[0];
      if (reservationId === undefined) throw new Error('no reservation');
      state.returns.set(command.return, { document, reservationId, pieces });
      return outcome;
    }
    case 'departure':
    case 'handover': {
      const shipment = named(state.returns, command.return);
      const { document, pieces } = shipment;
      const goods = { skuId, quantity: pieces.length, pieceCodes: pieces };
      // The shipment's identifier is the supplier-return document's (13.10).
      return command.command === 'departure'
        ? harness.step(document, 'depart', { from: 'approved', to: 'departed' }, [
            {
              kind: 'supplier-return-departure',
              lineId: line(),
              shipmentId: document.id,
              reservationId: shipment.reservationId,
              from: document.from,
              goods,
            },
          ])
        : harness.step(document, 'hand-over', { from: 'departed', to: 'handed-over' }, [
            { kind: 'supplier-handover', lineId: line(), shipmentId: document.id, from: unitOf(document.from), goods },
          ]);
    }
  }
}

/** The kinds of the movements a step wrote, sorted, read as the read-only role. */
async function movementKinds(database: string, written: Written): Promise<string[]> {
  if (written.movementIds.length === 0) return [];
  return asVerifier(database, async (client) =>
    (
      await client.query<{ kind: string }>('select kind from stock.movement where id = any($1::uuid[]) order by kind', [
        written.movementIds,
      ])
    ).rows.map((row) => row.kind),
  );
}

async function journalIds(database: string, bookId: string): Promise<Set<string>> {
  return asVerifier(
    database,
    async (client) =>
      new Set(
        (await client.query<{ id: string }>('select id from finance.journal where book_id = $1', [bookId])).rows.map(
          (row) => row.id,
        ),
      ),
  );
}

/**
 * The journals a command posted against the file (books-and-posting 16.2): each event kind and component's amount,
 * from the posting-source rows; each account's debits and credits, from the lines; where the inventory account's side
 * lies by place; every line of SKU X's brand at W1's or S1's unit (16.1).
 */
async function journalsAre(
  database: string,
  fixtures: HarnessFixtures,
  places: Record<PlaceName, At>,
  journals: readonly string[],
  expected: readonly ExpectedJournal[],
  label: string,
): Promise<void> {
  const { sources, lines } = await asVerifier(database, async (client) => ({
    sources: (
      await client.query<{ event_kind: string; component: string; amount: string }>(
        `select j.event_kind, s.component, sum(s.amount_paise)::text as amount
         from finance.posting_source s join finance.journal j on j.id = s.journal_id
         where j.id = any($1::uuid[]) group by 1, 2 order by 1, 2`,
        [journals],
      )
    ).rows,
    lines: (
      await client.query<{
        account_id: string;
        side: string;
        business_unit_id: string;
        brand_id: string;
        amount: string;
      }>(
        `select account_id, side, business_unit_id, brand_id, amount_paise::text as amount
         from finance.journal_line where journal_id = any($1::uuid[])`,
        [journals],
      )
    ).rows,
  }));
  const byComponent = new Map<string, number>();
  for (const each of expected) {
    const key = `${each.eventKind} ${each.component}`;
    byComponent.set(key, (byComponent.get(key) ?? 0) + each.amountPaise);
  }
  expect(
    Object.fromEntries(sources.map((row) => [`${row.event_kind} ${row.component}`, Number(row.amount)])),
    label,
  ).toEqual(Object.fromEntries(byComponent));
  const accountOf = new Map(Object.entries(fixtures.accounts).map(([code, id]) => [id, code]));
  const sides = (rows: readonly { account: string; side: string; amount: number }[]) => {
    const sums: Record<string, number> = {};
    for (const row of rows) sums[`${row.account} ${row.side}`] = (sums[`${row.account} ${row.side}`] ?? 0) + row.amount;
    return sums;
  };
  expect(
    sides(
      lines.map((row) => ({
        account: accountOf.get(row.account_id) ?? '?',
        side: row.side,
        amount: Number(row.amount),
      })),
    ),
    label,
  ).toEqual(
    sides(
      expected.flatMap((each) => [
        { account: each.debit, side: 'debit', amount: each.amountPaise },
        { account: each.credit, side: 'credit', amount: each.amountPaise },
      ]),
    ),
  );
  const unitName = new Map(Object.entries(places).map(([name, at]) => [at.businessUnitId, name]));
  for (const each of expected) {
    if (each.inventoryAt === undefined) continue;
    const side = each.debit === 'INV' ? 'debit' : 'credit';
    const at: Record<string, number> = {};
    for (const row of lines) {
      if (accountOf.get(row.account_id) !== 'INV' || row.side !== side) continue;
      const name = unitName.get(row.business_unit_id) ?? '?';
      at[name] = (at[name] ?? 0) + Number(row.amount);
    }
    expect(at, `${label}: inventory by place`).toEqual(each.inventoryAt);
  }
  for (const row of lines) {
    expect(row.brand_id, label).toBe(fixtures.sku.brandId);
    expect(unitName.has(row.business_unit_id), label).toBe(true);
  }
}
