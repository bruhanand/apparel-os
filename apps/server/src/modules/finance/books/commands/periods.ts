import { uuidv7 } from '@apparel-os/domain';
import type { MissingItem, PeriodDraft } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import {
  EXCLUSION_VIOLATION,
  LOCK_STEP,
  UNIQUE_VIOLATION,
  withSavepoint,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { Preparer } from '../../../access/index.js';
import type { AuditChange } from '../../../audit/index.js';
import { accountingBookExists } from '../../../organisation/index.js';
import { financialPeriod } from '../db/schema.js';
import { PERIOD_TABLE } from '../queries/periods.js';
import { refused, type Outcome } from './lines.js';

// Define a financial period of a book (books-and-posting 4.1; PRD-LED-001; S1-F09-T02): its code unique in the book, a
// date range inside the one financial year it names, never overlapping another period of the book and leaving no gap
// after the book's first period. Every period is Open here; Lock and reopening are S1-F09-T03. Which ranges each book
// uses, and the financial year's dates, are Accounts' and the CA's (GC4-1, GC5-1): tests use labelled synthetic ones.
// One authorised Accounts user defines it; no source asks for a second person, so none is asked (**Design choice**,
// as for locking, 4.2). The book's existing periods are locked at step 7, the period rows' step (code-house-rules 8.2),
// so two definitions in one book never pass each other's gap check.

/** The SQLSTATE the gap trigger raises (migration 0053). */
const PERIOD_GAP = 'AO010';

const dayAfter = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export async function definePeriod(
  context: TransactionContext,
  audit: (
    context: TransactionContext,
    preparer: Preparer,
    record: { readonly type: string; readonly id: string },
    operation: string,
    changes: readonly AuditChange[],
  ) => Promise<void>,
  preparer: Preparer,
  bookId: string,
  draft: PeriodDraft,
): Promise<Outcome<{ periodId: string }>> {
  const book: MissingItem = { kind: 'record', recordType: 'organisation.accounting_book', recordId: bookId };
  if (draft.lastDay < draft.firstDay) return refused('refused', 'finance.period-dates-invalid', [book]);
  if (!(await accountingBookExists(context, bookId))) return refused('not-found', 'finance.record-not-found', [book]);
  const existing = await context.tx
    .select({ id: financialPeriod.id })
    .from(financialPeriod)
    .where(eq(financialPeriod.bookId, bookId));
  await context.lock(
    LOCK_STEP.financialPeriod,
    existing.map((row) => ({ table: PERIOD_TABLE, id: row.id, mode: 'exclusive' as const })),
  );
  const dates = `[${draft.firstDay},${dayAfter(draft.lastDay)})`;
  const periodId = uuidv7();
  const written = await withSavepoint(
    context,
    'finance_new_period',
    [UNIQUE_VIOLATION, EXCLUSION_VIOLATION, PERIOD_GAP],
    () =>
      context.tx.insert(financialPeriod).values({
        id: periodId,
        bookId,
        code: draft.code,
        financialYear: draft.financialYear,
        dates,
        definedByUserId: preparer.userId,
      }),
  );
  if (written.kind === 'caught') {
    const code =
      written.violation.sqlState === UNIQUE_VIOLATION
        ? 'finance.period-code-taken'
        : written.violation.sqlState === EXCLUSION_VIOLATION
          ? 'finance.period-overlaps'
          : 'finance.period-gap';
    return refused('refused', code, [book]);
  }
  const value = (field: string, after: string): AuditChange => ({ kind: 'value', field, before: null, after });
  await audit(context, preparer, { type: 'financial_period', id: periodId }, 'define-financial-period', [
    value('bookId', bookId),
    value('code', draft.code),
    value('financialYear', draft.financialYear),
    value('firstDay', draft.firstDay),
    value('lastDay', draft.lastDay),
  ]);
  return { kind: 'success', answer: { periodId } };
}
