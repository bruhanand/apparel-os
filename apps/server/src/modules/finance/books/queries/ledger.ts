import type { Ledger, TrialBalance } from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import { account } from '../db/schema.js';
import { periodById } from './periods.js';

// The read models of the books part (books-and-posting 12; module-map 4.14; PRD-LED-001, PRD-LED-004, PRD-MOD-003,
// PRD-MOD-013, PRD-PRF-004, PRD-SEC-005; POL-11.01; S1-F09-T02): the trial balance of a book for a period and the
// ledger of an account over a date range, each with its as-of time and labelled the internal ledger, never the
// official book. They read the journal lines under row-level security, so a reader sees the lines in scope; a reader
// whose scope covers part of the book is told the answer is partial, by finance.lines_hidden, which says only that.
// Amounts are integer paise (PRD-MOD-014); a balance is signed, debit positive.

const dayBefore = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

const num = (value: unknown) => Number(value ?? 0);

async function hidden(context: TransactionContext, bookId: string, from: string | null, end: string) {
  const result = await context.tx.execute<{ hidden: boolean }>(
    sql`select finance.lines_hidden(${bookId}::uuid, ${from}::date, ${end}::date) as hidden`,
  );
  return result.rows[0]?.hidden === true;
}

/** The trial balance of a book for one of its periods (12), or undefined for a period of no such book. */
export async function trialBalance(
  context: TransactionContext,
  bookId: string,
  periodId: string,
): Promise<TrialBalance | undefined> {
  const period = await periodById(context, periodId);
  if (period?.bookId !== bookId) return undefined;
  const rows = await context.tx.execute<{
    account_id: string;
    code: string;
    nature: TrialBalance['rows'][number]['nature'];
    name: string | null;
    opening: string | null;
    debit: string | null;
    credit: string | null;
  }>(sql`
    select a.id as account_id, a.code, a.nature,
      (select v.name from finance.account_version v where v.account_id = a.id and v.decision = 'Approved'
         and lower(v.valid_during) < ${period.end}::date order by lower(v.valid_during) desc limit 1) as name,
      s.opening, s.debit, s.credit
    from ${account} a
    left join (
      select l.account_id,
        sum(case when j.accounting_date < ${period.firstDay}::date
                 then case when l.side = 'debit' then l.amount_paise else -l.amount_paise end end) as opening,
        sum(case when j.accounting_date >= ${period.firstDay}::date and l.side = 'debit' then l.amount_paise end)
          as debit,
        sum(case when j.accounting_date >= ${period.firstDay}::date and l.side = 'credit' then l.amount_paise end)
          as credit
      from finance.journal_line l join finance.journal j on j.id = l.journal_id
      where j.book_id = ${bookId}::uuid and j.accounting_date < ${period.end}::date
      group by l.account_id
    ) s on s.account_id = a.id
    where a.book_id = ${bookId}::uuid
    order by a.code, a.id`);
  const lines = rows.rows.map((row) => {
    const opening = num(row.opening);
    const debit = num(row.debit);
    const credit = num(row.credit);
    return {
      accountId: row.account_id,
      code: row.code,
      name: row.name ?? '',
      nature: row.nature,
      openingPaise: opening,
      debitPaise: debit,
      creditPaise: credit,
      closingPaise: opening + debit - credit,
    };
  });
  return {
    asOf: context.startedAt.toISOString(),
    ledger: 'internal',
    bookId,
    period: { id: period.id, code: period.code, firstDay: period.firstDay, lastDay: dayBefore(period.end) },
    partial: await hidden(context, bookId, null, period.end),
    rows: lines,
    totals: {
      debitPaise: lines.reduce((sum, row) => sum + row.debitPaise, 0),
      creditPaise: lines.reduce((sum, row) => sum + row.creditPaise, 0),
    },
  };
}

/** The ledger of an account over a date range, both days included (12), or undefined for no such account. */
export async function ledgerOf(
  context: TransactionContext,
  accountId: string,
  from: string,
  to: string,
): Promise<Ledger | undefined> {
  const [head] = (
    await context.tx.execute<{ book_id: string }>(sql`select book_id from ${account} where id = ${accountId}::uuid`)
  ).rows;
  if (head === undefined) return undefined;
  const end = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const [opening] = (
    await context.tx.execute<{ balance: string | null }>(sql`
      select sum(case when l.side = 'debit' then l.amount_paise else -l.amount_paise end) as balance
      from finance.journal_line l join finance.journal j on j.id = l.journal_id
      where l.account_id = ${accountId}::uuid and j.accounting_date < ${from}::date`)
  ).rows;
  const rows = await context.tx.execute<{
    line_id: string;
    journal_id: string;
    number: string;
    accounting_date: string;
    event_kind: string;
    side: 'debit' | 'credit';
    amount_paise: string;
    business_unit_id: string;
    store_id: string | null;
    brand_id: string | null;
    reverses_journal_id: string | null;
    source_module: string;
    source_record_type: string;
    source_record_id: string;
  }>(sql`
    select l.id as line_id, j.id as journal_id, j.number, j.accounting_date::text as accounting_date, j.event_kind,
      l.side, l.amount_paise, l.business_unit_id, l.store_id, l.brand_id, j.reverses_journal_id, j.source_module,
      j.source_record_type, j.source_record_id
    from finance.journal_line l join finance.journal j on j.id = l.journal_id
    where l.account_id = ${accountId}::uuid and j.accounting_date >= ${from}::date and j.accounting_date < ${end}::date
    order by j.accounting_date, j.id, l.id`);
  const openingPaise = num(opening?.balance);
  let closingPaise = openingPaise;
  const lines = rows.rows.map((row) => {
    const amountPaise = num(row.amount_paise);
    closingPaise += row.side === 'debit' ? amountPaise : -amountPaise;
    return {
      lineId: row.line_id,
      journalId: row.journal_id,
      journalNumber: row.number,
      accountingDate: row.accounting_date,
      eventKind: row.event_kind,
      side: row.side,
      amountPaise,
      businessUnitId: row.business_unit_id,
      ...(row.store_id === null ? {} : { storeId: row.store_id }),
      ...(row.brand_id === null ? {} : { brandId: row.brand_id }),
      ...(row.reverses_journal_id === null ? {} : { reversesJournalId: row.reverses_journal_id }),
      source: { module: row.source_module, recordType: row.source_record_type, recordId: row.source_record_id },
    };
  });
  return {
    asOf: context.startedAt.toISOString(),
    ledger: 'internal',
    accountId,
    bookId: head.book_id,
    from,
    to,
    partial: await hidden(context, head.book_id, null, end),
    openingPaise,
    closingPaise,
    lines,
  };
}
