import { uuidv7 } from '@apparel-os/domain';
import { sql } from 'drizzle-orm';
import { LOCK_STEP, lockTable, sqlStateOf, type TransactionContext } from '../../../../kernel/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import { organisationScopeMembers } from '../../../organisation/index.js';
import { trackingProfileSiteChange } from '../db/schema.js';
import { trackingProfileChanged } from '../events.js';
import { approvedProfileVersions } from '../queries/tracking.js';
import { refused, today, type Outcome } from './common.js';

// Record a change to piece-tracked in force at a Site (structure-and-masters 4.6; PRD-MER-018, DEC-054;
// S1-F03-T02): the operation the Site's labelling count calls once every piece of the profile there is counted,
// labelled and verified. The labelling count is stage 2's; until it is built nothing calls this but the tests. Piece
// rules for the change start at the Site from the day it is recorded.

/** Who records it: the labelling count's person or service identity. */
export type SiteChangeActor =
  | { readonly kind: 'user'; readonly id: string; readonly roleAssignmentId?: string }
  | { readonly kind: 'service'; readonly id: string };

export interface SiteChangeRequest {
  /** The profile version that made the change to piece-tracked. */
  readonly trackingProfileVersionId: string;
  readonly siteId: string;
  /** The labelling count that completed at the Site (stage 2). */
  readonly labellingCountId: string;
}

export async function recordTrackingSiteChange(
  context: TransactionContext,
  audit: AuditInterface,
  actor: SiteChangeActor,
  request: SiteChangeRequest,
): Promise<Outcome<{ readonly siteChangeId: string }>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const versionItem = {
    kind: 'version' as const,
    recordType: 'merchandise.tracking_profile',
    recordId: '',
    versionId: request.trackingProfileVersionId,
  };
  const owner = await context.tx.execute<{ profile: string }>(sql`
    select tracking_profile_id::text as profile from merchandise.tracking_profile_version
    where id = ${request.trackingProfileVersionId}::uuid`);
  const profileId = owner.rows[0]?.profile;
  if (profileId === undefined) return refused('not-found', 'merchandise.record-not-found', [versionItem]);
  await context.lock(LOCK_STEP.document, [
    { table: lockTable('merchandise', 'tracking_profile'), id: profileId, mode: 'exclusive' },
  ]);
  const item = { ...versionItem, recordId: profileId };
  // Only a change from quantity to piece-tracked waits for labelling counts (4.6).
  const versions = await approvedProfileVersions(context, profileId);
  const index = versions.findIndex((version) => version.id === request.trackingProfileVersionId);
  const version = versions[index];
  if (version === undefined || !version.pieceTracked || index === 0 || versions[index - 1]?.pieceTracked !== false) {
    return refused('refused', 'merchandise.not-a-piece-tracking-change', [item]);
  }
  const site = { type: 'site' as const, id: request.siteId };
  if ((await organisationScopeMembers.notFound(context, [site], { validFrom: date })).length > 0) {
    return refused('not-found', 'merchandise.record-not-found', [
      { kind: 'record', recordType: 'organisation.site', recordId: request.siteId },
    ]);
  }
  const siteChangeId = uuidv7();
  await context.tx.execute(sql`savepoint merchandise_site_change`);
  try {
    await context.tx.insert(trackingProfileSiteChange).values({
      id: siteChangeId,
      trackingProfileVersionId: request.trackingProfileVersionId,
      siteId: request.siteId,
      labellingCountId: request.labellingCountId,
      effectiveDate: date,
      actorUserId: actor.kind === 'user' ? actor.id : null,
      actorServiceIdentityId: actor.kind === 'service' ? actor.id : null,
    });
    await context.tx.execute(sql`release savepoint merchandise_site_change`);
  } catch (error) {
    if (sqlStateOf(error) !== '23505') throw error;
    await context.tx.execute(sql`rollback to savepoint merchandise_site_change`);
    return refused('refused', 'merchandise.not-a-piece-tracking-change', [item]);
  }
  await audit.record(context, {
    actor: actor.kind === 'user' ? { kind: 'user', id: actor.id } : { kind: 'service-identity', id: actor.id },
    ...(actor.kind === 'user' && actor.roleAssignmentId !== undefined
      ? { roleAssignmentId: actor.roleAssignmentId }
      : {}),
    record: {
      module: 'merchandise',
      type: 'tracking_profile',
      id: profileId,
      versionId: request.trackingProfileVersionId,
    },
    operation: 'record-tracking-site-change',
    changes: [
      { kind: 'value', field: 'siteId', before: null, after: request.siteId },
      { kind: 'value', field: 'labellingCountId', before: null, after: request.labellingCountId },
      { kind: 'value', field: 'effectiveDate', before: null, after: date },
    ],
    source: { kind: actor.kind === 'user' ? 'screen' : 'job' },
  });
  await context.publish(trackingProfileChanged, {
    subject: {
      module: 'merchandise',
      recordType: 'merchandise.tracking_profile',
      recordId: profileId,
      versionId: request.trackingProfileVersionId,
    },
    payload: {
      change: 'site',
      recordId: profileId,
      versionId: request.trackingProfileVersionId,
      siteId: request.siteId,
    },
  });
  return { kind: 'success', answer: { siteChangeId } };
}
