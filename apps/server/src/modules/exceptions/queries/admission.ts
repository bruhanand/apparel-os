import { and, eq, inArray } from 'drizzle-orm';
import { JOB_RECORD_TYPE, type TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface, RecordFacts } from '../../access/index.js';
import { exception, exceptionLink } from '../db/schema.js';
import { EXCEPTION_RECORD_TYPE } from '../domain/types.js';
import { readException, type ExceptionRecord } from './read.js';
import type { ExceptionParty } from '@apparel-os/schemas';

// Who may view an exception (access-and-approvals 12.4 "As built"; PRD-SEC-005): its owner, the named user or a
// holder of the owning role whose assignment covers its facts, an escalation recipient since it was raised or last
// reopened, or a reader Authorise admits for view on `exceptions.exception` with its facts. The record's route, the
// live-update stream and the operations view's links ask the same.

export function factsOfRecord(record: ExceptionRecord): RecordFacts {
  return {
    siteId: record.row.siteId ?? undefined,
    storeId: record.row.storeId ?? undefined,
    businessUnitId: record.row.businessUnitId ?? undefined,
    brandId: record.row.brandId ?? undefined,
  };
}

/** Whether the reader is the owner, a holder of the owning role, or an escalation recipient (12.2, 11.3). */
export async function isOwner(
  context: TransactionContext,
  access: AccessInterface,
  userId: string,
  record: ExceptionRecord,
): Promise<boolean> {
  const parties: ExceptionParty[] = [
    record.row.ownerUserId !== null
      ? { kind: 'user', userId: record.row.ownerUserId }
      : { kind: 'role', roleId: record.row.ownerRoleId ?? '' },
    ...record.escalatedTo,
  ];
  if (parties.some((party) => party.kind === 'user' && party.userId === userId)) return true;
  const roles = parties.flatMap((party) => (party.kind === 'role' ? [party.roleId] : []));
  const held = await access.rolesHeld(
    context,
    userId,
    roles.map((roleId) => ({ roleId, recordType: EXCEPTION_RECORD_TYPE, facts: factsOfRecord(record) })),
  );
  return held.some(Boolean);
}

/** Whether the reader may view the exception: as its owner, or through Authorise for view with its facts. */
export async function mayView(
  context: TransactionContext,
  access: AccessInterface,
  userId: string,
  record: ExceptionRecord,
): Promise<boolean> {
  if (await isOwner(context, access, userId, record)) return true;
  const authorised = await access.authorise(context, {
    actorId: userId,
    action: 'view',
    recordType: EXCEPTION_RECORD_TYPE,
    facts: factsOfRecord(record),
  });
  return authorised.kind === 'allowed';
}

/** Whether the reader may view the exception of an identifier; one that does not exist, no. */
export async function mayViewException(
  context: TransactionContext,
  access: AccessInterface,
  userId: string,
  exceptionId: string,
): Promise<boolean> {
  const record = await readException(context, exceptionId);
  return record !== undefined && mayView(context, access, userId, record);
}

/**
 * The unfinished-operation exception raised for each failed job the reader may view (access-and-approvals 9.8 step 4;
 * code-house-rules 12.9; DEC-116), for the operations view. An exception the reader may not view is left out, as if
 * none was raised (PRD-SEC-005).
 */
export async function exceptionsOfJobs(
  context: TransactionContext,
  access: AccessInterface,
  userId: string,
  jobIds: readonly string[],
): Promise<Map<string, { exceptionId: string; code: string }>> {
  const found = new Map<string, { exceptionId: string; code: string }>();
  if (jobIds.length === 0) return found;
  const rows = await context.tx
    .select({ jobId: exceptionLink.recordId, exceptionId: exception.id, code: exception.code })
    .from(exceptionLink)
    .innerJoin(exception, eq(exception.id, exceptionLink.exceptionId))
    .where(and(eq(exceptionLink.recordType, JOB_RECORD_TYPE), inArray(exceptionLink.recordId, [...jobIds])));
  for (const row of rows) {
    if (found.has(row.jobId)) continue;
    if (await mayViewException(context, access, userId, row.exceptionId)) {
      found.set(row.jobId, { exceptionId: row.exceptionId, code: row.code });
    }
  }
  return found;
}
