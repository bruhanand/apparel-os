import { uuidv7 } from '@apparel-os/domain';
import {
  COMPARISON_RUN_TYPE,
  type ComparisonCounts,
  type ComparisonKeyName,
  type ComparisonRunKind,
} from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AuditScope } from '../../audit/index.js';
import { comparisonBalanceLine, comparisonLine, comparisonRun } from '../db/schema.js';
import type { BalanceLineDraft } from '../domain/balances.js';
import type { SideTotal } from '../domain/compare.js';
import type { ComparisonLineDraft } from '../domain/comparison.js';
import type { ImportDependencies } from './import-common.js';
import type { LeftSet, RightSet } from './run-comparison.js';

// Keeping a comparison run (imports-and-opening-data 10.3, 10.4, 15.1; S1-F13-T01, S1-F13-T02): the run with both
// sides as they were read, its lines and its audit record, append-only, in the command's transaction under the locks
// Run a comparison took. The lines are worked out apart from this (run-comparison.ts, domain/); nothing here reads a
// side.

/** The lines worked out: by the stock keys of 10.3, with the count's as-of time, or balances by party and account. */
export type WorkedLines =
  | { readonly kind: 'stock'; readonly lines: readonly ComparisonLineDraft[]; readonly asOf?: string }
  | { readonly kind: 'balances'; readonly lines: readonly BalanceLineDraft[] };

export interface KeptRun {
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly roleAssignmentId: string;
  readonly run: ComparisonRunKind;
  readonly comparisonKey: ComparisonKeyName;
  readonly leftSet: LeftSet;
  readonly rightSet: RightSet;
  readonly left:
    | { readonly kind: 'batch'; readonly batchId: string; readonly versionId: string }
    | { readonly kind: 'count'; readonly siteId: string; readonly businessUnitId: string };
  readonly right: { readonly batchId: string; readonly versionId: string };
  /** The run's place: every fact either side holds (15.1). */
  readonly facts: AuditScope;
  readonly worked: WorkedLines;
  readonly counts: ComparisonCounts;
}

/** A side's total as its column keeps it: the sum where it is listed, else null (PRD-MOD-015). */
const totalColumn = (side: SideTotal) => (side.state === 'listed' ? side.total : null);

/** Keeps the run, its lines and the audit record; answers the run's identifier. */
export async function keepRun(
  deps: Pick<ImportDependencies, 'audit'>,
  context: TransactionContext,
  kept: KeptRun,
): Promise<string> {
  const runId = uuidv7();
  const scope = {
    legalEntityId: kept.facts.legalEntityId ?? null,
    siteId: kept.facts.siteId ?? null,
    storeId: kept.facts.storeId ?? null,
    businessUnitId: kept.facts.businessUnitId ?? null,
  };
  const { left } = kept;
  await context.tx.insert(comparisonRun).values({
    id: runId,
    runKind: kept.run,
    comparisonKey: kept.comparisonKey,
    leftSet: kept.leftSet,
    leftBatchId: left.kind === 'batch' ? left.batchId : null,
    leftBatchVersionId: left.kind === 'batch' ? left.versionId : null,
    leftSiteId: left.kind === 'count' ? left.siteId : null,
    leftBusinessUnitId: left.kind === 'count' ? left.businessUnitId : null,
    leftAsOf:
      left.kind === 'count'
        ? new Date((kept.worked.kind === 'stock' ? kept.worked.asOf : undefined) ?? context.startedAt.toISOString())
        : null,
    rightSet: kept.rightSet,
    rightBatchId: kept.right.batchId,
    rightBatchVersionId: kept.right.versionId,
    counts: kept.counts,
    runByUserId: kept.actorId,
    roleAssignmentId: kept.roleAssignmentId,
    runAt: context.startedAt,
    ...scope,
  });
  // What every line keeps, whichever table holds it: its number, both sides' states, the result and the rows.
  const common = (line: ComparisonLineDraft | BalanceLineDraft, index: number) => ({
    id: uuidv7(),
    runId,
    lineNumber: index + 1,
    leftState: line.left.state,
    rightState: line.right.state,
    result: line.result,
    leftRows: [...line.leftRows],
    rightRows: [...line.rightRows],
    ...scope,
  });
  const { worked } = kept;
  if (worked.lines.length > 0) {
    if (worked.kind === 'balances') {
      await context.tx.insert(comparisonBalanceLine).values(
        worked.lines.map((line, index) => ({
          ...common(line, index),
          keyedBy: line.keyedBy,
          accountingBookId: line.accountingBookId,
          account: line.account,
          party: line.party,
          leftPaise: totalColumn(line.left),
          rightPaise: totalColumn(line.right),
        })),
      );
    } else {
      await context.tx.insert(comparisonLine).values(
        worked.lines.map((line, index) => ({
          ...common(line, index),
          keyedBy: line.keyedBy,
          barcode: line.barcode,
          skuId: line.skuId,
          locationId: line.locationId,
          leftQuantity: totalColumn(line.left),
          rightQuantity: totalColumn(line.right),
        })),
      );
    }
  }
  await deps.audit.record(context, {
    actor: { kind: 'user', id: kept.actorId },
    roleAssignmentId: kept.roleAssignmentId,
    scope: kept.facts,
    record: { module: 'files-imports', type: COMPARISON_RUN_TYPE, id: runId },
    operation: 'run-comparison',
    changes: [
      { kind: 'value', field: 'run', before: null, after: kept.run },
      { kind: 'value', field: 'counts', before: null, after: { ...kept.counts } },
    ],
    source: { kind: 'screen' },
    idempotencyKey: kept.idempotencyKey,
  });
  return runId;
}
