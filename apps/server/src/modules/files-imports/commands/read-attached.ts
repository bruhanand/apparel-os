import type { AttachedFile, FieldClass, Receipt } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import {
  ApiRefusal,
  CommandDefect,
  type CommandOutcome,
  type CommandRefusal,
  type CommandRunner,
  type IdempotencyHelper,
  type IdempotentAnswer,
  type JsonValue,
  type ReplayAuthorisation,
  type RequestContent,
  type RoutedOrganisation,
  type StructuredLogger,
  type TransactionContext,
} from '../../../kernel/index.js';
import { freshCodeRefusal, takeFreshCode } from '../../access/index.js';
import type { AccessInterface, FreshCode, OrganisationKeys } from '../../access/index.js';
import type { AuditInterface, AuditScope } from '../../audit/index.js';
import { attachedRecord, type AttachedRecordReaders } from '../contracts/record-readers.js';
import { attachment, fileReceipt, storedFile } from '../db/schema.js';
import { contentHashOf, openFile } from '../domain/file-seal.js';
import { openReceiptText } from '../domain/receipt-seal.js';
import { fileStoreNotConfigured, type FileStoreHandle } from '../file-store/file-store.js';

export interface ReadAttachedDependencies {
  readonly runner: CommandRunner;
  readonly helper: IdempotencyHelper;
  readonly access: AccessInterface;
  readonly audit: AuditInterface;
  readonly keys: OrganisationKeys;
  readonly fileStore: FileStoreHandle;
  readonly logger: StructuredLogger;
  /** The owning modules' readers of their records (RR-452). */
  readonly readers: AttachedRecordReaders;
}

export interface Reader {
  readonly organisation: RoutedOrganisation;
  readonly userId: string;
  readonly correlationId: string;
  readonly networkAddress: string;
}

/** A receipt as stored: the name and reference still encrypted (RR-433). */
interface SealedReceipt {
  readonly receiptId: string;
  readonly receivedAt: Date;
  readonly sourceSystem: string;
  readonly originalNameSealed: string;
  readonly claimedReferenceSealed: string | null;
  readonly scheme: string;
}

interface Found {
  readonly attachmentId: string;
  readonly storedFileId: string;
  readonly recordModule: string;
  readonly recordType: string;
  readonly recordId: string;
  readonly classes: readonly FieldClass[];
  /** The record's scope facts; one the attachment holds as Unknown is left out (PRD-MOD-015). */
  readonly facts: AuditScope;
  readonly contentHash: string;
  readonly sizeBytes: number;
  readonly format: AttachedFile['format'];
  readonly objectKey: string;
  readonly scheme: string;
  /** The one receipt the attachment was made from, never another receipt of the same bytes (section 11, 15.1). */
  readonly receipt: SealedReceipt;
}

type Looked =
  | {
      readonly kind: 'found';
      readonly found: Found;
      /** The assignment that granted the read; none for a reader the owning module admitted with no class to grant. */
      readonly roleAssignmentId: string | undefined;
      /** Admitted by the record's owning module rather than through a grant on its type (RR-452). */
      readonly admitted: boolean;
    }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal<'not-authorised' | 'unavailable' | 'not-found'> };

const NOT_FOUND = {
  kind: 'not-found',
  code: 'files-imports.attachment-not-found',
  missing: [],
} as const satisfies CommandRefusal<'not-found'>;

/**
 * Finds the attachment as the reader may see it and authorises the read (imports-and-opening-data 11, 13.1;
 * PRD-SEC-005). Where the attached record's owning module registered a reader, it is asked first whether the reader
 * may read the record; if it admits them, the attachment shows and only the restricted classes are authorised
 * (RR-452). Otherwise row-level security shows an attachment only where a grant on the attached record's type covers
 * its scope facts, so one outside the reader's scope reads as not found; Authorise then checks view on the attached
 * record's own type with its facts, and a grant of every restricted class the attachment carries. Reads only.
 */
async function lookUp(
  context: TransactionContext,
  access: AccessInterface,
  readers: AttachedRecordReaders,
  userId: string,
  attachmentId: string,
): Promise<Looked> {
  const record = await attachedRecord(context, attachmentId);
  if (record === undefined) return { kind: 'refused', refusal: NOT_FOUND };
  const admitted = await readers.admit(context, record.recordType, record.recordId);
  const rows = await context.tx
    .select({
      attachmentId: attachment.id,
      storedFileId: attachment.storedFileId,
      recordModule: attachment.recordModule,
      recordType: attachment.recordType,
      recordId: attachment.recordId,
      classes: attachment.restrictedClasses,
      legalEntityId: attachment.legalEntityId,
      siteId: attachment.siteId,
      storeId: attachment.storeId,
      businessUnitId: attachment.businessUnitId,
      brandId: attachment.brandId,
      contentHash: storedFile.contentHash,
      sizeBytes: storedFile.sizeBytes,
      format: storedFile.format,
      objectKey: storedFile.objectKey,
      scheme: storedFile.encryptionScheme,
      receiptId: fileReceipt.id,
      receivedAt: fileReceipt.receivedAt,
      sourceSystem: fileReceipt.sourceSystem,
      originalNameSealed: fileReceipt.originalNameSealed,
      claimedReferenceSealed: fileReceipt.claimedReferenceSealed,
      receiptScheme: fileReceipt.encryptionScheme,
    })
    .from(attachment)
    .innerJoin(storedFile, eq(storedFile.id, attachment.storedFileId))
    .innerJoin(fileReceipt, eq(fileReceipt.id, attachment.fileReceiptId))
    .where(eq(attachment.id, attachmentId));
  const row = rows[0];
  if (row === undefined) return { kind: 'refused', refusal: NOT_FOUND };
  const classes = row.classes as FieldClass[];
  const found: Found = {
    attachmentId: row.attachmentId,
    storedFileId: row.storedFileId,
    recordModule: row.recordModule,
    recordType: row.recordType,
    recordId: row.recordId,
    classes,
    facts: {
      ...(row.legalEntityId === null ? {} : { legalEntityId: row.legalEntityId }),
      ...(row.siteId === null ? {} : { siteId: row.siteId }),
      ...(row.storeId === null ? {} : { storeId: row.storeId }),
      ...(row.businessUnitId === null ? {} : { businessUnitId: row.businessUnitId }),
      ...(row.brandId === null ? {} : { brandId: row.brandId }),
    },
    contentHash: row.contentHash,
    sizeBytes: row.sizeBytes,
    format: row.format as AttachedFile['format'],
    objectKey: row.objectKey,
    scheme: row.scheme,
    // Still encrypted, and decrypted only when the file is served, after the authority holds.
    receipt: {
      receiptId: row.receiptId,
      receivedAt: row.receivedAt,
      sourceSystem: row.sourceSystem,
      originalNameSealed: row.originalNameSealed,
      claimedReferenceSealed: row.claimedReferenceSealed,
      scheme: row.receiptScheme,
    },
  };
  if (admitted) {
    if (classes.length === 0) return { kind: 'found', found, roleAssignmentId: undefined, admitted };
    const classesHeld = await access.authoriseFieldClasses(context, {
      actorId: userId,
      recordType: found.recordType,
      facts: found.facts,
      fieldClasses: classes.map((fieldClass) => ({ fieldClass, use: 'view' as const })),
    });
    if (classesHeld.kind === 'refused') return { kind: 'refused', refusal: classesHeld.refusal };
    return { kind: 'found', found, roleAssignmentId: classesHeld.roleAssignmentId, admitted };
  }
  const authorised = await access.authorise(context, needOf(found, userId));
  if (authorised.kind === 'refused') return { kind: 'refused', refusal: authorised.refusal };
  return { kind: 'found', found, roleAssignmentId: authorised.roleAssignmentId, admitted };
}

function needOf(found: Found, actorId: string) {
  return {
    actorId,
    action: 'view' as const,
    recordType: found.recordType,
    facts: found.facts,
    fieldClasses: found.classes.map((fieldClass) => ({ fieldClass, use: 'view' as const })),
  };
}

function refuse(refusal: CommandRefusal<string>): never {
  throw new ApiRefusal({
    kind: refusal.kind as 'not-found' | 'not-authorised' | 'unavailable',
    code: refusal.code,
    missing: [...refusal.missing],
  });
}

/** Fetches the object, outside any transaction, decrypts it and checks it against the hash taken at intake. */
async function content(deps: ReadAttachedDependencies, reader: Reader, found: Found): Promise<AttachedFile> {
  if (deps.fileStore.kind === 'not-configured') throw fileStoreNotConfigured();
  const { organisationCode } = reader.organisation;
  const sealed = await deps.fileStore.store.get(found.objectKey);
  const bytes = openFile(deps.keys, organisationCode, found.contentHash, found.scheme, sealed);
  if (contentHashOf(bytes) !== found.contentHash) {
    throw new CommandDefect('A stored file does not match its content hash');
  }
  // The file's hash and size only, never its content (PRD-SEC-014).
  deps.logger.structured(
    'info',
    { correlationId: reader.correlationId, contentHash: found.contentHash, sizeBytes: bytes.length },
    'A stored file was served',
    'FilesImports',
  );
  return {
    attachmentId: found.attachmentId,
    storedFileId: found.storedFileId,
    contentHash: found.contentHash,
    sizeBytes: found.sizeBytes,
    format: found.format,
    restrictedClasses: [...found.classes],
    receipt: receiptOf(deps.keys, organisationCode, found.receipt),
    contentBase64: bytes.toString('base64'),
  };
}

/** Decrypts a receipt's name and reference for a reader already authorised to be served the file (RR-433). */
function receiptOf(keys: OrganisationKeys, organisationCode: string, receipt: SealedReceipt): Receipt {
  const open = (sealed: string, field: 'original-name' | 'claimed-reference'): string =>
    openReceiptText(keys, organisationCode, receipt.receiptId, field, { scheme: receipt.scheme, ciphertext: sealed });
  return {
    receiptId: receipt.receiptId,
    receivedAt: receipt.receivedAt.toISOString(),
    sourceSystem: receipt.sourceSystem,
    originalName: open(receipt.originalNameSealed, 'original-name'),
    claimedReference:
      receipt.claimedReferenceSealed === null ? null : open(receipt.claimedReferenceSealed, 'claimed-reference'),
  };
}

function read<T>(
  deps: ReadAttachedDependencies,
  reader: Reader,
  commandName: string,
  work: (context: TransactionContext) => Promise<T>,
): Promise<T> {
  return deps.runner.read(
    {
      commandName,
      organisation: reader.organisation,
      correlationId: reader.correlationId,
      actor: { kind: 'actor', actorId: reader.userId },
    },
    work,
  );
}

/**
 * Read a file that carries no restricted class (13.1, section 11; PRD-SEC-005): served only through the app, to a
 * reader authorised for the record it is attached to. A file that carries a restricted class is an export, so it is
 * served by the download command and refused here.
 */
export async function readAttachedFile(
  deps: ReadAttachedDependencies,
  reader: Reader,
  attachmentId: string,
): Promise<AttachedFile> {
  const looked = await read(deps, reader, 'files-imports.read-attached-file', (context) =>
    lookUp(context, deps.access, deps.readers, reader.userId, attachmentId),
  );
  if (looked.kind === 'refused') return refuse(looked.refusal);
  if (looked.found.classes.length > 0) {
    throw new ApiRefusal({ kind: 'refused', code: 'files-imports.restricted-file-is-an-export' });
  }
  return content(deps, reader, looked.found);
}

/**
 * A download that exports a restricted class is a protected action (access-and-approvals 3.3; PRD-SEC-001, RR-432): it
 * takes a fresh authenticator code, checked as every protected action checks one. A missing code counts as one that
 * does not match. How long a code stays fresh is OPEN (GC3-6; KDPS Owner): no duration is chosen here.
 */
function checkedCode(
  access: AccessInterface,
  context: TransactionContext,
  userId: string,
  totpCode: string | undefined,
): Promise<FreshCode> {
  return totpCode === undefined
    ? Promise.resolve({ kind: 'refused' })
    : access.checkFreshCode(context, userId, totpCode);
}

/**
 * Download a file (13.1, section 11; numbering-and-audit 5.1; PRD-SEC-007): the same authority as reading it, and,
 * for a file that holds a restricted class, an export that includes a restricted field, so one sensitive-access
 * record for each class is written in the command's own transaction before the bytes are given. The authority is
 * rechecked under the locks of the command (code-house-rules 8.2). The answer is never kept under the key: an
 * identical replay is refused as not repeatable (12.4; DEC-114).
 */
export async function downloadAttachedFile(
  deps: ReadAttachedDependencies,
  reader: Reader,
  attachmentId: string,
  key: string,
  requestContent: RequestContent,
  totpCode: string | undefined,
): Promise<IdempotentAnswer<JsonValue>> {
  const looked = await read(deps, reader, 'files-imports.authorise-download', async (context) => {
    const found = await lookUp(context, deps.access, deps.readers, reader.userId, attachmentId);
    if (found.kind === 'refused' || found.found.classes.length === 0) return found;
    // Nothing is fetched for a restricted file before its code is seen to be fresh. The code is only checked here;
    // it is taken in the command's own transaction (PRD-SEC-001).
    const checked = await checkedCode(deps.access, context, reader.userId, totpCode);
    const refusal = freshCodeRefusal(checked);
    return refusal === undefined ? found : ({ kind: 'refused', refusal: refusal.refusal } as const);
  });
  if (looked.kind === 'refused') return refuse(looked.refusal);
  const { found } = looked;
  // The object is fetched before the command's transaction (code-house-rules 8.3) and given only after it commits.
  const file = await content(deps, reader, found);

  const authoriseReplay: ReplayAuthorisation = async (context) => {
    const again = await lookUp(context, deps.access, deps.readers, reader.userId, attachmentId);
    if (again.kind === 'found') return { kind: 'allowed' };
    return { kind: 'refused', refusal: again.refusal as CommandRefusal<'not-authorised' | 'not-found'> };
  };
  return deps.helper.run(
    {
      commandName: 'files-imports.download-attached-file',
      organisation: reader.organisation,
      correlationId: reader.correlationId,
      actor: { kind: 'actor', actorId: reader.userId },
    },
    {
      key,
      content: requestContent,
      authoriseReplay,
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        if (looked.admitted) {
          // The owning module is asked again, and the classes authorised again, in the command (RR-452).
          const again = await lookUp(context, deps.access, deps.readers, reader.userId, attachmentId);
          if (again.kind === 'refused') return { kind: 'refusal', refusal: again.refusal, causedBySecret: false };
        } else {
          if (looked.roleAssignmentId === undefined) throw new CommandDefect('A granted read named no assignment');
          const held = await deps.access.holdAuthority(
            context,
            { kind: 'user', id: reader.userId },
            looked.roleAssignmentId,
            needOf(found, reader.userId),
          );
          if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
        }
        if (found.classes.length > 0) {
          // Checked again and taken here, so a code another request used in between is refused (PRD-SEC-001).
          const refusal = await takeFreshCode(await checkedCode(deps.access, context, reader.userId, totpCode));
          if (refusal !== undefined) return { kind: 'refusal', ...refusal };
        }
        for (const fieldClass of found.classes) {
          await deps.audit.recordAccess(context, {
            kind: 'sensitive-access',
            outcome: 'succeeded',
            userId: reader.userId,
            networkAddress: reader.networkAddress,
            scope: found.facts,
            record: { module: found.recordModule, type: found.recordType, id: found.recordId },
            fieldClass,
            exposure: 'exported',
          });
        }
        return { kind: 'success', answer: file as unknown as JsonValue, shows: 'restricted-value' };
      },
    },
  );
}
