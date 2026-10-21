import {
  DAMAGE_REPORT_TYPE,
  type DamagedGoods,
  type DamageReport,
  type DamageReportState,
} from '@apparel-os/schemas';
import { asc, eq } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../../kernel/index.js';
import type { LatestRequest, RecordFacts } from '../../../access/index.js';
import type { ResolutionAnswer, ResolutionSubject } from '../../../exceptions/index.js';
import {
  decisionsOf,
  factsOf,
  reportRow,
  reversalsOf,
  roundsOf,
  type DecisionRow,
  type ReportRow,
  type RoundRow,
} from '../commands/common.js';
import { damageReportPhoto, damageReversal } from '../db/schema.js';

// Reading a damage report (goods-in 8.2, 8.3, 8.5; S2-F08-T01) under the reader's actor, so row-level security keeps
// what the reader may not see out (code-house-rules 6.2), and the resolution check of the exception it raised
// (access-and-approvals 12.3; PRD-EXC-002).

/**
 * The goods a report names, as reported (goods-in 8.2): a GRN line, or a product. The table's check holds that each
 * names its own (migration 0094 `damage_report_goods`), so a missing one is a defect, never an empty identifier
 * (PRD-MOD-015).
 */
function goodsNamed(row: ReportRow): DamagedGoods {
  if (row.goodsKind === 'grn-line') {
    if (row.grnLineId === null) throw new CommandDefect(`Damage report ${row.id} names no GRN line`);
    return { kind: 'grn-line', grnLineId: row.grnLineId };
  }
  if (row.skuId === null) throw new CommandDefect(`Damage report ${row.id} names no product`);
  return { kind: 'product', skuId: row.skuId };
}

/** A report's state, from its latest round and that round's decision (design-language 7; goods-in 8.5). */
export function stateOf(rounds: readonly RoundRow[], decisions: readonly DecisionRow[]): DamageReportState {
  const latest = rounds.at(-1);
  const decision = decisions.find((each) => each.damageRoundId === latest?.id);
  return decision?.outcome ?? 'Submitted';
}

/** The facts of a report the reader may see, which every route on it authorises with (5.3); else undefined. */
export async function reportFacts(context: TransactionContext, reportId: string): Promise<RecordFacts | undefined> {
  const row = await reportRow(context, reportId);
  return row === undefined ? undefined : factsOf(row);
}

/** The report a reversal belongs to, as the reader may see it, or undefined (goods-in 8.3). */
export async function reportOfReversal(context: TransactionContext, reversalId: string): Promise<string | undefined> {
  const [row] = await context.tx
    .select({ reportId: damageReversal.damageReportId })
    .from(damageReversal)
    .where(eq(damageReversal.id, reversalId));
  return row?.reportId;
}

/**
 * One report as the reader sees it, with its rounds and their decisions, and its reversals; `requests` gives the latest
 * request of each round and reversal from `access`, which keeps them (access-and-approvals 9.1, 9.6).
 */
export async function reportView(
  context: TransactionContext,
  reportId: string,
  requests: (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>,
): Promise<DamageReport | undefined> {
  const row = await reportRow(context, reportId);
  if (row === undefined) return undefined;
  const rounds = await roundsOf(context, reportId);
  const decisions = await decisionsOf(context, reportId);
  const reversals = await reversalsOf(context, reportId);
  const photos = await context.tx
    .select({ attachmentId: damageReportPhoto.attachmentId })
    .from(damageReportPhoto)
    .where(eq(damageReportPhoto.damageReportId, reportId))
    .orderBy(asc(damageReportPhoto.id));
  const latest = await requests([...rounds.map((each) => each.id), ...reversals.map((each) => each.reversal.id)]);
  const current = rounds.at(-1);
  if (current === undefined) throw new CommandDefect(`Damage report ${reportId} has no round`);
  return {
    id: row.id,
    number: row.number,
    state: stateOf(rounds, decisions),
    siteId: row.siteId,
    storeId: row.storeId,
    businessUnitId: row.businessUnitId,
    locationId: row.locationId,
    brandId: row.brandId,
    goods: goodsNamed(row),
    skuId: row.skuId,
    quantity: row.quantity,
    description: row.description,
    photoAttachmentIds: photos.map((each) => each.attachmentId),
    reportedByUserId: row.reportedByUserId,
    reportedAt: row.reportedAt.toISOString(),
    businessDate: row.businessDate,
    rounds: rounds.map((round) => {
      const decision = decisions.find((each) => each.damageRoundId === round.id);
      const request = latest.get(round.id);
      return {
        id: round.id,
        kind: round.kind,
        recordedAt: round.recordedAt.toISOString(),
        requestId: request?.id ?? null,
        requestState: request?.state ?? null,
        decision:
          decision === undefined
            ? null
            : {
                id: decision.id,
                outcome: decision.outcome,
                decidedByUserId: decision.decidedByUserId,
                decidedAt: decision.decidedAt.toISOString(),
              },
      };
    }),
    reversals: reversals.map(({ reversal, decision }) => {
      const request = latest.get(reversal.id);
      return {
        id: reversal.id,
        decisionId: reversal.damageDecisionId,
        reason: reversal.reason,
        proposedByUserId: reversal.proposedByUserId,
        proposedAt: reversal.proposedAt.toISOString(),
        requestId: request?.id ?? null,
        requestState: request?.state ?? null,
        outcome: decision?.outcome ?? null,
      };
    }),
    versionToken: current.id,
  };
}

/**
 * The resolution check of the damage exception (access-and-approvals 12.3; PRD-EXC-002): verified once every report it
 * links to is decided in its latest round, confirmed or rejected; a report its closer may not see is not verified.
 */
export async function damageDecided(
  context: TransactionContext,
  subject: ResolutionSubject,
): Promise<ResolutionAnswer> {
  const missing = [];
  for (const link of subject.links) {
    if (link.recordType !== DAMAGE_REPORT_TYPE) continue;
    const rounds = await roundsOf(context, link.recordId);
    const decisions = await decisionsOf(context, link.recordId);
    if (rounds.length === 0 || stateOf(rounds, decisions) === 'Submitted') {
      missing.push({ kind: 'record', recordType: DAMAGE_REPORT_TYPE, recordId: link.recordId });
    }
  }
  return missing.length === 0 ? { kind: 'verified' } : { kind: 'not-verified', missing };
}
