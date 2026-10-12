import {
  COMPARISON_RUN_TYPE,
  IMPORT_BATCH_TYPE,
  STOCK_BALANCE_TYPE,
  type ComparisonCounts,
  type ComparisonKeyName,
  type ComparisonRunKind,
  type MissingItem,
  type RunComparisonRequest,
} from '@apparel-os/schemas';
import {
  LOCK_STEP,
  type CommandOutcome,
  type CommandRefusal,
  type IdempotentAnswer,
  type JsonValue,
  type ReplayAuthorisation,
  type RequestContent,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AuditScope } from '../../audit/index.js';
import type { ImportHandler } from '../contracts/import-handlers.js';
import { compareBalances, type BalanceLineDraft, type BalanceRow } from '../domain/balances.js';
import { compareSets, type ComparisonLineDraft, type ComparisonRow } from '../domain/comparison.js';
import { maskedField, maskPlan } from '../domain/masking.js';
import { keepRun, type WorkedLines } from './keep-comparison.js';
import {
  documentsOf,
  factsOfBatch,
  versionsOf,
  visibleBatch,
  type BatchRow,
  type ImportActor,
  type ImportDependencies,
} from './import-common.js';
import { BATCH_LOCK } from './validate-import.js';

// Run a comparison (imports-and-opening-data 2, 10.3, 13.1, 15.1; PRD-LIF-027, POL-14.07; S1-F13-T01): two sets
// compared by the key the run kind names, each difference listed, and the run kept with both sides as they were read,
// append-only. Neither side is ever changed: a batch side is only read, under a shared lock so its version cannot
// change while it is read, and a count side is read from the stock ledger's read model, as of the run.
//
// In the order of module-map 6.1: the sides as the actor may see them; Authorise create on the run with the places
// both sides hold, and view on each side with its own facts, the fields the comparison reads not masked for the reader
// (section 11); the authority held at step 0; the batches locked shared at step 1, then the sides, the authorisation
// and the masking checked again from what is read under the locks (code-house-rules 8.1); the rows read through each
// side's handler, or the count; the lines worked out; the run and its lines kept with the audit record
// (keep-comparison.ts).
//
// S1-F13-T02 adds the run of 10.4 (POL-14.03): an opening batch of dues, advances or deposits against the closed-books
// balances, by party and account, the closed books read only for the accounts the opening batch's handler holds, so
// each kind's totals are compared on their own (PRD-LIF-009).

export interface RunComparisonInput {
  readonly actor: ImportActor;
  readonly key: string;
  readonly content: RequestContent;
  readonly body: RunComparisonRequest;
}

/** The sets a batch side is: an opening manifest, the earlier POS's SOH, opening balances or the closed books. */
export type BatchSet = 'manifest' | 'stock-on-hand' | 'opening-balances' | 'closed-books';
/** The sets a run's left side may be: a count, a manifest or opening balances. */
export type LeftSet = 'count' | 'manifest' | 'opening-balances';
/** The sets a run's right side may be: a batch that is a manifest, an SOH or the closed books. */
export type RightSet = Exclude<BatchSet, 'opening-balances'>;

/**
 * Each run kind's key and sets, in one table (10.3, 10.4): the left side first, the right side always a batch. The
 * migration's check (`comparison_run_kind`) holds the same table.
 */
const RUNS = {
  'manifest-against-soh': { key: 'barcode-then-sku', left: 'manifest', right: 'stock-on-hand' },
  'count-against-manifest': { key: 'sku-and-location', left: 'count', right: 'manifest' },
  'count-against-soh': { key: 'barcode-then-sku', left: 'count', right: 'stock-on-hand' },
  'balances-against-closed-books': { key: 'party-and-account', left: 'opening-balances', right: 'closed-books' },
} as const satisfies Record<ComparisonRunKind, { key: ComparisonKeyName; left: LeftSet; right: RightSet }>;

/**
 * The batch kind each set's batches are of (4.1): a manifest and opening balances are opening balance; an SOH and the
 * closed-books balances, facts kept for checks only, historical reference.
 */
const KIND_OF_SET: Readonly<Record<BatchSet, BatchRow['kind']>> = {
  manifest: 'opening-balance',
  'stock-on-hand': 'historical-reference',
  'opening-balances': 'opening-balance',
  'closed-books': 'historical-reference',
};

/** A side as the request names it. */
type SideNamed =
  | { readonly kind: 'batch'; readonly set: BatchSet; readonly batchId: string }
  | { readonly kind: 'count'; readonly siteId: string; readonly businessUnitId: string };

interface PlannedRun {
  readonly run: ComparisonRunKind;
  readonly key: ComparisonKeyName;
  readonly left: SideNamed;
  readonly right: SideNamed & { readonly kind: 'batch' };
}

/** The run kind's sides and key (10.3, 10.4), from the request and `RUNS`. */
function plannedRun(body: RunComparisonRequest): PlannedRun {
  const { key } = RUNS[body.run];
  const batch = (set: BatchSet, named: { readonly batchId: string }) => ({
    kind: 'batch' as const,
    set,
    batchId: named.batchId,
  });
  const count = (named: { readonly siteId: string; readonly businessUnitId: string }) => ({
    kind: 'count' as const,
    ...named,
  });
  switch (body.run) {
    case 'manifest-against-soh': {
      const sets = RUNS[body.run];
      return { run: body.run, key, left: batch(sets.left, body.manifest), right: batch(sets.right, body.stockOnHand) };
    }
    case 'count-against-manifest':
      return { run: body.run, key, left: count(body.count), right: batch(RUNS[body.run].right, body.manifest) };
    case 'count-against-soh':
      return { run: body.run, key, left: count(body.count), right: batch(RUNS[body.run].right, body.stockOnHand) };
    case 'balances-against-closed-books': {
      const sets = RUNS[body.run];
      return { run: body.run, key, left: batch(sets.left, body.balances), right: batch(sets.right, body.closedBooks) };
    }
  }
}

type Resolved =
  | { readonly kind: 'batch'; readonly set: BatchSet; readonly batch: BatchRow; readonly handler: ImportHandler }
  | { readonly kind: 'count'; readonly siteId: string; readonly businessUnitId: string };

const refusalOf = (kind: CommandRefusal['kind'], code: string, missing: MissingItem[] = []): CommandRefusal => ({
  kind,
  code,
  missing,
});

/** A batch side as the actor may see it, of the set named: a batch of its kind, of a handler of that set, not Failed. */
async function resolved(
  deps: ImportDependencies,
  context: TransactionContext,
  side: SideNamed,
): Promise<Resolved | CommandRefusal> {
  if (side.kind === 'count') return side;
  const batch = await visibleBatch(context, side.batchId);
  if (batch === undefined) {
    return refusalOf('not-found', 'files-imports.comparison-set-not-found', [
      { kind: 'record', recordType: IMPORT_BATCH_TYPE, recordId: side.batchId },
    ]);
  }
  const handler = deps.handlers.ofTarget(batch.target);
  if (handler?.comparison?.set !== side.set || batch.kind !== KIND_OF_SET[side.set] || batch.state === 'Failed') {
    return refusalOf('refused', 'files-imports.comparison-set-wrong', [
      { kind: 'comparison-set', set: side.set, batchId: batch.id },
    ]);
  }
  return { kind: 'batch', set: side.set, batch, handler };
}

const FACTS = ['legalEntityId', 'siteId', 'storeId', 'businessUnitId'] as const;

/** A side's place: a batch's scope facts, or the count's unit at its Site. */
function factsOf(side: Resolved): AuditScope {
  return side.kind === 'batch'
    ? factsOfBatch(side.batch)
    : { siteId: side.siteId, businessUnitId: side.businessUnitId };
}

/**
 * The run's place (15.1): every fact either side holds. Two sides that name different values of one fact are of
 * different places and are not compared (`files-imports.comparison-places-differ`).
 */
function runFacts(left: Resolved, right: Resolved): AuditScope | CommandRefusal {
  const a = factsOf(left);
  const b = factsOf(right);
  const facts: Record<string, string> = {};
  for (const fact of FACTS) {
    const one = a[fact];
    const other = b[fact];
    if (one !== undefined && other !== undefined && one !== other) {
      return refusalOf('refused', 'files-imports.comparison-places-differ', [{ kind: 'scope-fact', fact }]);
    }
    const value = one ?? other;
    if (value !== undefined) facts[fact] = value;
  }
  return facts;
}

const isRefusal = (value: object): value is CommandRefusal => 'code' in value && 'missing' in value;

/** Authorise the run with its place, then view on each side with its own, the fields read not masked (section 11). */
async function authorised(
  deps: ImportDependencies,
  context: TransactionContext,
  actorId: string,
  sides: readonly Resolved[],
  facts: AuditScope,
): Promise<{ readonly roleAssignmentId: string } | CommandRefusal> {
  const run = await deps.access.authorise(context, {
    actorId,
    action: 'create',
    recordType: COMPARISON_RUN_TYPE,
    facts,
  });
  if (run.kind === 'refused') return run.refusal;
  for (const side of sides) {
    if (side.kind === 'count') {
      // The count is read under the reader's own authorisation (stock-ledger 13.6, 14.3): view on the balances of the
      // unit, every brand, so a partial count is never compared as a whole one.
      const view = await deps.access.authorise(context, {
        actorId,
        action: 'view',
        recordType: STOCK_BALANCE_TYPE,
        facts: factsOf(side),
      });
      if (view.kind === 'refused') return view.refusal;
      continue;
    }
    const view = await deps.access.authorise(context, {
      actorId,
      action: 'view',
      recordType: IMPORT_BATCH_TYPE,
      facts: factsOfBatch(side.batch),
    });
    if (view.kind === 'refused') return view.refusal;
    const restricted = await deps.access.restrictFields(
      context,
      { roleAssignmentId: view.roleAssignmentId, actorId, fieldClasses: side.batch.restrictedClasses },
      'view',
    );
    const versions = await versionsOf(context, side.batch);
    const plan = maskPlan({
      layoutConfirmed: versions.layout.state === 'Confirmed',
      masked: restricted.masked,
      layout: versions.structure,
      mapping: versions.fields,
      header: [],
    });
    for (const field of side.handler.comparison?.fields ?? []) {
      const fieldClass = maskedField(plan, field);
      if (fieldClass !== undefined) {
        return refusalOf('not-authorised', 'files-imports.comparison-side-masked', [
          { kind: 'field-class', fieldClass, batchId: side.batch.id },
        ]);
      }
    }
  }
  return { roleAssignmentId: run.roleAssignmentId };
}

interface Sides {
  readonly planned: PlannedRun;
  readonly left: Resolved;
  readonly right: Resolved & { readonly kind: 'batch' };
  readonly facts: AuditScope;
}

/** The sides and the run's place, or the refusal. */
async function sidesOf(
  deps: ImportDependencies,
  context: TransactionContext,
  body: RunComparisonRequest,
): Promise<Sides | CommandRefusal> {
  const planned = plannedRun(body);
  const left = await resolved(deps, context, planned.left);
  if (isRefusal(left)) return left;
  const right = await resolved(deps, context, planned.right);
  if (isRefusal(right)) return right;
  if (right.kind !== 'batch') throw new Error('The right side of a run is always a batch');
  const facts = runFacts(left, right);
  if (isRefusal(facts)) return facts;
  return { planned, left, right, facts };
}

/** The sides as the actor may see them and may compare them, or the refusal: the checks of step 0 and of 8.1. */
async function permittedSides(
  deps: ImportDependencies,
  context: TransactionContext,
  actorId: string,
  body: RunComparisonRequest,
): Promise<(Sides & { readonly roleAssignmentId: string }) | CommandRefusal> {
  const sides = await sidesOf(deps, context, body);
  if (isRefusal(sides)) return sides;
  const may = await authorised(deps, context, actorId, [sides.left, sides.right], sides.facts);
  if (isRefusal(may)) return may;
  return { ...sides, roleAssignmentId: may.roleAssignmentId };
}

/** The rows of a batch side's documents not excluded. */
async function documentsIn(context: TransactionContext, side: Resolved & { readonly kind: 'batch' }) {
  return (await documentsOf(context, side.batch)).filter((each) => !each.excluded);
}

/** One side's rows: the handler's rows of the batch's documents not excluded, or the count as of the run. */
async function rowsOf(
  deps: ImportDependencies,
  context: TransactionContext,
  side: Resolved,
): Promise<{ readonly rows: readonly ComparisonRow[]; readonly asOf?: string }> {
  if (side.kind === 'count') {
    return deps.counts.countAt(context, { siteId: side.siteId, businessUnitId: side.businessUnitId });
  }
  const comparison = side.handler.comparison;
  if (comparison === undefined || !('rows' in comparison)) return { rows: [] };
  return { rows: await comparison.rows(context, await documentsIn(context, side)) };
}

/** One batch side's balance rows (10.4): the handler's rows of the batch's documents not excluded. */
async function balancesOf(context: TransactionContext, side: Resolved): Promise<readonly BalanceRow[]> {
  if (side.kind !== 'batch') return [];
  const comparison = side.handler.comparison;
  if (comparison === undefined || !('balances' in comparison)) return [];
  return comparison.balances(context, await documentsIn(context, side));
}

/** The accounts an opening side's handler holds, to which the closed books are read (10.4). */
function accountsOf(side: Resolved): ReadonlySet<string> {
  const comparison = side.kind === 'batch' ? side.handler.comparison : undefined;
  return new Set(comparison !== undefined && 'balances' in comparison ? (comparison.accounts ?? []) : []);
}

/** The lines of the run: by the stock keys of 10.3, or by party and account (10.4). Reads; writes nothing. */
async function linesOf(deps: ImportDependencies, context: TransactionContext, sides: Sides): Promise<WorkedLines> {
  if (sides.planned.key === 'party-and-account') {
    const accounts = accountsOf(sides.left);
    const left = await balancesOf(context, sides.left);
    // The closed books hold every account of the book; each kind is compared with its own accounts only (PRD-LIF-009).
    const right = (await balancesOf(context, sides.right)).filter(
      (row) => row.account === null || accounts.has(row.account),
    );
    return { kind: 'balances', lines: compareBalances(left, right) };
  }
  const left = await rowsOf(deps, context, sides.left);
  const right = await rowsOf(deps, context, sides.right);
  return {
    kind: 'stock',
    lines: compareSets(left.rows, right.rows, sides.planned.key),
    ...(left.asOf === undefined ? {} : { asOf: left.asOf }),
  };
}

function countsOf(lines: readonly Pick<ComparisonLineDraft | BalanceLineDraft, 'result'>[]): ComparisonCounts {
  const counts: ComparisonCounts = {
    same: 0,
    different: 0,
    'not-listed-left': 0,
    'not-listed-right': 0,
    unknown: 0,
    unresolved: 0,
  };
  for (const line of lines) counts[line.result] += 1;
  return counts;
}

const asRefusal = (refusal: CommandRefusal): CommandOutcome<JsonValue> => ({
  kind: 'refusal',
  refusal,
  causedBySecret: false,
});

/** A replay refused: not found stays not found; anything else is not authorised now (code-house-rules 12.4). */
function replayRefusal(refusal: CommandRefusal) {
  return {
    kind: refusal.kind === 'not-found' ? ('not-found' as const) : ('not-authorised' as const),
    code: refusal.code,
    missing: refusal.missing,
  };
}

export async function runComparison(
  deps: ImportDependencies,
  input: RunComparisonInput,
): Promise<IdempotentAnswer<JsonValue>> {
  const actorId = input.actor.userId;
  // A replay's access check: create on the run now, with the places of its sides as the actor may see them.
  const authoriseReplay: ReplayAuthorisation = async (context) => {
    const permitted = await permittedSides(deps, context, actorId, input.body);
    return isRefusal(permitted) ? { kind: 'refused', refusal: replayRefusal(permitted) } : { kind: 'allowed' };
  };
  return deps.helper.run(
    {
      commandName: 'files-imports.run-comparison',
      organisation: input.actor.organisation,
      correlationId: input.actor.correlationId,
      actor: { kind: 'actor', actorId },
    },
    {
      key: input.key,
      content: input.content,
      authoriseReplay,
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        const first = await permittedSides(deps, context, actorId, input.body);
        if (isRefusal(first)) return asRefusal(first);
        const held = await deps.access.holdAuthority(context, { kind: 'user', id: actorId }, first.roleAssignmentId, {
          action: 'create',
          recordType: COMPARISON_RUN_TYPE,
          facts: first.facts,
        });
        if (held !== undefined) return asRefusal(held);
        // Each batch side locked shared at step 1, so its version cannot change while it is read.
        const batches = [first.left, first.right].flatMap((side) => (side.kind === 'batch' ? [side.batch.id] : []));
        await context.lock(
          LOCK_STEP.document,
          [...new Set(batches)].map((id) => ({ table: BATCH_LOCK, id, mode: 'shared' as const })),
        );
        // Under the locks, the sides read again and the authorisation and masking checked again from them, so a batch
        // or a grant changed before the lock is seen (code-house-rules 8.1).
        const sides = await permittedSides(deps, context, actorId, input.body);
        if (isRefusal(sides)) return asRefusal(sides);
        const worked = await linesOf(deps, context, sides);
        const counts = countsOf(worked.lines);
        const runId = await keepRun(deps, context, {
          idempotencyKey: input.key,
          actorId,
          roleAssignmentId: first.roleAssignmentId,
          run: sides.planned.run,
          comparisonKey: sides.planned.key,
          leftSet: RUNS[sides.planned.run].left,
          rightSet: RUNS[sides.planned.run].right,
          left:
            sides.left.kind === 'count'
              ? { kind: 'count', siteId: sides.left.siteId, businessUnitId: sides.left.businessUnitId }
              : { kind: 'batch', batchId: sides.left.batch.id, versionId: sides.left.batch.versionId },
          right: { batchId: sides.right.batch.id, versionId: sides.right.batch.versionId },
          facts: sides.facts,
          worked,
          counts,
        });
        return { kind: 'success', answer: { runId, counts: { ...counts } }, shows: 'nothing' };
      },
    },
  );
}
