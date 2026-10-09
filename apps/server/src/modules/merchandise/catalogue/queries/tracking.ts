import { sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';

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

/** The profile's approved versions, oldest first. */
export async function approvedProfileVersions(
  context: TransactionContext,
  profileId: string,
): Promise<ProfileVersion[]> {
  const result = await context.tx.execute<{
    id: string;
    start: string;
    end: string | null;
    name: string;
    piece_tracked: boolean;
    batch_expiry_required: boolean;
    required_identifiers: string[];
    receiving_shelf_life_days: number | null;
    selling_shelf_life_days: number | null;
  }>(sql`
    select id::text as id, lower(valid_during)::text as start, upper(valid_during)::text as end, name, piece_tracked,
           batch_expiry_required, required_identifiers, receiving_shelf_life_days, selling_shelf_life_days
    from merchandise.tracking_profile_version
    where tracking_profile_id = ${profileId}::uuid and decision = 'Approved'
    order by lower(valid_during)`);
  return result.rows.map((row) => ({
    id: row.id,
    start: row.start,
    end: row.end,
    name: row.name,
    pieceTracked: row.piece_tracked,
    batchExpiryRequired: row.batch_expiry_required,
    requiredIdentifiers: row.required_identifiers,
    receivingShelfLifeDays: row.receiving_shelf_life_days,
    sellingShelfLifeDays: row.selling_shelf_life_days,
  }));
}

const covers = (version: ProfileVersion, date: string) =>
  version.start <= date && (version.end === null || date < version.end);

/** The approved version a version starting on the date follows: the one in force then, else the last before it. */
function before(versions: readonly ProfileVersion[], date: string): ProfileVersion | undefined {
  return versions.find((version) => covers(version, date)) ?? versions.filter((each) => each.start < date).at(-1);
}

/** Whether a piece-tracked version starting on the date would be a change from quantity to piece-tracked (4.6). */
export async function isPieceTrackingChange(
  context: TransactionContext,
  profileId: string,
  start: string,
): Promise<boolean> {
  const previous = before(await approvedProfileVersions(context, profileId), start);
  return previous !== undefined && !previous.pieceTracked;
}

/**
 * The profile version in force on the date and the change to piece-tracked its piece rules come from, if any: the
 * first piece-tracked version of the run it belongs to, when an approved quantity version came before that run.
 */
export function inForceWithChange(
  versions: readonly ProfileVersion[],
  date: string,
): { readonly version: ProfileVersion; readonly change: ProfileVersion | undefined } | undefined {
  const index = versions.findIndex((version) => covers(version, date));
  const version = versions[index];
  if (version === undefined) return undefined;
  if (!version.pieceTracked) return { version, change: undefined };
  let first = index;
  while (first > 0 && versions[first - 1]?.pieceTracked === true) first -= 1;
  return { version, change: first === 0 ? undefined : versions[first] };
}

/** Whether the change is in force at the Site on the date: its labelling count there recorded it by then (4.6). */
export async function changeInForceAt(
  context: TransactionContext,
  changeVersionId: string,
  siteId: string,
  date: string,
): Promise<boolean> {
  const result = await context.tx.execute(sql`
    select 1 from merchandise.tracking_profile_site_change
    where tracking_profile_version_id = ${changeVersionId}::uuid and site_id = ${siteId}::uuid
      and effective_date <= ${date}::date`);
  return result.rows.length > 0;
}

/** The category's link to a tracking profile in force on the date: the link version and its profile. */
export async function linkOn(
  context: TransactionContext,
  categoryId: string,
  date: string,
): Promise<{ readonly id: string; readonly trackingProfileId: string } | undefined> {
  const result = await context.tx.execute<{ id: string; tracking_profile_id: string }>(sql`
    select id::text as id, tracking_profile_id::text as tracking_profile_id from merchandise.category_tracking_profile
    where category_id = ${categoryId}::uuid and decision = 'Approved' and valid_during @> ${date}::date`);
  const row = result.rows[0];
  return row === undefined ? undefined : { id: row.id, trackingProfileId: row.tracking_profile_id };
}

/** Whether the profile's version in force on the date asks for piece tracking, or undefined with none in force. */
export async function piecesAskedOn(
  context: TransactionContext,
  profileId: string,
  date: string,
): Promise<boolean | undefined> {
  return inForceWithChange(await approvedProfileVersions(context, profileId), date)?.version.pieceTracked;
}
