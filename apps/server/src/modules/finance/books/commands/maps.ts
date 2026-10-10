import { uuidv7 } from '@apparel-os/domain';
import {
  POSTING_MAP_CHANGE,
  POSTING_MAP_TYPE,
  type FinanceChanged,
  type MissingItem,
  type PostingMapDraft,
} from '@apparel-os/schemas';
import { and, eq, inArray } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { Preparer } from '../../../access/index.js';
import type { AuditChange } from '../../../audit/index.js';
import { accountingBookExists } from '../../../organisation/index.js';
import { account, postingMap, postingMapLine, postingMapVersion } from '../db/schema.js';
import { mapLinesRefusal, type PostingEventKind } from '../domain/posting.js';
import { approvedOn, mapLine, refused, staleToken, type Outcome } from './lines.js';

// Prepare a posting map version (books-and-posting 6.1 to 6.3, 9.1 "Maintain accounts, maps and settings"; PRD-LED-003,
// POL-09.11, POL-09.12; S1-F09-T02): for one book and one declared event kind, every component with at least one line,
// each line an account of the same book, a side and the dimensions it requires. Frozen when prepared, it waits for a
// different authorised Accounts user and takes effect only with the CA's evidence (POL-09.01; DEC-112, GC4-2), decided
// through `access` (effects.ts). No version starts on a past date (GC2-7, DEC-105); one in force is never edited.

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
const value = (field: string, after: ValueChange['after']): ValueChange => ({
  kind: 'value',
  field,
  before: null,
  after,
});

export interface MapDependencies {
  readonly kinds: ReadonlyMap<string, PostingEventKind>;
  startOf(context: TransactionContext, validFrom: string): Promise<Outcome<never> | undefined>;
  lock(context: TransactionContext, mapId: string): Promise<boolean>;
  audit(
    context: TransactionContext,
    preparer: Preparer,
    record: { readonly type: string; readonly id: string; readonly versionId?: string },
    operation: string,
    changes: readonly AuditChange[],
  ): Promise<void>;
  request(
    context: TransactionContext,
    preparer: Preparer,
    actionType: string,
    recordType: string,
    recordId: string,
    versionId: string,
  ): Promise<string>;
}

const kindItem = (eventKind: string): MissingItem => ({ kind: 'posting-event-kind', eventKind });

export async function preparePostingMap(
  context: TransactionContext,
  dependencies: MapDependencies,
  preparer: Preparer,
  draft: PostingMapDraft,
): Promise<Outcome<FinanceChanged>> {
  const past = await dependencies.startOf(context, draft.validFrom);
  if (past !== undefined) return past;
  const kind = dependencies.kinds.get(draft.eventKind);
  if (kind === undefined) return refused('refused', 'finance.event-kind-not-declared', [kindItem(draft.eventKind)]);
  // 6.1: every component of the kind has at least one line, and no line names another.
  const wrong = mapLinesRefusal(kind, draft.lines);
  if (wrong !== undefined) {
    return refused('refused', wrong.code, [
      { kind: 'posting-component', eventKind: draft.eventKind, component: wrong.component },
    ]);
  }
  if (!(await accountingBookExists(context, draft.bookId))) {
    return refused('not-found', 'finance.record-not-found', [
      { kind: 'record', recordType: 'organisation.accounting_book', recordId: draft.bookId },
    ]);
  }
  const accountIds = [...new Set(draft.lines.map((line) => line.accountId))];
  const inBook = await context.tx
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.bookId, draft.bookId), inArray(account.id, accountIds)));
  const strange = accountIds.filter((id) => !inBook.some((row) => row.id === id));
  if (strange.length > 0) {
    return refused(
      'refused',
      'finance.account-not-in-book',
      strange.map((id) => ({ kind: 'record', recordType: 'finance.account', recordId: id })),
    );
  }
  // The map is created with its first version; its row is the record a change locks (step 1).
  await context.tx
    .insert(postingMap)
    .values({ id: uuidv7(), bookId: draft.bookId, eventKind: draft.eventKind })
    .onConflictDoNothing();
  const [map] = await context.tx
    .select({ id: postingMap.id })
    .from(postingMap)
    .where(and(eq(postingMap.bookId, draft.bookId), eq(postingMap.eventKind, draft.eventKind)));
  if (map === undefined || !(await dependencies.lock(context, map.id))) {
    throw new Error('A posting map could be neither written nor found');
  }
  const line = mapLine(POSTING_MAP_TYPE, map.id);
  const stale = await staleToken(context, line, draft.versionToken);
  if (stale !== undefined) return { kind: 'refusal', refusal: stale };
  const overlap = await approvedOn(context, line, draft.validFrom);
  if (overlap !== undefined) return { kind: 'refusal', refusal: overlap };
  const versionId = uuidv7();
  await context.tx.insert(postingMapVersion).values({
    id: versionId,
    postingMapId: map.id,
    origin: draft.origin,
    validDuring: `[${draft.validFrom},)`,
    decision: 'Awaiting approval',
    preparedByUserId: preparer.userId,
  });
  await context.tx.insert(postingMapLine).values(
    draft.lines.map((each) => ({
      id: uuidv7(),
      postingMapVersionId: versionId,
      component: each.component,
      side: each.side,
      accountId: each.accountId,
      requiresStore: each.requiresStore,
      requiresBrand: each.requiresBrand,
    })),
  );
  await dependencies.audit(
    context,
    preparer,
    { type: 'posting_map', id: map.id, versionId },
    'prepare-posting-map-version',
    [
      value('bookId', draft.bookId),
      value('eventKind', draft.eventKind),
      value('origin', draft.origin),
      value('validFrom', draft.validFrom),
      value(
        'lines',
        draft.lines.map((each) => ({ ...each })),
      ),
    ],
  );
  const requestId = await dependencies.request(
    context,
    preparer,
    POSTING_MAP_CHANGE,
    POSTING_MAP_TYPE,
    map.id,
    versionId,
  );
  return { kind: 'success', answer: { recordId: map.id, versionId, requestId } };
}
