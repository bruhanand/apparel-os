import type { PeriodCloseRow, ReopeningState, ReopeningView } from '@apparel-os/schemas';
import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { LatestRequest } from '../../../access/index.js';
import { periodEvent, periodReopening, periodReopeningSource, periodReopeningUse } from '../db/schema.js';
import { periodById, periodRowsOfBook, recordOf, type PeriodRow } from './periods.js';

// Money › Period close (books-and-posting 14; PRD-LED-009, PRD-LED-019, PRD-LED-020; S1-F09-T03): each period's state,
// when it was locked, and its reopenings with their named corrections and which of them have posted.

type Requests = (ids: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>;

/** A reopening's state (4.3): from its decision, its withdrawal and whether a correction is still to post. */
function stateOf(events: ReadonlySet<string>, corrections: readonly { postedJournalId?: string }[]): ReopeningState {
  if (events.has('reopening-rejected')) return 'Rejected';
  // Withdrawn while awaiting its decision or in force (4.3 step 4; RR-489).
  if (events.has('reopening-withdrawn')) return 'Withdrawn';
  if (!events.has('reopening-approved')) return 'Awaiting approval';
  return corrections.every((each) => each.postedJournalId !== undefined) ? 'Completed' : 'In force';
}

async function reopeningViews(context: TransactionContext, where: SQL, requests: Requests): Promise<ReopeningView[]> {
  const reopenings = await context.tx.select().from(periodReopening).where(where).orderBy(asc(periodReopening.id));
  if (reopenings.length === 0) return [];
  const ids = reopenings.map((each) => each.id);
  const sources = await context.tx
    .select({
      id: periodReopeningSource.id,
      reopeningId: periodReopeningSource.periodReopeningId,
      module: periodReopeningSource.sourceModule,
      recordType: periodReopeningSource.sourceRecordType,
      recordId: periodReopeningSource.sourceRecordId,
      postedJournalId: periodReopeningUse.journalId,
    })
    .from(periodReopeningSource)
    .leftJoin(periodReopeningUse, eq(periodReopeningUse.periodReopeningSourceId, periodReopeningSource.id))
    .where(inArray(periodReopeningSource.periodReopeningId, ids))
    .orderBy(asc(periodReopeningSource.id));
  const events = await context.tx
    .select({ reopeningId: periodEvent.periodReopeningId, kind: periodEvent.kind })
    .from(periodEvent)
    .where(inArray(periodEvent.periodReopeningId, ids));
  const latest = await requests(ids);
  return reopenings.map((reopening) => {
    const corrections = sources
      .filter((each) => each.reopeningId === reopening.id)
      .map((each) => ({
        module: each.module,
        recordType: each.recordType,
        recordId: each.recordId,
        ...(each.postedJournalId === null ? {} : { postedJournalId: each.postedJournalId }),
      }));
    const kinds = new Set(events.filter((each) => each.reopeningId === reopening.id).map((each) => each.kind));
    const request = latest.get(reopening.id);
    return {
      id: reopening.id,
      periodId: reopening.financialPeriodId,
      reason: reopening.reason,
      state: stateOf(kinds, corrections),
      requestedByUserId: reopening.requestedByUserId,
      requestedAt: reopening.occurredAt.toISOString(),
      ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
      corrections,
    };
  });
}

/** Each period of a book with its state, its lock and its reopenings (14). */
export async function periodCloseOf(
  context: TransactionContext,
  bookId: string,
  requests: Requests,
): Promise<PeriodCloseRow[]> {
  const periods = await periodRowsOfBook(context, bookId);
  if (periods.length === 0) return [];
  const ids = periods.map((each) => each.id);
  const locks = await context.tx
    .select({ periodId: periodEvent.financialPeriodId, at: periodEvent.occurredAt })
    .from(periodEvent)
    .where(and(inArray(periodEvent.financialPeriodId, ids), eq(periodEvent.kind, 'locked')));
  const reopenings = await reopeningViews(context, inArray(periodReopening.financialPeriodId, ids), requests);
  return periods.map((period) => {
    const locked = locks.find((each) => each.periodId === period.id);
    return {
      ...recordOf(period),
      ...(locked === undefined ? {} : { lockedAt: locked.at.toISOString() }),
      reopenings: reopenings.filter((each) => each.periodId === period.id),
    };
  });
}

/** One reopening with its period, as the approval panel shows the request as made (PRD-ACS-007), or undefined. */
export async function reopeningRead(
  context: TransactionContext,
  reopeningId: string,
  requests: Requests,
): Promise<{ reopening: ReopeningView; period: PeriodRow } | undefined> {
  const [reopening] = await reopeningViews(context, eq(periodReopening.id, reopeningId), requests);
  if (reopening === undefined) return undefined;
  const period = await periodById(context, reopening.periodId);
  return period === undefined ? undefined : { reopening, period };
}
