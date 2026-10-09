import { uuidv7 } from '@apparel-os/domain';
import type { EvidenceFile } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import { CommandDefect, LOCK_STEP, type TransactionContext } from '../../../kernel/index.js';
import type { FilesImportsInterface } from '../../files-imports/index.js';
import { exceptionEvent, exceptionType } from '../db/schema.js';
import { EXCEPTION_RECORD_TYPE } from '../domain/types.js';
import { done, exceptionRow, exceptionTarget, isOpen, refused, type Outcome } from './common.js';
import type { Acting } from './lifecycle.js';
import { factsOf, type RaiseDependencies } from './raise.js';

// Evidence on an exception (access-and-approvals 12.1, 12.3; POL-03.05, PRD-EXC-001; S1-F08-T03): stored files, each
// stored first through files-imports outside this transaction, linked to the exception in it through Attach
// (imports-and-opening-data 13.1; module-map 4.7), one evidence event for each. The kind of evidence is the exception's
// type, which declares the restricted classes its evidence carries (12.4 "As built"); a reader of the file needs view
// on `exceptions.exception` covering the exception and a grant of each of those classes (imports 11).

/** The kind of evidence an exception's files are attached as. */
export const EXCEPTION_EVIDENCE_KIND = 'exceptions.exception-evidence';

export interface EvidenceAdded {
  readonly exceptionId: string;
  readonly state: 'Unresolved' | 'Resolved' | 'Closed' | 'Reopened';
  readonly attachmentIds: readonly string[];
}

export async function addEvidence(
  context: TransactionContext,
  dependencies: RaiseDependencies & { readonly files: Pick<FilesImportsInterface, 'attach'> | undefined },
  acting: Acting,
  exceptionId: string,
  files: readonly EvidenceFile[],
): Promise<Outcome<EvidenceAdded>> {
  await context.lock(LOCK_STEP.document, [exceptionTarget(exceptionId)]);
  const row = await exceptionRow(context, exceptionId);
  if (row === undefined) return refused('not-found', 'exceptions.exception-not-found');
  if (!isOpen(row.state)) return refused('refused', 'exceptions.not-open');
  const attacher = dependencies.files;
  if (attacher === undefined) throw new CommandDefect('Evidence was added with no files-imports');
  const typeRow = (await context.tx.select().from(exceptionType).where(eq(exceptionType.id, row.exceptionTypeId)))[0];
  const type = typeRow === undefined ? undefined : dependencies.types.get(typeRow.code);
  if (type === undefined) throw new CommandDefect('Evidence was added to an exception of a type not registered');
  const scope = factsOf({
    siteId: row.siteId,
    storeId: row.storeId,
    businessUnitId: row.businessUnitId,
    brandId: row.brandId,
  });
  const attachmentIds: string[] = [];
  for (const file of files) {
    const attached = await attacher.attach(context, {
      storedFileId: file.storedFileId,
      fileReceiptId: file.fileReceiptId,
      record: { module: 'exceptions', type: EXCEPTION_RECORD_TYPE, id: row.id },
      evidence: { kind: EXCEPTION_EVIDENCE_KIND, restrictedClasses: type.evidenceClasses },
      scope,
      attachedBy: acting.actor,
      ...(acting.roleAssignmentId === undefined ? {} : { roleAssignmentId: acting.roleAssignmentId }),
    });
    attachmentIds.push(attached.attachmentId);
    // A file already attached to this exception adds no second event (PRD-INT-008).
    if (attached.alreadyAttached) continue;
    await context.tx.insert(exceptionEvent).values({
      id: uuidv7(),
      exceptionId: row.id,
      kind: 'evidence',
      actorId: acting.actor.id,
      toUserId: null,
      toRoleId: null,
      comment: null,
      attachmentId: attached.attachmentId,
      occurredAt: context.startedAt,
    });
  }
  // Attach writes the audit record of each link (imports 13.1); the exception's state is unchanged (12.3).
  return done({ exceptionId, state: row.state as EvidenceAdded['state'], attachmentIds });
}
