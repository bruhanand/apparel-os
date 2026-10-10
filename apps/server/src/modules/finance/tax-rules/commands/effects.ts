import { TAX_RULE_CHANGE, type TaxRuleKind } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import type { LockTarget, TransactionContext } from '../../../../kernel/index.js';
import type { DocumentEffect, EffectOutcome, ModuleApprovals } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import { approvable, decisionChange, recordDecision, refused, takeEffect } from '../../books/index.js';
import { taxRateRule, taxRateRuleVersion } from '../db/schema.js';
import { TAX_RULE_KINDS, taxRulesApprovalRules } from '../domain/kinds.js';
import { classificationUsable } from './classification.js';
import { KIND_TABLES, lineOf, recordItem, recordLock, versionHead, versionsOf } from './lines.js';

// What a decision does to a tax-rule version (module-map 6.2 flow A; access-and-approvals 9.8b; shared-calculations
// 10.1; S1-F09-T04): the version takes effect from its start, or is rejected, in the decision's transaction under the
// locks Decide took, with its audit record. Approval makes the checks every version of `finance` makes under the locks
// (still waiting, not starting in the past, no overlap, the CA's evidence covering it: books-and-posting 6.3; POL-10.05;
// GC4-2; DEC-116; RR-486), through the books part's interface, and refuses a rate rule whose classification is not in
// force then.

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
  const { identity } = KIND_TABLES[kind];
  const versions = versionsOf(kind);
  const line = (recordId: string) => lineOf(kind, recordId);
  return {
    async targets(context, versionId): Promise<LockTarget[]> {
      const head = await versionHead(context, kind, versionId);
      return head === undefined ? [] : [recordLock(kind, head.ownerId)];
    },
    async approve(context, decider, versionId): Promise<EffectOutcome> {
      const head = await versionHead(context, kind, versionId);
      const blocked = await approvable(context, head, line, versionId);
      if (blocked !== undefined || head === undefined)
        return blocked ?? refused('not-found', 'finance.record-not-found');
      if (kind === 'tax-rate-rule') {
        const classificationId = await rateRuleClassification(context, versionId);
        if (classificationId === undefined || !(await classificationUsable(context, classificationId, head.start))) {
          return refused('refused', 'finance.reference-not-in-force', [recordItem(classificationId ?? head.ownerId)]);
        }
      }
      await takeEffect(context, line(head.ownerId), versionId, head.start);
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
