import {
  COMPARISON_RUN_TYPE,
  type ComparisonBalanceLine,
  type ComparisonLine,
  type ComparisonRunList,
  type ComparisonRunRead,
  type ComparisonSide,
} from '@apparel-os/schemas';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { ApiRefusal, scopeFactsOf, type TransactionContext } from '../../../kernel/index.js';
import type { ImportDependencies } from '../commands/import-common.js';
import { comparisonBalanceLine, comparisonLine, comparisonRun, importBatch } from '../db/schema.js';

// The comparison runs read model (imports-and-opening-data 10.3, 14; PRD-LIF-027, PRD-SEC-005; S1-F13-T01): each run
// the reader may see, newest first, with both sides as the run kept them and its counts by result; and one run with
// every line. Row-level security shows only the runs inside the reader's scope, and Authorise checks view on each run
// with its places under the reader's own assignment. The lines hold keys and quantities only; a run of opening
// balances against the closed books (10.4; S1-F13-T02) has balance lines instead, holding book, account, party code and
// totals in paise, never a customer's name (section 11).

type RunRow = typeof comparisonRun.$inferSelect;

function notAuthorised(code: string, missing: readonly { readonly kind: string }[]): never {
  throw new ApiRefusal({ kind: 'not-authorised', code, missing: [...missing] });
}

const factsOfRun = (run: RunRow) =>
  scopeFactsOf({
    legalEntityId: run.legalEntityId,
    siteId: run.siteId,
    storeId: run.storeId,
    businessUnitId: run.businessUnitId,
  });

/** The codes of the batches the runs name, whatever the reader's scope of batches: a code identifies, it holds no data. */
async function batchCodes(context: TransactionContext, runs: readonly RunRow[]): Promise<Map<string, string>> {
  const ids = [
    ...new Set(runs.flatMap((run) => [run.leftBatchId, run.rightBatchId].filter((id): id is string => id !== null))),
  ];
  if (ids.length === 0) return new Map();
  const rows = await context.tx
    .select({ id: importBatch.id, code: importBatch.code })
    .from(importBatch)
    .where(inArray(importBatch.id, ids));
  return new Map(rows.map((row) => [row.id, row.code]));
}

function sidesOf(run: RunRow, codes: ReadonlyMap<string, string>): { left: ComparisonSide; right: ComparisonSide } {
  const batchSide = (
    set: 'manifest' | 'stock-on-hand' | 'opening-balances' | 'closed-books',
    batchId: string,
    versionId: string,
  ): ComparisonSide => ({
    kind: 'batch',
    set,
    batchId,
    batchCode: codes.get(batchId) ?? '',
    batchVersionId: versionId,
  });
  const left: ComparisonSide =
    run.leftSet === 'count'
      ? {
          kind: 'count',
          set: 'count',
          siteId: run.leftSiteId ?? '',
          businessUnitId: run.leftBusinessUnitId ?? '',
          asOf: (run.leftAsOf ?? run.runAt).toISOString(),
        }
      : batchSide(run.leftSet, run.leftBatchId ?? '', run.leftBatchVersionId ?? '');
  return { left, right: batchSide(run.rightSet, run.rightBatchId, run.rightBatchVersionId) };
}

function runView(run: RunRow, codes: ReadonlyMap<string, string>) {
  return {
    runId: run.id,
    run: run.runKind,
    key: run.comparisonKey,
    ...sidesOf(run, codes),
    runByUserId: run.runByUserId,
    runAt: run.runAt.toISOString(),
    counts: run.counts,
  };
}

/** The runs the reader may see, newest first (14). */
export async function comparisonRuns(
  deps: Pick<ImportDependencies, 'access'>,
  context: TransactionContext,
  actorId: string,
): Promise<ComparisonRunList> {
  const may = await deps.access.authoriseEach(
    context,
    { actorId, action: 'view', recordType: COMPARISON_RUN_TYPE },
    [],
  );
  if (may.kind === 'refused') notAuthorised(may.refusal.code, may.refusal.missing);
  const runs = await context.tx.select().from(comparisonRun).orderBy(desc(comparisonRun.runAt), desc(comparisonRun.id));
  const visible: RunRow[] = [];
  for (const run of runs) {
    const authorised = await deps.access.authorise(context, {
      actorId,
      action: 'view',
      recordType: COMPARISON_RUN_TYPE,
      facts: factsOfRun(run),
    });
    if (authorised.kind === 'allowed') visible.push(run);
  }
  const codes = await batchCodes(context, visible);
  return { asOf: context.startedAt.toISOString(), runs: visible.map((run) => runView(run, codes)) };
}

/** One run with every line (14), or not found where the reader may not see it. */
export async function readComparisonRun(
  deps: Pick<ImportDependencies, 'access'>,
  context: TransactionContext,
  actorId: string,
  runId: string,
): Promise<ComparisonRunRead> {
  const [run] = await context.tx.select().from(comparisonRun).where(eq(comparisonRun.id, runId));
  const notFound = () =>
    new ApiRefusal({ kind: 'not-found', code: 'files-imports.comparison-run-not-found', missing: [] });
  if (run === undefined) throw notFound();
  const authorised = await deps.access.authorise(context, {
    actorId,
    action: 'view',
    recordType: COMPARISON_RUN_TYPE,
    facts: factsOfRun(run),
  });
  if (authorised.kind === 'refused') notAuthorised(authorised.refusal.code, authorised.refusal.missing);
  const lines = await context.tx
    .select()
    .from(comparisonLine)
    .where(eq(comparisonLine.runId, run.id))
    .orderBy(asc(comparisonLine.lineNumber));
  const balanceLines = await context.tx
    .select()
    .from(comparisonBalanceLine)
    .where(eq(comparisonBalanceLine.runId, run.id))
    .orderBy(asc(comparisonBalanceLine.lineNumber));
  const codes = await batchCodes(context, [run]);
  return {
    asOf: context.startedAt.toISOString(),
    ...runView(run, codes),
    lines: lines.map((line): ComparisonLine => ({
      lineNumber: line.lineNumber,
      keyedBy: line.keyedBy,
      ...(line.barcode === null ? {} : { barcode: line.barcode }),
      ...(line.skuId === null ? {} : { skuId: line.skuId }),
      ...(line.locationId === null ? {} : { locationId: line.locationId }),
      left: sideQuantity(line.leftState, line.leftQuantity),
      right: sideQuantity(line.rightState, line.rightQuantity),
      result: line.result,
      leftRows: line.leftRows,
      rightRows: line.rightRows,
    })),
    balanceLines: balanceLines.map((line): ComparisonBalanceLine => ({
      lineNumber: line.lineNumber,
      keyedBy: line.keyedBy,
      ...(line.accountingBookId === null ? {} : { accountingBookId: line.accountingBookId }),
      ...(line.account === null ? {} : { account: line.account }),
      ...(line.party === null ? {} : { party: line.party }),
      left: sideAmount(line.leftState, line.leftPaise),
      right: sideAmount(line.rightState, line.rightPaise),
      result: line.result,
      leftRows: line.leftRows,
      rightRows: line.rightRows,
    })),
  };
}

function sideAmount(state: 'listed' | 'unknown' | 'not-listed', amount: number | null): ComparisonBalanceLine['left'] {
  if (state === 'listed' && amount !== null) return { state, paise: amount };
  return state === 'not-listed' ? { state } : { state: 'unknown' };
}

function sideQuantity(state: 'listed' | 'unknown' | 'not-listed', quantity: number | null): ComparisonLine['left'] {
  if (state === 'listed' && quantity !== null) return { state, quantity };
  return state === 'not-listed' ? { state } : { state: 'unknown' };
}
