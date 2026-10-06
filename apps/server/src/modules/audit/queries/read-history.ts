import { and, asc, eq } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AuditActor, AuditHistoryEntry, AuditSource, HistoryQuery } from '../contracts.js';
import { auditRecord } from '../db/schema.js';
import { readAuditChanges } from '../domain/changes.js';
import { beyond, positionTime } from './position.js';

/**
 * Read history (module-map 4.5; numbering-and-audit 4.5). The audit records of one record, or of one actor, oldest
 * first. It reads under the reader's own row-level security: only rows inside the reader's scope come back
 * (PRD-SEC-005). Until `access` adds the read policy with access.row_visible (S1-F01-T11), no row comes back at all.
 * Restricted values are returned with their field class; `access`, which serves the history routes, masks those its
 * field permissions do not grant before any leaves the server (PRD-ACS-008; access-and-approvals 6). A page reads at
 * most `limit` rows after the position `after`; each row carries its own position (code-house-rules 12.1 "Reads").
 */
export async function readHistory(
  context: TransactionContext,
  query: HistoryQuery,
): Promise<readonly AuditHistoryEntry[]> {
  const whose =
    query.of === 'record'
      ? and(
          eq(auditRecord.recordModule, query.module),
          eq(auditRecord.recordType, query.type),
          eq(auditRecord.recordId, query.id),
        )
      : eq(auditRecord.actorId, query.actorId);
  const where =
    query.after === undefined ? whose : and(whose, beyond(auditRecord.recordedAt, auditRecord.id, '>', query.after));
  const ordered = context.tx
    .select({ row: auditRecord, position: positionTime(auditRecord.recordedAt) })
    .from(auditRecord)
    .where(where)
    .orderBy(asc(auditRecord.recordedAt), asc(auditRecord.id));
  const found = await (query.limit === undefined ? ordered : ordered.limit(query.limit));
  return found.map(({ row, position }) => ({
    id: row.id,
    position: { recordedAt: position, id: row.id },
    recordedAt: row.recordedAt,
    occurredAt: row.occurredAt,
    businessDate: row.businessDate,
    actor: actorOf(row),
    roleAssignmentId: row.roleAssignmentId,
    scope: {
      ...(row.legalEntityId === null ? {} : { legalEntityId: row.legalEntityId }),
      ...(row.siteId === null ? {} : { siteId: row.siteId }),
      ...(row.storeId === null ? {} : { storeId: row.storeId }),
      ...(row.businessUnitId === null ? {} : { businessUnitId: row.businessUnitId }),
      ...(row.brandId === null ? {} : { brandId: row.brandId }),
    },
    record: {
      module: row.recordModule,
      type: row.recordType,
      id: row.recordId,
      ...(row.recordVersionId === null ? {} : { versionId: row.recordVersionId }),
    },
    operation: row.operation,
    changes: readAuditChanges(row.changesFormat, row.changes),
    reason: row.reason,
    source: sourceOf(row),
    approval:
      row.approvalDecisionId === null
        ? null
        : {
            decisionId: row.approvalDecisionId,
            ...(row.approvalUseId === null ? {} : { useId: row.approvalUseId }),
          },
    correlationId: row.correlationId,
  }));
}

type Row = typeof auditRecord.$inferSelect;

function actorOf(row: Row): AuditActor {
  if (row.actorKind === 'user') return { kind: 'user', id: row.actorId };
  return {
    kind: 'service-identity',
    id: row.actorId,
    ...(row.onBehalfOfUserId === null ? {} : { onBehalfOfUserId: row.onBehalfOfUserId }),
  };
}

function sourceOf(row: Row): AuditSource {
  const reference = row.sourceReference === null ? {} : { reference: row.sourceReference };
  if (row.sourceKind === 'import') {
    return {
      kind: 'import',
      reference: row.sourceReference ?? '',
      ...(row.sourceRow === null ? {} : { row: row.sourceRow }),
    };
  }
  return { kind: row.sourceKind as Exclude<AuditSource['kind'], 'import'>, ...reference };
}
