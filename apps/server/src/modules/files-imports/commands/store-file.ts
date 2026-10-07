import { uuidv7 } from '@apparel-os/domain';
import type { StoredFileAnswer, StoreFileRequest } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import {
  ApiRefusal,
  CommandDefect,
  type CommandOutcome,
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
import type { AuditInterface } from '../../audit/index.js';
import { fileReceipt, storedFile } from '../db/schema.js';
import { contentHashOf, objectKeyOf, sealFile } from '../domain/file-seal.js';
import { checkEvidenceFile } from '../domain/intake-checks.js';
import type { FileStoreHandle } from '../file-store/file-store.js';

export interface StoreFileDependencies {
  readonly helper: IdempotencyHelper;
  readonly access: AccessInterface;
  readonly audit: AuditInterface;
  readonly keys: OrganisationKeys;
  readonly fileStore: FileStoreHandle;
  readonly logger: StructuredLogger;
}

export interface StoreFileInput {
  readonly organisation: RoutedOrganisation;
  readonly userId: string;
  readonly roleAssignmentId: string;
  readonly correlationId: string;
  readonly key: string;
  readonly content: RequestContent;
  readonly body: StoreFileRequest;
}

const COMMAND = 'files-imports.store-file';
const NEED = { action: 'create', recordType: 'files_imports.stored_file' } as const;

/**
 * Store a file (imports-and-opening-data 3.1 steps 1 and 2, 13.1; PRD-IMP-002, PRD-SEC-006, PRD-SEC-011; DEC-117).
 *
 * In this order, so that nothing is stored for a file that fails a check and no outside call is made inside a
 * transaction (code-house-rules 8.3; PRD-INT-006): the intake checks on the bytes in memory (type from content, size,
 * active content); the content hash; the encryption under the Organisation's key; the write of the object, once,
 * under a key that starts with the Organisation's identifier; and only then the transaction that records the stored
 * file, the receipt and the audit record. An object whose record then fails to commit stays, as an object with no
 * record (backup-and-restore 3.3). The same bytes again add a receipt and write no second object.
 */
export async function storeFile(
  deps: StoreFileDependencies,
  input: StoreFileInput,
): Promise<IdempotentAnswer<JsonValue>> {
  if (deps.fileStore.kind === 'not-configured') {
    throw new ApiRefusal({
      kind: 'unavailable',
      code: 'files-imports.file-store-not-configured',
      missing: [{ kind: 'setting', setting: 'files-imports.file-store' }],
    });
  }
  const { organisationId } = input.organisation;
  if (organisationId === undefined) throw new CommandDefect('The Organisation was routed without its identifier');
  const bytes = Buffer.from(input.body.contentBase64, 'base64');
  const checked = checkEvidenceFile(bytes);
  if (checked.kind === 'refused') {
    throw new ApiRefusal({
      kind: 'refused',
      code: checked.code,
      ...(checked.missing === undefined ? {} : { missing: [...checked.missing] }),
    });
  }
  const contentHash = contentHashOf(bytes);
  const sealed = sealFile(deps.keys, input.organisation.organisationCode, contentHash, bytes);
  const objectKey = objectKeyOf(organisationId, contentHash);
  await deps.fileStore.store.putOnce(objectKey, sealed.bytes);
  // The file's hash and size only, never its content (imports-and-opening-data 9.3; PRD-SEC-014).
  deps.logger.structured(
    'info',
    { correlationId: input.correlationId, contentHash, sizeBytes: bytes.length },
    'A file was handed in',
    'FilesImports',
  );

  const authoriseReplay: ReplayAuthorisation = async (context) => {
    const authorised = await deps.access.authorise(context, { actorId: input.userId, ...NEED });
    if (authorised.kind === 'allowed') return { kind: 'allowed' };
    return {
      kind: 'refused',
      refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
    };
  };
  const answer = await deps.helper.run(
    {
      commandName: COMMAND,
      organisation: input.organisation,
      correlationId: input.correlationId,
      actor: { kind: 'actor', actorId: input.userId },
    },
    {
      key: input.key,
      content: input.content,
      authoriseReplay,
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        const held = await deps.access.holdAuthority(
          context,
          { kind: 'user', id: input.userId },
          input.roleAssignmentId,
          NEED,
        );
        if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
        return {
          kind: 'success',
          answer: await record(deps, context, input, {
            contentHash,
            sizeBytes: bytes.length,
            format: checked.format,
            objectKey,
            scheme: sealed.scheme,
          }),
          shows: 'nothing',
        };
      },
    },
  );
  return answer;
}

async function record(
  deps: StoreFileDependencies,
  context: TransactionContext,
  input: StoreFileInput,
  file: {
    readonly contentHash: string;
    readonly sizeBytes: number;
    readonly format: StoredFileAnswer['format'];
    readonly objectKey: string;
    readonly scheme: string;
  },
): Promise<JsonValue> {
  const inserted = await context.tx
    .insert(storedFile)
    .values({
      id: uuidv7(),
      contentHash: file.contentHash,
      sizeBytes: file.sizeBytes,
      format: file.format,
      objectKey: file.objectKey,
      encryptionScheme: file.scheme,
      restrictedClasses: null,
    })
    .onConflictDoNothing({ target: storedFile.contentHash })
    .returning({ id: storedFile.id });
  let storedFileId = inserted[0]?.id;
  const alreadyStored = storedFileId === undefined;
  if (storedFileId === undefined) {
    const existing = await context.tx
      .select({ id: storedFile.id })
      .from(storedFile)
      .where(eq(storedFile.contentHash, file.contentHash));
    storedFileId = existing[0]?.id;
  }
  if (storedFileId === undefined) throw new CommandDefect('A stored file could be neither written nor found');
  const receiptId = uuidv7();
  await context.tx.insert(fileReceipt).values({
    id: receiptId,
    storedFileId,
    receivedByKind: 'user',
    receivedById: input.userId,
    receivedAt: context.startedAt,
    sourceSystem: input.body.sourceSystem,
    claimedReference: input.body.claimedReference ?? null,
    originalName: input.body.originalName,
    correlationId: context.correlationId,
  });
  await deps.audit.record(context, {
    actor: { kind: 'user', id: input.userId },
    roleAssignmentId: input.roleAssignmentId,
    record: { module: 'files-imports', type: 'stored_file', id: storedFileId },
    operation: alreadyStored ? 'receive-again' : 'store',
    changes: [
      { kind: 'value', field: 'receipt', before: null, after: receiptId },
      { kind: 'value', field: 'sourceSystem', before: null, after: input.body.sourceSystem },
      { kind: 'value', field: 'contentHash', before: null, after: file.contentHash },
      { kind: 'value', field: 'sizeBytes', before: null, after: file.sizeBytes },
      { kind: 'value', field: 'format', before: null, after: file.format },
    ],
    source: { kind: 'screen' },
    idempotencyKey: input.key,
  });
  return {
    storedFileId,
    receiptId,
    contentHash: file.contentHash,
    sizeBytes: file.sizeBytes,
    format: file.format,
    alreadyStored,
  };
}
