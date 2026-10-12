import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { paise, uuidv7 } from '@apparel-os/domain';
import type { CostFormula, CostPoolMode } from '@apparel-os/schemas';
import { expect } from 'vitest';
import { custody, pieceByCode, type LedgerItem, type Written } from '../../../src/modules/stock/ledger/index.js';
import { HARNESS_ACTIONS, HARNESS_REJECT_DAMAGE } from '../../fixtures/stock-harness.js';
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
import {
  HARNESS_POSTING_REFUSED,
  type DocumentKind,
  type DocumentLine,
  type HarnessDocument,
  type HarnessFixtures,
  type SendOptions,
  type StepSent,
  type StockHarness,
} from './harness.js';
import type { Actor } from '../../support/stock-ledger.js';

// The scenario files of the stock harness and their runner (S1-F10 spec 3.4, 3.5; stock-ledger 15.1). A file is one
// scenario under one combination, in the style of the shared golden cases (shared-calculations 12.1): `synthetic`, the
// IDs it covers, its steps as the driver's document commands, the movement kinds and journals each command must
// produce or the refusal it must meet, the stock values after each step and the end trial balance. Its expected values
// are written by hand from stock-ledger 11.2 to 11.8 and books-and-posting 16.2 to 16.4, never produced by the code
// under test; amounts are integer paise (PRD-MOD-014). The files outlive the driver: when a later stage builds a real
// document, the same file runs with that document in place of the command (DEC-112).

export const SCENARIO_FOLDER = join(import.meta.dirname, 'scenarios');
/** The further scenarios of stock-ledger 11.8 and books-and-posting 16.4 (S1-F10-T06). */
export const FURTHER_FOLDER = join(SCENARIO_FOLDER, 'further');

/** A place of the scenarios (11.1): warehouse W1, Store S1, and a second location of S1's unit, S1B. */
export type PlaceName = 'W1' | 'S1' | 'S1B' | 'S2';

/**
 * Pieces of a receipt by position, such as `R1:0-3` (R1's first four) or `R1:0-2,R2:0-1`; positions are those of the
 * receipt's piece codes, in the order counted.
 */
export type PieceSet = string;

/** A quantity-tracked command names a quantity; a piece-tracked one its pieces. */
interface Goods {
  readonly pieces?: PieceSet;
  readonly quantity?: number;
}

/** One difference of a count (8.2 to 8.4). */
export type CountLine =
  | ({ readonly difference: 'loss'; readonly at: PlaceName } & Goods)
  | { readonly difference: 'gain'; readonly at: PlaceName; readonly quantity: number }
  | {
      readonly difference: 'piece-correction';
      readonly at: PlaceName;
      readonly found: PieceSet;
      readonly sale: string;
      readonly missing: PieceSet;
    };

export type ScenarioCommand =
  | {
      readonly command: 'receipt';
      readonly receipt: string;
      readonly at: PlaceName;
      readonly pieces?: number;
      readonly quantity?: number;
      /** Supplier-owned until sale (7.2; G6); owned by the Organisation otherwise. */
      readonly owner?: 'consignment';
      /** For a batch-tracked SKU: the batch's expiry, this many days after the business date (PRD-MER-011). */
      readonly expiresInDays?: number;
    }
  | { readonly command: 'receipt-acceptance'; readonly receipt: string }
  | { readonly command: 'pt-coverage'; readonly receipt: string; readonly pieces?: PieceSet }
  | { readonly command: 'pt-approval'; readonly receipt: string; readonly pRatePaise: number }
  | {
      readonly command: 'transfer-approval';
      readonly transfer: string;
      readonly from: PlaceName;
      readonly to: PlaceName;
      readonly pieces: PieceSet;
    }
  | { readonly command: 'dispatch' | 'arrival' | 'acceptance' | 'transfer-cancel'; readonly transfer: string }
  | ({
      readonly command: 'sale';
      readonly sale: string;
      readonly at: PlaceName;
      readonly agreedCostPaise?: number;
    } & Goods)
  | ({
      readonly command: 'customer-return';
      readonly return: string;
      readonly sale: string;
      readonly at: PlaceName;
    } & Goods)
  | { readonly command: 'cost-change'; readonly change: string; readonly receipt: string; readonly amountPaise: number }
  | {
      readonly command: 'supplier-return-approval';
      readonly return: string;
      readonly at: PlaceName;
      readonly pieces: PieceSet;
    }
  | { readonly command: 'departure'; readonly return: string }
  | { readonly command: 'handover' | 'rejection'; readonly return: string; readonly pieces?: PieceSet }
  | { readonly command: 'damage-report'; readonly damage: string; readonly at: PlaceName; readonly pieces: PieceSet }
  | { readonly command: 'damage-confirm' | 'damage-reject'; readonly damage: string }
  | { readonly command: 'disposal'; readonly disposal: string; readonly damage: string }
  | {
      readonly command: 'count-freeze';
      readonly count: string;
      readonly at: PlaceName;
      readonly locations: readonly PlaceName[];
    }
  | { readonly command: 'count-approval'; readonly count: string; readonly differences: readonly CountLine[] }
  | { readonly command: 'loss-link'; readonly link: string; readonly count: string; readonly quantity: number }
  | ({
      readonly command: 'reversal';
      readonly reversal: string;
      readonly receipt: string;
      readonly at: PlaceName;
    } & Goods)
  | ({ readonly command: 'earlier-pos-load'; readonly load: string; readonly at: PlaceName } & Goods)
  | { readonly command: 'lock-period' }
  | { readonly command: 'reopen-period'; readonly sale: string }
  | { readonly command: 'approve-map'; readonly eventKind: string };

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
  readonly movements?: readonly string[];
  readonly journals?: readonly ExpectedJournal[];
  /** The value approved on cost, in paise, or null for an Unknown value, where the command is approved (15.3). */
  readonly approvedPaise?: number | null;
  /** The refusal the command must meet, with nothing committed (13.8; SL-23 Outcome A). */
  readonly refused?: string;
  /** Raise the driver's exception after the refusal, in its own command (books-and-posting 10 step 3). */
  readonly raise?: true;
  /** Send again a step refused before, its document and approval as they stayed, under a new key (10 step 5). */
  readonly retry?: true;
};

/** A pool after a step: the book's, or a Site's (7.1), with its FIFO layers left as [quantity, value] (7.4). */
export interface ExpectedPool {
  readonly pool: 'book' | PlaceName;
  readonly quantity: number;
  readonly valuePaise: number;
  readonly layers?: readonly (readonly [number, number])[];
}

/** Custody at one place by receipt origin (13.6 "Custody"): a receipt's name, or `<count>:gain` for a surplus. */
export interface ExpectedCustody {
  readonly origin: string;
  readonly at: PlaceName;
  readonly quantity: number;
  /** Good unless named. */
  readonly condition?: string;
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
    /** Custody held at a place, every origin of the SKU with units there (13.6). */
    readonly custody?: readonly ExpectedCustody[];
    /** Whether named pieces are in custody (13.6 "Piece"). */
    readonly pieces?: Readonly<Record<string, boolean>>;
    /** The driver's exceptions raised so far (books-and-posting 10 step 3). */
    readonly exceptions?: number;
    /** The book's period states (books-and-posting 4.1). */
    readonly periods?: readonly string[];
  };
}

export interface Scenario {
  readonly id: string;
  readonly title: string;
  readonly synthetic: true;
  readonly covers: readonly string[];
  readonly sources: readonly string[];
  readonly combination: { readonly formula: CostFormula; readonly poolMode: CostPoolMode };
  readonly sku: { readonly pieceTracked: boolean; readonly batch?: boolean };
  /** The event kinds the book has no approved map for at the start (books-and-posting 16.4 P4). */
  readonly withoutMaps?: readonly string[];
  readonly steps: readonly ScenarioStep[];
  /** The end trial balance (books-and-posting 16.3), debit positive, credit negative. */
  readonly trialBalance: Readonly<Record<SyntheticAccount, number>>;
}

/** Every scenario file of a folder, by file name. */
export function loadScenarios(folder = SCENARIO_FOLDER): { readonly file: string; readonly scenario: Scenario }[] {
  return readdirSync(folder)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((file) => ({ file, scenario: JSON.parse(readFileSync(join(folder, file), 'utf8')) as Scenario }));
}

interface Receipt {
  readonly document: HarnessDocument;
  readonly originId: string;
  readonly pieces: string[];
  readonly quantity: number;
  readonly at: At;
}

/** A step to send again after its refusal (10 step 5): its document, its items and its approval as they stayed. */
export interface Pending {
  readonly document: HarnessDocument;
  readonly name: string;
  readonly transition: { readonly from: string; readonly to: string };
  readonly items: readonly LedgerItem[];
  readonly approval?: { readonly decisionId: string; readonly actionType: string };
  readonly importKind?: 'historical-reference';
  readonly after?: (sent: StepSent & { kind: 'written' }) => void;
}

/** Custody as the run reads it, by the names the scenario gives (13.6). */
interface CustodyRow {
  readonly origin: string;
  readonly at: string;
  readonly quantity: number;
  readonly condition?: string;
}

/** What the run knows by the names the scenario gives. */
interface RunState {
  readonly receipts: Map<string, Receipt>;
  /** Each receipt's PT revision, the PT approval document prepared at its coverage and the pieces it covers. */
  readonly ptRevisions: Map<string, { ptRevisionId: string; document: HarnessDocument; covered: number }>;
  readonly transfers: Map<string, { document: HarnessDocument; reservationId: string; pieces: string[] }>;
  readonly sales: Map<string, { document: HarnessDocument; movementId?: string }>;
  readonly returns: Map<string, { document: HarnessDocument; reservationId: string; pieces: string[] }>;
  readonly damages: Map<
    string,
    { document: HarnessDocument; holdId: string; pieces: string[]; at: At; quarantine?: string }
  >;
  readonly counts: Map<
    string,
    {
      document: HarnessDocument;
      holdId: string;
      at: At;
      lossMovementIds: string[];
      gains: { originId: string; at: At }[];
    }
  >;
  /** Origins by the name custody expectations give them (receipts, and count gains). */
  readonly originNames: Map<string, string>;
  readonly pending: Map<string, Pending>;
}

let pieceNumber = 0;

/** The places by name; S2 only where the fixtures made a second Store (S1-F10-T07). */
function placesOf(fixtures: HarnessFixtures): Record<PlaceName, At> {
  const places = { W1: fixtures.w1, S1: fixtures.s1, S1B: fixtures.s1b };
  return (fixtures.s2 === undefined ? places : { ...places, S2: fixtures.s2 }) as Record<PlaceName, At>;
}

function newRunState(): RunState {
  return {
    receipts: new Map(),
    ptRevisions: new Map(),
    transfers: new Map(),
    sales: new Map(),
    returns: new Map(),
    damages: new Map(),
    counts: new Map(),
    originNames: new Map(),
    pending: new Map(),
  };
}

/**
 * Scenario commands run one at a time, with no file's expectations, for the failure, concurrency and isolation suites
 * (S1-F10-T07; S1-F10 spec 3.6): a command's step is prepared (its document, approval and items), then sent, by the
 * preparer or another actor, as often and as concurrently as the test needs.
 */
export class ScenarioRun {
  readonly places: Record<PlaceName, At>;
  private readonly state = newRunState();

  constructor(
    readonly harness: StockHarness,
    readonly fixtures: HarnessFixtures,
    readonly pieceTracked: boolean,
  ) {
    this.places = placesOf(fixtures);
  }

  /** Prepares a command's document, approval and items, sending nothing (S1-F10 spec 3.2). */
  prepared(command: ScenarioStepCommand): Promise<Pending> {
    return plan(this.harness, this.fixtures, this.places, this.state, command, this.pieceTracked);
  }

  /** Sends a prepared step once, under a new key, as the actor given or the preparer (13.1). */
  async send(pending: Pending, options: SendOptions = {}): Promise<StepSent> {
    const sent = await this.harness.send(
      pending.document,
      pending.name,
      pending.transition,
      pending.items,
      pending.approval,
      {
        ...(pending.importKind === undefined ? {} : { importKind: pending.importKind }),
        ...options,
      },
    );
    if (sent.kind === 'written') pending.after?.(sent);
    return sent;
  }

  /** Prepares and sends a command; a housekeeping command (a lock, a reopening, a map) posts nothing. */
  async do(command: ScenarioStepCommand, as?: Actor): Promise<StepSent | undefined> {
    if (await housekeeping(this.harness, this.fixtures, this.state, command)) return undefined;
    return this.send(await this.prepared(command), as === undefined ? {} : { as });
  }

  /** Prepares and sends a command that must be written. */
  async done(command: ScenarioStepCommand, as?: Actor): Promise<StepSent & { kind: 'written' }> {
    const sent = await this.do(command, as);
    if (sent?.kind !== 'written') throw new Error(`${command.command} refused: ${JSON.stringify(sent)}`);
    return sent;
  }

  /** The piece codes a set names (`R1:0-3`). */
  pieces(set: PieceSet): string[] {
    return piecesOf(this.state, set);
  }

  /** A receipt's origin, by its name. */
  originOf(receipt: string): string {
    return named(this.state.receipts, receipt).originId;
  }

  /** A sale's movement, by its name. */
  saleMovementOf(sale: string): string | undefined {
    return named(this.state.sales, sale).movementId;
  }
}

/**
 * Runs a scenario through the driver in its own fixtures (S1-F10 spec 3.4, 3.5): each command posts, then its movement
 * kinds and journals are compared with the file, the checks of 3.5 run, and the same request sent again under its key
 * changes nothing (16.5; PRD-INT-002); a command that must be refused is, with nothing committed and the same answer on
 * a replay (SL-23 Outcome A). After each step its stock values are compared; at the end, the trial balance.
 */
export async function runScenario(harness: StockHarness, scenario: Scenario): Promise<HarnessFixtures> {
  expect(scenario.synthetic).toBe(true);
  const kinds = [...new Set(SYNTHETIC_MAP_KINDS)].filter((kind) => !(scenario.withoutMaps ?? []).includes(kind));
  const fixtures = await harness.fixtures(scenario.combination.formula, scenario.combination.poolMode, {
    pieceTracked: scenario.sku.pieceTracked,
    batch: scenario.sku.batch ?? false,
    ...(scenario.withoutMaps === undefined ? {} : { maps: kinds }),
  });
  const places = placesOf(fixtures);
  const state = newRunState();
  const actorId = harness.preparer.user.id;
  for (const step of scenario.steps) {
    for (const command of step.commands) {
      const label = `step ${step.step}, ${command.command}`;
      if (await housekeeping(harness, fixtures, state, command)) continue;
      const journalsBefore = await journalIds(harness.database, fixtures.bookId);
      const movementsBefore = await movementCount(harness.database);
      const balanceBefore = await trialBalance(harness, fixtures);
      const sent = await perform(harness, fixtures, places, state, command, scenario.sku.pieceTracked);
      if (command.refused !== undefined) {
        expect(sent.kind, label).toBe('refused');
        if (sent.kind !== 'refused') continue;
        expect(sent.refusal.code, `${label}: ${JSON.stringify(sent.refusal)}`).toBe(command.refused);
        // Nothing committed (PRD-INT-004): no movement, no journal, the same trial balance.
        expect(await movementCount(harness.database), label).toBe(movementsBefore);
        expect(await journalIds(harness.database, fixtures.bookId), label).toEqual(journalsBefore);
        expect(await trialBalance(harness, fixtures), label).toEqual(balanceBefore);
        await rebuilds(harness, actorId);
        // The same request again answers the refusal it kept (PRD-INT-002).
        expect(await sent.replay(), label).toMatchObject({ kind: 'refusal', refusal: { code: command.refused } });
        if (command.raise === true) await raiseOnce(harness, state, command, sent);
        continue;
      }
      if (sent.kind !== 'written') throw new Error(`${label} not written: ${JSON.stringify(sent)}`);
      expect(await movementKinds(harness.database, sent.written), label).toEqual([...(command.movements ?? [])].sort());
      const journals = [...(await journalIds(harness.database, fixtures.bookId))].filter(
        (id) => !journalsBefore.has(id),
      );
      await journalsAre(harness.database, fixtures, places, journals, command.journals ?? [], label);
      await rebuilds(harness, actorId);
      await reconciles(harness, actorId, fixtures);
      const balance = await accountsMatchLedger(harness, actorId, fixtures);
      await invariantsHold(harness.database);
      // A replay of the step changes nothing and answers the same identifiers (16.5; PRD-INT-002, PRD-INT-008).
      const replayed = await sent.replay();
      expect(replayed, label).toMatchObject({
        kind: 'success',
        replayed: true,
        answer: { movementIds: sent.written.movementIds },
      });
      expect(await trialBalance(harness, fixtures), label).toEqual(balance);
    }
    await stepIs(harness, fixtures, places, state, step);
  }
  expect(await trialBalance(harness, fixtures)).toEqual(scenario.trialBalance);
  return fixtures;
}

/** The kinds of the synthetic maps of books-and-posting 16.1 and those the further scenarios add (stock-valued.ts). */
const SYNTHETIC_MAP_KINDS = [
  'stock.cost-established',
  'stock.cost-adjustment',
  'stock.pool-dispatch',
  'stock.pool-arrival',
  'stock.sale-issue',
  'stock.customer-return',
  'stock.supplier-return-departure',
  'stock.supplier-handover',
  'stock.supplier-rejection-return',
  'stock.cost-established-reversal',
  'stock.count-loss',
  'stock.count-loss-reversal',
  'stock.disposal-loss',
  'stock.pass-through',
];

/** The commands that post nothing of the ledger's: a period lock, a reopening, a map approved (books-and-posting). */
async function housekeeping(
  harness: StockHarness,
  fixtures: HarnessFixtures,
  state: RunState,
  command: ScenarioStepCommand,
): Promise<boolean> {
  switch (command.command) {
    case 'lock-period':
      await harness.lockPeriod(fixtures.periodId);
      return true;
    case 'reopen-period':
      await harness.reopenPeriod(fixtures.periodId, named(state.sales, command.sale).document);
      return true;
    case 'approve-map':
      await harness.map(fixtures.bookId, fixtures.accounts, command.eventKind);
      return true;
    default:
      return false;
  }
}

/** The driver's exception after the refusal, keyed by the step's key; a second raise under it answers the first. */
async function raiseOnce(
  harness: StockHarness,
  state: RunState,
  command: ScenarioStepCommand,
  sent: StepSent & { kind: 'refused' },
) {
  const document = state.pending.get(pendingKey(command))?.document;
  if (document === undefined) throw new Error('No document to raise on');
  const first = await harness.raiseRefused(sent.key, document, sent.refusal);
  expect(first, JSON.stringify(first)).toMatchObject({ kind: 'done', value: { replayed: false } });
  const again = await harness.raiseRefused(sent.key, document, sent.refusal);
  expect(again).toMatchObject({
    kind: 'done',
    value: { replayed: true, exceptionId: first.kind === 'done' ? first.value.exceptionId : '' },
  });
}

/** The stock values after a step, against the file (11.2 to 11.8). */
async function stepIs(
  harness: StockHarness,
  fixtures: HarnessFixtures,
  places: Record<PlaceName, At>,
  state: RunState,
  step: ScenarioStep,
) {
  const actorId = harness.preparer.user.id;
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
  if (step.after.custody !== undefined) {
    const placeOf = (locationId: string | null) =>
      (Object.entries(places) as [PlaceName, At][]).find(([, at]) => at.locationId === locationId)?.[0] ?? '?';
    const originOf = new Map([...state.originNames].map(([name, id]) => [id, name]));
    const rows = await harness.run(actorId, (context) => custody(context, { skuId: fixtures.sku.skuId }));
    const kept = rows.rows
      .filter((row) => row.heldAs === 'custody')
      .map((row): CustodyRow => ({
        origin: originOf.get(row.receiptOriginId) ?? '?',
        at: placeOf(row.locationId),
        quantity: row.quantity,
        ...(row.condition === 'good' ? {} : { condition: row.condition }),
      }));
    const order = (a: { origin: string; at: string; condition?: string }, b: typeof a) =>
      `${a.origin}|${a.at}|${a.condition ?? ''}`.localeCompare(`${b.origin}|${b.at}|${b.condition ?? ''}`);
    expect(kept.sort(order), `custody after ${step.step}`).toEqual([...step.after.custody].sort(order));
  }
  for (const [set, inCustody] of Object.entries(step.after.pieces ?? {})) {
    for (const code of piecesOf(state, set)) {
      const found = await harness.run(actorId, (context) => pieceByCode(context, code));
      expect(found?.inCustody, `piece ${set} after ${step.step}`).toBe(inCustody);
    }
  }
  if (step.after.exceptions !== undefined) {
    expect(await exceptionCount(harness.database), `exceptions after ${step.step}`).toBe(step.after.exceptions);
  }
  if (step.after.periods !== undefined) {
    expect(await harness.periodStates(fixtures.bookId), `periods after ${step.step}`).toEqual(step.after.periods);
  }
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

/** The key a step refused is kept under, to send again (`retry`). */
function pendingKey(command: ScenarioCommand): string {
  const { command: kind, ...rest } = command as ScenarioCommand & Record<string, unknown>;
  const name = ['receipt', 'transfer', 'sale', 'return', 'damage', 'disposal', 'count', 'link', 'reversal', 'load']
    .map((field) => rest[field])
    .find((value) => typeof value === 'string');
  return `${kind}:${String(name)}`;
}

/** The value a command is approved on: the file's, or Unknown (15.3; PRD-ACS-016). */
function approvedValue(command: ScenarioStepCommand, fallback?: number) {
  const amount = command.approvedPaise === undefined ? fallback : command.approvedPaise;
  return amount === undefined || amount === null
    ? ({ kind: 'unknown' } as const)
    : ({ kind: 'known', amountPaise: paise(amount) } as const);
}

/**
 * One command of the driver (S1-F10 spec 3.2), with the ledger items its document's step sends: prepares and approves
 * what it needs, then sends the step once. A step refused is kept to send again (`retry`).
 */
async function perform(
  harness: StockHarness,
  fixtures: HarnessFixtures,
  places: Record<PlaceName, At>,
  state: RunState,
  command: ScenarioStepCommand,
  pieceTracked: boolean,
): Promise<StepSent> {
  const key = pendingKey(command);
  const pending =
    command.retry === true
      ? named(state.pending, key)
      : await plan(harness, fixtures, places, state, command, pieceTracked);
  const sent = await harness.send(
    pending.document,
    pending.name,
    pending.transition,
    pending.items,
    pending.approval,
    pending.importKind === undefined ? {} : { importKind: pending.importKind },
  );
  if (sent.kind === 'refused') state.pending.set(key, pending);
  else if (sent.kind === 'written') pending.after?.(sent);
  return sent;
}

async function approve(
  harness: StockHarness,
  document: HarnessDocument,
  actionType: string,
  value: ReturnType<typeof approvedValue>,
) {
  return { decisionId: await harness.approveDocument(document, actionType, value), actionType };
}

/** Prepares a command's document and its step (S1-F10 spec 3.2). */
async function plan(
  harness: StockHarness,
  fixtures: HarnessFixtures,
  places: Record<PlaceName, At>,
  state: RunState,
  command: ScenarioStepCommand,
  pieceTracked: boolean,
): Promise<Pending> {
  const skuId = fixtures.sku.skuId;
  const line = () => uuidv7();
  /** A command's goods: its pieces, or a quantity of the SKU, of an origin when named (13.3). */
  const goodsOf = (goods: Goods, receiptOriginId?: string) => {
    if (goods.pieces !== undefined) {
      const pieceCodes = piecesOf(state, goods.pieces);
      return { skuId, quantity: pieceCodes.length, pieceCodes };
    }
    return { skuId, quantity: goods.quantity ?? 0, ...(receiptOriginId === undefined ? {} : { receiptOriginId }) };
  };
  const lineOf = (
    goods: { quantity: number; pieceCodes?: readonly string[] },
    at?: At,
    more: Partial<DocumentLine> = {},
  ) => ({
    lineId: line(),
    skuId,
    quantity: goods.quantity,
    ...(at === undefined ? {} : { locationId: at.locationId }),
    ...(goods.pieceCodes === undefined ? {} : { pieceCodes: goods.pieceCodes }),
    ...more,
  });
  const prepare = (kind: DocumentKind, at: At, lines: readonly DocumentLine[], to?: At) =>
    harness.prepare(kind, at, lines, to);
  switch (command.command) {
    case 'receipt': {
      // A GRN count: the pieces or the quantity counted at the receiving Site (2.3).
      const at = places[command.at];
      const quantity = command.pieces ?? command.quantity ?? 0;
      const pieceCodes = pieceTracked
        ? Array.from({ length: quantity }, () => syntheticCode(`HPIECE-${String(++pieceNumber)}`))
        : undefined;
      const goods = { quantity, ...(pieceCodes === undefined ? {} : { pieceCodes }) };
      const document = await prepare('receipt', at, [lineOf(goods, at)]);
      const batch =
        command.expiresInDays === undefined
          ? undefined
          : {
              code: syntheticCode(`BATCH-${String(++pieceNumber)}`),
              expiryDate: harness.setup.day(command.expiresInDays),
            };
      return {
        document,
        name: 'count',
        transition: { from: 'prepared', to: 'counted' },
        items: [
          {
            kind: 'receipt-count',
            lineId: line(),
            skuId,
            quantity,
            to: at,
            condition: 'good',
            owner:
              command.owner === 'consignment'
                ? {
                    kind: 'supplier',
                    partyId: harness.syntheticSupplier,
                    agreementVersionId: harness.syntheticAgreement,
                  }
                : { kind: 'organisation', legalEntityId: fixtures.legalEntityId },
            ...(pieceCodes === undefined ? {} : { pieceCodes }),
            ...(batch === undefined ? {} : { batch }),
          },
        ],
        after: (sent) => {
          const originId = sent.written.receiptOriginIds[0];
          if (originId === undefined) throw new Error('no receipt origin');
          state.receipts.set(command.receipt, { document, originId, pieces: pieceCodes ?? [], quantity, at });
          state.originNames.set(command.receipt, originId);
        },
      };
    }
    case 'receipt-acceptance': {
      // The counted goods barcode-verified and physically accepted at the receiving Site (13.5; PRD-REC-021).
      const receipt = named(state.receipts, command.receipt);
      const goods = pieceTracked
        ? { skuId, quantity: receipt.pieces.length, pieceCodes: receipt.pieces }
        : { skuId, quantity: receipt.quantity, receiptOriginId: receipt.originId };
      return {
        document: receipt.document,
        name: 'accept',
        transition: { from: 'counted', to: 'accepted' },
        items: [{ kind: 'record-acceptance', lineId: line(), at: receipt.at, goods }],
      };
    }
    case 'pt-coverage': {
      // The PT revision covering the receipt (13.5; PRD-PTW-010): recorded before its approval establishes cost.
      const receipt = named(state.receipts, command.receipt);
      const ptRevisionId = uuidv7();
      const pieceCodes = pieceTracked
        ? command.pieces === undefined
          ? receipt.pieces
          : piecesOf(state, command.pieces)
        : undefined;
      const covered = pieceCodes?.length ?? receipt.quantity;
      const document = await prepare('pt-approval', receipt.at, [
        lineOf({ quantity: covered, ...(pieceCodes === undefined ? {} : { pieceCodes }) }, undefined, {
          receiptOriginId: receipt.originId,
        }),
      ]);
      state.ptRevisions.set(command.receipt, { ptRevisionId, document, covered });
      return {
        document,
        name: 'cover',
        transition: { from: 'prepared', to: 'covered' },
        items: [
          {
            kind: 'record-coverage',
            lineId: line(),
            ptRevisionId,
            receiptOriginId: receipt.originId,
            ...(pieceCodes === undefined ? { quantity: covered } : { pieceCodes }),
          },
        ],
      };
    }
    case 'pt-approval': {
      // PT approval establishes the origin's cost at the P RATE: independent, on the covered quantity's cost (7.6).
      const receipt = named(state.receipts, command.receipt);
      const { ptRevisionId, document, covered } = named(state.ptRevisions, command.receipt);
      const approval = await approve(
        harness,
        document,
        HARNESS_ACTIONS.ptApproval,
        approvedValue(command, command.pRatePaise * covered),
      );
      return {
        document,
        name: 'approve',
        transition: { from: 'covered', to: 'approved' },
        items: [
          {
            kind: 'cost-established',
            lineId: line(),
            receiptOriginId: receipt.originId,
            ptRevisionId,
            pRatePaise: paise(command.pRatePaise),
          },
        ],
        approval,
      };
    }
    case 'transfer-approval': {
      // A transfer approved on cost reserves its pieces at the source (6.1; PRD-TRF-011).
      const from = places[command.from];
      const to = places[command.to];
      const pieces = piecesOf(state, command.pieces);
      const goods = { skuId, quantity: pieces.length, pieceCodes: pieces };
      const document = await prepare('transfer', from, [lineOf(goods, from, { toLocationId: to.locationId })], to);
      const approval = await approve(harness, document, HARNESS_ACTIONS.transfer, approvedValue(command));
      return {
        document,
        name: 'approve',
        transition: { from: 'prepared', to: 'approved' },
        items: [{ kind: 'reserve', lineId: line(), reservationKind: 'transfer', at: from, goods: [goods] }],
        approval,
        after: (sent) => {
          const reservationId = sent.written.reservationIds[0];
          if (reservationId === undefined) throw new Error('no reservation');
          state.transfers.set(command.transfer, { document, reservationId, pieces });
        },
      };
    }
    case 'dispatch':
    case 'arrival':
    case 'acceptance':
    case 'transfer-cancel': {
      const transfer = named(state.transfers, command.transfer);
      const { document, pieces } = transfer;
      const to = document.to;
      if (to === undefined) throw new Error('A transfer has a destination');
      const goods = { skuId, quantity: pieces.length, pieceCodes: pieces };
      // The dispatch's identifier, the transit reference, is the transfer document's (13.10).
      const steps: Record<typeof command.command, [string, string, LedgerItem]> = {
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
        // An explicit cancellation ends the transfer's reservation, and nothing else (6.1; PRD-TRF-022).
        'transfer-cancel': [
          'approved',
          'cancelled',
          { kind: 'end-reservation', lineId: line(), reservationId: transfer.reservationId, event: 'cancelled' },
        ],
      };
      const [from, next, item] = steps[command.command];
      return { document, name: command.command, transition: { from, to: next }, items: [item] };
    }
    case 'sale': {
      const at = places[command.at];
      const goods = goodsOf(command);
      const document = await prepare('sale', at, [lineOf(goods, at)]);
      state.sales.set(command.sale, { document });
      return {
        document,
        name: 'bill',
        transition: { from: 'prepared', to: 'billed' },
        items: [
          {
            kind: 'sale-issue',
            lineId: line(),
            at,
            handover: 'now',
            goods,
            ...(command.agreedCostPaise === undefined ? {} : { agreedCostPaise: paise(command.agreedCostPaise) }),
          },
        ],
        after: (sent) => {
          const movementId = sent.written.movementIds[0];
          if (movementId === undefined) throw new Error('no sale movement');
          state.sales.set(command.sale, { document, movementId });
        },
      };
    }
    case 'customer-return': {
      const at = places[command.at];
      const sale = named(state.sales, command.sale);
      if (sale.movementId === undefined) throw new Error(`Sale ${command.sale} was not billed`);
      const goods = goodsOf(command);
      const document = await prepare('customer-return', at, [lineOf(goods, at, { movementId: sale.movementId })]);
      return {
        document,
        name: 'return',
        transition: { from: 'prepared', to: 'returned' },
        items: [
          {
            kind: 'customer-return',
            lineId: line(),
            saleMovementId: sale.movementId,
            to: at,
            condition: 'good',
            goods,
          },
        ],
      };
    }
    case 'cost-change': {
      // A late cost change, approved on its absolute amount (7.7; PRD-LED-016, POL-09.08).
      const receipt = named(state.receipts, command.receipt);
      const document = await prepare('cost-change', receipt.at, [
        lineOf({ quantity: receipt.pieces.length || receipt.quantity }, undefined, {
          receiptOriginId: receipt.originId,
          amountPaise: command.amountPaise,
        }),
      ]);
      const approval = await approve(
        harness,
        document,
        HARNESS_ACTIONS.costChange,
        approvedValue(command, Math.abs(command.amountPaise)),
      );
      return {
        document,
        name: 'approve',
        transition: { from: 'prepared', to: 'approved' },
        items: [
          {
            kind: 'cost-adjustment',
            lineId: line(),
            receiptOriginId: receipt.originId,
            amountPaise: paise(command.amountPaise),
          },
        ],
        approval,
      };
    }
    case 'supplier-return-approval': {
      const at = places[command.at];
      const pieces = piecesOf(state, command.pieces);
      const goods = { skuId, quantity: pieces.length, pieceCodes: pieces };
      const document = await prepare('supplier-return', at, [lineOf(goods, at)]);
      const approval = await approve(harness, document, HARNESS_ACTIONS.supplierReturn, approvedValue(command));
      return {
        document,
        name: 'approve',
        transition: { from: 'prepared', to: 'approved' },
        items: [{ kind: 'reserve', lineId: line(), reservationKind: 'supplier-return', at, goods: [goods] }],
        approval,
        after: (sent) => {
          const reservationId = sent.written.reservationIds[0];
          if (reservationId === undefined) throw new Error('no reservation');
          state.returns.set(command.return, { document, reservationId, pieces });
        },
      };
    }
    case 'departure': {
      const shipment = named(state.returns, command.return);
      const { document, pieces } = shipment;
      // The shipment's identifier is the supplier-return document's (13.10).
      return {
        document,
        name: 'depart',
        transition: { from: 'approved', to: 'departed' },
        items: [
          {
            kind: 'supplier-return-departure',
            lineId: line(),
            shipmentId: document.id,
            reservationId: shipment.reservationId,
            from: document.from,
            goods: { skuId, quantity: pieces.length, pieceCodes: pieces },
          },
        ],
      };
    }
    case 'handover':
    case 'rejection': {
      // Part handed over, part refused and counted back at the Site it left (7.8; PRD-TRF-020, PRD-OFR-014): each a
      // step of the return shipment, which stays departed until its last units leave it.
      const shipment = named(state.returns, command.return);
      const { document } = shipment;
      const pieces = command.pieces === undefined ? shipment.pieces : piecesOf(state, command.pieces);
      const goods = { skuId, quantity: pieces.length, pieceCodes: pieces };
      const item: LedgerItem =
        command.command === 'handover'
          ? { kind: 'supplier-handover', lineId: line(), shipmentId: document.id, from: unitOf(document.from), goods }
          : {
              kind: 'supplier-rejection-return',
              lineId: line(),
              shipmentId: document.id,
              from: unitOf(document.from),
              to: document.from,
              goods,
            };
      return {
        document,
        name: `${command.command}-${String(++pieceNumber)}`,
        transition: { from: 'departed', to: 'departed' },
        items: [item],
      };
    }
    case 'damage-report': {
      // A damage report holds the goods at once, before confirmation (6.1; PRD-DMG-001, PRD-ACP-005).
      const at = places[command.at];
      const pieces = piecesOf(state, command.pieces);
      const goods = { skuId, quantity: pieces.length, pieceCodes: pieces };
      const document = await prepare('damage', at, [lineOf(goods, at)]);
      return {
        document,
        name: 'report',
        transition: { from: 'prepared', to: 'reported' },
        items: [
          {
            kind: 'place-hold',
            lineId: line(),
            holdKind: 'damage',
            reason: 'SYNTHETIC damage seen on the floor',
            at,
            condition: 'good',
            goods: [goods],
          },
        ],
        after: (sent) => {
          const holdId = sent.written.holdIds[0];
          if (holdId === undefined) throw new Error('no damage hold');
          state.damages.set(command.damage, { document, holdId, pieces, at });
        },
      };
    }
    case 'damage-confirm': {
      // Confirmed: the damage hold ends by its own event; the goods become damaged and are quarantined (6.1, 13.4,
      // 13.5; PRD-DMG-006, PRD-DMG-010), under an independent approval on their cost.
      const damage = named(state.damages, command.damage);
      const goods = { skuId, quantity: damage.pieces.length, pieceCodes: damage.pieces };
      const approval = await approve(harness, damage.document, HARNESS_ACTIONS.damage, approvedValue(command));
      return {
        document: damage.document,
        name: 'confirm',
        transition: { from: 'reported', to: 'confirmed' },
        items: [
          { kind: 'release-hold', lineId: line(), holdId: damage.holdId, event: 'damage-confirmed' },
          { kind: 'condition-change', lineId: line(), at: damage.at, from: 'good', to: 'damaged', goods },
          {
            kind: 'place-hold',
            lineId: line(),
            holdKind: 'quarantine',
            reason: 'SYNTHETIC damaged goods quarantined',
            at: damage.at,
            condition: 'damaged',
            goods: [goods],
          },
        ],
        approval,
        after: (sent) => {
          const quarantine = sent.written.holdIds.find((id) => id !== damage.holdId);
          if (quarantine === undefined) throw new Error('no quarantine hold');
          damage.quarantine = quarantine;
        },
      };
    }
    case 'damage-reject': {
      // Rejected by a different person: only the damage hold ends (6.2; PRD-DMG-003).
      const damage = named(state.damages, command.damage);
      const approval = {
        decisionId: await harness.approveDocument(damage.document, HARNESS_REJECT_DAMAGE, { kind: 'none' }),
        actionType: HARNESS_REJECT_DAMAGE,
      };
      return {
        document: damage.document,
        name: 'reject',
        transition: { from: 'reported', to: 'rejected' },
        items: [{ kind: 'release-hold', lineId: line(), holdId: damage.holdId, event: 'report-rejected' }],
        approval,
      };
    }
    case 'disposal': {
      // The quarantined goods disposed of under an approved decision (7.9; PRD-DMG-012, PRD-DMG-016).
      const damage = named(state.damages, command.damage);
      if (damage.quarantine === undefined) throw new Error(`Damage ${command.damage} was not confirmed`);
      const goods = { skuId, quantity: damage.pieces.length, pieceCodes: damage.pieces };
      const document = await prepare('disposal', damage.at, [lineOf(goods, damage.at)]);
      const approval = await approve(harness, document, HARNESS_ACTIONS.disposal, approvedValue(command));
      return {
        document,
        name: 'dispose',
        transition: { from: 'prepared', to: 'disposed' },
        items: [
          {
            kind: 'disposal',
            lineId: line(),
            at: damage.at,
            condition: 'damaged',
            holdId: damage.quarantine,
            goods,
          },
        ],
        approval,
      };
    }
    case 'count-freeze': {
      // A count freezes its scope at the unit before counting (8.1; PRD-STK-008, PRD-STK-009).
      const at = places[command.at];
      const document = await prepare('count', at, [lineOf({ quantity: 1 }, at)]);
      return {
        document,
        name: 'freeze',
        transition: { from: 'prepared', to: 'frozen' },
        items: [
          {
            kind: 'start-count-freeze',
            lineId: line(),
            siteId: at.siteId,
            businessUnitId: at.businessUnitId,
            reason: 'SYNTHETIC cycle count',
            scope: command.locations.map((name) => ({ locationId: places[name].locationId })),
          },
        ],
        after: (sent) => {
          const holdId = sent.written.holdIds[0];
          if (holdId === undefined) throw new Error('no count freeze');
          state.counts.set(command.count, { document, holdId, at, lossMovementIds: [], gains: [] });
        },
      };
    }
    case 'count-approval': {
      // Only the approval posts the differences (8.2; PRD-STK-012): each its item, then the freeze ends (13.5).
      const count = named(state.counts, command.count);
      const items: LedgerItem[] = command.differences.map((difference): LedgerItem => {
        const at = places[difference.at];
        if (difference.difference === 'piece-correction') {
          const sale = named(state.sales, difference.sale);
          const [found] = piecesOf(state, difference.found);
          const [missing] = piecesOf(state, difference.missing);
          return {
            kind: 'piece-correction',
            lineId: line(),
            foundPieceCode: found ?? '',
            movementId: sale.movementId ?? '',
            missingPieceCode: missing ?? '',
            at,
            countId: count.holdId,
          };
        }
        const goods = difference.difference === 'gain' ? { skuId, quantity: difference.quantity } : goodsOf(difference);
        return {
          kind: 'count-difference',
          lineId: line(),
          countId: count.holdId,
          at,
          condition: 'good',
          difference: difference.difference,
          reason: `SYNTHETIC count ${difference.difference}`,
          goods,
        };
      });
      items.push({ kind: 'end-count-freeze', lineId: line(), holdId: count.holdId });
      const approval = await approve(harness, count.document, HARNESS_ACTIONS.count, approvedValue(command));
      return {
        document: count.document,
        name: 'approve',
        transition: { from: 'frozen', to: 'approved' },
        items,
        approval,
        after: (sent) => {
          // The written movements follow the items: a loss, or a gain with its surplus origin (8.3, 8.4).
          let movement = 0;
          let origin = 0;
          command.differences.forEach((difference) => {
            if (difference.difference === 'piece-correction') {
              movement += 2;
              return;
            }
            const id = sent.written.movementIds[movement++] ?? '';
            if (difference.difference === 'loss') count.lossMovementIds.push(id);
            else {
              const originId = sent.written.receiptOriginIds[origin++] ?? '';
              count.gains.push({ originId, at: places[difference.at] });
              state.originNames.set(`${command.count}:gain`, originId);
            }
          });
        },
      };
    }
    case 'loss-link': {
      // The approver links the count's surplus to its recorded loss (8.4; PRD-STK-014): the excess hold ends by its
      // link to the loss, and the loss is reversed for the units found, at the cost it took, in their place.
      const count = named(state.counts, command.count);
      const [gain] = count.gains;
      const [loss] = count.lossMovementIds;
      if (gain === undefined || loss === undefined) throw new Error('No gain and loss to link');
      const goods = { skuId, quantity: command.quantity };
      const document = await prepare('reversal', gain.at, [lineOf(goods, gain.at, { movementId: loss })]);
      const excess = await harness.excessHoldOf(gain.originId);
      const approval = await approve(harness, document, HARNESS_ACTIONS.count, approvedValue(command));
      return {
        document,
        name: 'link',
        transition: { from: 'prepared', to: 'linked' },
        items: [
          { kind: 'release-hold', lineId: line(), holdId: excess, event: 'loss-link' },
          {
            kind: 'reversal',
            lineId: line(),
            movementId: loss,
            at: gain.at,
            goods,
            replacesOriginId: gain.originId,
          },
        ],
        approval,
      };
    }
    case 'reversal': {
      // A receipt count found wrong after later steps, reversed under approval (7.5; PRD-LED-018, PRD-ACS-014).
      const receipt = named(state.receipts, command.receipt);
      const at = places[command.at];
      const goods = goodsOf(command, pieceTracked ? undefined : receipt.originId);
      const counted = await harness.receiptMovementOf(receipt.originId);
      const document = await prepare('reversal', at, [lineOf(goods, at, { movementId: counted })]);
      const approval = await approve(harness, document, HARNESS_ACTIONS.reversal, approvedValue(command));
      return {
        document,
        name: 'reverse',
        transition: { from: 'prepared', to: 'reversed' },
        items: [{ kind: 'reversal', lineId: line(), movementId: counted, at, goods }],
        approval,
      };
    }
    case 'earlier-pos-load': {
      // The earlier POS's sales report and SOH, loaded for checking only: a source of historical reference, which
      // never moves stock (9; PRD-LIF-014, PRD-IMP-010).
      const at = places[command.at];
      const goods = goodsOf(command);
      const document = await prepare('earlier-pos-report', at, [lineOf(goods, at)]);
      return {
        document,
        name: 'load',
        transition: { from: 'prepared', to: 'loaded' },
        items: [{ kind: 'sale-issue', lineId: line(), at, handover: 'now', goods }],
        importKind: 'historical-reference',
      };
    }
    case 'lock-period':
    case 'reopen-period':
    case 'approve-map':
      throw new Error(`${command.command} posts no step`);
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

async function movementCount(database: string): Promise<number> {
  return asVerifier(
    database,
    async (client) =>
      (await client.query<{ n: number }>('select count(*)::integer as n from stock.movement')).rows[0]?.n ?? 0,
  );
}

async function exceptionCount(database: string): Promise<number> {
  return asVerifier(
    database,
    async (client) =>
      (
        await client.query<{ n: number }>(
          `select count(*)::integer as n from exceptions.exception e
           join exceptions.exception_type t on t.id = e.exception_type_id where t.code = $1`,
          [HARNESS_POSTING_REFUSED.code],
        )
      ).rows[0]?.n ?? 0,
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
  const unitName = new Map(
    (Object.entries(places) as [PlaceName, At][])
      .filter(([name]) => name !== 'S1B')
      .map(([name, at]) => [at.businessUnitId, name]),
  );
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
