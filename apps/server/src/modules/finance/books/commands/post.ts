import { isKnown, uuidv7, type MaybeKnown, type Paise } from '@apparel-os/domain';
import { JOURNAL_TYPE, type MissingItem } from '@apparel-os/schemas';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
  canonicalJson,
  CommandDefect,
  LOCK_STEP,
  sha256Hex,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { NumberingInterface } from '../../../numbering/index.js';
import { journal, journalLine, postingSource } from '../db/schema.js';
import { journalPosted } from '../events.js';
import { applyMap, otherSide, sumLines, type ItemLine, type PostingEventKind } from '../domain/posting.js';
import { dimensionsOn } from '../queries/dimensions.js';
import { accountsInForce, mapVersionOn } from '../queries/maps.js';
import { PERIOD_TABLE, periodOn, type PeriodRow } from '../queries/periods.js';

// Check postable, Hold periods, Post and Reverse (books-and-posting 8, 9.1 to 9.4, 10; module-map 4.14, 6.1, 6.3;
// PRD-LED-003, PRD-LED-004, PRD-MOD-011, PRD-MOD-013, PRD-MOD-015, PRD-INT-002, PRD-INT-004, PRD-INT-008;
// POL-09.11, POL-09.12, POL-09.13; DEC-087, DEC-105; S1-F09-T02). Every operation joins the caller's transaction: it
// opens, commits and rolls back nothing (9.3), and Post writes nothing unless every item is postable (9.2). The caller
// runs Check postable before any lock, holds the periods at step 7 and the journal series at step 8, then posts.

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

/** One amount an item carries (7.1): a signed amount in paise, or Unknown (PRD-MOD-015). */
export interface PostComponent {
  readonly component: string;
  readonly amount: MaybeKnown<Paise>;
}

/** One item of a document: a valued movement, or another money effect (8.1). */
export interface PostItem {
  /** Unique for the source module, such as a movement's identifier (9.3). */
  readonly itemKey: string;
  readonly eventKind: string;
  readonly businessUnitId: string;
  /** The Store the caller took the item at, checked against the unit's (8.1); leave out to take the unit's. */
  readonly storeId?: string | null;
  readonly brandId: string | null;
  /** The source's business date; the accounting date (4.4). */
  readonly businessDate: string;
  readonly components: readonly PostComponent[];
}

/** One document's posting (8.1): its source, who posts it, and its items. */
export interface PostRequest {
  readonly sourceModule: string;
  readonly document: { readonly recordType: string; readonly recordId: string; readonly versionId?: string };
  readonly actor: { readonly kind: 'user' | 'service'; readonly id: string };
  /** The person a job acts for (access-and-approvals 9.8). */
  readonly onBehalfOfUserId?: string;
  readonly items: readonly PostItem[];
}

/** What 9.3 asks the caller to keep of an item already posted with different content, never a secret. */
export interface ChangedItem {
  readonly sourceModule: string;
  readonly itemKey: string;
  readonly postedHash: string;
  readonly changedHash: string;
  readonly content: ItemContent;
}

interface ItemContent {
  readonly eventKind: string;
  readonly businessUnitId: string;
  readonly storeId: string | null;
  readonly brandId: string | null;
  readonly businessDate: string;
  readonly components: readonly { readonly component: string; readonly amountPaise: number }[];
}

/** Check postable's answer for one item (9.1), and what Post works from. */
export type ItemCheck =
  | {
      readonly kind: 'postable';
      readonly itemKey: string;
      readonly bookId: string;
      readonly legalEntityId: string;
      readonly period: { readonly id: string; readonly code: string; readonly state: 'Open' };
      readonly mapVersionId: string;
      readonly journalSeriesId: string;
      readonly eventKind: string;
      readonly accountingDate: string;
      readonly hash: string;
      readonly lines: readonly ItemLine[];
    }
  /** Every component is zero: nothing to post (9.2). */
  | { readonly kind: 'nothing'; readonly itemKey: string }
  /** Posted already with the same content: Post answers the first result (9.3). */
  | { readonly kind: 'posted'; readonly itemKey: string; readonly journalIds: readonly string[] }
  | {
      readonly kind: 'refused';
      readonly itemKey: string;
      readonly refusal: CommandRefusal;
      readonly changed?: ChangedItem;
    };

/** A journal Post wrote or found (9.2): its book, number and the map version it used. */
export interface PostedJournal {
  readonly journalId: string;
  readonly bookId: string;
  readonly number: string;
  readonly eventKind: string;
  readonly accountingDate: string;
  readonly mapVersionId: string;
}

/** Post's one result per document (9.2). */
export type PostResult =
  | { readonly kind: 'posted'; readonly journals: readonly PostedJournal[] }
  | { readonly kind: 'nothing-to-post' }
  | { readonly kind: 'refused'; readonly items: readonly Extract<ItemCheck, { kind: 'refused' }>[] };

export interface PostDependencies {
  readonly kinds: ReadonlyMap<string, PostingEventKind>;
  readonly numbering: NumberingInterface;
}

const refusal = (itemKey: string, code: string, missing: MissingItem[], kind: CommandRefusal['kind'] = 'refused') =>
  ({ kind: 'refused', itemKey, refusal: { kind, code, missing } }) as const;

function contentOf(item: PostItem, amounts: readonly { component: string; amountPaise: number }[]): ItemContent {
  return {
    eventKind: item.eventKind,
    businessUnitId: item.businessUnitId,
    storeId: item.storeId ?? null,
    brandId: item.brandId,
    businessDate: item.businessDate,
    components: [...amounts].sort((a, b) => (a.component < b.component ? -1 : 1)),
  };
}

const hashOf = (content: ItemContent) =>
  sha256Hex(canonicalJson({ ...content, components: content.components.map((each) => ({ ...each })) }));

/** The rows already posted for an item, by source module and item key, as first posted (9.3). */
async function postedRows(context: TransactionContext, sourceModule: string, itemKey: string) {
  return context.tx
    .select({ journalId: postingSource.journalId, itemHash: postingSource.itemHash })
    .from(postingSource)
    .where(
      and(
        eq(postingSource.sourceModule, sourceModule),
        eq(postingSource.itemKey, itemKey),
        isNull(postingSource.replacesPostingSourceId),
      ),
    );
}

/** The journal series of a book for a financial year, or the refusal while none is open (5.4). */
async function journalSeries(
  context: TransactionContext,
  numbering: NumberingInterface,
  bookId: string,
  period: PeriodRow,
): Promise<{ kind: 'series'; seriesId: string } | { kind: 'refused'; code: string; missing: MissingItem[] }> {
  const series = await numbering.liveSeries(context, {
    kind: JOURNAL_KIND.kind,
    scopeKey: bookId,
    financialYear: period.financialYear,
  });
  const missing: MissingItem[] = [{ kind: 'journal-series', bookId, financialYear: period.financialYear }];
  if (series === undefined) return { kind: 'refused', code: 'finance.no-journal-series', missing };
  if (series.state === 'Paused') return { kind: 'refused', code: 'finance.journal-series-paused', missing };
  return { kind: 'series', seriesId: series.seriesId };
}

/**
 * Check one item (8.1, 6.2, 9.3): the event kind declared, no Unknown amount, the same content if already posted, the
 * unit's book through its mapping on the accounting date, the Store, the period, the map version in force with its
 * lines and accounts, and the book's journal series. Writes and locks nothing.
 */
export async function checkItem(
  context: TransactionContext,
  dependencies: PostDependencies,
  sourceModule: string,
  item: PostItem,
): Promise<ItemCheck> {
  const key = item.itemKey;
  const kind = dependencies.kinds.get(item.eventKind);
  if (kind === undefined) {
    return refusal(key, 'finance.event-kind-not-declared', [{ kind: 'posting-event-kind', eventKind: item.eventKind }]);
  }
  const strange = item.components.find((each) => !kind.components.includes(each.component));
  if (strange !== undefined) {
    return refusal(key, 'finance.component-not-of-kind', [
      { kind: 'posting-component', eventKind: item.eventKind, component: strange.component },
    ]);
  }
  // 8.4; PRD-MOD-015, POL-09.02: an Unknown amount is never posted and never turned into zero.
  const unknown = item.components.find((each) => !isKnown(each.amount));
  if (unknown !== undefined) {
    return refusal(key, 'finance.unknown-amount', [
      { kind: 'posting-component', eventKind: item.eventKind, component: unknown.component },
    ]);
  }
  const amounts = item.components.map((each) => ({
    component: each.component,
    amountPaise: isKnown(each.amount) ? Number(each.amount.value) : 0,
  }));
  const content = contentOf(item, amounts);
  const hash = hashOf(content);
  // 9.3; PRD-INT-002, PRD-INT-008: the same item again answers its first result; changed, it is refused and kept.
  const posted = await postedRows(context, sourceModule, key);
  if (posted.length > 0) {
    const postedHash = posted[0]?.itemHash ?? '';
    if (postedHash === hash) {
      return { kind: 'posted', itemKey: key, journalIds: [...new Set(posted.map((row) => row.journalId))] };
    }
    return {
      ...refusal(key, 'finance.item-changed', [{ kind: 'posting-source', sourceModule, itemKey: key }]),
      changed: { sourceModule, itemKey: key, postedHash, changedHash: hash, content },
    };
  }
  if (amounts.every((each) => each.amountPaise === 0)) return { kind: 'nothing', itemKey: key };
  // 2.1; PRD-LED-002, PRD-ACP-013: the unit's book through its mapping on the accounting date (4.4).
  const date = item.businessDate;
  const found = await dimensionsOn(context, { businessUnitId: item.businessUnitId, brandId: item.brandId }, date);
  if (found.kind === 'refusal') return { kind: 'refused', itemKey: key, refusal: found.refusal };
  const dimensions = found.answer;
  if (item.storeId !== undefined && item.storeId !== dimensions.storeId) {
    return refusal(key, 'finance.store-mismatch', [
      { kind: 'record', recordType: 'organisation.business_unit', recordId: item.businessUnitId },
    ]);
  }
  const book = dimensions.bookId;
  const period = await periodOn(context, book, date);
  if (period === undefined)
    return refusal(key, 'finance.no-period', [{ kind: 'financial-period', bookId: book, date }]);
  // 6.2; POL-09.12, SL-23: no valid map refuses the item with the failed condition.
  const map = await mapVersionOn(context, book, item.eventKind, date);
  const mapItem: MissingItem = { kind: 'posting-map', bookId: book, eventKind: item.eventKind };
  if (map === undefined) return refusal(key, 'finance.no-posting-map', [mapItem]);
  const accounts = await accountsInForce(
    context,
    map.lines.map((line) => line.accountId),
    date,
  );
  const applied = applyMap(
    map.lines,
    amounts.map((each) => ({ component: each.component, amount: each.amountPaise })),
    {
      businessUnitId: dimensions.businessUnitId,
      siteId: dimensions.siteId,
      storeId: dimensions.storeId,
      brandId: dimensions.brandId,
      legalEntityId: dimensions.legalEntityId,
      mappingVersionId: dimensions.mappingVersionId,
    },
    accounts,
  );
  if (applied.kind === 'refused') {
    const failed = applied.refusal;
    const detail: MissingItem =
      failed.code === 'finance.map-account-not-in-force'
        ? { kind: 'record', recordType: 'finance.account', recordId: failed.accountId }
        : failed.code === 'finance.missing-dimension'
          ? { kind: 'dimension', dimension: failed.dimension, component: failed.component }
          : failed.code === 'finance.component-without-line'
            ? { kind: 'posting-component', eventKind: item.eventKind, component: failed.component }
            : mapItem;
    return refusal(key, failed.code, [{ ...mapItem, versionId: map.versionId }, detail]);
  }
  const series = await journalSeries(context, dependencies.numbering, book, period);
  if (series.kind === 'refused') return refusal(key, series.code, series.missing, 'unavailable');
  return {
    kind: 'postable',
    itemKey: key,
    bookId: book,
    legalEntityId: dimensions.legalEntityId,
    period: { id: period.id, code: period.code, state: period.state },
    mapVersionId: map.versionId,
    journalSeriesId: series.seriesId,
    eventKind: item.eventKind,
    accountingDate: date,
    hash,
    lines: applied.lines,
  };
}

/** Check postable (9.1; module-map 6.1 step 4): each item's answer. Writes nothing and locks nothing. */
export async function checkPostable(
  context: TransactionContext,
  dependencies: PostDependencies,
  request: Pick<PostRequest, 'sourceModule' | 'items'>,
): Promise<ItemCheck[]> {
  const checks: ItemCheck[] = [];
  for (const item of request.items) checks.push(await checkItem(context, dependencies, request.sourceModule, item));
  return checks;
}

/**
 * Hold periods (9.1, 4.5; stock-ledger 10.3 step 7): takes the row of each period the postable items post into in
 * shared mode, so postings into one period never wait for each other on it, and answers the journal series the
 * caller locks with its own at step 8 (code-house-rules 8.2 "Number series"). Refuses a period that does not exist.
 */
export async function holdPeriods(
  context: TransactionContext,
  numbering: NumberingInterface,
  checks: readonly ItemCheck[],
): Promise<{ kind: 'held'; seriesTargets: LockTarget[] } | { kind: 'refused'; refusal: CommandRefusal }> {
  const postable = checks.filter((each) => each.kind === 'postable');
  const periods = [...new Set(postable.map((each) => each.period.id))];
  const held = await context.lock(
    LOCK_STEP.financialPeriod,
    periods.map((id) => ({ table: PERIOD_TABLE, id, mode: 'shared' as const })),
  );
  if (held.missing.length > 0) {
    return {
      kind: 'refused',
      refusal: {
        kind: 'refused',
        code: 'finance.no-period',
        missing: held.missing.map((each) => ({ kind: 'financial-period', periodId: each.id })),
      },
    };
  }
  // The journal series the postable items draw on, for the caller's step 8 lock call.
  const series = [...new Set(postable.map((each) => each.journalSeriesId))];
  return { kind: 'held', seriesTargets: series.map((id) => numbering.seriesLockTarget(id)) };
}

function requirePeriodHeld(context: TransactionContext, periodId: string): void {
  const held = context.heldLock(PERIOD_TABLE, periodId);
  if (held?.step !== LOCK_STEP.financialPeriod) {
    throw new CommandDefect(
      'Post writes only into a period the command holds at step 7 (books-and-posting 4.5; code-house-rules 8.2)',
    );
  }
}

async function journalsByIds(context: TransactionContext, ids: readonly string[]): Promise<PostedJournal[]> {
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
  if (code === 'numbering.series-paused')
    return { kind: 'unavailable', code: 'finance.journal-series-paused', missing };
  return { kind: 'unavailable', code: 'finance.no-journal-series', missing };
}

/** Writes one journal with its lines, already summed, and answers it (5.1, 8.2). */
async function writeJournal(
  context: TransactionContext,
  numbering: NumberingInterface,
  request: PostRequest,
  head: {
    readonly bookId: string;
    readonly legalEntityId: string;
    readonly periodId: string;
    readonly accountingDate: string;
    readonly businessDate: string;
    readonly eventKind: string;
    readonly mapVersionId: string;
    readonly seriesId: string;
    readonly reversesJournalId?: string;
  },
): Promise<{ kind: 'written'; journal: PostedJournal } | { kind: 'refused'; refusal: CommandRefusal }> {
  const journalId = uuidv7();
  const allocated = await numbering.allocate(context, {
    seriesId: head.seriesId,
    documentType: JOURNAL_TYPE,
    documentId: journalId,
  });
  if (allocated.kind === 'refused')
    return { kind: 'refused', refusal: seriesRefusal(allocated.refusal.code, head.bookId) };
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
  const groups = new Map<string, Extract<ItemCheck, { kind: 'postable' }>[]>();
  for (const check of postable) {
    requirePeriodHeld(context, check.period.id);
    const key = [check.bookId, check.eventKind, check.accountingDate].join('|');
    groups.set(key, [...(groups.get(key) ?? []), check]);
  }
  const written: PostedJournal[] = [];
  for (const [, group] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const first = group[0];
    if (first === undefined) continue;
    const answer = await writeJournal(context, dependencies.numbering, request, {
      bookId: first.bookId,
      legalEntityId: first.legalEntityId,
      periodId: first.period.id,
      accountingDate: first.accountingDate,
      businessDate: first.accountingDate,
      eventKind: first.eventKind,
      mapVersionId: first.mapVersionId,
      seriesId: first.journalSeriesId,
    });
    if (answer.kind === 'refused') {
      return {
        kind: 'refused',
        items: group.map((each) => ({ kind: 'refused', itemKey: each.itemKey, refusal: answer.refusal })),
      };
    }
    const journalId = answer.journal.journalId;
    const hashes = new Map(group.map((each) => [each.itemKey, each.hash]));
    const itemKeyOf = new Map<ItemLine, string>();
    for (const each of group) for (const line of each.lines) itemKeyOf.set(line, each.itemKey);
    const summed = sumLines(group.flatMap((each) => each.lines));
    const lineRows = summed.map((line) => ({ id: uuidv7(), line }));
    await context.tx.insert(journalLine).values(
      lineRows.map(({ id, line }) => ({
        id,
        journalId,
        accountId: line.accountId,
        side: line.side,
        amountPaise: line.amount,
        legalEntityId: line.dimensions.legalEntityId,
        siteId: line.dimensions.siteId,
        storeId: line.dimensions.storeId,
        businessUnitId: line.dimensions.businessUnitId,
        brandId: line.dimensions.brandId,
        mappingVersionId: line.dimensions.mappingVersionId,
      })),
    );
    // 8.3: one row per item and component, naming the journal line its first map line went into.
    const sources = new Map<string, { itemKey: string; component: string; amount: number; lineId: string }>();
    for (const { id, line } of lineRows) {
      for (const part of line.parts) {
        const itemKey = itemKeyOf.get(part) ?? '';
        const sourceKey = `${itemKey}|${part.component}`;
        if (!sources.has(sourceKey)) {
          sources.set(sourceKey, { itemKey, component: part.component, amount: part.signedAmount, lineId: id });
        }
      }
    }
    await context.tx.insert(postingSource).values(
      [...sources.values()].map((each) => ({
        id: uuidv7(),
        sourceModule: request.sourceModule,
        itemKey: each.itemKey,
        component: each.component,
        amountPaise: each.amount,
        journalId,
        journalLineId: each.lineId,
        itemHash: hashes.get(each.itemKey) ?? '',
      })),
    );
    written.push(answer.journal);
  }
  const earlier = await journalsByIds(context, [...new Set(replayed)]);
  return { kind: 'posted', journals: [...earlier, ...written] };
}

/** A reversal (9.1, 9.4): the journal it reverses and the reversal's own business date. */
export interface ReverseRequest {
  readonly journalId: string;
  readonly businessDate: string;
  readonly actor: PostRequest['actor'];
  readonly onBehalfOfUserId?: string;
}

/** What Reverse needs held: the period of its date at step 7 and the journal series at step 8 (4.5, 5.4). */
export type ReversalPlan =
  | {
      readonly kind: 'reversible';
      readonly original: typeof journal.$inferSelect;
      readonly period: PeriodRow;
      readonly seriesId: string;
    }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal };

/** Checks a reversal before any lock: the journal exists and is not reversed, a period and a series take it. */
export async function planReversal(
  context: TransactionContext,
  numbering: NumberingInterface,
  request: Pick<ReverseRequest, 'journalId' | 'businessDate'>,
): Promise<ReversalPlan> {
  const [original] = await context.tx.select().from(journal).where(eq(journal.id, request.journalId));
  const item: MissingItem = { kind: 'record', recordType: JOURNAL_TYPE, recordId: request.journalId };
  if (original === undefined) {
    return { kind: 'refused', refusal: { kind: 'not-found', code: 'finance.record-not-found', missing: [item] } };
  }
  const [reversal] = await context.tx
    .select({ id: journal.id })
    .from(journal)
    .where(eq(journal.reversesJournalId, original.id));
  if (reversal !== undefined) {
    return { kind: 'refused', refusal: { kind: 'refused', code: 'finance.already-reversed', missing: [item] } };
  }
  const period = await periodOn(context, original.bookId, request.businessDate);
  if (period === undefined) {
    return {
      kind: 'refused',
      refusal: {
        kind: 'refused',
        code: 'finance.no-period',
        missing: [{ kind: 'financial-period', bookId: original.bookId, date: request.businessDate }],
      },
    };
  }
  const series = await journalSeries(context, numbering, original.bookId, period);
  if (series.kind === 'refused') {
    return { kind: 'refused', refusal: { kind: 'unavailable', code: series.code, missing: series.missing } };
  }
  return { kind: 'reversible', original, period, seriesId: series.seriesId };
}

/** Holds the reversal's period at step 7 (4.5) and answers the series the caller locks at step 8. */
export async function holdReversal(
  context: TransactionContext,
  numbering: NumberingInterface,
  plan: Extract<ReversalPlan, { kind: 'reversible' }>,
): Promise<LockTarget[]> {
  await context.lock(LOCK_STEP.financialPeriod, [{ table: PERIOD_TABLE, id: plan.period.id, mode: 'shared' }]);
  return [numbering.seriesLockTarget(plan.seriesId)];
}

/**
 * Reverse (9.1, 9.4; PRD-LED-004, PRD-MOD-011): a new journal with the original's lines on opposite sides, linked to
 * it, dated on the reversal's own business date and keeping the original map version, with its own number. A journal
 * is reversed at most once (5.3): rechecked here, and the unique reversal key is the backstop.
 */
export async function reverse(
  context: TransactionContext,
  numbering: NumberingInterface,
  request: ReverseRequest,
): Promise<{ kind: 'reversed'; journal: PostedJournal } | { kind: 'refused'; refusal: CommandRefusal }> {
  const plan = await planReversal(context, numbering, request);
  if (plan.kind === 'refused') return plan;
  requirePeriodHeld(context, plan.period.id);
  const original = plan.original;
  const lines = await context.tx.select().from(journalLine).where(eq(journalLine.journalId, original.id));
  if (lines.length === 0) throw new CommandDefect('A reversal reads the lines of the journal it reverses');
  const answer = await writeJournal(
    context,
    numbering,
    {
      sourceModule: original.sourceModule,
      document: {
        recordType: original.sourceRecordType,
        recordId: original.sourceRecordId,
        ...(original.sourceVersionId === null ? {} : { versionId: original.sourceVersionId }),
      },
      actor: request.actor,
      ...(request.onBehalfOfUserId === undefined ? {} : { onBehalfOfUserId: request.onBehalfOfUserId }),
      items: [],
    },
    {
      bookId: original.bookId,
      legalEntityId: original.legalEntityId,
      periodId: plan.period.id,
      accountingDate: request.businessDate,
      businessDate: request.businessDate,
      eventKind: original.eventKind,
      mapVersionId: original.postingMapVersionId,
      seriesId: plan.seriesId,
      reversesJournalId: original.id,
    },
  );
  if (answer.kind === 'refused') return answer;
  await context.tx.insert(journalLine).values(
    lines.map((line) => ({
      id: uuidv7(),
      journalId: answer.journal.journalId,
      accountId: line.accountId,
      side: otherSide(line.side),
      amountPaise: line.amountPaise,
      legalEntityId: line.legalEntityId,
      siteId: line.siteId,
      storeId: line.storeId,
      businessUnitId: line.businessUnitId,
      brandId: line.brandId,
      mappingVersionId: line.mappingVersionId,
    })),
  );
  return { kind: 'reversed', journal: answer.journal };
}
