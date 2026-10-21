import {
  attributeMarks,
  MARKED_ATTRIBUTE_CHANGE,
  type AttributeMark,
  type MarkedAttribute,
  type MarkedAttributeVersion,
} from '@apparel-os/schemas';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import type { LatestRequest } from '../../../access/index.js';
import { markedAttribute, markedAttributeVersion } from '../db/schema.js';
import { attributeNotMarked, markDocument, markVersionState } from '../domain/marks.js';

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
async function spansOf(context: TransactionContext, markedAttributeId: string) {
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
      and(
        eq(markedAttributeVersion.markedAttributeId, markedAttributeId),
        sql`${markedAttributeVersion.validDuring} is not null`,
      ),
    );
  return new Map(rows.map((row) => [row.id, { from: row.from, until: row.until }]));
}

/**
 * Both markings, the season's first, each with what is in force at the command's start and every version with its
 * latest approval request (access-and-approvals 9.5).
 */
export async function markedAttributeViews(
  context: TransactionContext,
  requests: (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>,
): Promise<MarkedAttribute[]> {
  const views: MarkedAttribute[] = [];
  for (const mark of attributeMarks) {
    const inForce = await markedAttributeAt(context, mark);
    const shown = inForce.kind === 'set' ? { ...inForce } : { kind: 'not-set' as const };
    const row = await markRow(context, mark);
    if (row === undefined) {
      views.push({ mark, inForce: shown, versions: [] });
      continue;
    }
    const versions = await markVersions(context, row.id);
    const spans = await spansOf(context, row.id);
    const latest = await requests(versions.map((each) => each.id));
    views.push({
      mark,
      inForce: shown,
      ...(versions.length === 0 ? {} : { versionToken: versions.at(-1)?.id }),
      versions: versions.map((version): MarkedAttributeVersion => {
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
      }),
    });
  }
  return views;
}

/** The action type and document each waiting version's request was made under, for supersession (9.6). */
export const markDecision = (markedAttributeId: string, versionId: string) =>
  ({ ...markDocument(markedAttributeId, versionId), actionType: MARKED_ATTRIBUTE_CHANGE }) as const;
