import { and, eq } from 'drizzle-orm';
import { CommandDefect, lockTable, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { approvalRequest } from '../db/schema.js';
import { approvalDecided } from '../events.js';
import { storedPreparers, type ApprovalDocument } from './request-approval.js';

// Withdraw a request on behalf of its owning module (access-and-approvals 9.1a; module-map 4.3 "Withdraw a request";
// RR-489, product owner, 10 Oct 2026). The owning module decides who may withdraw its document and holds its own rows;
// `access` closes the open request on that document version as Withdrawn (DEC-117), so it can no longer be decided and
// leaves My work. Who may withdraw is the owning module's rule, not an approval: no decision is recorded.

const APPROVAL_REQUEST = lockTable('access', 'approval_request');

/** The document whose open request the owning module withdraws, at the exact version requested (9.1). */
export type WithdrawnDocument = ApprovalDocument & { readonly module: string; readonly actionType: string };

const openRequest = (document: WithdrawnDocument) =>
  and(
    eq(approvalRequest.documentModule, document.module),
    eq(approvalRequest.documentRecordType, document.recordType),
    eq(approvalRequest.documentRecordId, document.recordId),
    eq(approvalRequest.documentVersionId, document.versionId),
    eq(approvalRequest.actionType, document.actionType),
    eq(approvalRequest.state, 'Awaiting approval'),
  );

/**
 * The rows the owning module locks with its document at step 1 before it withdraws: the open request, exclusively, as
 * Decide locks it (code-house-rules 8.2), so a decision and a withdrawal never pass each other.
 */
export async function requestLockTargets(
  context: TransactionContext,
  document: WithdrawnDocument,
): Promise<LockTarget[]> {
  const rows = await context.tx.select({ id: approvalRequest.id }).from(approvalRequest).where(openRequest(document));
  return rows.map((row) => ({ table: APPROVAL_REQUEST, id: row.id, mode: 'exclusive' as const }));
}

/**
 * Withdraws the open request on the document version, under the lock the owning module took through
 * requestLockTargets: its state becomes Withdrawn, with its audit record, and `access.approval-decided` says so.
 * Answers `withdrawn`, or `not-open` when no request awaits a decision any more.
 */
export async function withdrawRequest(
  context: TransactionContext,
  audit: AuditInterface,
  document: WithdrawnDocument,
  by: { readonly userId: string; readonly roleAssignmentId?: string },
): Promise<'withdrawn' | 'not-open'> {
  const [request] = await context.tx.select().from(approvalRequest).where(openRequest(document));
  if (request === undefined) return 'not-open';
  const held = context.heldLock(APPROVAL_REQUEST, request.id);
  if (held?.mode !== 'exclusive') {
    throw new CommandDefect('A request is withdrawn only under the lock its owning module took at step 1 (8.2)');
  }
  await context.tx.update(approvalRequest).set({ state: 'Withdrawn' }).where(eq(approvalRequest.id, request.id));
  await audit.record(context, {
    actor: { kind: 'user', id: by.userId },
    ...(by.roleAssignmentId === undefined ? {} : { roleAssignmentId: by.roleAssignmentId }),
    record: { module: 'access', type: 'approval_request', id: request.id, versionId: request.documentVersionId },
    operation: 'withdraw-approval-request',
    changes: [{ kind: 'value', field: 'state', before: 'Awaiting approval', after: 'Withdrawn' }],
    source: { kind: 'screen' },
  });
  await context.publish(approvalDecided, {
    subject: {
      module: 'access',
      recordType: 'access.approval_request',
      recordId: request.id,
      versionId: request.documentVersionId,
    },
    payload: {
      requestId: request.id,
      state: 'Withdrawn',
      preparerIds: await storedPreparers(context, request.id),
      documentRecordType: request.documentRecordType,
      documentRecordId: request.documentRecordId,
      documentVersionId: request.documentVersionId,
    },
  });
  return 'withdrawn';
}
