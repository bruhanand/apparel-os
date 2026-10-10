import { ACCOUNT_CHANGE, ACCOUNT_TYPE, BOOK_SETTING_CHANGE, BOOK_SETTING_TYPE } from '@apparel-os/schemas';
import { eq, or, sql } from 'drizzle-orm';
import { lockTable, type LockTarget, type TransactionContext } from '../../../../kernel/index.js';
import type { DocumentEffect, EffectDecider, EffectOutcome, ModuleApprovals } from '../../../access/index.js';
import type { AuditChange, AuditInterface } from '../../../audit/index.js';
import type { BookHeldStock } from '../contracts/book-held-stock.js';
import {
  accountVersion,
  bookSetting,
  bookSettingVersion,
  caApprovalEvidenceCover,
  type Decision,
} from '../db/schema.js';
import { booksApprovalRules } from '../domain/kinds.js';
import { costChangeRefusal } from './cost-change.js';
import { accountLine, approvedOn, refused, settingLine, takeEffect, today, type Line } from './lines.js';

// What a decision does to a version of the books part (module-map 6.2 flow A; access-and-approvals 9.8b;
// books-and-posting 6.3; S1-F09-T01): an account version or a book-setting version taking effect from its start, or
// rejected, in the decision's transaction under the locks Decide took, with its audit record. A version takes effect
// only when the CA's approval evidence covers it (POL-09.01; DEC-112, GC4-2): without it the approval is refused, and
// the version stays awaiting its decision.

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

/** Whether a piece of the CA's approval evidence covers the version (6.3). */
async function covered(context: TransactionContext, versionId: string): Promise<boolean> {
  const rows = await context.tx
    .select({ id: caApprovalEvidenceCover.id })
    .from(caApprovalEvidenceCover)
    .where(
      or(
        eq(caApprovalEvidenceCover.accountVersionId, versionId),
        eq(caApprovalEvidenceCover.bookSettingVersionId, versionId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * The checks every approval of a version makes under the locks: still waiting, not started in the past, no approved
 * version starting the same day, and the CA's evidence attached or referenced (6.3).
 */
async function approvable(
  context: TransactionContext,
  version: Version | undefined,
  line: (id: string) => Line,
  versionId: string,
  recordType: string,
) {
  if (version === undefined) return refused<never>('not-found', 'finance.record-not-found');
  if (version.decision !== 'Awaiting approval') return refused<never>('conflict', 'kernel.stale-version');
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date } as const;
  // GC2-7, DEC-105: re-dated by preparing it again from today or later (structure-and-masters 2.2).
  if (version.start < date) return refused<never>('refused', 'finance.starts-in-past');
  const overlap = await approvedOn(context, line(version.ownerId), version.start);
  if (overlap !== undefined) return { kind: 'refusal', refusal: overlap } as const;
  // POL-09.01; DEC-112, GC4-2: a version takes effect only with the CA's approval evidence (6.3).
  if (!(await covered(context, versionId))) {
    return refused<never>('refused', 'finance.no-ca-evidence', [
      { kind: 'version', recordType, recordId: version.ownerId, versionId },
    ]);
  }
  return undefined;
}

async function accountVersionOf(context: TransactionContext, versionId: string): Promise<Version | undefined> {
  const [row] = await context.tx
    .select({
      ownerId: accountVersion.accountId,
      decision: sql<Decision>`${accountVersion.decision}`,
      start: sql<string>`lower(${accountVersion.validDuring})::text`,
    })
    .from(accountVersion)
    .where(eq(accountVersion.id, versionId));
  return row;
}

const lineOfAccount = (accountId: string) => accountLine(ACCOUNT_TYPE, accountId);

/** The effect of a decision on an account version (3.1, 6.3): approved, it is in force from its start. */
function accountEffect(audit: AuditInterface): DocumentEffect {
  return {
    async targets(context, versionId): Promise<LockTarget[]> {
      const version = await accountVersionOf(context, versionId);
      return version === undefined
        ? []
        : [{ table: lockTable('finance', 'account'), id: version.ownerId, mode: 'exclusive' }];
    },
    async approve(context, decider, versionId): Promise<EffectOutcome> {
      const version = await accountVersionOf(context, versionId);
      const blocked = await approvable(context, version, lineOfAccount, versionId, ACCOUNT_TYPE);
      if (blocked !== undefined || version === undefined)
        return blocked ?? refused('not-found', 'finance.record-not-found');
      await takeEffect(context, lineOfAccount(version.ownerId), versionId, version.start);
      await recordDecision(
        context,
        audit,
        decider,
        { type: 'account', id: version.ownerId, versionId },
        'approve-account-version',
        [decisionChange('Approved')],
      );
      return { kind: 'success', answer: { recordId: version.ownerId } };
    },
    async reject(context, decider, versionId): Promise<EffectOutcome> {
      const version = await accountVersionOf(context, versionId);
      if (version === undefined) return refused('not-found', 'finance.record-not-found');
      if (version.decision !== 'Awaiting approval') return refused('conflict', 'kernel.stale-version');
      await context.tx.update(accountVersion).set({ decision: 'Rejected' }).where(eq(accountVersion.id, versionId));
      await recordDecision(
        context,
        audit,
        decider,
        { type: 'account', id: version.ownerId, versionId },
        'reject-account-version',
        [decisionChange('Rejected')],
      );
      return { kind: 'success', answer: { recordId: version.ownerId } };
    },
  };
}

async function settingVersionOf(context: TransactionContext, versionId: string) {
  const [row] = await context.tx
    .select({
      ownerId: bookSettingVersion.bookSettingId,
      bookId: bookSetting.bookId,
      kind: bookSettingVersion.kind,
      formula: bookSettingVersion.formula,
      poolMode: bookSettingVersion.poolMode,
      decision: sql<Decision>`${bookSettingVersion.decision}`,
      start: sql<string>`lower(${bookSettingVersion.validDuring})::text`,
    })
    .from(bookSettingVersion)
    .innerJoin(bookSetting, eq(bookSetting.id, bookSettingVersion.bookSettingId))
    .where(eq(bookSettingVersion.id, versionId));
  return row;
}

const lineOfSetting = (settingId: string) => settingLine(BOOK_SETTING_TYPE, settingId);

/**
 * The effect of a decision on a book-setting version (2.2, 2.3, 6.3): approved, it is in force from its start; a cost
 * version that changes the formula or pool mode of a book that has held stock is refused under the setting's lock
 * (2.2; SL-6).
 */
function bookSettingEffect(audit: AuditInterface, bookHeldStock: BookHeldStock | undefined): DocumentEffect {
  return {
    async targets(context, versionId): Promise<LockTarget[]> {
      const version = await settingVersionOf(context, versionId);
      return version === undefined
        ? []
        : [{ table: lockTable('finance', 'book_setting'), id: version.ownerId, mode: 'exclusive' }];
    },
    async approve(context, decider, versionId): Promise<EffectOutcome> {
      const version = await settingVersionOf(context, versionId);
      const blocked = await approvable(context, version, lineOfSetting, versionId, BOOK_SETTING_TYPE);
      if (blocked !== undefined || version === undefined)
        return blocked ?? refused('not-found', 'finance.record-not-found');
      if (version.kind === 'cost' && version.formula !== null && version.poolMode !== null) {
        const change = await costChangeRefusal(
          context,
          bookHeldStock,
          { id: version.ownerId, bookId: version.bookId },
          { formula: version.formula, poolMode: version.poolMode },
        );
        if (change !== undefined) return { kind: 'refusal', refusal: change };
      }
      await takeEffect(context, lineOfSetting(version.ownerId), versionId, version.start);
      await recordDecision(
        context,
        audit,
        decider,
        { type: 'book_setting', id: version.ownerId, versionId },
        'approve-book-setting-version',
        [decisionChange('Approved')],
      );
      return { kind: 'success', answer: { recordId: version.ownerId } };
    },
    async reject(context, decider, versionId): Promise<EffectOutcome> {
      const version = await settingVersionOf(context, versionId);
      if (version === undefined) return refused('not-found', 'finance.record-not-found');
      if (version.decision !== 'Awaiting approval') return refused('conflict', 'kernel.stale-version');
      await context.tx
        .update(bookSettingVersion)
        .set({ decision: 'Rejected' })
        .where(eq(bookSettingVersion.id, versionId));
      await recordDecision(
        context,
        audit,
        decider,
        { type: 'book_setting', id: version.ownerId, versionId },
        'reject-book-setting-version',
        [decisionChange('Rejected')],
      );
      return { kind: 'success', answer: { recordId: version.ownerId } };
    },
  };
}

/**
 * The approval rules and decision effects the books part declares to `access` (access-and-approvals 8, 9.8b;
 * module-map section 3, rule 6), which the composition root hands to `access` at start, with the "has this book held
 * stock?" implementation `stock` gives, or none (books-and-posting 2.2).
 */
export function booksApprovals(audit: AuditInterface, bookHeldStock: BookHeldStock | undefined): ModuleApprovals {
  return {
    rules: booksApprovalRules,
    effects: new Map<string, DocumentEffect>([
      [ACCOUNT_CHANGE, accountEffect(audit)],
      [BOOK_SETTING_CHANGE, bookSettingEffect(audit, bookHeldStock)],
    ]),
  };
}
