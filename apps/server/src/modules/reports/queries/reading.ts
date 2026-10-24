import type { CommandRefusal, ReadModelGateway, TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import { BUSINESS_DATE_NOT_SET, EXPORT_TOO_LARGE } from '../domain/refusals.js';
import { ReadRefused } from './authority.js';

// What every read of stock search and the stage 2 reports shares (goods-in 9.1, 9.4, 9.5; code-house-rules 8.1, 9,
// 12.1 "Reads"; S2-F11-T01, S2-F11-T02; code reviews 8 and 9 of stage 2): the reading itself, one bundle of the gateway,
// `access`, the reader's transaction, the reader and the business date; the business date or its refusal; a read
// refused as a whole, answered as a refusal; a page's size; and reading a list to its end within technical caps.

/** One reader's read: through the gateway, asking `access`, in the reader's transaction, on the business date. */
export interface Reading {
  readonly gateway: ReadModelGateway;
  readonly access: AccessInterface;
  readonly context: TransactionContext;
  readonly actorId: string;
  /** The business date and the Organisation's timezone (code-house-rules 9). */
  readonly today: string;
  readonly timeZone: string;
}

/**
 * A read as the reader on the business date: the reading's answer, or the refusal while the Organisation has no
 * timezone, or of a read refused as a whole (`ReadRefused`; access-and-approvals 7.1 step 3). Shared by the search's and
 * the reports' routes and by their exports' commands.
 */
export async function asReader<Answer>(
  base: Pick<Reading, 'gateway' | 'access' | 'context' | 'actorId'>,
  work: (reading: Reading) => Promise<Answer>,
): Promise<{ readonly refused: CommandRefusal } | { readonly answer: Answer }> {
  const date = await base.context.businessDate();
  if (date.kind === 'not-set') return { refused: BUSINESS_DATE_NOT_SET };
  try {
    return { answer: await work({ ...base, today: date.date, timeZone: date.timezone }) };
  } catch (error) {
    if (error instanceof ReadRefused) return { refused: error.refusal };
    throw error;
  }
}

/** The rows a page holds: the limit asked, or the list's cap (code-house-rules 12.1 "Reads"). */
export const pageLimitOf = (limit: string | undefined, cap: number): number =>
  limit === undefined ? cap : Number(limit);

/** One page of a list as a report reads it: the rows the reader may see, how many it read, and where the next starts. */
export interface ReadPage<Row> {
  readonly rows: readonly Row[];
  readonly read: number;
  readonly next: string | null;
}

/**
 * A list read to its end, a page at a time (goods-in 9.5; PRD-PRF-004): at most `readCap` records read, shown or
 * hidden, past which the read is refused as `tooMany` says; and, for an export, at most `shownCap` rows shown, past which
 * it is refused as too large (`reports.export-too-large`). So no figure or file holds part of a list as if it were all
 * of it, and hidden records are never read without a limit. Both caps are technical (goods-in 9.5).
 */
export async function readAll<Row>(
  readPage: (after: string | undefined) => Promise<ReadPage<Row>>,
  caps: { readonly readCap: number; readonly tooMany: CommandRefusal; readonly shownCap?: number },
): Promise<Row[]> {
  const rows: Row[] = [];
  let after: string | undefined;
  let read = 0;
  for (;;) {
    const page = await readPage(after);
    read += page.read;
    if (read > caps.readCap) throw new ReadRefused(caps.tooMany);
    rows.push(...page.rows);
    if (caps.shownCap !== undefined && rows.length > caps.shownCap) throw new ReadRefused(EXPORT_TOO_LARGE);
    if (page.next === null) return rows;
    after = page.next;
  }
}
