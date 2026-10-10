import { TAX_RULE_CHANGE, TAX_RULE_TYPE, type TaxRuleKind } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import { lockTable, type LockTarget, type TransactionContext } from '../../../../kernel/index.js';
import type { DocumentEffect, EffectDecider, EffectOutcome, ModuleApprovals } from '../../../access/index.js';
import type { AuditChange, AuditInterface } from '../../../audit/index.js';
import { taxRateRule, taxRateRuleVersion } from '../db/schema.js';
import { TAX_RULE_KINDS, taxRulesApprovalRules } from '../domain/kinds.js';
import { classificationUsable } from './classification.js';
import {
  KIND_TABLES,
  approvedOn,
  caEvidenceCount,
  recordItem,
  refused,
  takeEffect,
  today,
  versionHead,
} from './lines.js';

// What a decision does to a tax-rule version (module-map 6.2 flow A; access-and-approvals 9.8b; shared-calculations
// 10.1; S1-F09-T04): the version takes effect from its start, or is rejected, in the decision's transaction under the
// locks Decide took, with its audit record. Approval refuses, under the locks, a version that is no longer waiting,
// starts in the past (GC2-7, DEC-105), would overlap an approved version (10.3), has no CA evidence recorded
// (POL-10.05; books-and-posting 6.3, GC4-2; DEC-116), or is a rate rule whose classification is not in force then.

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
    record: { module: 'finance', ...record },
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

/** The classification a rate rule version names, which must be in force, not retired, on its start (10.1). */
async function rateRuleClassification(context: TransactionContext, versionId: string): Promise<string | undefined> {
  const [row] = await context.tx
    .select({ classificationId: taxRateRule.goodsClassificationId })
    .from(taxRateRuleVersion)
    .innerJoin(taxRateRule, eq(taxRateRule.id, taxRateRuleVersion.taxRateRuleId))
    .where(eq(taxRateRuleVersion.id, versionId));
  return row?.classificationId;
}

function effectOf(kind: TaxRuleKind, audit: AuditInterface): DocumentEffect {
  const { identity, versions } = KIND_TABLES[kind];
  return {
    async targets(context, versionId): Promise<LockTarget[]> {
      const head = await versionHead(context, kind, versionId);
      return head === undefined ? [] : [{ table: lockTable('finance', identity), id: head.ownerId, mode: 'exclusive' }];
    },
    async approve(context, decider, versionId): Promise<EffectOutcome> {
      const head = await versionHead(context, kind, versionId);
      if (head === undefined) return refused('not-found', 'finance.record-not-found');
      if (head.decision !== 'Awaiting approval') return refused('conflict', 'kernel.stale-version');
      const date = await today(context);
      if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
      // GC2-7, DEC-105: re-dated by preparing it again from today or later (structure-and-masters 2.2).
      if (head.start < date) return refused('refused', 'finance.starts-in-past');
      const overlap = await approvedOn(context, kind, head.ownerId, head.start);
      if (overlap !== undefined) return { kind: 'refusal', refusal: overlap };
      // POL-10.05; GC4-2, DEC-116: in force only with the CA's evidence attached or referenced (10.1).
      if ((await caEvidenceCount(context, kind, versionId)) === 0) {
        return refused('refused', 'finance.ca-evidence-missing', [
          { kind: 'version', recordType: TAX_RULE_TYPE, recordId: head.ownerId, versionId },
        ]);
      }
      if (kind === 'tax-rate-rule') {
        const classificationId = await rateRuleClassification(context, versionId);
        if (classificationId === undefined || !(await classificationUsable(context, classificationId, head.start))) {
          return refused('refused', 'finance.reference-not-in-force', [recordItem(classificationId ?? head.ownerId)]);
        }
      }
      await takeEffect(context, kind, head.ownerId, versionId, head.start);
      await recordDecision(
        context,
        audit,
        decider,
        { type: identity, id: head.ownerId, versionId },
        `approve-${identity.replaceAll('_', '-')}-version`,
        [decisionChange('Approved')],
      );
      return { kind: 'success', answer: { recordId: head.ownerId } };
    },
    async reject(context, decider, versionId): Promise<EffectOutcome> {
      const head = await versionHead(context, kind, versionId);
      if (head === undefined) return refused('not-found', 'finance.record-not-found');
      if (head.decision !== 'Awaiting approval') return refused('conflict', 'kernel.stale-version');
      await context.tx.update(versions).set({ decision: 'Rejected' }).where(eq(versions.id, versionId));
      await recordDecision(
        context,
        audit,
        decider,
        { type: identity, id: head.ownerId, versionId },
        `reject-${identity.replaceAll('_', '-')}-version`,
        [decisionChange('Rejected')],
      );
      return { kind: 'success', answer: { recordId: head.ownerId } };
    },
  };
}

/**
 * The approval rules and decision effects the tax rules part declares to `access` (access-and-approvals 8, 9.8b;
 * module-map section 3, rule 6), which the composition root hands to `access` at start.
 */
export function taxRulesApprovals(audit: AuditInterface): ModuleApprovals {
  return {
    rules: taxRulesApprovalRules,
    effects: new Map<string, DocumentEffect>(
      TAX_RULE_KINDS.map((kind) => [TAX_RULE_CHANGE[kind], effectOf(kind, audit)]),
    ),
  };
}
