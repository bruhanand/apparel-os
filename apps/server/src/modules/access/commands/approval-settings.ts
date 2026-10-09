import { uuidv7 } from '@apparel-os/domain';
import type {
  ApprovalReasonDraft,
  ApprovalReasonVersionDraft,
  ApprovalRuleSettingDraft,
  ApprovalRuleSettingVersionDraft,
} from '@apparel-os/schemas';
import { eq, sql } from 'drizzle-orm';
import { LOCK_STEP, lockTable, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type { AuditChange, AuditInterface } from '../../audit/index.js';
import {
  approvalReason,
  approvalReasonVersion,
  approvalReasonVersionChange,
  approvalRuleSetting,
  approvalRuleSettingVersion,
  approvalRuleSettingVersionChange,
} from '../db/schema.js';
import { accessApprovalRules, type ApprovalRule } from '../domain/approval-rules.js';
import {
  rangeOf,
  refusal,
  today,
  type Decider,
  type EffectOptions,
  type Prepared,
  type Preparer,
} from './access-changes.js';
import { requestApproval } from './request-approval.js';

// The approve and reject reasons and the approval rule settings (access-and-approvals 8, 9.5, 9.11; POL-02.07,
// POL-02.19, POL-02.22, POL-02.23; DEC-104; S1-F01-T13). Each is an effective-dated setting with no default, prepared
// and approved by a different authorised person; a decision on a reason-list change gives a free-text reason
// (DEC-104), so the first list can be approved.

/** One kind of effective-dated setting version this file decides: its tables, by name (code-house-rules 7.3). */
interface VersionKind {
  readonly versionTable: 'approval_reason_version' | 'approval_rule_setting_version';
  readonly parentColumn: 'approval_reason_id' | 'approval_rule_setting_id';
  readonly recordType: 'approval_reason' | 'approval_rule_setting';
  readonly notFound: string;
}

const REASON: VersionKind = {
  versionTable: 'approval_reason_version',
  parentColumn: 'approval_reason_id',
  recordType: 'approval_reason',
  notFound: 'access.reason-not-found',
};
const RULE_SETTING: VersionKind = {
  versionTable: 'approval_rule_setting_version',
  parentColumn: 'approval_rule_setting_id',
  recordType: 'approval_rule_setting',
  notFound: 'access.rule-setting-not-found',
};

export class ApprovalSettingsChanges {
  constructor(
    private readonly audit: AuditInterface,
    /**
     * Every approval rule of the composition, access's own and the modules' (8): any of them takes a setting, such as
     * the bulk allowlist of another module's action type (9.9; S1-F05-T02). Access's own when left out.
     */
    private readonly rules: ReadonlyMap<string, ApprovalRule> = accessApprovalRules,
  ) {}

  /** Prepares a new approve or reject reason, with its first version, and requests its approval (9.5; POL-02.23). */
  async prepareReason(
    context: TransactionContext,
    preparer: Preparer,
    draft: ApprovalReasonDraft,
  ): Promise<Prepared<{ reasonId: string; versionId: string; requestId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    if (draft.validFrom < date) return refusal('refused', 'access.starts-in-past');
    const taken = await context.tx
      .select({ id: approvalReason.id })
      .from(approvalReason)
      .where(eq(approvalReason.code, draft.code));
    if (taken.length > 0) return refusal('refused', 'access.reason-code-taken');
    const reasonId = uuidv7();
    await context.tx.insert(approvalReason).values({ id: reasonId, code: draft.code, kind: draft.kind });
    const written = await this.writeReasonVersion(context, preparer, reasonId, draft, 'prepare-approval-reason', [
      { kind: 'value', field: 'code', before: null, after: draft.code },
      { kind: 'value', field: 'kind', before: null, after: draft.kind },
    ]);
    return { kind: 'success', answer: { reasonId, ...written } };
  }

  /** Prepares a new version of a reason: its text from its start (9.5). An earlier open request is Superseded (9.6). */
  async prepareReasonVersion(
    context: TransactionContext,
    preparer: Preparer,
    reasonId: string,
    draft: ApprovalReasonVersionDraft,
  ): Promise<Prepared<{ reasonId: string; versionId: string; requestId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    const found = await context.tx
      .select({ id: approvalReason.id })
      .from(approvalReason)
      .where(eq(approvalReason.id, reasonId));
    if (found.length === 0) return refusal('not-found', 'access.reason-not-found');
    if (draft.validFrom < date) return refusal('refused', 'access.starts-in-past');
    const written = await this.writeReasonVersion(
      context,
      preparer,
      reasonId,
      draft,
      'prepare-approval-reason-version',
      [],
    );
    return { kind: 'success', answer: { reasonId, ...written } };
  }

  private async writeReasonVersion(
    context: TransactionContext,
    preparer: Preparer,
    reasonId: string,
    draft: ApprovalReasonVersionDraft,
    operation: string,
    more: AuditChange[],
  ): Promise<{ versionId: string; requestId: string }> {
    const versionId = uuidv7();
    await context.tx.insert(approvalReasonVersion).values({
      id: versionId,
      approvalReasonId: reasonId,
      text: draft.text,
      validDuring: rangeOf(draft.validFrom, undefined),
      decision: 'Awaiting approval',
    });
    await context.tx
      .insert(approvalReasonVersionChange)
      .values({ id: uuidv7(), approvalReasonVersionId: versionId, changedByUserId: preparer.userId });
    await this.audit.record(context, {
      actor: { kind: 'user', id: preparer.userId },
      roleAssignmentId: preparer.roleAssignmentId,
      record: { module: 'access', type: 'approval_reason', id: reasonId, versionId },
      operation,
      changes: [
        ...more,
        { kind: 'value', field: 'text', before: null, after: draft.text },
        { kind: 'value', field: 'validFrom', before: null, after: draft.validFrom },
      ],
      source: { kind: 'screen' },
    });
    const requestId = await requestApproval(context, this.audit, {
      actionType: 'access.approval_reason.change',
      document: { recordType: 'access.approval_reason', recordId: reasonId, versionId },
      preparer,
    });
    return { versionId, requestId };
  }

  /**
   * Prepares the configured parts of one action type's approval rule: whether bulk and phone approval are allowed
   * (access-and-approvals 8; POL-02.19, POL-02.22), and requests their approval. Refused for an action type with no
   * approval rule in code, or one whose setting exists, which takes a new version instead.
   */
  async prepareRuleSetting(
    context: TransactionContext,
    preparer: Preparer,
    draft: ApprovalRuleSettingDraft,
  ): Promise<Prepared<{ settingId: string; versionId: string; requestId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    if (draft.validFrom < date) return refusal('refused', 'access.starts-in-past');
    if (!this.rules.has(draft.actionType)) {
      return refusal('refused', 'access.action-type-not-declared');
    }
    const existing = await context.tx
      .select({ id: approvalRuleSetting.id })
      .from(approvalRuleSetting)
      .where(eq(approvalRuleSetting.actionType, draft.actionType));
    if (existing.length > 0) return refusal('refused', 'access.rule-setting-exists');
    const settingId = uuidv7();
    await context.tx.insert(approvalRuleSetting).values({ id: settingId, actionType: draft.actionType });
    const written = await this.writeRuleSettingVersion(context, preparer, settingId, draft, 'prepare-approval-rule', [
      { kind: 'value', field: 'actionType', before: null, after: draft.actionType },
    ]);
    return { kind: 'success', answer: { settingId, ...written } };
  }

  /** Prepares a new version of a rule setting (8). An earlier open request is Superseded (9.6). */
  async prepareRuleSettingVersion(
    context: TransactionContext,
    preparer: Preparer,
    settingId: string,
    draft: ApprovalRuleSettingVersionDraft,
  ): Promise<Prepared<{ settingId: string; versionId: string; requestId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    const found = await context.tx
      .select({ id: approvalRuleSetting.id })
      .from(approvalRuleSetting)
      .where(eq(approvalRuleSetting.id, settingId));
    if (found.length === 0) return refusal('not-found', 'access.rule-setting-not-found');
    if (draft.validFrom < date) return refusal('refused', 'access.starts-in-past');
    const written = await this.writeRuleSettingVersion(
      context,
      preparer,
      settingId,
      draft,
      'prepare-approval-rule-version',
      [],
    );
    return { kind: 'success', answer: { settingId, ...written } };
  }

  private async writeRuleSettingVersion(
    context: TransactionContext,
    preparer: Preparer,
    settingId: string,
    draft: ApprovalRuleSettingVersionDraft,
    operation: string,
    more: AuditChange[],
  ): Promise<{ versionId: string; requestId: string }> {
    const versionId = uuidv7();
    await context.tx.insert(approvalRuleSettingVersion).values({
      id: versionId,
      approvalRuleSettingId: settingId,
      bulkAllowed: draft.bulkAllowed,
      phoneAllowed: draft.phoneAllowed,
      validDuring: rangeOf(draft.validFrom, undefined),
      decision: 'Awaiting approval',
    });
    await context.tx
      .insert(approvalRuleSettingVersionChange)
      .values({ id: uuidv7(), approvalRuleSettingVersionId: versionId, changedByUserId: preparer.userId });
    await this.audit.record(context, {
      actor: { kind: 'user', id: preparer.userId },
      roleAssignmentId: preparer.roleAssignmentId,
      record: { module: 'access', type: 'approval_rule_setting', id: settingId, versionId },
      operation,
      changes: [
        ...more,
        { kind: 'value', field: 'bulkAllowed', before: null, after: draft.bulkAllowed },
        { kind: 'value', field: 'phoneAllowed', before: null, after: draft.phoneAllowed },
        { kind: 'value', field: 'validFrom', before: null, after: draft.validFrom },
      ],
      source: { kind: 'screen' },
    });
    const requestId = await requestApproval(context, this.audit, {
      actionType: 'access.approval_rule_setting.change',
      document: { recordType: 'access.approval_rule_setting', recordId: settingId, versionId },
      preparer,
    });
    return { versionId, requestId };
  }

  /** The rows a decision on a reason version locks at step 1 (code-house-rules 8.2). */
  reasonVersionTargets(versionId: string): LockTarget[] {
    return [{ table: lockTable('access', REASON.versionTable), id: versionId, mode: 'exclusive' }];
  }

  /** The rows a decision on a rule setting version locks at step 1. */
  ruleSettingVersionTargets(versionId: string): LockTarget[] {
    return [{ table: lockTable('access', RULE_SETTING.versionTable), id: versionId, mode: 'exclusive' }];
  }

  approveReasonVersion(context: TransactionContext, decider: Decider, versionId: string, options: EffectOptions = {}) {
    return this.approve(context, REASON, decider, versionId, options);
  }

  rejectReasonVersion(context: TransactionContext, decider: Decider, versionId: string, options: EffectOptions = {}) {
    return this.reject(context, REASON, decider, versionId, options);
  }

  approveRuleSettingVersion(
    context: TransactionContext,
    decider: Decider,
    versionId: string,
    options: EffectOptions = {},
  ) {
    return this.approve(context, RULE_SETTING, decider, versionId, options);
  }

  rejectRuleSettingVersion(
    context: TransactionContext,
    decider: Decider,
    versionId: string,
    options: EffectOptions = {},
  ) {
    return this.reject(context, RULE_SETTING, decider, versionId, options);
  }

  private async readVersion(context: TransactionContext, kind: VersionKind, versionId: string) {
    const result = await context.tx.execute<{ parent_id: string; decision: string; start: string }>(
      sql`select ${sql.identifier(kind.parentColumn)} as parent_id, decision, lower(valid_during)::text as start
          from ${sql.identifier('access')}.${sql.identifier(kind.versionTable)} where id = ${versionId}::uuid`,
    );
    return result.rows[0];
  }

  /**
   * Makes an approved version take effect from its start (code-house-rules 7.3; module-map 6.2 flow A): rechecks
   * under its lock that it is Awaiting approval and starts today or later, ends the Approved version it follows on its
   * start, records the decision and its permission-change access record (9.11). Refused when an Approved version
   * starts on or after its start.
   */
  private async approve(
    context: TransactionContext,
    kind: VersionKind,
    decider: Decider,
    versionId: string,
    options: EffectOptions,
  ): Promise<Prepared<{ recordId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    if (options.locksHeld !== true) await context.lock(LOCK_STEP.document, this.targetsOf(kind, versionId));
    const version = await this.readVersion(context, kind, versionId);
    if (version === undefined) return refusal('not-found', kind.notFound);
    if (version.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    if (version.start < date) return refusal('refused', 'access.starts-in-past');
    const table = sql`${sql.identifier('access')}.${sql.identifier(kind.versionTable)}`;
    const parent = sql.identifier(kind.parentColumn);
    const later = await context.tx.execute(
      sql`select id from ${table} where ${parent} = ${version.parent_id}::uuid and decision = 'Approved'
          and lower(valid_during) >= ${version.start}::date`,
    );
    if (later.rows.length > 0) return refusal('refused', 'access.version-overlaps');
    await context.tx.execute(
      sql`update ${table} set valid_during = daterange(lower(valid_during), ${version.start}::date)
          where ${parent} = ${version.parent_id}::uuid and decision = 'Approved' and valid_during @> ${version.start}::date`,
    );
    await context.tx.execute(sql`update ${table} set decision = 'Approved' where id = ${versionId}::uuid`);
    const auditRecord = await this.audit.record(context, {
      ...auditActor(decider),
      record: { module: 'access', type: kind.recordType, id: version.parent_id, versionId },
      operation: `approve-${kind.recordType.replaceAll('_', '-')}-version`,
      changes: [{ kind: 'value', field: 'decision', before: 'Awaiting approval', after: 'Approved' }],
      source: { kind: decider.actor.kind === 'service-identity' ? 'operator-command' : 'screen' },
    });
    await this.audit.recordAccess(context, { kind: 'permission-changed', outcome: 'succeeded', auditRecord });
    return { kind: 'success', answer: { recordId: version.parent_id } };
  }

  /** Records a version Rejected; it never takes effect (access-and-approvals 9.5). */
  private async reject(
    context: TransactionContext,
    kind: VersionKind,
    decider: Decider,
    versionId: string,
    options: EffectOptions,
  ): Promise<Prepared<{ recordId: string }>> {
    if (options.locksHeld !== true) await context.lock(LOCK_STEP.document, this.targetsOf(kind, versionId));
    const version = await this.readVersion(context, kind, versionId);
    if (version === undefined) return refusal('not-found', kind.notFound);
    if (version.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    await context.tx.execute(
      sql`update ${sql.identifier('access')}.${sql.identifier(kind.versionTable)} set decision = 'Rejected'
          where id = ${versionId}::uuid`,
    );
    await this.audit.record(context, {
      ...auditActor(decider),
      record: { module: 'access', type: kind.recordType, id: version.parent_id, versionId },
      operation: `reject-${kind.recordType.replaceAll('_', '-')}-version`,
      changes: [{ kind: 'value', field: 'decision', before: 'Awaiting approval', after: 'Rejected' }],
      source: { kind: 'screen' },
    });
    return { kind: 'success', answer: { recordId: version.parent_id } };
  }

  private targetsOf(kind: VersionKind, versionId: string): LockTarget[] {
    return kind === REASON ? this.reasonVersionTargets(versionId) : this.ruleSettingVersionTargets(versionId);
  }
}

function auditActor(decider: Decider) {
  return {
    actor: decider.actor,
    ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
    ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
  };
}
