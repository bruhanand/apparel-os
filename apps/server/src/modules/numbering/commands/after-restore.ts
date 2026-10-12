import { uuidv7 } from '@apparel-os/domain';
import { eq, inArray, sql } from 'drizzle-orm';
import { CommandDefect, LOCK_STEP, type TransactionContext } from '../../../kernel/index.js';
import { series, seriesEvent } from '../db/schema.js';
import { answered, refused, type NumberingResult } from '../domain/kinds.js';
import { seriesRow } from '../queries/series.js';
import { requireHeld, seriesLockTarget } from './lock-target.js';

// Number series after a restore (numbering-and-audit 3.6, 3.7; backup-and-restore 5.3; POL-18.04, PRD-ACP-019,
// PRD-LIF-020; S1-F14-T03). A restore may lose the latest allocations while their documents, such as printed bills,
// exist outside the database, so every series is paused until it is reconciled against the evidence of what was
// issued, and a number is never given twice.

/** A series a restore paused that waits for its reconciliation (5.3). */
export interface SeriesAwaitingReconciliation {
  readonly seriesId: string;
  readonly kind: string;
  readonly scopeKey: string;
  readonly financialYear: string | null;
  readonly nextSequence: number;
  /** The highest number allocated in the restored database, 0 when none was. */
  readonly restoredHighest: number;
  readonly restoreId: string;
}

/** What a reconciliation did: the next number before and after, so the numbers skipped are `before` to `after - 1`. */
export interface Reconciled {
  readonly seriesId: string;
  readonly restoreId: string;
  readonly restoredHighest: number;
  readonly evidenceHighest: number | null;
  readonly nextSequenceBefore: number;
  readonly nextSequenceAfter: number;
}

/** The evidence of the highest number issued and the reason (5.3): a statement that no document left is evidence too. */
export interface ReconciliationInput {
  readonly seriesId: string;
  /** What shows the highest number issued: printed or uploaded bills, the counters' records, or a statement. */
  readonly evidence: string;
  /** The highest number the evidence shows was issued; null when it shows that none left the system. */
  readonly evidenceHighest: number | null;
  readonly reason: string;
}

/**
 * Pause every series after a restore (3.7 "Pause every series after a restore"; backup-and-restore 5.3): numbering's
 * own after-restore step, under the restore's internal service identity; no owning module calls it. Every live series,
 * Open or Paused, is Paused with a `paused-after-restore` event naming the restore, since one Paused at the recovery
 * point may have been released and used after it. A Closed series is final and never continued, so it is left. The
 * series are locked at step 8 of the lock order, in identifier order (code-house-rules 8.2). Returns how many there
 * were.
 */
export async function pauseEverySeriesAfterRestore(context: TransactionContext, restoreId: string): Promise<number> {
  const live = await context.tx
    .select({ id: series.id })
    .from(series)
    .where(inArray(series.state, ['Open', 'Paused']))
    .orderBy(series.id);
  if (live.length === 0) return 0;
  await context.lock(
    LOCK_STEP.numberSeries,
    live.map((row) => seriesLockTarget(row.id)),
  );
  for (const { id } of live) {
    requireHeld(context, id, 'Pause after a restore');
    const row = await seriesRow(context, id);
    if (row === undefined || row.state === 'Closed') continue;
    if (row.state === 'Open') await context.tx.update(series).set({ state: 'Paused' }).where(eq(series.id, id));
    await context.tx.insert(seriesEvent).values({
      id: uuidv7(),
      seriesId: id,
      event: 'paused-after-restore',
      occurredAt: context.startedAt,
      restoreId,
    });
  }
  return live.length;
}

/**
 * The series a restore paused that wait for their reconciliation (5.3): those whose latest event of a restore is
 * `paused-after-restore`. Of every restore, or of the one named. In series order.
 */
export async function seriesAwaitingReconciliation(
  context: TransactionContext,
  restoreId?: string,
): Promise<SeriesAwaitingReconciliation[]> {
  const rows = await context.tx.execute<{
    series_id: string;
    kind: string;
    scope_key: string;
    financial_year: string | null;
    next_sequence: string;
    restored_highest: string;
    restore_id: string;
  }>(sql`
    select s.id::text as series_id, s.kind, s.scope_key, s.financial_year, s.next_sequence::text as next_sequence,
           coalesce((select max(a.sequence_number) from numbering.allocation a where a.series_id = s.id), 0)::text
             as restored_highest,
           latest.restore_id::text as restore_id
      from numbering.series s
      join lateral (
        select e.event, e.restore_id from numbering.series_event e
         where e.series_id = s.id and e.event in ('paused-after-restore', 'reconciled-after-restore')
         order by e.occurred_at desc, e.id desc limit 1) latest on true
     where latest.event = 'paused-after-restore' and s.state <> 'Closed'
       ${restoreId === undefined ? sql`` : sql`and latest.restore_id = ${restoreId}`}
     order by s.id`);
  return rows.rows.map((row) => ({
    seriesId: row.series_id,
    kind: row.kind,
    scopeKey: row.scope_key,
    financialYear: row.financial_year,
    nextSequence: Number(row.next_sequence),
    restoredHighest: Number(row.restored_highest),
    restoreId: row.restore_id,
  }));
}

/**
 * Reconcile after a restore (3.7; backup-and-restore 5.3): on a series the command holds exclusively at step 8, paused
 * by a restore and not reconciled since. Sets the next number past the higher of the evidence and the highest
 * allocation in the restored database, never lowering it, records the skip and the reason as the series event
 * `reconciled-after-restore`, and releases the series (POL-18.04, PRD-ACP-019). The caller has authorised the person.
 */
export async function reconcileAfterRestore(
  context: TransactionContext,
  input: ReconciliationInput,
): Promise<NumberingResult<Reconciled>> {
  requireHeld(context, input.seriesId, 'Reconcile after a restore');
  if (input.evidence.trim() === '' || input.reason.trim() === '') {
    throw new CommandDefect('A reconciliation after a restore names its evidence and its reason');
  }
  if (input.evidenceHighest !== null && (!Number.isSafeInteger(input.evidenceHighest) || input.evidenceHighest < 0)) {
    throw new CommandDefect('The highest number the evidence shows is a whole number, 0 or more');
  }
  const row = await seriesRow(context, input.seriesId);
  if (row === undefined) return refused('series-not-found');
  const awaiting = (await seriesAwaitingReconciliation(context)).find((each) => each.seriesId === input.seriesId);
  if (awaiting === undefined) return refused('series-not-paused-after-restore');
  const before = row.nextSequence;
  const after = Math.max(before, awaiting.restoredHighest + 1, (input.evidenceHighest ?? 0) + 1);
  await context.tx.update(series).set({ state: 'Open', nextSequence: after }).where(eq(series.id, row.id));
  await context.tx.insert(seriesEvent).values({
    id: uuidv7(),
    seriesId: row.id,
    event: 'reconciled-after-restore',
    occurredAt: context.startedAt,
    restoreId: awaiting.restoreId,
    evidence: input.evidence,
    evidenceHighest: input.evidenceHighest,
    restoredHighest: awaiting.restoredHighest,
    nextSequenceBefore: before,
    nextSequenceAfter: after,
    reason: input.reason,
  });
  return answered({
    seriesId: row.id,
    restoreId: awaiting.restoreId,
    restoredHighest: awaiting.restoredHighest,
    evidenceHighest: input.evidenceHighest,
    nextSequenceBefore: before,
    nextSequenceAfter: after,
  });
}

/** The reconciliations after a restore, for the drill record (section 6): the skip and the reason, never the evidence. */
export async function reconciliationsAfterRestore(
  context: TransactionContext,
  restoreId: string,
): Promise<(Reconciled & { readonly reason: string; readonly reconciledAt: Date })[]> {
  const rows = await context.tx.select().from(seriesEvent).where(eq(seriesEvent.restoreId, restoreId));
  return rows
    .filter((row) => row.event === 'reconciled-after-restore')
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id))
    .map((row) => ({
      seriesId: row.seriesId,
      restoreId,
      restoredHighest: row.restoredHighest ?? 0,
      evidenceHighest: row.evidenceHighest,
      nextSequenceBefore: row.nextSequenceBefore ?? 0,
      nextSequenceAfter: row.nextSequenceAfter ?? 0,
      reason: row.reason ?? '',
      reconciledAt: row.occurredAt,
    }));
}
