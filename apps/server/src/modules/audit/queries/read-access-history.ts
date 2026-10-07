import { and, desc, eq, inArray, notInArray, type SQL } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AccessHistoryEntry, AccessHistoryQuery, AccessRecordGroup } from '../contracts.js';
import { accessRecord, auditRecord } from '../db/schema.js';
import { beyond, positionTime } from './position.js';

/** The kinds read under record types of their own (numbering-and-audit 4.5; migration 0011's read policy). */
const SENSITIVE_KINDS = ['sensitive-access'];
const DEVICE_KINDS = ['device-registered', 'device-revoked'];

function groupFilter(group: AccessRecordGroup): SQL {
  if (group === 'sensitive-access') return inArray(accessRecord.kind, SENSITIVE_KINDS);
  if (group === 'device') return inArray(accessRecord.kind, DEVICE_KINDS);
  return notInArray(accessRecord.kind, [...SENSITIVE_KINDS, ...DEVICE_KINDS]);
}

/**
 * Read access history (numbering-and-audit 4.5, 5; module-map 4.3 "Stage 1 report: access history"). The access
 * records of one group, of every user or of one, newest first, under the reader's own row-level security, so only
 * rows inside the reader's scope come back (PRD-SEC-005, PRD-SEC-007). A page reads at most `limit` rows older than
 * the position `before` (code-house-rules 12.1 "Reads"). A permission change carries what its audit record changed
 * (the record's type and the operation, never a value), read through the same row-level security, so it is null where
 * the reader may not read that audit record (numbering-and-audit 4.5, 5.1; visual review finding 8).
 */
export async function readAccessHistory(
  context: TransactionContext,
  query: AccessHistoryQuery,
): Promise<readonly AccessHistoryEntry[]> {
  const conditions: SQL[] = [groupFilter(query.group)];
  if (query.userId !== undefined) conditions.push(eq(accessRecord.userId, query.userId));
  if (query.before !== undefined) conditions.push(beyond(accessRecord.recordedAt, accessRecord.id, '<', query.before));
  const ordered = context.tx
    .select({
      row: accessRecord,
      position: positionTime(accessRecord.recordedAt),
      change: {
        module: auditRecord.recordModule,
        type: auditRecord.recordType,
        operation: auditRecord.operation,
      },
    })
    .from(accessRecord)
    .leftJoin(auditRecord, eq(auditRecord.id, accessRecord.auditRecordId))
    .where(and(...conditions))
    .orderBy(desc(accessRecord.recordedAt), desc(accessRecord.id));
  const found = await (query.limit === undefined ? ordered : ordered.limit(query.limit));
  return found.map(({ row, position, change }) => ({
    id: row.id,
    position: { recordedAt: position, id: row.id },
    recordedAt: row.recordedAt,
    occurredAt: row.occurredAt,
    kind: row.kind,
    outcome: row.outcome as AccessHistoryEntry['outcome'],
    userId: row.userId,
    deviceId: row.deviceId,
    networkAddress: row.networkAddress,
    identityVerification: row.identityVerification,
    auditRecordId: row.auditRecordId,
    change,
    record:
      row.recordModule === null || row.recordType === null || row.recordId === null
        ? null
        : { module: row.recordModule, type: row.recordType, id: row.recordId },
    fieldClass: row.fieldClass,
    exposure: row.exposure as AccessHistoryEntry['exposure'],
    scope: {
      ...(row.legalEntityId === null ? {} : { legalEntityId: row.legalEntityId }),
      ...(row.siteId === null ? {} : { siteId: row.siteId }),
      ...(row.storeId === null ? {} : { storeId: row.storeId }),
      ...(row.businessUnitId === null ? {} : { businessUnitId: row.businessUnitId }),
      ...(row.brandId === null ? {} : { brandId: row.brandId }),
    },
    correlationId: row.correlationId,
  }));
}
