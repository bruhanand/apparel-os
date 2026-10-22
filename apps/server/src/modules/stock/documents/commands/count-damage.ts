import { uuidv7 } from '@apparel-os/domain';
import type { EvidenceFile } from '@apparel-os/schemas';
import type { LockTarget, TransactionContext } from '../../../../kernel/index.js';
import type { ConfigurationInterface } from '../../../configuration/index.js';
import type { ExceptionsInterface } from '../../../exceptions/index.js';
import type { NumberingInterface } from '../../../numbering/index.js';
import type { ItemValue, LedgerItem, NamedGoods, Place } from '../../ledger/index.js';
import { DAMAGE_REPORT_KIND, DAMAGE_REPORT_SCOPE_KEY, MISSING_DAMAGE_REPORT_SERIES } from '../domain/kinds.js';
import { damageHoldItem } from '../domain/items.js';
import { damageUnavailable } from '../queries/availability.js';
import { refusalOf, refused, today, type Actor, type Outcome } from './common.js';
import { recordReport, type RecordDependencies } from './record.js';

// Damage the count finds (goods-in 4.4, 4.5, 4.9, 8.1, 8.5, 10.2, 10.3; PRD-DMG-001, PRD-REC-006; S2-F02-T03). A GRN's
// command makes one ledger request (stock-ledger 13.1), which counts each line's pieces and holds them, so the damage
// hold of each damaged line is an item of that request, on the receipt origin its count makes, named by the identifier
// `receiving` gives it (stock-ledger 13.16): `reportDamage`, which posts a request of its own, cannot join it, and
// would take the ledger's steps 2 to 6 a second time (code-house-rules 8.2). So the GRN calls these, in its order:
//
// 1. `countDamageReady`, before any lock: the policy gate of damage reports at the unit and the damage-report series,
//    answering the series the GRN holds at step 8 with its own;
// 2. `countDamageHold` gives each damaged line's hold item for the GRN's request;
// 3. `recordCountDamage`, once the request is written: each report on its hold, with its number from the series held,
//    its photo, its decision's request and the exception to Operations, as a report made on its own is (record.ts).
//
// All in the GRN's transaction, or nothing. **Design choice** (goods-in 4.9, 8.5).

export interface CountDamageDependencies extends RecordDependencies {
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
  dependencies: Pick<CountDamageDependencies, 'configuration' | 'numbering' | 'exceptions'>,
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
    answer: { seriesId: series.seriesId, series: [dependencies.numbering.seriesLockTarget(series.seriesId), codes.value] },
  };
}

/** The damage hold of a line the count found damaged, on the goods its count makes (stock-ledger 6.1, 13.16). */
export function countDamageHold(lineId: string, at: Place, goods: NamedGoods, description: string): LedgerItem {
  return damageHoldItem(lineId, at, goods, description);
}

/** One damaged GRN line whose hold the GRN's request wrote. */
export interface CountDamageWritten {
  readonly grnLineId: string;
  readonly receiptOriginId: string;
  readonly skuId: string | null;
  readonly holdId: string;
  /** The hold's value under the ledger's locks: the goods' cost, Unknown before their PT (13.15; DM-8). */
  readonly value: ItemValue;
  readonly quantity: number;
  readonly description: string;
  readonly photo: EvidenceFile | null;
}

/** Where the GRN's goods are: its place, the legal entity and Store of its unit's mapping, and its brand. */
export interface CountDamagePlace {
  readonly scope: {
    readonly siteId: string;
    readonly storeId: string | null;
    readonly businessUnitId: string;
    readonly legalEntityId: string;
    readonly brandId: string;
  };
  readonly mappingVersionId: string;
  readonly locationId: string;
}

/**
 * Records the report of each damaged line once the GRN's request is written (goods-in 8.2), reported by whoever issues
 * the GRN: a different authorised person decides it (PRD-DMG-002). Answers each line's report, in the order given.
 */
export async function recordCountDamage(
  context: TransactionContext,
  dependencies: RecordDependencies,
  reporter: Actor,
  input: {
    readonly seriesId: string;
    readonly place: CountDamagePlace;
    readonly lines: readonly CountDamageWritten[];
    readonly idempotencyKey?: string;
  },
): Promise<Outcome<readonly { readonly grnLineId: string; readonly damageReportId: string }[]>> {
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  const reports: { grnLineId: string; damageReportId: string }[] = [];
  for (const line of input.lines) {
    const recorded = await recordReport(
      context,
      dependencies,
      reporter,
      {
        reportId: uuidv7(),
        roundId: uuidv7(),
        holdId: line.holdId,
        value: line.value,
        seriesId: input.seriesId,
        scope: input.place.scope,
        mappingVersionId: input.place.mappingVersionId,
        locationId: input.place.locationId,
        goods: { kind: 'grn-line', grnLineId: line.grnLineId },
        skuId: line.skuId,
        receiptOriginId: line.receiptOriginId,
        quantity: line.quantity,
        description: line.description,
        photos: line.photo === null ? [] : [line.photo],
        businessDate: date,
      },
      input.idempotencyKey,
    );
    if (recorded.kind === 'refusal') return recorded;
    reports.push({ grnLineId: line.grnLineId, damageReportId: recorded.answer.damageReportId });
  }
  return { kind: 'success', answer: reports };
}
