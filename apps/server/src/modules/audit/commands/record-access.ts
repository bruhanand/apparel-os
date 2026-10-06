import { uuidv7 } from '@apparel-os/domain';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AccessEntry } from '../contracts.js';
import { accessRecord } from '../db/schema.js';
import { refuseInRead } from './checks.js';

/**
 * Record access (module-map 4.5; numbering-and-audit 5; PRD-SEC-007). Appends one access record in the command's
 * transaction. It holds the user only when one is known, never a password, an authenticator code or a typed login
 * that matched no user (5.2; PRD-SEC-014): the entry has no field for any of them. Works with no actor set, as
 * sign-in does, and asks for no row back (code-house-rules 6.3).
 */
export async function recordAccess(context: TransactionContext, entry: AccessEntry): Promise<void> {
  refuseInRead(context, 'An access record');
  await context.tx.insert(accessRecord).values({
    id: uuidv7(),
    occurredAt: entry.occurredAt ?? context.startedAt,
    kind: entry.kind,
    outcome: entry.outcome,
    userId: entry.userId ?? null,
    deviceId: entry.deviceId ?? null,
    networkAddress: entry.networkAddress ?? null,
    identityVerification: entry.kind === 'operator-recovery' ? entry.identityVerification : null,
    auditRecordId: entry.kind === 'permission-changed' ? entry.auditRecord.auditRecordId : null,
    recordModule: entry.kind === 'sensitive-access' ? entry.record.module : null,
    recordType: entry.kind === 'sensitive-access' ? entry.record.type : null,
    recordId: entry.kind === 'sensitive-access' ? entry.record.id : null,
    fieldClass: entry.kind === 'sensitive-access' ? entry.fieldClass : null,
    exposure: entry.kind === 'sensitive-access' ? entry.exposure : null,
    legalEntityId: entry.scope?.legalEntityId ?? null,
    siteId: entry.scope?.siteId ?? null,
    storeId: entry.scope?.storeId ?? null,
    businessUnitId: entry.scope?.businessUnitId ?? null,
    brandId: entry.scope?.brandId ?? null,
    correlationId: context.correlationId,
  });
}
