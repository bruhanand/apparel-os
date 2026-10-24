import type { LockTarget, TransactionContext } from '../../../../kernel/index.js';
import type { ConfigurationInterface } from '../../../configuration/index.js';
import type { ExceptionsInterface } from '../../../exceptions/index.js';
import type { NumberingInterface } from '../../../numbering/index.js';
import { DAMAGE_REPORT_KIND, DAMAGE_REPORT_SCOPE_KEY, MISSING_DAMAGE_REPORT_SERIES } from '../domain/kinds.js';
import { damageUnavailable } from '../queries/availability.js';
import { refusalOf, refused, type Outcome } from './common.js';

// Damage the count finds, first step (goods-in 4.4, 4.5, 4.9, 8.1, 8.5, 10.2, 10.3; PRD-DMG-001, PRD-REC-006;
// S2-F02-T03). A GRN's command makes one ledger request (stock-ledger 13.1), which counts each line's pieces and holds
// them, so the damage hold of each damaged line is an item of that request, on the receipt origin its count makes
// (stock-ledger 13.16): `reportDamage`, which posts a request of its own, cannot join it, and would take the ledger's
// steps 2 to 6 a second time (code-house-rules 8.2). So the GRN, in its order: asks this before any lock, for the
// policy gate of damage reports at the unit and the series it holds at step 8 with its own; puts each damaged line's
// hold, from `countDamageHold` of the interface, in its own request; and, once the request is written, records each
// report on its hold (record-count-damage.ts). All in the GRN's transaction, or nothing. **Design choice** (goods-in
// 4.9, 8.5).

export interface CountDamageReadyDependencies {
  readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'>;
  readonly numbering: Pick<NumberingInterface, 'liveSeries' | 'seriesLockTarget' | 'allocate'>;
  readonly exceptions: Pick<ExceptionsInterface, 'codeSeriesTarget' | 'raise'>;
}

/** What the count's damage holds before any lock: the series the GRN holds at step 8 with its own. */
export interface CountDamageReady {
  readonly seriesId: string;
  /** The damage-report series and the exception-code series, for the GRN's one call at step 8. */
  readonly series: readonly LockTarget[];
}

/** Damage reports at a unit available now, and their series, for a GRN whose count found damage (goods-in 10.5). */
export async function countDamageReady(
  context: TransactionContext,
  dependencies: CountDamageReadyDependencies,
  place: { readonly siteId: string; readonly businessUnitId: string },
): Promise<Outcome<CountDamageReady>> {
  const unavailable = await damageUnavailable(context, dependencies, place);
  if (unavailable !== undefined) return refusalOf(unavailable);
  const series = await dependencies.numbering.liveSeries(context, {
    kind: DAMAGE_REPORT_KIND.kind,
    scopeKey: DAMAGE_REPORT_SCOPE_KEY,
  });
  if (series === undefined) {
    return refused('unavailable', 'stock.no-damage-report-series', [MISSING_DAMAGE_REPORT_SERIES]);
  }
  if (series.state !== 'Open') {
    return refused('unavailable', 'stock.damage-report-series-paused', [MISSING_DAMAGE_REPORT_SERIES]);
  }
  const codes = await dependencies.exceptions.codeSeriesTarget(context);
  if (codes.kind === 'refused') return refusalOf(codes.refusal);
  return {
    kind: 'success',
    answer: {
      seriesId: series.seriesId,
      series: [dependencies.numbering.seriesLockTarget(series.seriesId), codes.value],
    },
  };
}
