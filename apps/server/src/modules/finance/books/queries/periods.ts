import type { PeriodRecord, PeriodState } from '@apparel-os/schemas';
import { and, asc, eq, exists, inArray, notExists, sql, type SQL } from 'drizzle-orm';
import { lockTable, type TransactionContext } from '../../../../kernel/index.js';
import {
  financialPeriod,
  periodEvent,
  periodReopening,
  periodReopeningSource,
  periodReopeningUse,
} from '../db/schema.js';

// The financial periods of a book and their state (books-and-posting 4.1 to 4.5; S1-F09-T02, S1-F09-T03). A period's
// state is a projection of its events and reopenings (DM-4): Open until it is locked; Reopened while an approved
// reopening of it, not withdrawn, names a correction still to post; otherwise Locked. Each fact it reads changes only
// under an exclusive lock of the period row (a lock, an approval, a withdrawal) or never changes once written (a
// reopening's corrections), save a correction's use, which the posting writes under the period row held shared and
// whose unique key stops a second one (4.5; code-house-rules 8.1).

/** The period row a posting holds in shared mode at lock step 7 (4.5; stock-ledger 10.3). */
export const PERIOD_TABLE = lockTable('finance', 'financial_period');

export interface PeriodRow {
  readonly id: string;
  readonly bookId: string;
  readonly code: string;
  readonly financialYear: string;
  readonly firstDay: string;
  /** The day after the last, as the range's end. */
  readonly end: string;
  readonly state: PeriodState;
}

/** A source record, by owning module, record type and identifier: what a reopening names as a correction (4.3). */
export interface SourceRecord {
  readonly module: string;
  readonly recordType: string;
  readonly recordId: string;
}

const columns = {
  id: financialPeriod.id,
  bookId: financialPeriod.bookId,
  code: financialPeriod.code,
  financialYear: financialPeriod.financialYear,
  firstDay: sql<string>`lower(${financialPeriod.dates})::text`,
  end: sql<string>`upper(${financialPeriod.dates})::text`,
};

const dayBefore = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** A reopening's event of the kind exists. */
const reopeningEvent = (context: TransactionContext, kind: 'reopening-approved' | 'reopening-withdrawn') =>
  context.tx
    .select({ id: periodEvent.id })
    .from(periodEvent)
    .where(and(eq(periodEvent.periodReopeningId, periodReopening.id), eq(periodEvent.kind, kind)));

/**
 * The named corrections still open to post, of the reopenings that match `where` (4.3 steps 3 and 4): their reopening
 * approved, not withdrawn, and the correction not yet used. Oldest reopening first.
 */
export function openCorrections(context: TransactionContext, where: SQL | undefined) {
  return context.tx
    .select({
      sourceId: periodReopeningSource.id,
      reopeningId: periodReopening.id,
      periodId: periodReopening.financialPeriodId,
    })
    .from(periodReopeningSource)
    .innerJoin(periodReopening, eq(periodReopening.id, periodReopeningSource.periodReopeningId))
    .where(
      and(
        where,
        exists(reopeningEvent(context, 'reopening-approved')),
        notExists(reopeningEvent(context, 'reopening-withdrawn')),
        notExists(
          context.tx
            .select({ id: periodReopeningUse.id })
            .from(periodReopeningUse)
            .where(eq(periodReopeningUse.periodReopeningSourceId, periodReopeningSource.id)),
        ),
      ),
    )
    .orderBy(asc(periodReopening.id), asc(periodReopeningSource.id));
}

/** The state of each period named (4.1). */
export async function statesOf(
  context: TransactionContext,
  periodIds: readonly string[],
): Promise<Map<string, PeriodState>> {
  if (periodIds.length === 0) return new Map();
  const ids = [...new Set(periodIds)];
  const locked = await context.tx
    .select({ periodId: periodEvent.financialPeriodId })
    .from(periodEvent)
    .where(and(inArray(periodEvent.financialPeriodId, ids), eq(periodEvent.kind, 'locked')));
  const reopened = await openCorrections(context, inArray(periodReopening.financialPeriodId, ids));
  const lockedIds = new Set(locked.map((row) => row.periodId));
  const reopenedIds = new Set(reopened.map((row) => row.periodId));
  return new Map(
    ids.map((id) => [id, !lockedIds.has(id) ? 'Open' : reopenedIds.has(id) ? 'Reopened' : 'Locked'] as const),
  );
}

/**
 * Whether a posting whose source is `source` may enter the period (4.2, 4.3; PRD-LED-009, PRD-LED-020): an Open
 * period takes any; a Locked or Reopened one only a posting whose source a reopening in force names as a correction
 * still to post, and answers that correction. Read under the period row held at step 7 when it is a recheck.
 */
export async function admission(
  context: TransactionContext,
  periodId: string,
  source: SourceRecord | undefined,
): Promise<{ kind: 'open' } | { kind: 'correction'; sourceId: string } | { kind: 'locked' }> {
  const state = (await statesOf(context, [periodId])).get(periodId) ?? 'Open';
  if (state === 'Open') return { kind: 'open' };
  if (source === undefined) return { kind: 'locked' };
  const [correction] = await openCorrections(
    context,
    and(
      eq(periodReopening.financialPeriodId, periodId),
      eq(periodReopeningSource.sourceModule, source.module),
      eq(periodReopeningSource.sourceRecordType, source.recordType),
      eq(periodReopeningSource.sourceRecordId, source.recordId),
    ),
  ).limit(1);
  return correction === undefined ? { kind: 'locked' } : { kind: 'correction', sourceId: correction.sourceId };
}

async function withStates<Row extends { readonly id: string }>(
  context: TransactionContext,
  rows: readonly Row[],
): Promise<(Row & { state: PeriodState })[]> {
  const states = await statesOf(
    context,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...row, state: states.get(row.id) ?? 'Open' }));
}

/** The period of a book a date lies in, or undefined (4.4). */
export async function periodOn(
  context: TransactionContext,
  bookId: string,
  date: string,
): Promise<PeriodRow | undefined> {
  const rows = await context.tx
    .select(columns)
    .from(financialPeriod)
    .where(and(eq(financialPeriod.bookId, bookId), sql`${financialPeriod.dates} @> ${date}::date`));
  return (await withStates(context, rows))[0];
}

export async function periodById(context: TransactionContext, periodId: string): Promise<PeriodRow | undefined> {
  const rows = await context.tx.select(columns).from(financialPeriod).where(eq(financialPeriod.id, periodId));
  return (await withStates(context, rows))[0];
}

/** A book's periods in date order (4.1). */
export async function periodRowsOfBook(context: TransactionContext, bookId: string): Promise<PeriodRow[]> {
  const rows = await context.tx
    .select(columns)
    .from(financialPeriod)
    .where(eq(financialPeriod.bookId, bookId))
    .orderBy(asc(sql`lower(${financialPeriod.dates})`));
  return withStates(context, rows);
}

export const recordOf = (row: PeriodRow): PeriodRecord => ({
  id: row.id,
  bookId: row.bookId,
  code: row.code,
  financialYear: row.financialYear,
  firstDay: row.firstDay,
  lastDay: dayBefore(row.end),
  state: row.state,
});

/** A book's periods in date order, as records (4.1). */
export async function periodsOfBook(context: TransactionContext, bookId: string): Promise<PeriodRecord[]> {
  return (await periodRowsOfBook(context, bookId)).map(recordOf);
}
