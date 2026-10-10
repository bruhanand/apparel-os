import type { PeriodRecord } from '@apparel-os/schemas';
import { and, asc, eq, sql } from 'drizzle-orm';
import { lockTable, type TransactionContext } from '../../../../kernel/index.js';
import { financialPeriod } from '../db/schema.js';

// The financial periods of a book (books-and-posting 4.1, 4.5; S1-F09-T02). A period's state is a projection of its
// events and reopenings; until S1-F09-T03 adds them, every period is Open.

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
  readonly state: 'Open';
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

/** The period of a book a date lies in, or undefined (4.4). */
export async function periodOn(
  context: TransactionContext,
  bookId: string,
  date: string,
): Promise<PeriodRow | undefined> {
  const [row] = await context.tx
    .select(columns)
    .from(financialPeriod)
    .where(and(eq(financialPeriod.bookId, bookId), sql`${financialPeriod.dates} @> ${date}::date`));
  return row === undefined ? undefined : { ...row, state: 'Open' };
}

export async function periodById(context: TransactionContext, periodId: string): Promise<PeriodRow | undefined> {
  const [row] = await context.tx.select(columns).from(financialPeriod).where(eq(financialPeriod.id, periodId));
  return row === undefined ? undefined : { ...row, state: 'Open' };
}

/** A book's periods in date order (4.1). */
export async function periodsOfBook(context: TransactionContext, bookId: string): Promise<PeriodRecord[]> {
  const rows = await context.tx
    .select(columns)
    .from(financialPeriod)
    .where(eq(financialPeriod.bookId, bookId))
    .orderBy(asc(sql`lower(${financialPeriod.dates})`));
  return rows.map((row) => ({
    id: row.id,
    bookId: row.bookId,
    code: row.code,
    financialYear: row.financialYear,
    firstDay: row.firstDay,
    lastDay: dayBefore(row.end),
    state: 'Open',
  }));
}
