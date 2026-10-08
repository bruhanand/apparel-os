import { uuidv7 } from '@apparel-os/domain';
import type { MappingVerificationRequest, MappingVerified } from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import { sqlStateOf, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { FilesImportsInterface } from '../../files-imports/index.js';
import { businessUnitMapping, businessUnitMappingVerification } from '../db/schema.js';
import { recordTypeOf } from '../domain/kinds.js';
import { refusal, type Prepared, type Preparer } from './common.js';
import { recordScope } from './prepare.js';

// Verify a business unit's mapping version (structure-and-masters 2.3, 3.4; POL-10.08; GC2-2, DEC-105; S1-F02-T02): an
// append-only record linked to the one version, with who verified it, when, and its evidence, stored files attached
// through files-imports in the same transaction (S1-F06-T05; DEC-116). The verify permission, create on the
// verification record, is checked by the route's Authorise and held at step 0; the verifier is never the person who made
// the mapping, checked here and by the migration's trigger (0029).

/** The record type of a verification, which the evidence is attached to and read through (imports-and-opening-data 11). */
export const VERIFICATION_RECORD_TYPE = 'organisation.business_unit_mapping_verification';

/** What the evidence of a verification is, declared to files-imports: it carries no restricted field class. */
const EVIDENCE = { kind: 'business-unit-mapping-verification', restrictedClasses: [] } as const;

const UNIQUE_VIOLATION = '23505';

export async function verifyMapping(
  context: TransactionContext,
  dependencies: { readonly audit: AuditInterface; readonly files: Pick<FilesImportsInterface, 'attach'> },
  verifier: Preparer,
  unitId: string,
  mappingVersionId: string,
  request: MappingVerificationRequest,
): Promise<Prepared<MappingVerified>> {
  const [mapping] = await context.tx
    .select({ decision: businessUnitMapping.decision, preparedBy: businessUnitMapping.preparedByUserId })
    .from(businessUnitMapping)
    .where(and(eq(businessUnitMapping.id, mappingVersionId), eq(businessUnitMapping.businessUnitId, unitId)));
  const version = {
    kind: 'version',
    recordType: recordTypeOf('business_unit_mapping'),
    recordId: unitId,
    versionId: mappingVersionId,
  };
  if (mapping === undefined) return refusal('not-found', 'organisation.record-not-found', [version]);
  if (mapping.decision !== 'Approved') return refusal('refused', 'organisation.mapping-not-approved', [version]);
  if (mapping.preparedBy === verifier.userId) {
    return refusal('refused', 'organisation.verifier-made-mapping', [{ kind: 'person' }]);
  }
  const [already] = await context.tx
    .select({ id: businessUnitMappingVerification.id })
    .from(businessUnitMappingVerification)
    .where(eq(businessUnitMappingVerification.businessUnitMappingId, mappingVersionId));
  if (already !== undefined) return refusal('refused', 'organisation.mapping-already-verified', [version]);
  // The unit's place facts, which the verification and its evidence carry (structure-and-masters 6.1).
  const date = await context.businessDate();
  const facts = date.kind === 'set' ? await recordScope(context, 'business_unit_mapping', unitId, date.date) : {};
  const verificationId = uuidv7();
  const attachmentIds: string[] = [];
  // A second verification of the version at once meets the unique key and is refused, never failed; its attachments
  // go with it.
  await context.tx.execute(sql`savepoint organisation_verification`);
  for (const file of request.evidence) {
    const attached = await dependencies.files.attach(context, {
      storedFileId: file.storedFileId,
      fileReceiptId: file.fileReceiptId,
      record: { module: 'organisation', type: VERIFICATION_RECORD_TYPE, id: verificationId },
      evidence: EVIDENCE,
      scope: facts ?? {},
      attachedBy: { kind: 'user', id: verifier.userId },
      roleAssignmentId: verifier.roleAssignmentId,
    });
    attachmentIds.push(attached.attachmentId);
  }
  try {
    await context.tx.insert(businessUnitMappingVerification).values({
      id: verificationId,
      businessUnitMappingId: mappingVersionId,
      verifiedByUserId: verifier.userId,
      verifiedAt: context.startedAt,
      attachmentIds,
    });
    await context.tx.execute(sql`release savepoint organisation_verification`);
  } catch (error) {
    if (sqlStateOf(error) !== UNIQUE_VIOLATION) throw error;
    await context.tx.execute(sql`rollback to savepoint organisation_verification`);
    return refusal('refused', 'organisation.mapping-already-verified', [version]);
  }
  await dependencies.audit.record(context, {
    ...(facts === undefined ? {} : { scope: facts }),
    actor: { kind: 'user', id: verifier.userId },
    roleAssignmentId: verifier.roleAssignmentId,
    record: { module: 'organisation', type: 'business_unit_mapping', id: unitId, versionId: mappingVersionId },
    operation: 'verify-business-unit-mapping',
    changes: [
      { kind: 'value', field: 'verification', before: null, after: verificationId },
      { kind: 'value', field: 'evidence', before: null, after: attachmentIds },
    ],
    source: { kind: 'screen' },
  });
  return { kind: 'success', answer: { verificationId, attachmentIds } };
}
