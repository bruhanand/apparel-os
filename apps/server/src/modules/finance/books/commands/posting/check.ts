import { isKnown } from '@apparel-os/domain';
import type { MissingItem } from '@apparel-os/schemas';
import { and, eq, isNull } from 'drizzle-orm';
import {
  canonicalJson,
  LOCK_STEP,
  sha256Hex,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../../../kernel/index.js';
import type { NumberingInterface } from '../../../../numbering/index.js';
import { postingSource } from '../../db/schema.js';
import { byText } from '../../domain/order.js';
import { applyMap, type ApplyRefusal } from '../../domain/posting.js';
import { dimensionsOn } from '../../queries/dimensions.js';
import { accountsInForce, mapVersionOn } from '../../queries/maps.js';
import { admission, PERIOD_TABLE, periodOn, type SourceRecord } from '../../queries/periods.js';
import { periodItem } from '../period-close.js';
import { journalSeries } from './journal.js';
import type { ItemCheck, ItemContent, PostDependencies, PostItem, PostRequest, RefusedItem } from './types.js';

// Check postable and Hold periods (books-and-posting 6.2, 8.1, 9.1, 9.3, 4.5; module-map 4.14, 6.1 step 4;
// PRD-MOD-014, PRD-MOD-015, PRD-INT-002, PRD-INT-003, PRD-INT-008; POL-09.02, POL-09.12; S1-F09-T02). Check postable
// writes and locks nothing; Hold periods takes the periods at step 7 and answers the journal series for step 8.

const refusal = (
  itemKey: string,
  code: string,
  missing: MissingItem[],
  kind: CommandRefusal['kind'] = 'refused',
): RefusedItem => ({ kind: 'refused', itemKey, refusal: { kind, code, missing } });

function contentOf(item: PostItem, amounts: ItemContent['components']): ItemContent {
  return {
    eventKind: item.eventKind,
    businessUnitId: item.businessUnitId,
    storeId: item.storeId ?? null,
    brandId: item.brandId,
    businessDate: item.businessDate,
    components: [...amounts].sort((a, b) => byText(a.component, b.component)),
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

/** The detail a refusal of 6.2 names beside the map version (PRD-UXP-003), by the failed condition. */
const APPLY_DETAIL: {
  readonly [Code in ApplyRefusal['code']]: (
    failed: Extract<ApplyRefusal, { code: Code }>,
    eventKind: string,
    map: MissingItem,
  ) => MissingItem;
} = {
  'finance.map-account-not-in-force': (failed) => ({
    kind: 'record',
    recordType: 'finance.account',
    recordId: failed.accountId,
  }),
  'finance.missing-dimension': (failed) => ({
    kind: 'dimension',
    dimension: failed.dimension,
    component: failed.component,
  }),
  'finance.component-without-line': (failed, eventKind) => ({
    kind: 'posting-component',
    eventKind,
    component: failed.component,
  }),
  'finance.journal-unbalanced': (_failed, _eventKind, map) => map,
};

function applyDetail(failed: ApplyRefusal, eventKind: string, map: MissingItem): MissingItem {
  const detail = APPLY_DETAIL[failed.code] as (
    failed: ApplyRefusal,
    eventKind: string,
    map: MissingItem,
  ) => MissingItem;
  return detail(failed, eventKind, map);
}

/**
 * Check one item (8.1, 6.2, 9.3): the event kind declared, no Unknown amount, the same content if already posted, the
 * unit's book through its mapping on the accounting date, the Store, the period, the map version in force with its
 * lines and accounts, and the book's journal series. Writes and locks nothing.
 */
async function checkItem(
  context: TransactionContext,
  dependencies: PostDependencies,
  sourceModule: string,
  item: PostItem,
  source?: SourceRecord,
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
  // Every amount is known from here, in whole paise (PRD-MOD-014).
  const amounts = item.components.flatMap((each) =>
    isKnown(each.amount) ? [{ component: each.component, amountPaise: each.amount.value }] : [],
  );
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
  if (period === undefined) {
    return refusal(key, 'finance.no-period', [{ kind: 'financial-period', bookId: book, date }]);
  }
  // 4.2, 4.3; PRD-LED-009, PRD-LED-020: a Locked period takes only a correction a reopening in force names.
  const admitted = await admission(context, period.id, source);
  if (admitted.kind === 'locked') return refusal(key, 'finance.period-locked', [periodItem(period)]);
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
    return refusal(key, applied.refusal.code, [
      { ...mapItem, versionId: map.versionId },
      applyDetail(applied.refusal, item.eventKind, mapItem),
    ]);
  }
  const series = await journalSeries(context, dependencies.numbering, book, period);
  if (series.kind === 'refused') return { kind: 'refused', itemKey: key, refusal: series.refusal };
  return {
    kind: 'postable',
    itemKey: key,
    bookId: book,
    legalEntityId: dimensions.legalEntityId,
    period: { id: period.id, code: period.code, state: period.state },
    ...(source === undefined ? {} : { source }),
    ...(admitted.kind === 'correction' ? { correction: admitted.sourceId } : {}),
    mapVersionId: map.versionId,
    journalSeriesId: series.seriesId,
    eventKind: item.eventKind,
    accountingDate: date,
    hash,
    lines: applied.lines,
  };
}

/** The source document of a posting, as a reopening names a correction (4.3; PRD-LED-020). */
const sourceOf = (
  request: Pick<PostRequest, 'sourceModule'> & { readonly document?: PostRequest['document'] },
): SourceRecord | undefined =>
  request.document === undefined
    ? undefined
    : { module: request.sourceModule, recordType: request.document.recordType, recordId: request.document.recordId };

/**
 * Check postable (9.1; module-map 6.1 step 4): each item's answer. Writes nothing and locks nothing. Without its
 * document a request can name no correction, so a Locked or Reopened period refuses it.
 */
export async function checkPostable(
  context: TransactionContext,
  dependencies: PostDependencies,
  request: Pick<PostRequest, 'sourceModule' | 'items'> & { readonly document?: PostRequest['document'] },
): Promise<ItemCheck[]> {
  const checks: ItemCheck[] = [];
  const source = sourceOf(request);
  for (const item of request.items) {
    checks.push(await checkItem(context, dependencies, request.sourceModule, item, source));
  }
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
  // 9.1, 4.5; PRD-INT-003: under the lock, a period locked since Check postable refuses an item no reopening names.
  for (const check of postable) {
    if ((await admission(context, check.period.id, check.source)).kind === 'locked') {
      return {
        kind: 'refused',
        refusal: { kind: 'refused', code: 'finance.period-locked', missing: [periodItem(check.period)] },
      };
    }
  }
  // The journal series the postable items draw on, for the caller's step 8 lock call.
  const series = [...new Set(postable.map((each) => each.journalSeriesId))];
  return { kind: 'held', seriesTargets: series.map((id) => numbering.seriesLockTarget(id)) };
}
