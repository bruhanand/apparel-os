import {
  IMPORT_BATCH_APPROVAL,
  IMPORT_BATCH_TYPE,
  IMPORT_LAYOUT_TYPE,
  IMPORT_MAPPING_TYPE,
  LAYOUT_CONFIRMATION,
  MAPPING_CONFIRMATION,
  MAPPING_RULE_CONFIRMATION,
  MAPPING_RULE_TYPE,
} from '@apparel-os/schemas';
import { and, eq } from 'drizzle-orm';
import {
  EXCLUSION_VIOLATION,
  lockTable,
  withSavepoint,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import type {
  ApprovalRule,
  DocumentEffect,
  EffectDecider,
  EffectOutcome,
  ModuleApprovals,
} from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { ImportHandlers } from '../contracts/import-handlers.js';
import { layoutVersion, mappingRule, mappingRuleVersion, mappingVersion } from '../db/schema.js';
import { mappingConfirmed } from '../events.js';
import { dateRangeOf, dateRangeText, followOn, type DateRange } from '../domain/rules.js';
import { ruleTargetRefusal } from './proposals.js';

// What a decision does to a layout version, a mapping version or a mapping rule version (imports-and-opening-data 6.3,
// 6.4, 13.3; access-and-approvals 8, 9.8b; module-map 6.2 flow A; PRD-IMP-008, POL-02.07, POL-02.08; DEC-112 GC6-4;
// S1-F06-T03): confirmed or rejected, once, in the decision's transaction under the locks Decide took, with its audit
// record. `access` refuses the proposer as a decider (a preparer, 9.3), and each version's table refuses it behind
// (`*_independent`). Confirming emits `files-imports.mapping-confirmed`. Two Confirmed versions of one mapping rule
// never overlap (code-house-rules 7.3; 15.1): a version confirmed from a date ends the one before it on that date, as
// the check here places it, with the exclusion constraint behind it.

const refusal = (
  kind: CommandRefusal['kind'],
  code: string,
  missing: CommandRefusal['missing'] = [],
): EffectOutcome => ({
  kind: 'refusal',
  refusal: { kind, code, missing },
});

/** The fixed parts of the rules `files-imports` declares (access-and-approvals 8): independent, no value limit (DM-8). */
function rule(actionType: string, recordType: string): ApprovalRule {
  return {
    actionType,
    module: 'files-imports',
    recordType,
    independent: true,
    value: 'none',
    freeTextReason: false,
    // A layout, mapping or rule holds structure, never data; no decision's evidence carries a class (9.5; RR-453).
    decisionEvidenceClasses: [],
    synthetic: false,
  };
}

export const filesImportsApprovalRules: readonly ApprovalRule[] = [
  rule(LAYOUT_CONFIRMATION, IMPORT_LAYOUT_TYPE),
  rule(MAPPING_CONFIRMATION, IMPORT_MAPPING_TYPE),
  rule(MAPPING_RULE_CONFIRMATION, MAPPING_RULE_TYPE),
  // The approval of an import batch whose handler requires one (3.1 step 8, 13.2): independent, bound to the batch
  // version, with no effect of its own, since Publish verifies and uses it under its locks (access-and-approvals 9.7,
  // 9.8a). An update batch of product masters needs it (product owner, 11 Oct 2026). The batch's staged cells may hold
  // any class its file holds, but the decision's evidence carries none (RR-453).
  rule(IMPORT_BATCH_APPROVAL, IMPORT_BATCH_TYPE),
];

async function recordDecision(
  context: TransactionContext,
  audit: AuditInterface,
  decider: EffectDecider,
  record: { readonly type: string; readonly id: string; readonly versionId: string },
  operation: string,
  after: 'Confirmed' | 'Rejected',
): Promise<void> {
  await audit.record(context, {
    actor: decider.actor,
    ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
    ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    record: { module: 'files-imports', ...record },
    operation,
    changes: [{ kind: 'value', field: 'state', before: 'Proposed', after }],
    source: { kind: 'screen' },
  });
}

type VersionTable = typeof layoutVersion | typeof mappingVersion;

/** The effect of a decision on a layout or mapping version (6.4). */
function versionEffect(
  audit: AuditInterface,
  table: VersionTable,
  lock: string,
  kind: 'layout-version' | 'mapping-version',
  recordOf: (row: Record<string, unknown>) => string,
  type: 'layout' | 'mapping',
): DocumentEffect {
  const read = async (context: TransactionContext, versionId: string) => {
    const [row] = await context.tx.select().from(table).where(eq(table.id, versionId));
    return row;
  };
  const decide = async (
    context: TransactionContext,
    decider: EffectDecider,
    versionId: string,
    after: 'Confirmed' | 'Rejected',
  ): Promise<EffectOutcome> => {
    const row = await read(context, versionId);
    if (row === undefined) return refusal('not-found', 'files-imports.proposal-not-found');
    if (row.state !== 'Proposed') return refusal('refused', 'files-imports.proposal-not-open');
    await context.tx
      .update(table)
      .set({ state: after, decidedByUserId: decider.actor.id, decidedAt: context.startedAt })
      .where(eq(table.id, versionId));
    const recordId = recordOf(row);
    await recordDecision(
      context,
      audit,
      decider,
      { type, id: recordId, versionId },
      `${after === 'Confirmed' ? 'confirm' : 'reject'}-${type}-version`,
      after,
    );
    if (after === 'Confirmed') {
      await context.publish(mappingConfirmed, {
        subject: { module: 'files-imports', recordType: `files_imports.${type}`, recordId, versionId },
        payload: { kind, recordId, versionId },
      });
    }
    return { kind: 'success', answer: { recordId } };
  };
  return {
    targets(_context, versionId): Promise<LockTarget[]> {
      return Promise.resolve([{ table: lockTable('files_imports', lock), id: versionId, mode: 'exclusive' }]);
    },
    approve: (context, decider, versionId) => decide(context, decider, versionId, 'Confirmed'),
    reject: (context, decider, versionId) => decide(context, decider, versionId, 'Rejected'),
  };
}

async function ruleVersionOf(context: TransactionContext, versionId: string) {
  const [row] = await context.tx
    .select({
      version: mappingRuleVersion,
      attribute: mappingRule.attribute,
    })
    .from(mappingRuleVersion)
    .innerJoin(mappingRule, eq(mappingRule.id, mappingRuleVersion.mappingRuleId))
    .where(eq(mappingRuleVersion.id, versionId));
  return row;
}

/**
 * The effect of a decision on a mapping rule version (6.3, 6.4, 15.1; code-house-rules 7.3): confirming it refuses a
 * start that has passed, rechecks its target with the handler that owns it, and places it among the rule's Confirmed
 * versions, which never overlap: the one in force before it ends on its start date, and it ends where a later one
 * starts; one starting on the same date, or a later one its own end runs into, is a conflict. The exclusion
 * constraint is the last guard.
 */
function ruleEffect(audit: AuditInterface, handlers: ImportHandlers): DocumentEffect {
  const decide = async (
    context: TransactionContext,
    decider: EffectDecider,
    versionId: string,
    after: 'Confirmed' | 'Rejected',
  ): Promise<EffectOutcome> => {
    const row = await ruleVersionOf(context, versionId);
    if (row === undefined) return refusal('not-found', 'files-imports.proposal-not-found');
    const { version } = row;
    if (version.state !== 'Proposed') return refusal('refused', 'files-imports.proposal-not-open');
    let range = dateRangeOf(version.validDuring);
    const ends: { id: string; range: DateRange }[] = [];
    if (after === 'Confirmed') {
      // A version never starts on a past date (code-house-rules 7.3; GC2-7, DEC-105): one proposed for a date that
      // has passed is refused, and proposed again from today or later.
      const date = await context.businessDate();
      if (date.kind !== 'set') {
        return refusal('unavailable', 'access.business-date-not-set', [
          { kind: 'setting', setting: 'configuration.timezone' },
        ]);
      }
      if (range.from < date.date) return refusal('refused', 'files-imports.starts-in-past');
      const target = await ruleTargetRefusal(context, handlers, row.attribute, version.target);
      if (target !== undefined) return { kind: 'refusal', refusal: target };
      // The rule's Confirmed versions never overlap (code-house-rules 7.3; 15.1): this one ends the one in force
      // before it on its start date, and ends, where it is open-ended, where a later one starts.
      const confirmed = await context.tx
        .select({ id: mappingRuleVersion.id, validDuring: mappingRuleVersion.validDuring })
        .from(mappingRuleVersion)
        .where(
          and(eq(mappingRuleVersion.mappingRuleId, version.mappingRuleId), eq(mappingRuleVersion.state, 'Confirmed')),
        );
      const placed = followOn(
        range,
        confirmed.map((each) => ({ id: each.id, range: dateRangeOf(each.validDuring) })),
      );
      if (placed.kind === 'conflict') {
        return refusal('refused', 'files-imports.rule-conflict', [
          { kind: 'mapping-rule-version', ruleVersionId: placed.with },
        ]);
      }
      ends.push(...placed.ends);
      if (placed.ownEnd !== undefined) range = { from: range.from, to: placed.ownEnd };
    }
    const written = await withSavepoint(context, 'files_imports_rule_decision', [EXCLUSION_VIOLATION], async () => {
      for (const each of ends) {
        await context.tx
          .update(mappingRuleVersion)
          .set({ validDuring: dateRangeText(each.range) })
          .where(eq(mappingRuleVersion.id, each.id));
      }
      await context.tx
        .update(mappingRuleVersion)
        .set({
          state: after,
          decidedByUserId: decider.actor.id,
          decidedAt: context.startedAt,
          validDuring: dateRangeText(range),
        })
        .where(eq(mappingRuleVersion.id, versionId));
    });
    if (written.kind === 'caught') return refusal('refused', 'files-imports.rule-conflict');
    await recordDecision(
      context,
      audit,
      decider,
      { type: 'mapping_rule', id: version.mappingRuleId, versionId },
      `${after === 'Confirmed' ? 'confirm' : 'reject'}-mapping-rule-version`,
      after,
    );
    if (after === 'Confirmed') {
      await context.publish(mappingConfirmed, {
        subject: {
          module: 'files-imports',
          recordType: MAPPING_RULE_TYPE,
          recordId: version.mappingRuleId,
          versionId,
        },
        payload: { kind: 'mapping-rule-version', recordId: version.mappingRuleId, versionId },
      });
    }
    return { kind: 'success', answer: { recordId: version.mappingRuleId } };
  };
  return {
    // The rule's identity row, so two confirmations of one rule queue and the overlap check sees the first (8.2).
    async targets(context, versionId): Promise<LockTarget[]> {
      const row = await ruleVersionOf(context, versionId);
      return row === undefined
        ? []
        : [{ table: lockTable('files_imports', 'mapping_rule'), id: row.version.mappingRuleId, mode: 'exclusive' }];
    },
    approve: (context, decider, versionId) => decide(context, decider, versionId, 'Confirmed'),
    reject: (context, decider, versionId) => decide(context, decider, versionId, 'Rejected'),
  };
}

/**
 * The approval rules and decision effects `files-imports` declares to `access` (access-and-approvals 8, 9.8b;
 * module-map section 3, rule 6), which the composition root hands to `access` at start, with the import handlers the
 * target modules register, which check a rule's target (13.2).
 */
export function filesImportsApprovals(audit: AuditInterface, handlers: ImportHandlers): ModuleApprovals {
  return {
    rules: filesImportsApprovalRules,
    effects: new Map<string, DocumentEffect>([
      [
        LAYOUT_CONFIRMATION,
        versionEffect(
          audit,
          layoutVersion,
          'layout_version',
          'layout-version',
          (row) => String(row.layoutId),
          'layout',
        ),
      ],
      [
        MAPPING_CONFIRMATION,
        versionEffect(
          audit,
          mappingVersion,
          'mapping_version',
          'mapping-version',
          (row) => String(row.mappingId),
          'mapping',
        ),
      ],
      [MAPPING_RULE_CONFIRMATION, ruleEffect(audit, handlers)],
    ]),
  };
}
