import { uuidv7 } from '@apparel-os/domain';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { AuditEntry, AuditRecordReference } from '../contracts.js';
import { auditRecord } from '../db/schema.js';
import { auditChanges } from '../domain/changes.js';
import { businessDateOrUnknown, refuseInRead, refuseOtherActor } from './checks.js';

/**
 * Record (module-map 4.5; numbering-and-audit 4.1, 4.2). Appends one audit record in the command's transaction, so it
 * commits with its change or neither does (PRD-INT-004). The changes are checked first: no encrypted value, password
 * hash or session identifier hash is ever written (4.3; PRD-SEC-006, PRD-SEC-014). The insert asks for no row back,
 * since on the paths with no actor reading it back is refused (code-house-rules 6.3).
 */
export async function recordChange(context: TransactionContext, entry: AuditEntry): Promise<AuditRecordReference> {
  refuseInRead(context, 'An audit record');
  refuseOtherActor(context, entry.actor.id);
  if (entry.operation === '') throw new CommandDefect('An audit record names what was done');
  const stored = auditChanges(entry.changes);
  const occurredAt = entry.occurredAt ?? context.startedAt;
  const id = uuidv7();
  await context.tx.insert(auditRecord).values({
    id,
    occurredAt,
    businessDate: await businessDateOrUnknown(context, occurredAt),
    actorKind: entry.actor.kind,
    actorId: entry.actor.id,
    onBehalfOfUserId: entry.actor.kind === 'service-identity' ? (entry.actor.onBehalfOfUserId ?? null) : null,
    roleAssignmentId: entry.roleAssignmentId ?? null,
    legalEntityId: entry.scope?.legalEntityId ?? null,
    siteId: entry.scope?.siteId ?? null,
    storeId: entry.scope?.storeId ?? null,
    businessUnitId: entry.scope?.businessUnitId ?? null,
    brandId: entry.scope?.brandId ?? null,
    recordModule: entry.record.module,
    recordType: entry.record.type,
    recordId: entry.record.id,
    recordVersionId: entry.record.versionId ?? null,
    operation: entry.operation,
    changesFormat: stored.format,
    changes: stored.changes,
    reason: entry.reason ?? null,
    sourceKind: entry.source.kind,
    sourceReference: entry.source.reference ?? null,
    sourceRow: entry.source.kind === 'import' ? (entry.source.row ?? null) : null,
    approvalDecisionId: entry.approval?.decisionId ?? null,
    approvalUseId: entry.approval?.useId ?? null,
    idempotencyKey: entry.idempotencyKey ?? null,
    correlationId: context.correlationId,
  });
  return { auditRecordId: id };
}
