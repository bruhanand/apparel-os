import { uuidv7, type Paise } from '@apparel-os/domain';
import { JOURNAL_TYPE, type MissingItem } from '@apparel-os/schemas';
import { asc, inArray } from 'drizzle-orm';
import {
  CommandDefect,
  LOCK_STEP,
  UNIQUE_VIOLATION,
  withSavepoint,
  type CommandRefusal,
  type TransactionContext,
} from '../../../../../kernel/index.js';
import type { NumberingInterface } from '../../../../numbering/index.js';
import { journal, journalLine, periodReopeningUse, type Side } from '../../db/schema.js';
import { journalPosted } from '../../events.js';
import { PERIOD_TABLE, type PeriodRow } from '../../queries/periods.js';
import { periodItem } from '../period-close.js';
import type { PostedJournal, PostRequest } from './types.js';

// Writing journals (books-and-posting 5.1, 5.4, 8.2, 4.3 step 4; S1-F09-T02, S1-F09-T03): the book's journal series,
// the period held at step 7, one journal with its lines, and a named correction's use. Post and Reverse are the only
// writers of `finance.journal_line` (12 "As built").

/**
 * The journal kind `finance` numbers (numbering-and-audit 3.1; books-and-posting 5.4; DEC-112, GC4-4): one series per
 * book and financial year, its texts unique in the book and year. Its format is the Organisation's, with no default
 * (numbering-and-audit 3.5): tests use a labelled synthetic one.
 */
export const JOURNAL_KIND = {
  kind: 'finance.journal',
  yearly: true,
  scopeKeyStandsFor: 'the accounting book, by its identifier',
  displayScope: { standsFor: 'the accounting book, by its identifier', perYear: true },
} as const;

/** The journal series of a book for a financial year, or the refusal while none is open (5.4). */
export async function journalSeries(
  context: TransactionContext,
  numbering: NumberingInterface,
  bookId: string,
  period: PeriodRow,
): Promise<{ kind: 'series'; seriesId: string } | { kind: 'refused'; refusal: CommandRefusal }> {
  const series = await numbering.liveSeries(context, {
    kind: JOURNAL_KIND.kind,
    scopeKey: bookId,
    financialYear: period.financialYear,
  });
  const missing: MissingItem[] = [{ kind: 'journal-series', bookId, financialYear: period.financialYear }];
  if (series === undefined) {
    return { kind: 'refused', refusal: { kind: 'unavailable', code: 'finance.no-journal-series', missing } };
  }
  if (series.state === 'Paused') {
    return { kind: 'refused', refusal: { kind: 'unavailable', code: 'finance.journal-series-paused', missing } };
  }
  return { kind: 'series', seriesId: series.seriesId };
}

export function requirePeriodHeld(context: TransactionContext, periodId: string): void {
  const held = context.heldLock(PERIOD_TABLE, periodId);
  if (held?.step !== LOCK_STEP.financialPeriod) {
    throw new CommandDefect(
      'Post writes only into a period the command holds at step 7 (books-and-posting 4.5; code-house-rules 8.2)',
    );
  }
}

export async function journalsByIds(context: TransactionContext, ids: readonly string[]): Promise<PostedJournal[]> {
  if (ids.length === 0) return [];
  const rows = await context.tx
    .select()
    .from(journal)
    .where(inArray(journal.id, [...ids]))
    .orderBy(asc(journal.id));
  return rows.map((row) => ({
    journalId: row.id,
    bookId: row.bookId,
    number: row.number,
    eventKind: row.eventKind,
    accountingDate: row.accountingDate,
    mapVersionId: row.postingMapVersionId,
  }));
}

/** Allocate's refusal on the held journal series, as Post's (5.4). */
function seriesRefusal(code: string, bookId: string): CommandRefusal {
  const missing: MissingItem[] = [{ kind: 'journal-series', bookId }];
  if (code === 'numbering.series-paused') {
    return { kind: 'unavailable', code: 'finance.journal-series-paused', missing };
  }
  return { kind: 'unavailable', code: 'finance.no-journal-series', missing };
}

/** A journal's header (5.1). */
export interface JournalHead {
  readonly bookId: string;
  readonly legalEntityId: string;
  readonly periodId: string;
  readonly accountingDate: string;
  readonly businessDate: string;
  readonly eventKind: string;
  readonly mapVersionId: string;
  readonly seriesId: string;
  readonly reversesJournalId?: string;
}

/** A journal line as written (5.1): its account, side, amount in paise above zero and scope facts (12). */
export interface JournalLineRow {
  readonly id: string;
  readonly accountId: string;
  readonly side: Side;
  readonly amountPaise: Paise;
  readonly legalEntityId: string;
  readonly siteId: string;
  readonly storeId: string | null;
  readonly businessUnitId: string;
  readonly brandId: string | null;
  readonly mappingVersionId: string;
}

/**
 * Writes one journal with its lines and answers it (5.1, 8.2): a number from the held journal series (5.4), the
 * header, the lines, and `finance.journal-posted`. The balance is checked at commit (5.2).
 */
export async function writeJournal(
  context: TransactionContext,
  numbering: NumberingInterface,
  request: Pick<PostRequest, 'sourceModule' | 'document' | 'actor' | 'onBehalfOfUserId'>,
  head: JournalHead,
  lines: readonly JournalLineRow[],
): Promise<{ kind: 'written'; journal: PostedJournal } | { kind: 'refused'; refusal: CommandRefusal }> {
  const journalId = uuidv7();
  const allocated = await numbering.allocate(context, {
    seriesId: head.seriesId,
    documentType: JOURNAL_TYPE,
    documentId: journalId,
  });
  if (allocated.kind === 'refused') {
    return { kind: 'refused', refusal: seriesRefusal(allocated.refusal.code, head.bookId) };
  }
  await context.tx.insert(journal).values({
    id: journalId,
    bookId: head.bookId,
    legalEntityId: head.legalEntityId,
    financialPeriodId: head.periodId,
    accountingDate: head.accountingDate,
    businessDate: head.businessDate,
    eventKind: head.eventKind,
    sourceModule: request.sourceModule,
    sourceRecordType: request.document.recordType,
    sourceRecordId: request.document.recordId,
    sourceVersionId: request.document.versionId ?? null,
    postingMapVersionId: head.mapVersionId,
    numberAllocationId: allocated.value.allocationId,
    number: allocated.value.formattedText,
    reversesJournalId: head.reversesJournalId ?? null,
    actorUserId: request.actor.kind === 'user' ? request.actor.id : null,
    actorServiceIdentityId: request.actor.kind === 'service' ? request.actor.id : null,
    onBehalfOfUserId: request.onBehalfOfUserId ?? null,
    occurredAt: context.startedAt,
  });
  await context.tx.insert(journalLine).values(lines.map((line) => ({ ...line, journalId })));
  await context.publish(journalPosted, {
    subject: { module: 'finance', recordType: JOURNAL_TYPE, recordId: journalId },
    scope: { legalEntityId: head.legalEntityId },
    payload: {
      journalId,
      bookId: head.bookId,
      postingMapVersionId: head.mapVersionId,
      ...(head.reversesJournalId === undefined ? {} : { reversesJournalId: head.reversesJournalId }),
    },
    ...(request.onBehalfOfUserId === undefined ? {} : { onBehalfOfUserId: request.onBehalfOfUserId }),
  });
  return {
    kind: 'written',
    journal: {
      journalId,
      bookId: head.bookId,
      number: allocated.value.formattedText,
      eventKind: head.eventKind,
      accountingDate: head.accountingDate,
      mapVersionId: head.mapVersionId,
    },
  };
}

/**
 * Records a named correction's use (4.3 step 4, 4.5; PRD-LED-020), once, after its journals; or answers the refusal
 * naming the period when the correction was used already, such as by another posting of it at the same time.
 */
export async function recordUse(
  context: TransactionContext,
  correction: string,
  journalId: string,
  period: { readonly id: string; readonly code: string },
): Promise<CommandRefusal | undefined> {
  const written = await withSavepoint(context, 'finance_correction_use', [UNIQUE_VIOLATION], () =>
    context.tx.insert(periodReopeningUse).values({ id: uuidv7(), periodReopeningSourceId: correction, journalId }),
  );
  if (written.kind === 'done') return undefined;
  return { kind: 'refused', code: 'finance.period-locked', missing: [periodItem(period)] };
}
