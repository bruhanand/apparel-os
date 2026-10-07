import type { AttachedFile, FieldClass } from '@apparel-os/schemas';
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
import type { AccessInterface, OrganisationKeys } from '../../access/index.js';
import type { AuditInterface, AuditScope } from '../../audit/index.js';
import { attachment, storedFile } from '../db/schema.js';
import { contentHashOf, openFile } from '../domain/file-seal.js';
import { fileStoreNotConfigured, type FileStoreHandle } from '../file-store/file-store.js';

export interface ReadAttachedDependencies {
  readonly runner: CommandRunner;
  readonly helper: IdempotencyHelper;
  readonly access: AccessInterface;
  readonly audit: AuditInterface;
  readonly keys: OrganisationKeys;
  readonly fileStore: FileStoreHandle;
  readonly logger: StructuredLogger;
}

export interface Reader {
  readonly organisation: RoutedOrganisation;
  readonly userId: string;
  readonly correlationId: string;
  readonly networkAddress: string;
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
}

type Looked =
  | { readonly kind: 'found'; readonly found: Found; readonly roleAssignmentId: string }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal<'not-authorised' | 'unavailable' | 'not-found'> };

const NOT_FOUND = {
  kind: 'not-found',
  code: 'files-imports.attachment-not-found',
  missing: [],
} as const satisfies CommandRefusal<'not-found'>;

/**
 * Finds the attachment as the reader may see it and authorises the read (imports-and-opening-data 11, 13.1;
 * PRD-SEC-005): row-level security shows an attachment only where a grant on the attached record's type covers its
 * scope facts, so one outside the reader's scope reads as not found; Authorise then checks view on the attached
 * record's own type with its facts, and a grant of every restricted class the attachment carries. Reads only.
 */
async function lookUp(
  context: TransactionContext,
  access: AccessInterface,
  userId: string,
  attachmentId: string,
): Promise<Looked> {
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
    })
    .from(attachment)
    .innerJoin(storedFile, eq(storedFile.id, attachment.storedFileId))
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
  };
  const authorised = await access.authorise(context, needOf(found, userId));
  if (authorised.kind === 'refused') return { kind: 'refused', refusal: authorised.refusal };
  return { kind: 'found', found, roleAssignmentId: authorised.roleAssignmentId };
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
    contentBase64: bytes.toString('base64'),
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
    lookUp(context, deps.access, reader.userId, attachmentId),
  );
  if (looked.kind === 'refused') return refuse(looked.refusal);
  if (looked.found.classes.length > 0) {
    throw new ApiRefusal({ kind: 'refused', code: 'files-imports.restricted-file-is-an-export' });
  }
  return content(deps, reader, looked.found);
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
): Promise<IdempotentAnswer<JsonValue>> {
  const looked = await read(deps, reader, 'files-imports.authorise-download', (context) =>
    lookUp(context, deps.access, reader.userId, attachmentId),
  );
  if (looked.kind === 'refused') return refuse(looked.refusal);
  const { found } = looked;
  // The object is fetched before the command's transaction (code-house-rules 8.3) and given only after it commits.
  const file = await content(deps, reader, found);

  const authoriseReplay: ReplayAuthorisation = async (context) => {
    const again = await lookUp(context, deps.access, reader.userId, attachmentId);
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
        const held = await deps.access.holdAuthority(
          context,
          { kind: 'user', id: reader.userId },
          looked.roleAssignmentId,
          needOf(found, reader.userId),
        );
        if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
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
