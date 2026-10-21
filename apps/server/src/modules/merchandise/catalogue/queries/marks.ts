import {
  attributeMarks,
  type AttributeMark,
  type MarkedAttribute,
  type MarkedAttributeVersion,
} from '@apparel-os/schemas';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import type { LatestRequest } from '../../../access/index.js';
import { markedAttribute, markedAttributeVersion } from '../db/schema.js';
import { attributeNotMarked, markVersionState } from '../domain/marks.js';

// The reads of the season attribute and the size attribute (structure-and-masters 4.2 "As built"; RR-550, RR-556;
// code-house-rules 7.3, 12.14): the attribute marked at an instant, which a budget's season and a count line's size are
// read under, or not set; and each marking with every version, for Setup › Vocabularies.

type MarkRow = typeof markedAttribute.$inferSelect;
type VersionRow = typeof markedAttributeVersion.$inferSelect;

/** What is marked at an instant: the attribute and the version that marks it, or the refusal naming the setting. */
export type MarkedAttributeAt =
  | { readonly kind: 'set'; readonly attributeId: string; readonly versionId: string }
  | { readonly kind: 'not-set'; readonly refusal: CommandRefusal };

/** A marking's identity row, or undefined before its first version is prepared. */
export async function markRow(context: TransactionContext, mark: AttributeMark): Promise<MarkRow | undefined> {
  const [row] = await context.tx.select().from(markedAttribute).where(eq(markedAttribute.mark, mark));
  return row;
}

/** A marking's versions, oldest first. */
export async function markVersions(context: TransactionContext, markedAttributeId: string): Promise<VersionRow[]> {
  return context.tx
    .select()
    .from(markedAttributeVersion)
    .where(eq(markedAttributeVersion.markedAttributeId, markedAttributeId))
    .orderBy(asc(markedAttributeVersion.recordedAt), asc(markedAttributeVersion.id));
}

/** One version, or undefined. */
export async function markVersionRow(context: TransactionContext, versionId: string): Promise<VersionRow | undefined> {
  const [row] = await context.tx.select().from(markedAttributeVersion).where(eq(markedAttributeVersion.id, versionId));
  return row;
}

/**
 * The attribute marked as the season or the size list at the command's start (code-house-rules 7.3, 12.14), as a
 * setting is read: the approved version in force then, or not set, never a guess.
 */
export async function markedAttributeAt(context: TransactionContext, mark: AttributeMark): Promise<MarkedAttributeAt> {
  const [row] = await context.tx
    .select({ versionId: markedAttributeVersion.id, attributeId: markedAttributeVersion.attributeId })
    .from(markedAttributeVersion)
    .innerJoin(markedAttribute, eq(markedAttribute.id, markedAttributeVersion.markedAttributeId))
    .where(
      and(
        eq(markedAttribute.mark, mark),
        eq(markedAttributeVersion.decision, 'Approved'),
        sql`${markedAttributeVersion.validDuring} @> ${context.startedAt.toISOString()}::timestamptz`,
      ),
    );
  return row === undefined
    ? { kind: 'not-set', refusal: attributeNotMarked(mark) }
    : { kind: 'set', attributeId: row.attributeId, versionId: row.versionId };
}

/** The start and end of each approved version's instants, read by PostgreSQL rather than parsed (7.3). */
async function spansOf(context: TransactionContext, versionIds: readonly string[]) {
  if (versionIds.length === 0) return new Map<string, { from: string; until: string | null }>();
  const rows = await context.tx
    .select({
      id: markedAttributeVersion.id,
      from: sql<string>`pg_catalog.lower(${markedAttributeVersion.validDuring})`.mapWith((value: string) =>
        new Date(value).toISOString(),
      ),
      until: sql<string | null>`pg_catalog.upper(${markedAttributeVersion.validDuring})`.mapWith(
        (value: string | null) => (value === null ? null : new Date(value).toISOString()),
      ),
    })
    .from(markedAttributeVersion)
    .where(
      and(inArray(markedAttributeVersion.id, [...versionIds]), sql`${markedAttributeVersion.validDuring} is not null`),
    );
  return new Map(rows.map((row) => [row.id, { from: row.from, until: row.until }]));
}

/** The latest approval request of each version, which `access` answers (access-and-approvals 9.5). */
type LatestRequests = (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>;

/** Versions as Setup › Vocabularies and the approval panel show them: state, origin, preparer, instants, request. */
async function versionViews(
  context: TransactionContext,
  versions: readonly VersionRow[],
  requests: LatestRequests,
): Promise<MarkedAttributeVersion[]> {
  const ids = versions.map((each) => each.id);
  const spans = await spansOf(context, ids);
  const latest = await requests(ids);
  return versions.map((version): MarkedAttributeVersion => {
    const span = spans.get(version.id);
    const request = latest.get(version.id);
    return {
      id: version.id,
      attributeId: version.attributeId,
      origin: version.origin,
      state: markVersionState({
        decision: version.decision,
        openEnded: span?.until === null,
        requestState: request?.state,
      }),
      preparedBy: version.preparedByUserId,
      preparedAt: version.recordedAt.toISOString(),
      ...(span === undefined ? {} : { inForceFrom: span.from }),
      ...(span?.until === undefined || span.until === null ? {} : { inForceUntil: span.until }),
      ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
    };
  });
}

/** What a marking has in force at the command's start, as its read shows it. */
async function inForceShown(context: TransactionContext, mark: AttributeMark): Promise<MarkedAttribute['inForce']> {
  const inForce = await markedAttributeAt(context, mark);
  return inForce.kind === 'set'
    ? { kind: 'set', attributeId: inForce.attributeId, versionId: inForce.versionId }
    : { kind: 'not-set' };
}

/**
 * Both markings, the season's first, each with what is in force at the command's start and its newest version's
 * identifier, the token a change names (12.7). Their versions are read a page at a time (markVersionPage).
 */
export async function markedAttributeViews(context: TransactionContext): Promise<MarkedAttribute[]> {
  const views: MarkedAttribute[] = [];
  for (const mark of attributeMarks) {
    const inForce = await inForceShown(context, mark);
    const row = await markRow(context, mark);
    const newest = row === undefined ? undefined : (await markVersions(context, row.id)).at(-1);
    views.push({ mark, inForce, ...(newest === undefined ? {} : { versionToken: newest.id }) });
  }
  return views;
}

/**
 * A page of a marking's versions, newest first (code-house-rules 12.1 "Reads"): those recorded before the version
 * `after` names, at most `limit`; `next` names the last one read while more follow. A cursor that names no version of
 * the marking reads none.
 */
export async function markVersionPage(
  context: TransactionContext,
  mark: AttributeMark,
  page: { readonly after?: string | undefined; readonly limit: number },
  requests: LatestRequests,
): Promise<{ readonly versions: MarkedAttributeVersion[]; readonly next: string | null }> {
  const row = await markRow(context, mark);
  if (row === undefined) return { versions: [], next: null };
  const rows = await context.tx
    .select()
    .from(markedAttributeVersion)
    .where(
      and(
        eq(markedAttributeVersion.markedAttributeId, row.id),
        page.after === undefined
          ? undefined
          : sql`(${markedAttributeVersion.recordedAt}, ${markedAttributeVersion.id}) < (select named.recorded_at,
              named.id from merchandise.marked_attribute_version named
              where named.id = ${page.after}::uuid and named.marked_attribute_id = ${row.id}::uuid)`,
      ),
    )
    .orderBy(desc(markedAttributeVersion.recordedAt), desc(markedAttributeVersion.id))
    .limit(page.limit + 1);
  const read = rows.slice(0, page.limit);
  return {
    versions: await versionViews(context, read, requests),
    next: rows.length > page.limit ? (read.at(-1)?.id ?? null) : null,
  };
}

/** One version with the marking it belongs to and what that marking has in force, or undefined when there is none. */
export async function markVersionRead(
  context: TransactionContext,
  versionId: string,
  requests: LatestRequests,
): Promise<
  | {
      readonly mark: AttributeMark;
      readonly inForce: MarkedAttribute['inForce'];
      readonly version: MarkedAttributeVersion;
    }
  | undefined
> {
  const [found] = await context.tx
    .select({ mark: markedAttribute.mark, version: markedAttributeVersion })
    .from(markedAttributeVersion)
    .innerJoin(markedAttribute, eq(markedAttribute.id, markedAttributeVersion.markedAttributeId))
    .where(eq(markedAttributeVersion.id, versionId));
  if (found === undefined) return undefined;
  const [version] = await versionViews(context, [found.version], requests);
  if (version === undefined) return undefined;
  return { mark: found.mark, inForce: await inForceShown(context, found.mark), version };
}
