import { uuidv7 } from '@apparel-os/domain';
import type { EvidenceFile } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { ItemValue } from '../../ledger/index.js';
import type { ReportedCondition } from '../domain/goods.js';
import { refusalOf, today, type Actor, type Outcome } from './common.js';
import { recordReport, type RecordDependencies } from './record.js';

// Damage the count finds, last step (goods-in 4.4, 4.5, 4.9, 8.2, 8.5; PRD-DMG-001, PRD-DMG-002; S2-F02-T03): once the
// GRN's one ledger request is written with each damaged line's hold (count-damage-ready.ts), each line's report on its
// hold, with its number from the series the GRN holds at step 8, its photo, its decision's request and the exception
// to Operations, as a report made on its own is (record.ts). In the GRN's transaction, or nothing.

/** One damaged GRN line whose hold the GRN's request wrote. */
export interface CountDamageWritten {
  readonly grnLineId: string;
  readonly receiptOriginId: string;
  readonly skuId: string | null;
  /** The condition the count received the goods in, which their damage hold fell on (goods-in 4.9; RR-571). */
  readonly condition: ReportedCondition;
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
        goodsCondition: line.condition,
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
