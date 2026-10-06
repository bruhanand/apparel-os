import { uuidv7 } from '@apparel-os/domain';
import type { AccessActionType } from '@apparel-os/schemas';
import { and, eq, ne } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import {
  approvalReasonVersionChange,
  approvalRequest,
  approvalRequestPreparer,
  approvalRuleSettingVersionChange,
  appUserVersionChange,
  roleAssignmentChange,
  roleAssignmentWithdrawalChange,
  roleVersionChange,
} from '../db/schema.js';
import { accessApprovalRules } from '../domain/approval-rules.js';
import { approvalDecided, approvalRequested } from '../events.js';

/** The document a request binds to: its record and exact version (access-and-approvals 9.1; PRD-ACS-007). */
export interface ApprovalDocument {
  readonly recordType: string;
  readonly recordId: string;
  readonly versionId: string;
}

/**
 * Every user who recorded a change in the version: its preparers, read from its change rows (access-and-approvals
 * 9.1; GC3-1, DEC-105; code-house-rules 7.2). An assignment is its own version, so its rows are by assignment.
 */
export async function preparersOf(
  context: TransactionContext,
  actionType: string,
  versionId: string,
): Promise<string[]> {
  const rows = await (async () => {
    switch (actionType as AccessActionType) {
      case 'access.user.change':
        return context.tx
          .select({ userId: appUserVersionChange.changedByUserId })
          .from(appUserVersionChange)
          .where(eq(appUserVersionChange.appUserVersionId, versionId));
      case 'access.role.change':
        return context.tx
          .select({ userId: roleVersionChange.changedByUserId })
          .from(roleVersionChange)
          .where(eq(roleVersionChange.roleVersionId, versionId));
      case 'access.role_assignment.change':
        return context.tx
          .select({ userId: roleAssignmentChange.changedByUserId })
          .from(roleAssignmentChange)
          .where(eq(roleAssignmentChange.roleAssignmentId, versionId));
      case 'access.role_assignment.withdrawal':
        return context.tx
          .select({ userId: roleAssignmentWithdrawalChange.changedByUserId })
          .from(roleAssignmentWithdrawalChange)
          .where(eq(roleAssignmentWithdrawalChange.withdrawalVersionId, versionId));
      case 'access.approval_reason.change':
        return context.tx
          .select({ userId: approvalReasonVersionChange.changedByUserId })
          .from(approvalReasonVersionChange)
          .where(eq(approvalReasonVersionChange.approvalReasonVersionId, versionId));
      case 'access.approval_rule_setting.change':
        return context.tx
          .select({ userId: approvalRuleSettingVersionChange.changedByUserId })
          .from(approvalRuleSettingVersionChange)
          .where(eq(approvalRuleSettingVersionChange.approvalRuleSettingVersionId, versionId));
      default:
        throw new CommandDefect(`No approval rule for action type ${actionType}`);
    }
  })();
  return [...new Set(rows.map((row) => row.userId))].sort();
}

/**
 * Request approval (access-and-approvals 9.1, 9.6; PRD-ACS-007; module-map section 3, rule 6), in the preparing
 * command's transaction: the request binds to the document's exact version, with the preparers read from its change
 * rows, and opens for whoever is eligible (9.3). A request still open on an earlier version of the same document is
 * Superseded: its decision can no longer be made (9.6). Each is audited and published through the outbox, which
 * `inbox` turns into My work (11.1). An access change has no value (DM-8). Returns the request's identifier.
 */
export async function requestApproval(
  context: TransactionContext,
  audit: AuditInterface,
  request: {
    readonly actionType: AccessActionType;
    readonly document: ApprovalDocument;
    readonly preparer: { readonly userId: string; readonly roleAssignmentId: string };
  },
): Promise<string> {
  if (!accessApprovalRules.has(request.actionType)) {
    throw new CommandDefect(`No approval rule for action type ${request.actionType}`);
  }
  const preparers = await preparersOf(context, request.actionType, request.document.versionId);
  if (preparers.length === 0) throw new CommandDefect('A request needs at least one preparer (9.1)');
  const earlier = await context.tx
    .select()
    .from(approvalRequest)
    .where(
      and(
        eq(approvalRequest.documentRecordId, request.document.recordId),
        eq(approvalRequest.actionType, request.actionType),
        eq(approvalRequest.state, 'Awaiting approval'),
        ne(approvalRequest.documentVersionId, request.document.versionId),
      ),
    );
  for (const superseded of earlier) {
    await context.tx
      .update(approvalRequest)
      .set({ state: 'Superseded' })
      .where(and(eq(approvalRequest.id, superseded.id), eq(approvalRequest.state, 'Awaiting approval')));
    await audit.record(context, {
      actor: { kind: 'user', id: request.preparer.userId },
      roleAssignmentId: request.preparer.roleAssignmentId,
      record: {
        module: 'access',
        type: 'approval_request',
        id: superseded.id,
        versionId: superseded.documentVersionId,
      },
      operation: 'supersede-approval-request',
      changes: [
        { kind: 'value', field: 'state', before: 'Awaiting approval', after: 'Superseded' },
        { kind: 'value', field: 'supersededByVersionId', before: null, after: request.document.versionId },
      ],
      source: { kind: 'screen' },
    });
    await context.publish(approvalDecided, {
      subject: {
        module: 'access',
        recordType: 'access.approval_request',
        recordId: superseded.id,
        versionId: superseded.documentVersionId,
      },
      payload: {
        requestId: superseded.id,
        state: 'Superseded',
        preparerIds: await storedPreparers(context, superseded.id),
        documentRecordType: superseded.documentRecordType,
        documentRecordId: superseded.documentRecordId,
        documentVersionId: superseded.documentVersionId,
      },
    });
  }
  const requestId = uuidv7();
  await context.tx.insert(approvalRequest).values({
    id: requestId,
    actionType: request.actionType,
    documentModule: 'access',
    documentRecordType: request.document.recordType,
    documentRecordId: request.document.recordId,
    documentVersionId: request.document.versionId,
    valueKind: 'none',
    valueBasis: null,
    valueAmount: null,
    state: 'Awaiting approval',
  });
  await context.tx
    .insert(approvalRequestPreparer)
    .values(preparers.map((userId) => ({ id: uuidv7(), approvalRequestId: requestId, userId })));
  await audit.record(context, {
    actor: { kind: 'user', id: request.preparer.userId },
    roleAssignmentId: request.preparer.roleAssignmentId,
    record: { module: 'access', type: 'approval_request', id: requestId, versionId: request.document.versionId },
    operation: 'request-approval',
    changes: [
      { kind: 'value', field: 'actionType', before: null, after: request.actionType },
      { kind: 'value', field: 'document', before: null, after: { ...request.document } },
      { kind: 'value', field: 'preparers', before: null, after: preparers },
    ],
    source: { kind: 'screen' },
  });
  await context.publish(approvalRequested, {
    subject: {
      module: 'access',
      recordType: 'access.approval_request',
      recordId: requestId,
      versionId: request.document.versionId,
    },
    payload: {
      requestId,
      actionType: request.actionType,
      documentRecordType: request.document.recordType,
      documentRecordId: request.document.recordId,
      documentVersionId: request.document.versionId,
    },
  });
  return requestId;
}

/** The preparers a request bound to when it was requested (9.1). */
export async function storedPreparers(context: TransactionContext, requestId: string): Promise<string[]> {
  const rows = await context.tx
    .select({ userId: approvalRequestPreparer.userId })
    .from(approvalRequestPreparer)
    .where(eq(approvalRequestPreparer.approvalRequestId, requestId));
  return rows.map((row) => row.userId).sort();
}
