import { ACTIVITY_APPROVAL, READINESS_RECORD_TYPE } from '@apparel-os/schemas';
import { lockTable, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type {
  ApprovalRule,
  DocumentEffect,
  EffectDecider,
  EffectOutcome,
  ModuleApprovals,
} from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { ACTIVITY_GRANTER, type ConfigurationInterface } from '../../configuration/index.js';
import type { OpeningPlans } from '../contracts/opening-plans.js';
import { allPassed, failingItems } from '../domain/checks.js';
import { runChecks } from '../queries/checks.js';
import { activationBlocked, readinessRecordOf, refused, unitToday } from './readiness.js';

// What a decision on an activity's approval does (module-map 4.16 "Approve an activity", 6.2 flow A; domain-model
// section 6 "Granting an activity", invariant 7; PRD-LIF-001, PRD-LIF-002; MM-8, DEC-105; S1-F04-T02). Decide in
// `access` has refused the person who ran the checks or asked for the approval (PRD-ACS-006); under the activation's
// lock the checks run again, and the decision, the readiness record it binds to, the grant written into
// `configuration` and the audit records commit together, or nothing does.

/** The approval rule of an activity (access-and-approvals 8; domain-model section 5): independent, with no value. */
export const activityApprovalRule: ApprovalRule = {
  actionType: ACTIVITY_APPROVAL,
  module: 'site-lifecycle',
  recordType: READINESS_RECORD_TYPE,
  independent: true,
  value: 'none',
  freeTextReason: false,
  decisionEvidenceClasses: [],
  synthetic: false,
};

async function recordDecision(
  context: TransactionContext,
  audit: AuditInterface,
  decider: EffectDecider,
  record: { readonly activationId: string; readonly id: string },
  operation: string,
  outcome: string,
): Promise<void> {
  await audit.record(context, {
    actor: decider.actor,
    ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
    ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    record: { module: 'site-lifecycle', type: 'readiness_record', id: record.activationId, versionId: record.id },
    operation,
    changes: [{ kind: 'value', field: 'decision', before: null, after: outcome }],
    source: { kind: 'screen' },
  });
}

function activityEffect(
  audit: AuditInterface,
  configuration: ConfigurationInterface,
  openingPlans: OpeningPlans | undefined,
): DocumentEffect {
  return {
    async targets(context, readinessRecordId): Promise<LockTarget[]> {
      const record = await readinessRecordOf(context, readinessRecordId);
      return record === undefined
        ? []
        : [{ table: lockTable('site_lifecycle', 'activation'), id: record.activationId, mode: 'exclusive' }];
    },
    async approve(context, decider, readinessRecordId): Promise<EffectOutcome> {
      const record = await readinessRecordOf(context, readinessRecordId);
      if (record === undefined) return refused('not-found', 'site-lifecycle.record-not-found');
      const blocked = await activationBlocked(context, { configuration }, record);
      if (blocked !== undefined) return { kind: 'refusal', refusal: blocked };
      // Refused while a check fails, naming it, as the checks stand now under the lock (PRD-LIF-002).
      const found = await unitToday(context, record.businessUnitId);
      if (found.kind === 'refusal') return found;
      const checks = await runChecks(
        context,
        { configuration, openingPlans },
        found.answer.unit,
        record.activity,
        found.answer.today,
      );
      if (!allPassed(checks)) return refused('refused', 'site-lifecycle.check-failed', failingItems(checks));
      const { grantId } = await configuration.grantActivity(
        context,
        {
          module: ACTIVITY_GRANTER,
          userId: decider.actor.id,
          roleAssignmentId: decider.roleAssignmentId,
          approvalDecisionId: decider.approvalDecisionId,
        },
        {
          activity: record.activity,
          siteId: record.siteId,
          businessUnitId: record.businessUnitId,
          readinessRecordId: record.id,
        },
      );
      await recordDecision(context, audit, decider, record, 'approve-activity', 'Approved');
      return { kind: 'success', answer: { recordId: record.activationId, grantId } };
    },
    async reject(context, decider, readinessRecordId): Promise<EffectOutcome> {
      const record = await readinessRecordOf(context, readinessRecordId);
      if (record === undefined) return refused('not-found', 'site-lifecycle.record-not-found');
      await recordDecision(context, audit, decider, record, 'reject-activity', 'Rejected');
      return { kind: 'success', answer: { recordId: record.activationId } };
    },
  };
}

/**
 * The approval rule and decision effect `site-lifecycle` declares to `access` (access-and-approvals 8, 9.8b;
 * module-map section 3, rule 6), which the composition root hands to `access` at start.
 */
export function siteLifecycleApprovals(
  audit: AuditInterface,
  configuration: ConfigurationInterface,
  openingPlans?: OpeningPlans,
): ModuleApprovals {
  return {
    rules: [activityApprovalRule],
    effects: new Map<string, DocumentEffect>([[ACTIVITY_APPROVAL, activityEffect(audit, configuration, openingPlans)]]),
  };
}
