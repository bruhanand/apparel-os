import { uuidv7 } from '@apparel-os/domain';
import {
  MARKED_ATTRIBUTE_CHANGE,
  type MarkedAttributePrepared,
  type MarkedAttributeVersionDraft,
} from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import {
  CommandDefect,
  LOCK_STEP,
  lockTable,
  type LockTarget,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { AccessInterface, DocumentEffect, EffectDecider, EffectOutcome } from '../../../access/index.js';
import type { AuditChange, AuditInterface } from '../../../audit/index.js';
import type { ConfigurationInterface } from '../../../configuration/index.js';
import type { Preparer } from '../../../organisation/index.js';
import { markedAttribute, markedAttributeVersion } from '../db/schema.js';
import { markAuditRecord, markDocument, markItem } from '../domain/marks.js';
import { markDecision, markRow, markVersionRow, markVersions } from '../queries/marks.js';
import { refused, today, type Outcome } from './common.js';
import { listAttributeRefusal } from './proposals.js';

// The season attribute and the size attribute (structure-and-masters 4.2 "As built"; goods-in GI-2, GI-3; RR-550,
// RR-556; POL-02.07; code-house-rules 7.3, 12.7, 12.14): an Organisation setting each, marking one list-type attribute
// in force today. A version is prepared by one person under the marking's lock, frozen when prepared, and waits for a
// different person's approval through `access`'s Decide; a version prepared while another waits supersedes it (9.6).
// The approval rechecks the attribute and the origin under the same lock, and the version takes effect at the
// decision's instant, ending the one in force there. Each change writes its audit record in the same transaction. No
// attribute is defaulted: it comes from the draft, with its origin, which the environment must accept.

export interface MarkDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'requestLockTargets' | 'supersedeRequest'>;
  readonly origins: Pick<ConfigurationInterface, 'originRefusal'>;
}

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
const value = (field: string, before: ValueChange['before'], after: ValueChange['after']): ValueChange => ({
  kind: 'value',
  field,
  before,
  after,
});

/** A marking's identity row, which every change and decision of it locks exclusively at step 1 (8.2). */
const markLock = (markedAttributeId: string): LockTarget => ({
  table: lockTable('merchandise', 'marked_attribute'),
  id: markedAttributeId,
  mode: 'exclusive',
});

/**
 * Prepare a version of the season or size attribute (4.2 "As built"): the attribute exists, is list-type and is in force
 * today; the token names the marking's newest version, or none before its first (12.7).
 */
export async function prepareMarkedAttributeVersion(
  context: TransactionContext,
  dependencies: MarkDependencies,
  preparer: Preparer,
  draft: MarkedAttributeVersionDraft,
): Promise<Outcome<MarkedAttributePrepared>> {
  const origin = dependencies.origins.originRefusal(context, draft.origin);
  if (origin !== undefined) return { kind: 'refusal', refusal: origin };
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const attribute = await listAttributeRefusal<MarkedAttributePrepared>(context, draft.attributeId, date);
  if (attribute !== undefined) return attribute;
  // The marking's identity, written with its first version; another first preparation committing meanwhile leaves
  // its row, which this one then locks and finds a version on (12.7).
  await context.tx
    .insert(markedAttribute)
    .values({ id: uuidv7(), mark: draft.mark })
    .onConflictDoNothing({ target: markedAttribute.mark });
  const row = await markRow(context, draft.mark);
  if (row === undefined) throw new CommandDefect('A marking just written could not be read');
  // The open requests of a version still waiting, locked with the marking at step 1 in one call, so no decision passes
  // the supersession (code-house-rules 8.2; access-and-approvals 9.1a).
  const waiting = (await markVersions(context, row.id)).filter((each) => each.decision === 'Awaiting approval');
  const targets: LockTarget[] = [markLock(row.id)];
  for (const each of waiting) {
    targets.push(...(await dependencies.access.requestLockTargets(context, markDecision(row.id, each.id))));
  }
  await context.lock(LOCK_STEP.document, targets);
  const versions = await markVersions(context, row.id);
  if (versions.at(-1)?.id !== draft.versionToken) {
    return refused('conflict', 'kernel.stale-version', [markItem(row.id)]);
  }
  for (const each of versions.filter((version) => version.decision === 'Awaiting approval')) {
    await dependencies.access.supersedeRequest(context, markDecision(row.id, each.id), preparer);
  }
  const versionId = uuidv7();
  await context.tx.insert(markedAttributeVersion).values({
    id: versionId,
    markedAttributeId: row.id,
    attributeId: draft.attributeId,
    origin: draft.origin,
    decision: 'Awaiting approval',
    validDuring: null,
    preparedByUserId: preparer.userId,
  });
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: preparer.userId },
    roleAssignmentId: preparer.roleAssignmentId,
    record: markAuditRecord(row.id, versionId),
    operation: 'prepare-marked-attribute-version',
    changes: [
      value('mark', null, draft.mark),
      value('attributeId', null, draft.attributeId),
      value('origin', null, draft.origin),
      ...(draft.versionToken === undefined ? [] : [value('replaces', null, draft.versionToken)]),
    ],
    source: { kind: 'screen' },
  });
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: MARKED_ATTRIBUTE_CHANGE,
    document: markDocument(row.id, versionId),
    value: { kind: 'none' },
    preparers: [preparer.userId],
    requestedBy: preparer,
  });
  return { kind: 'success', answer: { markedAttributeId: row.id, versionId, requestId } };
}

/** The version, rechecked under the lock: it exists and still awaits its decision. */
async function waitingVersion(context: TransactionContext, versionId: string) {
  const row = await markVersionRow(context, versionId);
  if (row === undefined) return refused<never>('not-found', 'merchandise.record-not-found');
  if (row.decision !== 'Awaiting approval') return refused<never>('conflict', 'kernel.stale-version');
  return row;
}

async function recordDecision(
  context: TransactionContext,
  audit: AuditInterface,
  decider: EffectDecider,
  row: { readonly markedAttributeId: string; readonly id: string },
  operation: string,
  changes: readonly AuditChange[],
): Promise<void> {
  await audit.record(context, {
    actor: decider.actor,
    ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
    ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    record: markAuditRecord(row.markedAttributeId, row.id),
    operation,
    changes,
    source: { kind: 'screen' },
  });
}

/**
 * The effect of a decision on a version of the season or size attribute (4.2 "As built"; access-and-approvals 9.8b),
 * in the decision's transaction under the marking's lock, which Decide takes with the request at step 1. Approved: the
 * origin and the attribute are checked again, and the version takes effect at the decision's instant, ending the one in
 * force there. Rejected: the version is Rejected and what is in force stays.
 */
export function markedAttributeEffect(dependencies: {
  readonly audit: AuditInterface;
  readonly origins: Pick<ConfigurationInterface, 'originRefusal'>;
}): DocumentEffect {
  return {
    async targets(context, versionId): Promise<LockTarget[]> {
      const row = await markVersionRow(context, versionId);
      return row === undefined ? [] : [markLock(row.markedAttributeId)];
    },
    async approve(context, decider, versionId): Promise<EffectOutcome> {
      const row = await waitingVersion(context, versionId);
      if ('kind' in row) return row;
      const origin = dependencies.origins.originRefusal(context, row.origin);
      if (origin !== undefined) return { kind: 'refusal', refusal: origin };
      const date = await today(context);
      if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
      const attribute = await listAttributeRefusal<never>(context, row.attributeId, date);
      if (attribute !== undefined) return attribute;
      const at = context.startedAt.toISOString();
      // The version in force ends where this one starts; one that started after this decision began is newer than
      // it, so the decision is stale and tried again (access-and-approvals 9.5 "dated by instants").
      const [inForce] = await context.tx
        .select({
          id: markedAttributeVersion.id,
          attributeId: markedAttributeVersion.attributeId,
          later: sql<boolean>`pg_catalog.lower(${markedAttributeVersion.validDuring}) >= ${at}::timestamptz`,
        })
        .from(markedAttributeVersion)
        .where(
          and(
            eq(markedAttributeVersion.markedAttributeId, row.markedAttributeId),
            eq(markedAttributeVersion.decision, 'Approved'),
            sql`pg_catalog.upper_inf(${markedAttributeVersion.validDuring})`,
          ),
        );
      if (inForce?.later === true) return refused('conflict', 'kernel.stale-version');
      if (inForce !== undefined) {
        await context.tx
          .update(markedAttributeVersion)
          .set({
            validDuring: sql`pg_catalog.tstzrange(pg_catalog.lower(${markedAttributeVersion.validDuring}), ${at}::timestamptz, '[)')`,
          })
          .where(eq(markedAttributeVersion.id, inForce.id));
      }
      await context.tx
        .update(markedAttributeVersion)
        .set({ decision: 'Approved', validDuring: sql`pg_catalog.tstzrange(${at}::timestamptz, null, '[)')` })
        .where(eq(markedAttributeVersion.id, versionId));
      await recordDecision(context, dependencies.audit, decider, row, 'approve-marked-attribute-version', [
        value('decision', 'Awaiting approval', 'Approved'),
        value('attributeId', inForce?.attributeId ?? null, row.attributeId),
      ]);
      return { kind: 'success', answer: { markedAttributeId: row.markedAttributeId, versionId } };
    },
    async reject(context, decider, versionId): Promise<EffectOutcome> {
      const row = await waitingVersion(context, versionId);
      if ('kind' in row) return row;
      await context.tx
        .update(markedAttributeVersion)
        .set({ decision: 'Rejected' })
        .where(eq(markedAttributeVersion.id, versionId));
      await recordDecision(context, dependencies.audit, decider, row, 'reject-marked-attribute-version', [
        value('decision', 'Awaiting approval', 'Rejected'),
      ]);
      return { kind: 'success', answer: { markedAttributeId: row.markedAttributeId, versionId } };
    },
  };
}
