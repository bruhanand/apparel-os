import { uuidv7 } from '@apparel-os/domain';
import { BRAND_COVERAGE_CHANGE, PRODUCT_CONFIRMATION, VOCABULARY_CONFIRMATION } from '@apparel-os/schemas';
import { eq, sql } from 'drizzle-orm';
import {
  lockTable,
  UNIQUE_VIOLATION,
  withSavepoint,
  type LockTarget,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { DocumentEffect, EffectDecider, EffectOutcome, ModuleApprovals } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import { businessUnitInForce } from '../../../organisation/index.js';
import {
  businessUnitBrand,
  businessUnitBrandMember,
  vocabularyProposal,
  vocabularyValue,
  vocabularyValueVersion,
  type Decision,
} from '../db/schema.js';
import { catalogueApprovalRules } from '../domain/kinds.js';
import { approvedOn, referencesInForce, refused, takeEffect, today } from './common.js';
import { listAttributeRefusal, vocabularyCodeTaken } from './proposals.js';
import { productProposalEffect } from './products.js';
import { coverageRules } from './rules.js';

// What a decision does to a catalogue document (module-map 6.2 flow A; access-and-approvals 9.8b; S1-F03-T01): a
// brand coverage version taking effect from its start or rejected (structure-and-masters 3.3), and a vocabulary
// proposal confirmed into an approved value or rejected (4.2; PRD-IMP-008), in the decision's transaction under the
// locks Decide took, with their audit records.

async function recordDecision(
  context: TransactionContext,
  audit: AuditInterface,
  decider: EffectDecider,
  record: { readonly type: string; readonly id: string; readonly versionId?: string },
  operation: string,
  changes: { readonly field: string; readonly before: string | null; readonly after: string }[],
): Promise<void> {
  await audit.record(context, {
    actor: decider.actor,
    ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
    ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    record: { module: 'merchandise', ...record },
    operation,
    changes: changes.map((change) => ({ kind: 'value' as const, ...change })),
    source: { kind: 'screen' },
  });
}

/** A brand coverage version: its unit, decision and first day; fixed once written, so read before the locks. */
async function coverageVersion(context: TransactionContext, versionId: string) {
  const [row] = await context.tx
    .select({
      unitId: businessUnitBrand.businessUnitId,
      decision: sql<Decision>`${businessUnitBrand.decision}`,
      start: sql<string>`lower(${businessUnitBrand.validDuring})::text`,
    })
    .from(businessUnitBrand)
    .where(eq(businessUnitBrand.id, versionId));
  return row;
}

/** The effect of a decision on a unit's brand coverage version (structure-and-masters 3.3; GC2-2, DEC-105). */
function coverageEffect(audit: AuditInterface): DocumentEffect {
  return {
    async targets(context, versionId): Promise<LockTarget[]> {
      const version = await coverageVersion(context, versionId);
      return version === undefined
        ? []
        : [{ table: lockTable('merchandise', 'business_unit_coverage'), id: version.unitId, mode: 'exclusive' }];
    },
    async approve(context, decider, versionId): Promise<EffectOutcome> {
      const version = await coverageVersion(context, versionId);
      if (version === undefined) return refused('not-found', 'merchandise.record-not-found');
      if (version.decision !== 'Awaiting approval') return refused('conflict', 'kernel.stale-version');
      const date = await today(context);
      if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
      // GC2-7, DEC-105: re-dated by recording it again from today or later (structure-and-masters 2.2).
      if (version.start < date) return refused('refused', 'merchandise.starts-in-past');
      const overlap = await approvedOn(context, 'business_unit_brand', version.unitId, version.start);
      if (overlap !== undefined) return { kind: 'refusal', refusal: overlap };
      const members = await context.tx
        .select({ brandId: businessUnitBrandMember.brandId })
        .from(businessUnitBrandMember)
        .where(eq(businessUnitBrandMember.businessUnitBrandId, versionId));
      const rules = await coverageRules(context, version.unitId, members.length);
      if (rules !== undefined) return { kind: 'refusal', refusal: rules };
      if (!(await businessUnitInForce(context, version.unitId, version.start))) {
        return refused('refused', 'merchandise.reference-not-in-force', [
          { kind: 'record', recordType: 'organisation.business_unit', recordId: version.unitId },
        ]);
      }
      const brands = await referencesInForce(
        context,
        members.map((member) => ({ kind: 'brand' as const, id: member.brandId })),
        version.start,
      );
      if (brands !== undefined) return { kind: 'refusal', refusal: brands };
      await takeEffect(context, 'business_unit_brand', version.unitId, versionId, version.start);
      await recordDecision(
        context,
        audit,
        decider,
        { type: 'business_unit_brand', id: version.unitId, versionId },
        'approve-business-unit-brand-version',
        [{ field: 'decision', before: 'Awaiting approval', after: 'Approved' }],
      );
      return { kind: 'success', answer: { recordId: version.unitId } };
    },
    async reject(context, decider, versionId): Promise<EffectOutcome> {
      const version = await coverageVersion(context, versionId);
      if (version === undefined) return refused('not-found', 'merchandise.record-not-found');
      if (version.decision !== 'Awaiting approval') return refused('conflict', 'kernel.stale-version');
      await context.tx
        .update(businessUnitBrand)
        .set({ decision: 'Rejected' })
        .where(eq(businessUnitBrand.id, versionId));
      await recordDecision(
        context,
        audit,
        decider,
        { type: 'business_unit_brand', id: version.unitId, versionId },
        'reject-business-unit-brand-version',
        [{ field: 'decision', before: 'Awaiting approval', after: 'Rejected' }],
      );
      return { kind: 'success', answer: { recordId: version.unitId } };
    },
  };
}

async function proposalOf(context: TransactionContext, proposalId: string) {
  const [row] = await context.tx.select().from(vocabularyProposal).where(eq(vocabularyProposal.id, proposalId));
  return row;
}

/**
 * The effect of a decision on a vocabulary proposal (4.2; PRD-IMP-008, POL-02.07): confirming it makes the approved
 * value, in force from the day it is confirmed, and records the confirmer, never its proposer (access refuses a
 * preparer first; the table refuses it behind). Rejecting it makes nothing.
 */
function proposalEffect(audit: AuditInterface): DocumentEffect {
  return {
    targets(_context, proposalId): Promise<LockTarget[]> {
      return Promise.resolve([
        { table: lockTable('merchandise', 'vocabulary_proposal'), id: proposalId, mode: 'exclusive' },
      ]);
    },
    async approve(context, decider, proposalId): Promise<EffectOutcome> {
      const proposal = await proposalOf(context, proposalId);
      if (proposal === undefined) return refused('not-found', 'merchandise.proposal-not-found');
      if (proposal.state !== 'Proposed') return refused('refused', 'merchandise.proposal-not-open');
      const date = await today(context);
      if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
      const notList = await listAttributeRefusal<never>(context, proposal.attributeId, date);
      if (notList !== undefined) return notList;
      if (await vocabularyCodeTaken(context, proposal.attributeId, proposal.code, proposalId)) {
        return refused('refused', 'merchandise.code-taken');
      }
      const valueId = uuidv7();
      const written = await withSavepoint(context, 'merchandise_confirm', [UNIQUE_VIOLATION], () =>
        context.tx.insert(vocabularyValue).values({
          id: valueId,
          attributeId: proposal.attributeId,
          code: proposal.code,
          proposalId,
        }),
      );
      if (written.kind === 'caught') return refused('refused', 'merchandise.code-taken');
      const versionId = uuidv7();
      await context.tx.insert(vocabularyValueVersion).values({
        id: versionId,
        vocabularyValueId: valueId,
        name: proposal.name,
        validDuring: `[${date},)`,
        decision: 'Approved',
        preparedByUserId: proposal.proposedByUserId,
      });
      await context.tx
        .update(vocabularyProposal)
        .set({ state: 'Confirmed', decidedByUserId: decider.actor.id, decidedAt: context.startedAt })
        .where(eq(vocabularyProposal.id, proposalId));
      await recordDecision(
        context,
        audit,
        decider,
        { type: 'vocabulary_proposal', id: proposalId },
        'confirm-vocabulary-value',
        [
          { field: 'state', before: 'Proposed', after: 'Confirmed' },
          { field: 'valueId', before: null, after: valueId },
        ],
      );
      return { kind: 'success', answer: { recordId: valueId } };
    },
    async reject(context, decider, proposalId): Promise<EffectOutcome> {
      const proposal = await proposalOf(context, proposalId);
      if (proposal === undefined) return refused('not-found', 'merchandise.proposal-not-found');
      if (proposal.state !== 'Proposed') return refused('refused', 'merchandise.proposal-not-open');
      await context.tx
        .update(vocabularyProposal)
        .set({ state: 'Rejected', decidedByUserId: decider.actor.id, decidedAt: context.startedAt })
        .where(eq(vocabularyProposal.id, proposalId));
      await recordDecision(
        context,
        audit,
        decider,
        { type: 'vocabulary_proposal', id: proposalId },
        'reject-vocabulary-value',
        [{ field: 'state', before: 'Proposed', after: 'Rejected' }],
      );
      return { kind: 'success', answer: { recordId: proposalId } };
    },
  };
}

/**
 * The approval rules and decision effects `merchandise` · catalogue declares to `access` (access-and-approvals 8,
 * 9.8b; module-map section 3, rule 6), which the composition root hands to `access` at start.
 */
export function catalogueApprovals(audit: AuditInterface): ModuleApprovals {
  return {
    rules: catalogueApprovalRules,
    effects: new Map<string, DocumentEffect>([
      [BRAND_COVERAGE_CHANGE, coverageEffect(audit)],
      [VOCABULARY_CONFIRMATION, proposalEffect(audit)],
      // A product proposal's confirmation (4.2; DM-5, DEC-105; S1-F03-T02).
      [PRODUCT_CONFIRMATION, productProposalEffect(audit)],
    ]),
  };
}
