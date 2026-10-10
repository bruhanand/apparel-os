import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { EmptyState } from '../components/StandardStates';
import { AsOf } from '../history/AsOf';
import { t } from '../messages/catalogue';
import { useTimeZone } from '../shell/session';
import { formatDate, formatPaise } from '../setup/format';
import { inputClass, ListRead, Th, Toolbar } from '../setup/parts';
import { BookPicker } from './BookPicker';

// Money › Internal ledger and trial balance (books-and-posting 12, 14; ui-blueprint Money; PRD-LED-001, PRD-MOD-003,
// PRD-PRF-004, PRD-SEC-005; POL-11.01; S1-F09-T02): a book's trial balance for one of its periods, labelled the
// internal ledger, never the official book (Tally stays KDPS's), with its as-of time, and saying when the reader's
// scope covers only part of the book. In stage 1 it runs on SYNTHETIC data.

function PeriodPicker({
  bookId,
  value,
  onChange,
}: {
  bookId: string;
  value: string | null;
  onChange: (periodId: string | null) => void;
}) {
  const periods = useQuery(readQuery(api, 'listPeriods', { params: { bookId } }));
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="finance-period" className="text-body-sm font-semibold">
        {t('finance.period')}
      </label>
      <select
        id="finance-period"
        className={inputClass}
        value={value ?? ''}
        onChange={(event) => {
          onChange(event.target.value === '' ? null : event.target.value);
        }}
      >
        <option value="">{t('finance.period.choose')}</option>
        {(periods.data?.records ?? []).map((period) => (
          <option key={period.id} value={period.id}>
            {t('finance.period.option', {
              code: period.code,
              first: formatDate(period.firstDay),
              last: formatDate(period.lastDay),
            })}
          </option>
        ))}
      </select>
    </div>
  );
}

function TrialBalanceTable({ bookId, periodId }: { bookId: string; periodId: string }) {
  const timeZone = useTimeZone();
  const query = useQuery(readQuery(api, 'readTrialBalance', { params: { bookId }, query: { periodId } }));
  return (
    <ListRead query={query} what="ledger.what">
      {(balance) => (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <AsOf asOf={balance.asOf} timeZone={timeZone} />
          </div>
          {balance.partial && <Banner tone="warning" role="status" message="ledger.partial" />}
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full border-collapse text-body" aria-label={t('ledger.trial-balance')}>
              <thead>
                <tr>
                  <Th label="ledger.account" />
                  <Th label="ledger.nature" />
                  <Th label="ledger.opening" />
                  <Th label="ledger.debits" />
                  <Th label="ledger.credits" />
                  <Th label="ledger.closing" />
                </tr>
              </thead>
              <tbody>
                {balance.rows.map((row) => (
                  <tr key={row.accountId} className="h-10 border-t border-border">
                    <td className="px-3">
                      <span className="font-mono">{row.code}</span> {row.name}
                    </td>
                    <td className="px-3">{t(`ledger.nature.${row.nature}`)}</td>
                    <td className="px-3 text-right tabular-nums">{formatPaise(row.openingPaise)}</td>
                    <td className="px-3 text-right tabular-nums">{formatPaise(row.debitPaise)}</td>
                    <td className="px-3 text-right tabular-nums">{formatPaise(row.creditPaise)}</td>
                    <td className="px-3 text-right tabular-nums">{formatPaise(row.closingPaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="h-10 border-t border-border font-semibold">
                  <td className="px-3" colSpan={3}>
                    {t('ledger.totals')}
                  </td>
                  <td className="px-3 text-right tabular-nums">{formatPaise(balance.totals.debitPaise)}</td>
                  <td className="px-3 text-right tabular-nums">{formatPaise(balance.totals.creditPaise)}</td>
                  <td className="px-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </ListRead>
  );
}

/** Money › Internal ledger and trial balance. */
export function LedgerScreen() {
  const [bookId, setBookId] = useState<string | null>(null);
  const [periodId, setPeriodId] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="info" role="status" message="ledger.internal" />
      <Toolbar>
        <BookPicker
          value={bookId}
          onChange={(next) => {
            setBookId(next);
            setPeriodId(null);
          }}
        />
        {bookId !== null && <PeriodPicker bookId={bookId} value={periodId} onChange={setPeriodId} />}
      </Toolbar>
      {bookId === null || periodId === null ? (
        <EmptyState title="ledger.choose.title" body="ledger.choose.body" />
      ) : (
        <TrialBalanceTable bookId={bookId} periodId={periodId} />
      )}
    </div>
  );
}
