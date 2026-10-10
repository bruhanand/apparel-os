import type { PostingMapRecord } from '@apparel-os/schemas';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import { account, accountVersion, postingMap, postingMapLine, postingMapVersion } from '../db/schema.js';
import type { MapLine, PostingEventKind } from '../domain/posting.js';
import { datesOf } from '../commands/lines.js';
import { evidenceOf, newestFirst, tokenOf, versionView, type RequestReader } from './records.js';

// Posting maps (books-and-posting 6.1 to 6.3, 14; S1-F09-T02): the approved version of a book's map for an event kind
// in force on a date with its lines, the accounts in force on a date, and a book's maps with every version, their
// lines, approval and the CA's evidence, and the version in force on a chosen date.

/** The approved map version in force on the date for the book and event kind, with its lines (6.2 condition 1). */
export async function mapVersionOn(
  context: TransactionContext,
  bookId: string,
  eventKind: string,
  date: string,
): Promise<{ readonly versionId: string; readonly lines: MapLine[] } | undefined> {
  const [version] = await context.tx
    .select({ id: postingMapVersion.id })
    .from(postingMapVersion)
    .innerJoin(postingMap, eq(postingMap.id, postingMapVersion.postingMapId))
    .where(
      and(
        eq(postingMap.bookId, bookId),
        eq(postingMap.eventKind, eventKind),
        eq(postingMapVersion.decision, 'Approved'),
        sql`${postingMapVersion.validDuring} @> ${date}::date`,
      ),
    );
  if (version === undefined) return undefined;
  const lines = await context.tx
    .select({
      component: postingMapLine.component,
      side: postingMapLine.side,
      accountId: postingMapLine.accountId,
      requiresStore: postingMapLine.requiresStore,
      requiresBrand: postingMapLine.requiresBrand,
    })
    .from(postingMapLine)
    .where(eq(postingMapLine.postingMapVersionId, version.id))
    .orderBy(asc(postingMapLine.id));
  return { versionId: version.id, lines };
}

/** The accounts among those named with an approved version in force on the date that is not retired (6.2 cond. 3). */
export async function accountsInForce(
  context: TransactionContext,
  accountIds: readonly string[],
  date: string,
): Promise<Set<string>> {
  if (accountIds.length === 0) return new Set();
  const rows = await context.tx
    .select({ id: accountVersion.accountId })
    .from(accountVersion)
    .where(
      and(
        inArray(accountVersion.accountId, [...accountIds]),
        eq(accountVersion.decision, 'Approved'),
        eq(accountVersion.retired, false),
        sql`${accountVersion.validDuring} @> ${date}::date`,
      ),
    );
  return new Set(rows.map((row) => row.id));
}

/** A book's posting maps with every version, newest first, and the version in force on the date asked (14). */
export async function mapsOfBook(
  context: TransactionContext,
  bookId: string,
  on: string,
  today: string,
  kinds: ReadonlyMap<string, PostingEventKind>,
  requests: RequestReader,
): Promise<PostingMapRecord[]> {
  const heads = await context.tx
    .select()
    .from(postingMap)
    .where(eq(postingMap.bookId, bookId))
    .orderBy(asc(postingMap.eventKind));
  if (heads.length === 0) return [];
  const versions = await context.tx
    .select()
    .from(postingMapVersion)
    .where(
      inArray(
        postingMapVersion.postingMapId,
        heads.map((head) => head.id),
      ),
    );
  const lines =
    versions.length === 0
      ? []
      : await context.tx
          .select({ line: postingMapLine, accountCode: account.code })
          .from(postingMapLine)
          .innerJoin(account, eq(account.id, postingMapLine.accountId))
          .where(
            inArray(
              postingMapLine.postingMapVersionId,
              versions.map((row) => row.id),
            ),
          )
          .orderBy(asc(postingMapLine.id));
  const latest = await requests(versions.filter((row) => row.decision === 'Awaiting approval').map((row) => row.id));
  const evidence = await evidenceOf(
    context,
    versions.map((row) => row.id),
  );
  return heads.map((head) => {
    const own = newestFirst(versions.filter((row) => row.postingMapId === head.id));
    const token = tokenOf(own);
    const inForce = own.find((row) => {
      if (row.decision !== 'Approved') return false;
      const dates = datesOf(row.validDuring);
      return dates.start <= on && (dates.end === undefined || on < dates.end);
    });
    return {
      id: head.id,
      bookId: head.bookId,
      eventKind: head.eventKind,
      components: [...(kinds.get(head.eventKind)?.components ?? [])],
      ...(token === undefined ? {} : { versionToken: token }),
      ...(inForce === undefined ? {} : { inForceOn: inForce.id }),
      versions: own.map((row) => ({
        ...versionView(row, today, latest.get(row.id), evidence.get(row.id) ?? []),
        origin: row.origin,
        lines: lines
          .filter((each) => each.line.postingMapVersionId === row.id)
          .map(({ line, accountCode }) => ({
            component: line.component,
            side: line.side,
            accountId: line.accountId,
            accountCode,
            requiresStore: line.requiresStore,
            requiresBrand: line.requiresBrand,
          })),
      })),
    };
  });
}
