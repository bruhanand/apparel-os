import { uuidv7 } from '@apparel-os/domain';
import {
  COMPARISON_RUN_TYPE,
  IMPORT_BATCH_TYPE,
  type ComparisonCounts,
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
import { comparisonLine, comparisonRun } from '../db/schema.js';
import { compareSets, type ComparisonKey, type ComparisonLineDraft, type ComparisonRow } from '../domain/comparison.js';
import { maskedField, maskPlan } from '../domain/masking.js';
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
// (section 11); the authority held at step 0; the batches locked shared at step 1 and read again; the rows read
// through each side's handler, or the count; the lines worked out; the run and its lines written with the audit record.

export interface RunComparisonInput {
  readonly actor: ImportActor;
  readonly key: string;
  readonly content: RequestContent;
  readonly body: RunComparisonRequest;
}

type BatchSet = 'manifest' | 'stock-on-hand';

/** A side as the request names it. */
type SideNamed =
  | { readonly kind: 'batch'; readonly set: BatchSet; readonly batchId: string }
  | { readonly kind: 'count'; readonly siteId: string; readonly businessUnitId: string };

/** The run kind's sides and key (10.3). */
function plannedRun(body: RunComparisonRequest): {
  readonly run: ComparisonRunKind;
  readonly key: ComparisonKey;
  readonly left: SideNamed;
  readonly right: SideNamed & { readonly kind: 'batch' };
} {
  switch (body.run) {
    case 'manifest-against-soh':
      return {
        run: body.run,
        key: 'barcode-then-sku',
        left: { kind: 'batch', set: 'manifest', batchId: body.manifest.batchId },
        right: { kind: 'batch', set: 'stock-on-hand', batchId: body.stockOnHand.batchId },
      };
    case 'count-against-manifest':
      return {
        run: body.run,
        key: 'sku-and-location',
        left: { kind: 'count', ...body.count },
        right: { kind: 'batch', set: 'manifest', batchId: body.manifest.batchId },
      };
    case 'count-against-soh':
      return {
        run: body.run,
        key: 'barcode-then-sku',
        left: { kind: 'count', ...body.count },
        right: { kind: 'batch', set: 'stock-on-hand', batchId: body.stockOnHand.batchId },
      };
  }
}

/** The batch kind a set's batches are of (4.1): a manifest is opening balance, an SOH historical reference. */
const KIND_OF_SET: Readonly<Record<BatchSet, BatchRow['kind']>> = {
  manifest: 'opening-balance',
  'stock-on-hand': 'historical-reference',
};

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
  if (side.kind === 'count') {
    if (deps.counts === undefined) {
      return refusalOf('unavailable', 'files-imports.comparison-count-unavailable', [{ kind: 'count-set' }]);
    }
    return side;
  }
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
        recordType: 'stock.balance',
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

/** The sides and the run's place, or the refusal. */
async function sidesOf(deps: ImportDependencies, context: TransactionContext, body: RunComparisonRequest) {
  const planned = plannedRun(body);
  const left = await resolved(deps, context, planned.left);
  if (isRefusal(left)) return left;
  const right = await resolved(deps, context, planned.right);
  if (isRefusal(right)) return right;
  const facts = runFacts(left, right);
  if (isRefusal(facts)) return facts;
  return { planned, left, right, facts };
}

/** One side's rows: the handler's rows of the batch's documents not excluded, or the count as of the run. */
async function rowsOf(
  deps: ImportDependencies,
  context: TransactionContext,
  side: Resolved,
): Promise<{ readonly rows: readonly ComparisonRow[]; readonly asOf?: string }> {
  if (side.kind === 'count') {
    if (deps.counts === undefined) return { rows: [] };
    return deps.counts.countAt(context, { siteId: side.siteId, businessUnitId: side.businessUnitId });
  }
  const documents = (await documentsOf(context, side.batch)).filter((each) => !each.excluded);
  return { rows: (await side.handler.comparison?.rows(context, documents)) ?? [] };
}

export function countsOf(lines: readonly Pick<ComparisonLineDraft, 'result'>[]): ComparisonCounts {
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

const quantityColumn = (side: ComparisonLineDraft['left']) => (side.state === 'listed' ? side.quantity : null);

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
    const sides = await sidesOf(deps, context, input.body);
    if (isRefusal(sides)) return { kind: 'refused', refusal: replayRefusal(sides) };
    const may = await authorised(deps, context, actorId, [sides.left, sides.right], sides.facts);
    return isRefusal(may) ? { kind: 'refused', refusal: replayRefusal(may) } : { kind: 'allowed' };
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
        const sides = await sidesOf(deps, context, input.body);
        if (isRefusal(sides)) return asRefusal(sides);
        const may = await authorised(deps, context, actorId, [sides.left, sides.right], sides.facts);
        if (isRefusal(may)) return asRefusal(may);
        const held = await deps.access.holdAuthority(context, { kind: 'user', id: actorId }, may.roleAssignmentId, {
          action: 'create',
          recordType: COMPARISON_RUN_TYPE,
          facts: sides.facts,
        });
        if (held !== undefined) return asRefusal(held);
        // Each batch side locked shared at step 1, so its version cannot change while it is read, and read again.
        const batches = [sides.left, sides.right].flatMap((side) => (side.kind === 'batch' ? [side.batch.id] : []));
        await context.lock(
          LOCK_STEP.document,
          [...new Set(batches)].map((id) => ({ table: BATCH_LOCK, id, mode: 'shared' as const })),
        );
        const again = await sidesOf(deps, context, input.body);
        if (isRefusal(again)) return asRefusal(again);
        const left = await rowsOf(deps, context, again.left);
        const right = await rowsOf(deps, context, again.right);
        const lines = compareSets(left.rows, right.rows, again.planned.key);
        const counts = countsOf(lines);
        const runId = uuidv7();
        const scope = {
          legalEntityId: again.facts.legalEntityId ?? null,
          siteId: again.facts.siteId ?? null,
          storeId: again.facts.storeId ?? null,
          businessUnitId: again.facts.businessUnitId ?? null,
        };
        const leftSide = again.left;
        const rightSide = again.right;
        if (rightSide.kind !== 'batch') throw new Error('The right side of a run is always a batch');
        await context.tx.insert(comparisonRun).values({
          id: runId,
          runKind: again.planned.run,
          comparisonKey: again.planned.key,
          leftSet: leftSide.kind === 'count' ? 'count' : 'manifest',
          leftBatchId: leftSide.kind === 'batch' ? leftSide.batch.id : null,
          leftBatchVersionId: leftSide.kind === 'batch' ? leftSide.batch.versionId : null,
          leftSiteId: leftSide.kind === 'count' ? leftSide.siteId : null,
          leftBusinessUnitId: leftSide.kind === 'count' ? leftSide.businessUnitId : null,
          leftAsOf: leftSide.kind === 'count' ? new Date(left.asOf ?? context.startedAt.toISOString()) : null,
          rightSet: rightSide.set,
          rightBatchId: rightSide.batch.id,
          rightBatchVersionId: rightSide.batch.versionId,
          counts,
          runByUserId: actorId,
          roleAssignmentId: may.roleAssignmentId,
          runAt: context.startedAt,
          ...scope,
        });
        if (lines.length > 0) {
          await context.tx.insert(comparisonLine).values(
            lines.map((line, index) => ({
              id: uuidv7(),
              runId,
              lineNumber: index + 1,
              keyedBy: line.keyedBy,
              barcode: line.barcode,
              skuId: line.skuId,
              locationId: line.locationId,
              leftState: line.left.state,
              leftQuantity: quantityColumn(line.left),
              rightState: line.right.state,
              rightQuantity: quantityColumn(line.right),
              result: line.result,
              leftRows: [...line.leftRows],
              rightRows: [...line.rightRows],
              ...scope,
            })),
          );
        }
        await deps.audit.record(context, {
          actor: { kind: 'user', id: actorId },
          roleAssignmentId: may.roleAssignmentId,
          scope: again.facts,
          record: { module: 'files-imports', type: COMPARISON_RUN_TYPE, id: runId },
          operation: 'run-comparison',
          changes: [
            { kind: 'value', field: 'run', before: null, after: again.planned.run },
            { kind: 'value', field: 'counts', before: null, after: { ...counts } },
          ],
          source: { kind: 'screen' },
          idempotencyKey: input.key,
        });
        return { kind: 'success', answer: { runId, counts: { ...counts } }, shows: 'nothing' };
      },
    },
  );
}
