import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import { categoryTrackingProfile, trackingProfileSiteChange, trackingProfileVersion } from '../db/schema.js';

// Tracking profiles as of a date and at a Site (structure-and-masters 4.5, 4.6; PRD-MER-014, PRD-MER-018, DEC-054;
// S1-F03-T02). A change from quantity to piece-tracked is a profile version that is piece-tracked while the approved
// version before it was not; piece rules for it start at a Site only from the day its labelling count there recorded
// the change in force (`tracking_profile_site_change`). A profile piece-tracked from its first version is so at every
// Site: no stock of it was ever held as a quantity. **Design choice.**

export interface ProfileVersion {
  readonly id: string;
  readonly start: string;
  readonly end: string | null;
  readonly name: string;
  readonly pieceTracked: boolean;
  readonly batchExpiryRequired: boolean;
  readonly requiredIdentifiers: readonly string[];
  readonly receivingShelfLifeDays: number | null;
  readonly sellingShelfLifeDays: number | null;
}

const start = sql<string>`lower(${trackingProfileVersion.validDuring})::text`;

/** The profile's approved versions, oldest first. */
export async function approvedProfileVersions(
  context: TransactionContext,
  profileId: string,
): Promise<ProfileVersion[]> {
  return context.tx
    .select({
      id: trackingProfileVersion.id,
      start,
      end: sql<string | null>`upper(${trackingProfileVersion.validDuring})::text`,
      name: trackingProfileVersion.name,
      pieceTracked: trackingProfileVersion.pieceTracked,
      batchExpiryRequired: trackingProfileVersion.batchExpiryRequired,
      requiredIdentifiers: trackingProfileVersion.requiredIdentifiers,
      receivingShelfLifeDays: trackingProfileVersion.receivingShelfLifeDays,
      sellingShelfLifeDays: trackingProfileVersion.sellingShelfLifeDays,
    })
    .from(trackingProfileVersion)
    .where(
      and(eq(trackingProfileVersion.trackingProfileId, profileId), eq(trackingProfileVersion.decision, 'Approved')),
    )
    .orderBy(asc(start));
}

const covers = (version: ProfileVersion, date: string) =>
  version.start <= date && (version.end === null || date < version.end);

/** The approved version a version starting on the date follows: the one in force then, else the last before it. */
export function versionBefore(versions: readonly ProfileVersion[], date: string): ProfileVersion | undefined {
  return versions.find((version) => covers(version, date)) ?? versions.filter((each) => each.start < date).at(-1);
}

/** Where a version starting on the date ends: the start of the first approved version after it, or open-ended (2.2). */
export function endOfVersionFrom(versions: readonly ProfileVersion[], date: string): string | null {
  return versions.find((version) => version.start > date)?.start ?? null;
}

/**
 * The change to piece-tracked a piece-tracked version's piece rules come from: the first piece-tracked version of the
 * run it belongs to, when an approved quantity version came before that run; undefined for a quantity version or a
 * run from the profile's first version, piece-tracked at every Site.
 */
export function changeOf(versions: readonly ProfileVersion[], version: ProfileVersion): ProfileVersion | undefined {
  if (!version.pieceTracked) return undefined;
  let first = versions.findIndex((each) => each.id === version.id);
  while (first > 0 && versions[first - 1]?.pieceTracked === true) first -= 1;
  return first <= 0 ? undefined : versions[first];
}

/** The profile version in force on the date and the change to piece-tracked its piece rules come from, if any. */
export function inForceWithChange(
  versions: readonly ProfileVersion[],
  date: string,
): { readonly version: ProfileVersion; readonly change: ProfileVersion | undefined } | undefined {
  const version = versions.find((each) => covers(each, date));
  return version === undefined ? undefined : { version, change: changeOf(versions, version) };
}

/** Whether a piece-tracked version starting on the date would be a change from quantity to piece-tracked (4.6). */
export async function isPieceTrackingChange(
  context: TransactionContext,
  profileId: string,
  date: string,
): Promise<boolean> {
  const previous = versionBefore(await approvedProfileVersions(context, profileId), date);
  return previous !== undefined && !previous.pieceTracked;
}

/** Whether the change is in force at the Site on the date: its labelling count there recorded it by then (4.6). */
export async function changeInForceAt(
  context: TransactionContext,
  changeVersionId: string,
  siteId: string,
  date: string,
): Promise<boolean> {
  return (await sitesWithChange(context, changeVersionId, [siteId], date)).length > 0;
}

/** The Sites among those given where the change is in force on the date (4.6). */
async function sitesWithChange(
  context: TransactionContext,
  changeVersionId: string,
  siteIds: readonly string[],
  date: string,
): Promise<string[]> {
  if (siteIds.length === 0) return [];
  const rows = await context.tx
    .select({ siteId: trackingProfileSiteChange.siteId })
    .from(trackingProfileSiteChange)
    .where(
      and(
        eq(trackingProfileSiteChange.trackingProfileVersionId, changeVersionId),
        inArray(trackingProfileSiteChange.siteId, [...siteIds]),
        lte(trackingProfileSiteChange.effectiveDate, date),
      ),
    );
  return rows.map((row) => row.siteId);
}

/**
 * The Sites among those given where the piece rules of a piece-tracked version are in force on the date (4.6;
 * PRD-MER-018): every Site for a profile piece-tracked from its first version, else those whose labelling count
 * recorded the change in force. Stock of the profile's goods at such a Site is held as pieces; elsewhere as quantities.
 */
export async function sitesUnderPieceRules(
  context: TransactionContext,
  versions: readonly ProfileVersion[],
  version: ProfileVersion,
  siteIds: readonly string[],
  date: string,
): Promise<string[]> {
  if (!version.pieceTracked) return [];
  const change = changeOf(versions, version);
  if (change === undefined) return [...siteIds];
  const under = new Set(await sitesWithChange(context, change.id, siteIds, date));
  return siteIds.filter((siteId) => under.has(siteId));
}

/** The category's link to a tracking profile in force on the date: the link version and its profile. */
export async function linkOn(
  context: TransactionContext,
  categoryId: string,
  date: string,
): Promise<{ readonly id: string; readonly trackingProfileId: string } | undefined> {
  const [row] = await context.tx
    .select({ id: categoryTrackingProfile.id, trackingProfileId: categoryTrackingProfile.trackingProfileId })
    .from(categoryTrackingProfile)
    .where(
      and(
        eq(categoryTrackingProfile.categoryId, categoryId),
        eq(categoryTrackingProfile.decision, 'Approved'),
        sql`${categoryTrackingProfile.validDuring} @> ${date}::date`,
      ),
    );
  return row;
}
