import { paise, uuidv7 } from '@apparel-os/domain';
import { JOURNAL_TYPE, type MissingItem } from '@apparel-os/schemas';
import { eq, sql } from 'drizzle-orm';
import {
  CommandDefect,
  LOCK_STEP,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../../../kernel/index.js';
import type { NumberingInterface } from '../../../../numbering/index.js';
import { journal, type Side } from '../../db/schema.js';
import { otherSide } from '../../domain/posting.js';
import { admission, PERIOD_TABLE, periodOn } from '../../queries/periods.js';
import { periodItem } from '../period-close.js';
import { journalSeries, recordUse, requirePeriodHeld, writeJournal, type JournalLineRow } from './journal.js';
import type { PostedJournal, ReversalPlan, ReverseRequest } from './types.js';

// Reverse (books-and-posting 9.1, 9.4; module-map 4.14; PRD-LED-004, PRD-MOD-011; S1-F09-T02): in three parts, as
// Post is: plan the reversal before any lock, hold its period at step 7 and answer its series, then reverse under the
// locks.

/** Checks a reversal before any lock: the journal exists and is not reversed, a period and a series take it. */
export async function planReversal(
  context: TransactionContext,
  numbering: NumberingInterface,
  request: Pick<ReverseRequest, 'journalId' | 'businessDate'>,
): Promise<ReversalPlan> {
  const [original] = await context.tx.select().from(journal).where(eq(journal.id, request.journalId));
  const item: MissingItem = { kind: 'record', recordType: JOURNAL_TYPE, recordId: request.journalId };
  if (original === undefined) {
    return { kind: 'refused', refusal: { kind: 'not-found', code: 'finance.record-not-found', missing: [item] } };
  }
  const [reversal] = await context.tx
    .select({ id: journal.id })
    .from(journal)
    .where(eq(journal.reversesJournalId, original.id));
  if (reversal !== undefined) {
    return { kind: 'refused', refusal: { kind: 'refused', code: 'finance.already-reversed', missing: [item] } };
  }
  const period = await periodOn(context, original.bookId, request.businessDate);
  if (period === undefined) {
    return {
      kind: 'refused',
      refusal: {
        kind: 'refused',
        code: 'finance.no-period',
        missing: [{ kind: 'financial-period', bookId: original.bookId, date: request.businessDate }],
      },
    };
  }
  // 9.1; PRD-LED-009, PRD-LED-020: the reversal's source is the original's, which a reopening may name.
  const admitted = await admission(context, period.id, {
    module: original.sourceModule,
    recordType: original.sourceRecordType,
    recordId: original.sourceRecordId,
  });
  if (admitted.kind === 'locked') {
    return {
      kind: 'refused',
      refusal: { kind: 'refused', code: 'finance.period-locked', missing: [periodItem(period)] },
    };
  }
  const series = await journalSeries(context, numbering, original.bookId, period);
  if (series.kind === 'refused') return series;
  return {
    kind: 'reversible',
    original,
    period,
    seriesId: series.seriesId,
    ...(admitted.kind === 'correction' ? { correction: admitted.sourceId } : {}),
  };
}

/**
 * Holds the reversal's period at step 7 (4.5) and answers the series the caller locks at step 8; refused when the
 * period no longer exists.
 */
export async function holdReversal(
  context: TransactionContext,
  numbering: NumberingInterface,
  plan: Extract<ReversalPlan, { kind: 'reversible' }>,
): Promise<{ kind: 'held'; seriesTargets: LockTarget[] } | { kind: 'refused'; refusal: CommandRefusal }> {
  const held = await context.lock(LOCK_STEP.financialPeriod, [
    { table: PERIOD_TABLE, id: plan.period.id, mode: 'shared' },
  ]);
  if (held.missing.length > 0) {
    return {
      kind: 'refused',
      refusal: {
        kind: 'refused',
        code: 'finance.no-period',
        missing: held.missing.map((each) => ({ kind: 'financial-period', periodId: each.id })),
      },
    };
  }
  return { kind: 'held', seriesTargets: [numbering.seriesLockTarget(plan.seriesId)] };
}

interface OriginalLine extends Record<string, unknown> {
  readonly account_id: string;
  readonly side: Side;
  readonly amount_paise: string;
  readonly legal_entity_id: string;
  readonly site_id: string;
  readonly store_id: string | null;
  readonly business_unit_id: string;
  readonly brand_id: string | null;
  readonly mapping_version_id: string;
}

/**
 * Every line of the journal reversed, whatever the reverser may see of journals (9.4, 12): read through
 * `finance.lines_to_reverse`, SECURITY DEFINER and named in books-and-posting 9.1 and code-house-rules 5.2, which
 * answers the lines of a journal not yet reversed only. A reversal is complete or not written, as Post writes the lines
 * of a money effect whatever its actor may read (12 "As built").
 */
async function linesToReverse(context: TransactionContext, journalId: string): Promise<OriginalLine[]> {
  const rows = await context.tx.execute<OriginalLine>(
    sql`select account_id, side, amount_paise::text as amount_paise, legal_entity_id, site_id, store_id,
          business_unit_id, brand_id, mapping_version_id
        from finance.lines_to_reverse(${journalId}::uuid)`,
  );
  return rows.rows;
}

/**
 * Reverse (9.1, 9.4; PRD-LED-004, PRD-MOD-011): a new journal with the original's lines on opposite sides, linked to
 * it, dated on the reversal's own business date and keeping the original map version, with its own number. A journal
 * is reversed at most once (5.3): rechecked here, and the unique reversal key is the backstop.
 */
export async function reverse(
  context: TransactionContext,
  numbering: NumberingInterface,
  request: ReverseRequest,
): Promise<{ kind: 'reversed'; journal: PostedJournal } | { kind: 'refused'; refusal: CommandRefusal }> {
  const plan = await planReversal(context, numbering, request);
  if (plan.kind === 'refused') return plan;
  requirePeriodHeld(context, plan.period.id);
  const original = plan.original;
  const lines = await linesToReverse(context, original.id);
  if (lines.length < 2) throw new CommandDefect('A reversal reads every line of the journal it reverses');
  const answer = await writeJournal(
    context,
    numbering,
    {
      sourceModule: original.sourceModule,
      document: {
        recordType: original.sourceRecordType,
        recordId: original.sourceRecordId,
        ...(original.sourceVersionId === null ? {} : { versionId: original.sourceVersionId }),
      },
      actor: request.actor,
      ...(request.onBehalfOfUserId === undefined ? {} : { onBehalfOfUserId: request.onBehalfOfUserId }),
    },
    {
      bookId: original.bookId,
      legalEntityId: original.legalEntityId,
      periodId: plan.period.id,
      accountingDate: request.businessDate,
      businessDate: request.businessDate,
      eventKind: original.eventKind,
      mapVersionId: original.postingMapVersionId,
      seriesId: plan.seriesId,
      reversesJournalId: original.id,
    },
    lines.map((line): JournalLineRow => ({
      id: uuidv7(),
      accountId: line.account_id,
      side: otherSide(line.side),
      amountPaise: paise(Number(line.amount_paise)),
      legalEntityId: line.legal_entity_id,
      siteId: line.site_id,
      storeId: line.store_id,
      businessUnitId: line.business_unit_id,
      brandId: line.brand_id,
      mappingVersionId: line.mapping_version_id,
    })),
  );
  if (answer.kind === 'refused') return answer;
  if (plan.correction !== undefined) {
    const used = await recordUse(context, plan.correction, answer.journal.journalId, plan.period);
    if (used !== undefined) return { kind: 'refused', refusal: used };
  }
  return { kind: 'reversed', journal: answer.journal };
}
