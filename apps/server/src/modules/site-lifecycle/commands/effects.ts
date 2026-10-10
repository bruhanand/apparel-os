import { uuidv7 } from '@apparel-os/domain';
import { ACTIVITY_APPROVAL, READINESS_RECORD_TYPE, SITE_READINESS_APPROVAL } from '@apparel-os/schemas';
import { CommandDefect, lockTable, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type {
  ApprovalRule,
  DocumentEffect,
  EffectDecider,
  EffectOutcome,
  ModuleApprovals,
} from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { ActivityGrantWriter, ConfigurationInterface } from '../../configuration/index.js';
import type { LocationInUse } from '../../organisation/index.js';
import type { OpeningPlans } from '../contracts/opening-plans.js';
import { siteReadinessApproval } from '../db/schema.js';
import { allPassed, failingItems } from '../domain/checks.js';
import { activationAt, latestZeroStock, runSiteChecks, runUnitChecks } from '../queries/checks.js';
import { activationBlocked, readinessRecordOf, refused, unitToday, type ReadinessRow } from './readiness.js';

// What a decision on a Site's readiness or on an activity's approval does (module-map 4.16 "Approve an activity", 6.2
// flow A; domain-model section 6 "Granting an activity", invariant 7; PRD-LIF-001, PRD-LIF-002; MM-8, DEC-105;
// S1-F04-T02; product owner, 10 Oct 2026). Decide in `access` has refused the person who ran the checks or asked for
// the approval (PRD-ACS-006), and the effect refuses the person who ran them again. Under the activation's lock the
// checks run again; for a unit, under its Site's too, so the Site's readiness is rechecked as it stands. The decision,
// the readiness record it binds to, the Site's approval or the grant written into `configuration`, and the audit
// records commit together, or nothing does.

const ACTIVATION = lockTable('site_lifecycle', 'activation');

/** An approval rule of readiness (access-and-approvals 8; domain-model section 5): independent, with no value. */
const readinessRule = (actionType: string): ApprovalRule => ({
  actionType,
  module: 'site-lifecycle',
  recordType: READINESS_RECORD_TYPE,
  independent: true,
  value: 'none',
  freeTextReason: false,
  decisionEvidenceClasses: [],
  synthetic: false,
});

/** The approval rule of an activity for a business unit. */
export const activityApprovalRule: ApprovalRule = readinessRule(ACTIVITY_APPROVAL);
/** The approval rule of a Site's shared readiness for an activity. */
export const siteReadinessApprovalRule: ApprovalRule = readinessRule(SITE_READINESS_APPROVAL);

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

/** The decision's own identifier, which every Site approval and grant names (module-map 4.4; S1-F04 review H4). */
function decisionOf(decider: EffectDecider): string {
  if (decider.approvalDecisionId === undefined) {
    throw new CommandDefect('A readiness approval is written only in the decision that gives it');
  }
  return decider.approvalDecisionId;
}

/**
 * The record a decision binds to, still the latest and not yet approved or granted, and decided by someone other than
 * the person who ran its checks: Decide refuses them already, and this refuses them again (S1-F04 review S4).
 */
async function decidable(
  context: TransactionContext,
  configuration: ConfigurationInterface,
  decider: EffectDecider,
  readinessRecordId: string,
): Promise<{ readonly kind: 'decidable'; readonly record: ReadinessRow } | EffectOutcome> {
  const record = await readinessRecordOf(context, readinessRecordId);
  if (record === undefined) return refused('not-found', 'site-lifecycle.record-not-found');
  if (decider.actor.id === record.ranByUserId) {
    return refused('refused', 'access.self-preparation', [{ kind: 'preparer', userId: record.ranByUserId }]);
  }
  const blocked = await activationBlocked(context, { configuration }, record);
  if (blocked !== undefined) return { kind: 'refusal', refusal: blocked };
  return { kind: 'decidable', record };
}

const rejectWith = (audit: AuditInterface): DocumentEffect['reject'] =>
  async function reject(context, decider, readinessRecordId): Promise<EffectOutcome> {
    const record = await readinessRecordOf(context, readinessRecordId);
    if (record === undefined) return refused('not-found', 'site-lifecycle.record-not-found');
    await recordDecision(context, audit, decider, record, 'reject-activity', 'Rejected');
    return { kind: 'success', answer: { recordId: record.activationId } };
  };

/** A Site made ready: its shared checks run again under the lock, then its approval is kept (PRD-LIF-001). */
function siteReadinessEffect(audit: AuditInterface, configuration: ConfigurationInterface): DocumentEffect {
  return {
    async targets(context, readinessRecordId): Promise<LockTarget[]> {
      const record = await readinessRecordOf(context, readinessRecordId);
      return record === undefined ? [] : [{ table: ACTIVATION, id: record.activationId, mode: 'exclusive' }];
    },
    async approve(context, decider, readinessRecordId): Promise<EffectOutcome> {
      const found = await decidable(context, configuration, decider, readinessRecordId);
      if (found.kind !== 'decidable') return found;
      const { record } = found;
      const checks = await runSiteChecks(context, { configuration }, record.activity);
      if (!allPassed(checks)) return refused('refused', 'site-lifecycle.check-failed', failingItems(checks));
      await context.tx.insert(siteReadinessApproval).values({
        id: uuidv7(),
        readinessRecordId: record.id,
        siteId: record.siteId,
        activity: record.activity,
        approvalDecisionId: decisionOf(decider),
        approvedByUserId: decider.actor.id,
        roleAssignmentId: decider.roleAssignmentId ?? null,
        approvedAt: context.startedAt,
      });
      await recordDecision(context, audit, decider, record, 'approve-site-readiness', 'Approved');
      return { kind: 'success', answer: { recordId: record.activationId } };
    },
    reject: rejectWith(audit),
  };
}

interface UnitEffectDependencies {
  readonly audit: AuditInterface;
  readonly configuration: ConfigurationInterface;
  readonly grants: ActivityGrantWriter;
  readonly locationInUse: LocationInUse;
  readonly openingPlans: OpeningPlans | undefined;
}

/**
 * An activity granted to a unit: under the unit's activation and its Site's, every check runs again, the Site's
 * readiness and the stock at the unit among them; a zero declaration replaced since the run refuses it as stale, for
 * the approver approved the one the run relied on (RR-483). Then the grant is written into `configuration`.
 */
function activityEffect(dependencies: UnitEffectDependencies): DocumentEffect {
  const { audit, configuration, grants } = dependencies;
  return {
    async targets(context, readinessRecordId): Promise<LockTarget[]> {
      const record = await readinessRecordOf(context, readinessRecordId);
      if (record === undefined) return [];
      const site = await activationAt(context, { siteId: record.siteId, businessUnitId: null }, record.activity);
      return [
        { table: ACTIVATION, id: record.activationId, mode: 'exclusive' },
        ...(site === undefined ? [] : [{ table: ACTIVATION, id: site, mode: 'shared' as const }]),
      ];
    },
    async approve(context, decider, readinessRecordId): Promise<EffectOutcome> {
      const found = await decidable(context, configuration, decider, readinessRecordId);
      if (found.kind !== 'decidable') return found;
      const { record } = found;
      if (record.businessUnitId === null) throw new CommandDefect('An activity is granted to a business unit');
      if (record.zeroStockDeclarationId !== null) {
        const latest = await latestZeroStock(context, record.businessUnitId);
        if (latest?.id !== record.zeroStockDeclarationId) {
          return refused('conflict', 'kernel.stale-version', [
            { kind: 'record', recordType: 'site_lifecycle.zero_stock_declaration', recordId: latest?.id ?? '' },
          ]);
        }
      }
      // Refused while a check fails, naming it, as the checks stand now under the locks (PRD-LIF-002).
      const unit = await unitToday(context, record.businessUnitId);
      if (unit.kind === 'refusal') return unit;
      const { checks } = await runUnitChecks(
        context,
        dependencies,
        unit.answer.unit,
        record.activity,
        unit.answer.today,
      );
      if (!allPassed(checks)) return refused('refused', 'site-lifecycle.check-failed', failingItems(checks));
      const { grantId } = await grants.grant(
        context,
        {
          userId: decider.actor.id,
          roleAssignmentId: decider.roleAssignmentId,
          approvalDecisionId: decisionOf(decider),
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
    reject: rejectWith(audit),
  };
}

/** What the composition root hands `site-lifecycle`'s approvals at start (module-map section 3, rule 6). */
export interface SiteLifecycleApprovalDependencies {
  readonly audit: AuditInterface;
  readonly configuration: ConfigurationInterface;
  /** The one writer of activity grants, which the composition root claims from `configuration` (module-map 4.4). */
  readonly grants: ActivityGrantWriter;
  /** Whether the stock ledger holds stock at a location (structure-and-masters 3.5); `stock` implements it. */
  readonly locationInUse: LocationInUse;
  /** The read of an approved opening plan, wired with S1-F13-T01; none counts while it is left out. */
  readonly openingPlans?: OpeningPlans | undefined;
}

/**
 * The approval rules and decision effects `site-lifecycle` declares to `access` (access-and-approvals 8, 9.8b;
 * module-map section 3, rule 6), which the composition root hands to `access` at start: a Site's shared readiness,
 * and an activity for a unit.
 */
export function siteLifecycleApprovals(dependencies: SiteLifecycleApprovalDependencies): ModuleApprovals {
  const { audit, configuration } = dependencies;
  return {
    rules: [siteReadinessApprovalRule, activityApprovalRule],
    effects: new Map<string, DocumentEffect>([
      [SITE_READINESS_APPROVAL, siteReadinessEffect(audit, configuration)],
      [ACTIVITY_APPROVAL, activityEffect({ ...dependencies, openingPlans: dependencies.openingPlans })],
    ]),
  };
}
