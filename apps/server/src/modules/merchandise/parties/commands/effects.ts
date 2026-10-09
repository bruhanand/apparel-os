import {
  AGREEMENT_CHANGE,
  AGREEMENT_TYPE,
  BANK_DETAILS_CHANGE,
  BANK_DETAILS_TYPE,
  type MissingItem,
} from '@apparel-os/schemas';
import { eq, sql } from 'drizzle-orm';
import { lockTable, type LockTarget, type TransactionContext } from '../../../../kernel/index.js';
import type { DocumentEffect, EffectDecider, EffectOutcome, ModuleApprovals } from '../../../access/index.js';
import type { AuditChange, AuditInterface } from '../../../audit/index.js';
import { brandInForce } from '../../catalogue/index.js';
import { agreement, agreementVersion, partyBankDetails, type Decision } from '../db/schema.js';
import { agreementChanged } from '../events.js';
import { partiesApprovalRules } from '../domain/kinds.js';
import { approvedOn, holdsRoleOn, inForceOn, lineOf, refused, takeEffect, today, type Line } from './lines.js';

// What a decision does to a document of the parties part (module-map 6.2 flow A; access-and-approvals 9.8b;
// S1-F03-T03): a bank-detail version or an agreement version taking effect from its start, or rejected, in the
// decision's transaction under the locks Decide took, with its audit record; an agreement version's taking effect also
// publishes `merchandise.agreement-changed` (module-map section 8).

interface Version {
  readonly ownerId: string;
  readonly decision: Decision;
  readonly start: string;
}

async function recordDecision(
  context: TransactionContext,
  audit: AuditInterface,
  decider: EffectDecider,
  record: { readonly type: string; readonly id: string; readonly versionId: string },
  operation: string,
  changes: readonly AuditChange[],
): Promise<void> {
  await audit.record(context, {
    actor: decider.actor,
    ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
    ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    record: { module: 'merchandise', ...record },
    operation,
    changes,
    source: { kind: 'screen' },
  });
}

const decisionChange = (after: 'Approved' | 'Rejected'): AuditChange => ({
  kind: 'value',
  field: 'decision',
  before: 'Awaiting approval',
  after,
});

/** The checks every approval of a version makes under the locks: still waiting, not started in the past, no overlap. */
async function approvable(context: TransactionContext, version: Version | undefined, line: (id: string) => Line) {
  if (version === undefined) return refused<never>('not-found', 'merchandise.record-not-found');
  if (version.decision !== 'Awaiting approval') return refused<never>('conflict', 'kernel.stale-version');
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date } as const;
  // GC2-7, DEC-105: re-dated by preparing it again from today or later (structure-and-masters 2.2).
  if (version.start < date) return refused<never>('refused', 'merchandise.starts-in-past');
  const overlap = await approvedOn(context, line(version.ownerId), version.start);
  if (overlap !== undefined) return { kind: 'refusal', refusal: overlap } as const;
  return undefined;
}

async function bankVersion(context: TransactionContext, versionId: string): Promise<Version | undefined> {
  const [row] = await context.tx
    .select({
      ownerId: partyBankDetails.partyId,
      decision: sql<Decision>`${partyBankDetails.decision}`,
      start: sql<string>`lower(${partyBankDetails.validDuring})::text`,
    })
    .from(partyBankDetails)
    .where(eq(partyBankDetails.id, versionId));
  return row;
}

const bankLine = (partyId: string) => lineOf('party_bank_details', BANK_DETAILS_TYPE, 'party_id', partyId);

/**
 * The effect of a decision on a bank-detail version (structure-and-masters 5.1; POL-02.07; GC2-6, DEC-105): approved, it
 * is in force from its start; the audit record names the versions that held the old and the new value, never a value
 * (numbering-and-audit 4.3; PRD-SEC-006).
 */
function bankDetailsEffect(audit: AuditInterface): DocumentEffect {
  return {
    async targets(context, versionId): Promise<LockTarget[]> {
      const version = await bankVersion(context, versionId);
      return version === undefined
        ? []
        : [{ table: lockTable('merchandise', 'party'), id: version.ownerId, mode: 'exclusive' }];
    },
    async approve(context, decider, versionId): Promise<EffectOutcome> {
      const version = await bankVersion(context, versionId);
      const blocked = await approvable(context, version, bankLine);
      if (blocked !== undefined || version === undefined)
        return blocked ?? refused('not-found', 'merchandise.record-not-found');
      const before = await inForceOn(context, bankLine(version.ownerId), version.start);
      await takeEffect(context, bankLine(version.ownerId), versionId, version.start);
      await recordDecision(
        context,
        audit,
        decider,
        { type: 'party_bank_details', id: version.ownerId, versionId },
        'approve-party-bank-details-version',
        [
          decisionChange('Approved'),
          {
            kind: 'encrypted',
            field: 'bankDetails',
            fieldClass: 'bank-details',
            before: before === undefined ? { kind: 'absent' } : { kind: 'version', versionId: before },
            after: { kind: 'version', versionId },
          },
        ],
      );
      return { kind: 'success', answer: { recordId: version.ownerId } };
    },
    async reject(context, decider, versionId): Promise<EffectOutcome> {
      const version = await bankVersion(context, versionId);
      if (version === undefined) return refused('not-found', 'merchandise.record-not-found');
      if (version.decision !== 'Awaiting approval') return refused('conflict', 'kernel.stale-version');
      await context.tx.update(partyBankDetails).set({ decision: 'Rejected' }).where(eq(partyBankDetails.id, versionId));
      await recordDecision(
        context,
        audit,
        decider,
        { type: 'party_bank_details', id: version.ownerId, versionId },
        'reject-party-bank-details-version',
        [decisionChange('Rejected')],
      );
      return { kind: 'success', answer: { recordId: version.ownerId } };
    },
  };
}

async function agreementVersionOf(context: TransactionContext, versionId: string): Promise<Version | undefined> {
  const [row] = await context.tx
    .select({
      ownerId: agreementVersion.agreementId,
      decision: sql<Decision>`${agreementVersion.decision}`,
      start: sql<string>`lower(${agreementVersion.validDuring})::text`,
    })
    .from(agreementVersion)
    .where(eq(agreementVersion.id, versionId));
  return row;
}

const agreementLine = (agreementId: string) => lineOf('agreement_version', AGREEMENT_TYPE, 'agreement_id', agreementId);

/**
 * The effect of a decision on an agreement version (structure-and-masters 5.2; GC2-2, DEC-105): approved, it is in
 * force from its start, provided its brand is in force then, or its supplier holds the supplier role then (5.1).
 */
function agreementEffect(audit: AuditInterface): DocumentEffect {
  return {
    async targets(context, versionId): Promise<LockTarget[]> {
      const version = await agreementVersionOf(context, versionId);
      return version === undefined
        ? []
        : [{ table: lockTable('merchandise', 'agreement'), id: version.ownerId, mode: 'exclusive' }];
    },
    async approve(context, decider, versionId): Promise<EffectOutcome> {
      const version = await agreementVersionOf(context, versionId);
      const blocked = await approvable(context, version, agreementLine);
      if (blocked !== undefined || version === undefined)
        return blocked ?? refused('not-found', 'merchandise.record-not-found');
      const [head] = await context.tx
        .select({ brandId: agreement.brandId, partyId: agreement.partyId })
        .from(agreement)
        .where(eq(agreement.id, version.ownerId));
      if (head?.brandId != null && !(await brandInForce(context, head.brandId, version.start))) {
        const missing: MissingItem[] = [{ kind: 'record', recordType: 'merchandise.brand', recordId: head.brandId }];
        return refused('refused', 'merchandise.reference-not-in-force', missing);
      }
      if (head?.partyId != null && !(await holdsRoleOn(context, head.partyId, 'supplier', version.start))) {
        const missing: MissingItem[] = [{ kind: 'record', recordType: 'merchandise.party', recordId: head.partyId }];
        return refused('refused', 'merchandise.party-not-supplier', missing);
      }
      await takeEffect(context, agreementLine(version.ownerId), versionId, version.start);
      await recordDecision(
        context,
        audit,
        decider,
        { type: 'agreement', id: version.ownerId, versionId },
        'approve-agreement-version',
        [decisionChange('Approved')],
      );
      await context.publish(agreementChanged, {
        subject: { module: 'merchandise', recordType: AGREEMENT_TYPE, recordId: version.ownerId, versionId },
        payload: { agreementId: version.ownerId, versionId },
      });
      return { kind: 'success', answer: { recordId: version.ownerId } };
    },
    async reject(context, decider, versionId): Promise<EffectOutcome> {
      const version = await agreementVersionOf(context, versionId);
      if (version === undefined) return refused('not-found', 'merchandise.record-not-found');
      if (version.decision !== 'Awaiting approval') return refused('conflict', 'kernel.stale-version');
      await context.tx.update(agreementVersion).set({ decision: 'Rejected' }).where(eq(agreementVersion.id, versionId));
      await recordDecision(
        context,
        audit,
        decider,
        { type: 'agreement', id: version.ownerId, versionId },
        'reject-agreement-version',
        [decisionChange('Rejected')],
      );
      return { kind: 'success', answer: { recordId: version.ownerId } };
    },
  };
}

/**
 * The approval rules and decision effects the parties part declares to `access` (access-and-approvals 8, 9.8b;
 * module-map section 3, rule 6), which the composition root hands to `access` at start.
 */
export function partiesApprovals(audit: AuditInterface): ModuleApprovals {
  return {
    rules: partiesApprovalRules,
    effects: new Map<string, DocumentEffect>([
      [BANK_DETAILS_CHANGE, bankDetailsEffect(audit)],
      [AGREEMENT_CHANGE, agreementEffect(audit)],
    ]),
  };
}
