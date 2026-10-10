import { uuidv7, type Paise } from '@apparel-os/domain';
import { postingSource } from '../../db/schema.js';
import { byText } from '../../domain/order.js';
import { sumLines, type ItemLine } from '../../domain/posting.js';
import type { TransactionContext } from '../../../../../kernel/index.js';
import { checkPostable } from './check.js';
import { journalsByIds, recordUse, requirePeriodHeld, writeJournal, type JournalLineRow } from './journal.js';
import type { PostableItem, PostDependencies, PostedJournal, PostRequest, PostResult } from './types.js';

// Post (books-and-posting 8, 9.1 to 9.3; module-map 4.14, 6.1, 6.3; PRD-LED-003, PRD-LED-004, PRD-MOD-013,
// PRD-MOD-014, PRD-INT-002, PRD-INT-004, PRD-INT-008; POL-09.11, POL-09.12, POL-09.13; DEC-087, DEC-105;
// S1-F09-T02). It joins the caller's transaction: it opens, commits and rolls back nothing (9.3), and writes nothing
// unless every item is postable (9.2). The caller runs Check postable before any lock, holds the periods at step 7 and
// the journal series at step 8, then posts.

/**
 * Post (9.1 to 9.3; module-map 4.14): rechecks every item under the caller's locks; one refused item refuses the whole
 * document and nothing is written (9.2; PRD-INT-004). Otherwise one journal per book, event kind and accounting date,
 * its lines summed by account, side, business unit, Store and brand (8.2), a number from the book's journal series
 * (5.4), a posting-source row per item and non-zero component (8.3), and `finance.journal-posted`. Answers Posted with
 * the journals and the map version each used, Nothing to post, or Refused with each refused item and its reason.
 */
export async function post(
  context: TransactionContext,
  dependencies: PostDependencies,
  request: PostRequest,
): Promise<PostResult> {
  const checks = await checkPostable(context, dependencies, request);
  const refused = checks.filter((each) => each.kind === 'refused');
  if (refused.length > 0) return { kind: 'refused', items: refused };
  const replayed = checks.flatMap((each) => (each.kind === 'posted' ? each.journalIds : []));
  const postable = checks.filter((each) => each.kind === 'postable');
  if (postable.length === 0) {
    if (replayed.length === 0) return { kind: 'nothing-to-post' };
    return { kind: 'posted', journals: await journalsByIds(context, [...new Set(replayed)]) };
  }
  const groups = new Map<string, PostableItem[]>();
  for (const check of postable) {
    requirePeriodHeld(context, check.period.id);
    const key = [check.bookId, check.eventKind, check.accountingDate].join('|');
    const group = groups.get(key) ?? [];
    group.push(check);
    groups.set(key, group);
  }
  const written: PostedJournal[] = [];
  const uses = new Map<string, { journalId: string; period: PostableItem['period'] }>();
  for (const [, group] of [...groups.entries()].sort(([a], [b]) => byText(a, b))) {
    const answer = await postGroup(context, dependencies, request, group);
    if (answer.kind === 'refused') return answer;
    written.push(answer.journal);
    for (const each of group) {
      if (each.correction !== undefined && !uses.has(each.correction)) {
        uses.set(each.correction, { journalId: answer.journal.journalId, period: each.period });
      }
    }
  }
  // 4.3 step 4, 4.5; PRD-LED-020: each named correction's use, once, after its journals, which the period guard
  // admitted while it was still unused. A second posting of the same correction meets the unique key.
  for (const [correction, use] of uses) {
    const used = await recordUse(context, correction, use.journalId, use.period);
    if (used !== undefined) {
      const items = postable.filter((each) => each.correction === correction);
      return {
        kind: 'refused',
        items: items.map((each) => ({ kind: 'refused', itemKey: each.itemKey, refusal: used })),
      };
    }
  }
  const earlier = await journalsByIds(context, [...new Set(replayed)]);
  return { kind: 'posted', journals: [...earlier, ...written] };
}

/** One journal of a book, event kind and date: its summed lines and its items' posting-source rows (8.2, 8.3). */
async function postGroup(
  context: TransactionContext,
  dependencies: PostDependencies,
  request: PostRequest,
  group: readonly PostableItem[],
): Promise<{ kind: 'written'; journal: PostedJournal } | Extract<PostResult, { kind: 'refused' }>> {
  const [first] = group;
  if (first === undefined) throw new Error('A journal group holds at least one item');
  const itemKeyOf = new Map<ItemLine, string>();
  for (const each of group) for (const line of each.lines) itemKeyOf.set(line, each.itemKey);
  const lineRows = sumLines(group.flatMap((each) => each.lines)).map((line) => ({ id: uuidv7(), line }));
  const answer = await writeJournal(
    context,
    dependencies.numbering,
    request,
    {
      bookId: first.bookId,
      legalEntityId: first.legalEntityId,
      periodId: first.period.id,
      accountingDate: first.accountingDate,
      businessDate: first.accountingDate,
      eventKind: first.eventKind,
      mapVersionId: first.mapVersionId,
      seriesId: first.journalSeriesId,
    },
    lineRows.map(({ id, line }): JournalLineRow => ({
      id,
      accountId: line.accountId,
      side: line.side,
      amountPaise: line.amount,
      ...line.dimensions,
    })),
  );
  if (answer.kind === 'refused') {
    return {
      kind: 'refused',
      items: group.map((each) => ({ kind: 'refused', itemKey: each.itemKey, refusal: answer.refusal })),
    };
  }
  // 8.3: one row per item and component, naming the journal line its first map line went into.
  const hashes = new Map(group.map((each) => [each.itemKey, each.hash]));
  const sources = new Map<string, { itemKey: string; component: string; amount: Paise; lineId: string }>();
  for (const { id, line } of lineRows) {
    for (const part of line.parts) {
      const itemKey = itemKeyOf.get(part) ?? '';
      const sourceKey = `${itemKey}|${part.component}`;
      if (!sources.has(sourceKey)) {
        sources.set(sourceKey, { itemKey, component: part.component, amount: part.signedAmount, lineId: id });
      }
    }
  }
  const rows = [...sources.values()].map((each) => ({
    id: uuidv7(),
    sourceModule: request.sourceModule,
    itemKey: each.itemKey,
    component: each.component,
    amountPaise: each.amount,
    journalId: answer.journal.journalId,
    journalLineId: each.lineId,
    itemHash: hashes.get(each.itemKey) ?? '',
  }));
  // A large document's rows (stock-ledger 10.6) in multi-row inserts of a bounded size, so no statement passes
  // PostgreSQL's limit of 65,535 bound parameters (S1-F10-T07). A technical bound, no business value.
  for (let start = 0; start < rows.length; start += SOURCE_ROWS_PER_INSERT) {
    await context.tx.insert(postingSource).values(rows.slice(start, start + SOURCE_ROWS_PER_INSERT));
  }
  return answer;
}

/** Posting-source rows a multi-row insert takes at once: 8 columns each, well inside the parameter limit. */
const SOURCE_ROWS_PER_INSERT = 1000;
