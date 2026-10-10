import { uuidv7 } from '@apparel-os/domain';
import type { Activity } from '@apparel-os/schemas';
import { and, desc, eq, sql } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { activityGrant } from '../db/schema.js';
import { activityChanged } from '../events.js';

// Grant an activity (module-map 4.4 "Grant or withdraw an activity", 4.16; domain-model 3.6, section 6 "Granting an
// activity", invariant 7; PRD-LIF-001; S1-F04-T02): only `site-lifecycle` calls it, in the transaction of the decision
// that approves the activity, so the decision, the readiness record, the grant and the audit record commit together.

/** The one module that writes activity grants (module-map 4.4). */
export const ACTIVITY_GRANTER = 'site-lifecycle';

/** What a grant records: the activity at a business unit at its Site, on the readiness record it was approved on. */
export interface ActivityGrantRequest {
  readonly activity: Activity;
  readonly siteId: string;
  readonly businessUnitId: string;
  readonly readinessRecordId: string;
}

/** Who grants: `site-lifecycle`, for the approver of the decision, with the decision relied on. */
export interface ActivityGranter {
  readonly module: typeof ACTIVITY_GRANTER;
  readonly userId: string;
  readonly roleAssignmentId?: string | undefined;
  readonly approvalDecisionId?: string | undefined;
}

/**
 * Writes the grant (append-only; the latest row of an activity at a place is its state), its audit record, and
 * `configuration.activity-changed`. A caller other than `site-lifecycle` is a defect of the composition.
 */
export async function grantActivity(
  context: TransactionContext,
  audit: AuditInterface,
  by: ActivityGranter,
  grant: ActivityGrantRequest,
): Promise<{ grantId: string }> {
  if ((by.module as string) !== ACTIVITY_GRANTER) {
    throw new CommandDefect('Only site-lifecycle grants an activity (module-map 4.4)');
  }
  const grantId = uuidv7();
  await context.tx.insert(activityGrant).values({
    id: grantId,
    activity: grant.activity,
    siteId: grant.siteId,
    businessUnitId: grant.businessUnitId,
    granted: true,
    readinessRecordId: grant.readinessRecordId,
    recordedByUserId: by.userId,
    recordedAt: context.startedAt,
  });
  await audit.record(context, {
    actor: { kind: 'user', id: by.userId },
    ...(by.roleAssignmentId === undefined ? {} : { roleAssignmentId: by.roleAssignmentId }),
    ...(by.approvalDecisionId === undefined ? {} : { approval: { decisionId: by.approvalDecisionId } }),
    record: { module: 'configuration', type: 'activity_grant', id: grantId },
    operation: 'grant-activity',
    changes: [
      { kind: 'value', field: 'activity', before: null, after: grant.activity },
      { kind: 'value', field: 'businessUnitId', before: null, after: grant.businessUnitId },
      { kind: 'value', field: 'granted', before: null, after: true },
      { kind: 'value', field: 'readinessRecordId', before: null, after: grant.readinessRecordId },
    ],
    source: { kind: 'screen' },
  });
  await context.publish(activityChanged, {
    subject: { module: 'configuration', recordType: 'configuration.activity_grant', recordId: grantId },
    scope: { siteId: grant.siteId, businessUnitId: grant.businessUnitId },
    payload: { grantId, activity: grant.activity, businessUnitId: grant.businessUnitId, granted: true },
  });
  return { grantId };
}

/** The activities granted now at each business unit of a Site, or at one unit: the latest row of each decides. */
export async function grantedActivities(
  context: TransactionContext,
  place: { readonly siteId: string; readonly businessUnitId?: string | undefined },
): Promise<{ readonly activity: Activity; readonly businessUnitId: string }[]> {
  const rows = await context.tx
    .select({
      activity: activityGrant.activity,
      businessUnitId: activityGrant.businessUnitId,
      granted: activityGrant.granted,
    })
    .from(activityGrant)
    .where(
      and(
        eq(activityGrant.siteId, place.siteId),
        place.businessUnitId === undefined
          ? sql`${activityGrant.businessUnitId} is not null`
          : sql`${activityGrant.businessUnitId} = ${place.businessUnitId}::uuid`,
      ),
    )
    .orderBy(desc(activityGrant.id));
  const latest = new Map<string, { activity: Activity; businessUnitId: string; granted: boolean }>();
  for (const row of rows) {
    if (row.businessUnitId === null) continue;
    const key = `${row.activity}:${row.businessUnitId}`;
    if (!latest.has(key)) {
      latest.set(key, { activity: row.activity as Activity, businessUnitId: row.businessUnitId, granted: row.granted });
    }
  }
  return [...latest.values()]
    .filter((each) => each.granted)
    .map(({ activity, businessUnitId }) => ({ activity, businessUnitId }));
}
