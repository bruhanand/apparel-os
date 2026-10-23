import type { DamageReportState } from '@apparel-os/schemas';
import { asc, inArray } from 'drizzle-orm';
import { declareReadModel, serveReadModel, type TransactionContext } from '../../../../kernel/index.js';
import { damageDecision, damageReport, damageRound } from '../db/schema.js';
import { stateOf } from './reports.js';

// The damage reports a report names (goods-in 8.5, 9.3, 9.5; module-map section 3 rule 5; S2-F11-T02), served
// through the kernel's read-model gateway for the receipt problems report: each report's number, its state and the
// decision of its latest round, with who made it and when (goods-in 9.3 "each with its decision and who made it").
// Read under the reader's actor, so row-level security keeps out a report the reader may not see (code-house-rules
// 6.2): one not answered is Unknown to its reader (PRD-MOD-015).

export interface DamageReportStateRow {
  readonly damageReportId: string;
  readonly number: string;
  readonly state: DamageReportState;
  readonly decision: {
    readonly outcome: 'Confirmed' | 'Rejected';
    readonly decidedBy: string;
    readonly decidedAt: string;
  } | null;
}

/** The reports given the reader may see, each with its state and its latest round's decision (design-language 7). */
export async function damageReportStates(
  context: TransactionContext,
  reportIds: readonly string[],
): Promise<readonly DamageReportStateRow[]> {
  if (reportIds.length === 0) return [];
  const ids = [...new Set(reportIds)];
  const reports = await context.tx
    .select({ id: damageReport.id, number: damageReport.number })
    .from(damageReport)
    .where(inArray(damageReport.id, ids))
    .orderBy(asc(damageReport.id));
  if (reports.length === 0) return [];
  const shown = reports.map((each) => each.id);
  const rounds = await context.tx
    .select()
    .from(damageRound)
    .where(inArray(damageRound.damageReportId, shown))
    .orderBy(asc(damageRound.roundNumber));
  const decisions = await context.tx.select().from(damageDecision).where(inArray(damageDecision.damageReportId, shown));
  return reports.map((report) => {
    const ofReport = rounds.filter((each) => each.damageReportId === report.id);
    const latest = ofReport.at(-1);
    const decision = decisions.find((each) => each.damageRoundId === latest?.id);
    return {
      damageReportId: report.id,
      number: report.number,
      state: stateOf(
        ofReport,
        decisions.filter((each) => each.damageReportId === report.id),
      ),
      decision:
        decision === undefined
          ? null
          : {
              outcome: decision.outcome,
              decidedBy: decision.decidedByUserId,
              decidedAt: decision.decidedAt.toISOString(),
            },
    };
  });
}

/** The read model of damage reports' states, declared for the read-model gateway (module-map section 3, rule 5). */
export const STOCK_DAMAGE_REPORT_STATES = declareReadModel<readonly string[], readonly DamageReportStateRow[]>(
  'stock.damage-report-states',
);

/** `stock` · documents' read models as it serves them, handed to the gateway by the composition root. */
export const stockDocumentsReadModels = [serveReadModel(STOCK_DAMAGE_REPORT_STATES, damageReportStates)];
