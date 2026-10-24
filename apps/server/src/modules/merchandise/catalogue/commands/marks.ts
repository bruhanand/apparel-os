import { uuidv7 } from '@apparel-os/domain';
import {
  MARKED_ATTRIBUTE_CHANGE,
  type MarkedAttributePrepared,
  type MarkedAttributeVersionDraft,
} from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import { LOCK_STEP, lockTable, type LockTarget, type TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface, DocumentEffect, EffectDecider, EffectOutcome } from '../../../access/index.js';
import type { AuditChange, AuditInterface } from '../../../audit/index.js';
import type { ConfigurationInterface } from '../../../configuration/index.js';
import type { Preparer } from '../../../organisation/index.js';
import { markedAttribute, markedAttributeVersion } from '../db/schema.js';
import { markAuditRecord, markDecision, markDocument, markItem } from '../domain/marks.js';
import { markRow, markVersionRow, markVersions } from '../queries/marks.js';
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
 * The marking a preparation changes, locked before anything is written (code-house-rules 8.2): an existing marking's
 * row exclusively at step 1, with the open requests of its versions still waiting, so no decision passes the
 * supersession (access-and-approvals 9.1a), and its token rechecked under the lock (12.7). A marking's first
 * preparation finds no row: it writes it, which creates it locked, and holds nothing else to lock. Another first
 * preparation committing meanwhile wrote it first, so this one's token, naming no version, is stale.
 */
async function lockedMarking(
  context: TransactionContext,
  dependencies: MarkDependencies,
  draft: MarkedAttributeVersionDraft,
): Promise<
  { readonly kind: 'locked'; readonly markedAttributeId: string; readonly waiting: readonly string[] } | Outcome<never>
> {
  const found = await markRow(context, draft.mark);
  if (found === undefined) {
    if (draft.versionToken !== undefined) return refused('conflict', 'kernel.stale-version');
    const [written] = await context.tx
      .insert(markedAttribute)
      .values({ id: uuidv7(), mark: draft.mark })
      .onConflictDoNothing({ target: markedAttribute.mark })
      .returning({ id: markedAttribute.id });
    if (written === undefined) return refused('conflict', 'kernel.stale-version');
    return { kind: 'locked', markedAttributeId: written.id, waiting: [] };
  }
  const targets: LockTarget[] = [markLock(found.id)];
  for (const each of await markVersions(context, found.id)) {
    if (each.decision !== 'Awaiting approval') continue;
    targets.push(...(await dependencies.access.requestLockTargets(context, markDecision(found.id, each.id))));
  }
  await context.lock(LOCK_STEP.document, targets);
  const versions = await markVersions(context, found.id);
  if (versions.at(-1)?.id !== draft.versionToken) {
    return refused('conflict', 'kernel.stale-version', [markItem(found.id)]);
  }
  return {
    kind: 'locked',
    markedAttributeId: found.id,
    waiting: versions.filter((version) => version.decision === 'Awaiting approval').map((version) => version.id),
  };
}

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
  const marking = await lockedMarking(context, dependencies, draft);
  if (marking.kind !== 'locked') return marking;
  const { markedAttributeId } = marking;
  for (const each of marking.waiting) {
    await dependencies.access.supersedeRequest(context, markDecision(markedAttributeId, each), preparer);
  }
  const versionId = uuidv7();
  await context.tx.insert(markedAttributeVersion).values({
    id: versionId,
    markedAttributeId: markedAttributeId,
    attributeId: draft.attributeId,
    origin: draft.origin,
    decision: 'Awaiting approval',
    validDuring: null,
    preparedByUserId: preparer.userId,
  });
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: preparer.userId },
    roleAssignmentId: preparer.roleAssignmentId,
    record: markAuditRecord(markedAttributeId, versionId),
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
    document: markDocument(markedAttributeId, versionId),
    value: { kind: 'none' },
    preparers: [preparer.userId],
    requestedBy: preparer,
  });
  return { kind: 'success', answer: { markedAttributeId: markedAttributeId, versionId, requestId } };
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
