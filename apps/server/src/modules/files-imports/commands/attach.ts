import { uuidv7 } from '@apparel-os/domain';
import type { FieldClass } from '@apparel-os/schemas';
import { and, eq, isNull } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface, AuditScope } from '../../audit/index.js';
import { attachment, storedFile } from '../db/schema.js';

/** The record a file is attached to: its module, type, identifier and the version, where it has versions. */
export interface AttachedRecord {
  readonly module: string;
  /** A record type declared in the permission registry: it decides who may read the file (section 11). */
  readonly type: string;
  readonly id: string;
  readonly versionId?: string;
}

/**
 * What a file evidences, declared by the attaching module for each kind of evidence it takes, with the restricted
 * field classes that kind carries (imports-and-opening-data 11): a photograph of an identity document carries
 * `identity-documents`; a supplier's tax invoice carries none.
 */
export interface EvidenceKind {
  readonly kind: string;
  readonly restrictedClasses: readonly FieldClass[];
}

export interface AttachRequest {
  readonly storedFileId: string;
  readonly record: AttachedRecord;
  readonly evidence: EvidenceKind;
  /** The record's scope facts, as its module holds them; a fact it does not hold is Unknown (PRD-MOD-015). */
  readonly scope: AuditScope;
  readonly attachedBy: { readonly kind: 'user' | 'service-identity'; readonly id: string };
  readonly roleAssignmentId?: string;
}

export interface Attached {
  readonly attachmentId: string;
  /** True when the file was already attached to this record and version as the same evidence: nothing was written. */
  readonly alreadyAttached: boolean;
}

/**
 * Attach (imports-and-opening-data 13.1, 15.1): links a stored file to one record of any module, inside that record's
 * own transaction, so an attachment written in a transaction that rolls back leaves no link (the stored object stays,
 * as an object with no record, backup-and-restore 3.3). The attachment is never edited. Row-level security checks
 * that the actor could read the row it writes, so attaching needs a grant on the record's type that covers its facts
 * (code-house-rules 6.2).
 */
export async function attach(
  context: TransactionContext,
  audit: AuditInterface,
  request: AttachRequest,
): Promise<Attached> {
  if (context.readOnly) throw new CommandDefect('A file was attached in a read');
  const file = await context.tx
    .select({ id: storedFile.id })
    .from(storedFile)
    .where(eq(storedFile.id, request.storedFileId));
  if (file[0] === undefined) throw new CommandDefect('A file was attached that is not stored');
  const classes = [...new Set(request.evidence.restrictedClasses)];
  const id = uuidv7();
  const inserted = await context.tx
    .insert(attachment)
    .values({
      id,
      storedFileId: request.storedFileId,
      recordModule: request.record.module,
      recordType: request.record.type,
      recordId: request.record.id,
      recordVersionId: request.record.versionId ?? null,
      evidences: request.evidence.kind,
      restrictedClasses: classes,
      attachedByKind: request.attachedBy.kind,
      attachedById: request.attachedBy.id,
      attachedAt: context.startedAt,
      legalEntityId: request.scope.legalEntityId ?? null,
      siteId: request.scope.siteId ?? null,
      storeId: request.scope.storeId ?? null,
      businessUnitId: request.scope.businessUnitId ?? null,
      brandId: request.scope.brandId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: attachment.id });
  if (inserted[0] === undefined) {
    const existing = await context.tx
      .select({ id: attachment.id, evidences: attachment.evidences })
      .from(attachment)
      .where(
        and(
          eq(attachment.storedFileId, request.storedFileId),
          eq(attachment.recordType, request.record.type),
          eq(attachment.recordId, request.record.id),
          request.record.versionId === undefined
            ? isNull(attachment.recordVersionId)
            : eq(attachment.recordVersionId, request.record.versionId),
        ),
      );
    const found = existing[0];
    if (found === undefined) throw new CommandDefect('An attachment could be neither written nor found');
    if (found.evidences !== request.evidence.kind) {
      throw new CommandDefect('The file is attached to this record already as other evidence');
    }
    return { attachmentId: found.id, alreadyAttached: true };
  }
  await audit.record(context, {
    actor:
      request.attachedBy.kind === 'user'
        ? { kind: 'user', id: request.attachedBy.id }
        : { kind: 'service-identity', id: request.attachedBy.id },
    ...(request.roleAssignmentId === undefined ? {} : { roleAssignmentId: request.roleAssignmentId }),
    scope: request.scope,
    record: {
      module: request.record.module,
      type: request.record.type,
      id: request.record.id,
      ...(request.record.versionId === undefined ? {} : { versionId: request.record.versionId }),
    },
    operation: 'attach-file',
    changes: [
      { kind: 'value', field: 'attachment', before: null, after: id },
      { kind: 'value', field: 'evidences', before: null, after: request.evidence.kind },
    ],
    source: { kind: 'screen' },
  });
  return { attachmentId: id, alreadyAttached: false };
}
