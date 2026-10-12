import type { FieldClass } from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import type { CheckResult, RecoveryGap, RestoreCheckStep } from '../../kernel/index.js';
import type { OrganisationKeys, attachmentReaderCheck } from '../access/index.js';
import { contentHashOf, openFile } from './domain/file-seal.js';
import { openReceiptText } from './domain/receipt-seal.js';

/** What the check needs that the restore command holds: the custodian's kept copies of the data keys and Authorise. */
export interface FilesRestoreCheckDependencies {
  readonly keys: OrganisationKeys;
  readonly readerCheck: typeof attachmentReaderCheck;
}

type Result = Omit<CheckResult, 'unit'>;
type Gap = Omit<RecoveryGap, 'unit'>;

/**
 * Files-imports' after-restore check (backup-and-restore 5.1 "Stored files", "Attachments", "Objects with no record";
 * 3.3, 4.5; PRD-IMP-002, PRD-SEC-005, PRD-ACP-019; imports-and-opening-data 17 test 23; S1-F14-T03), as the migration
 * role, which row-level security does not filter:
 *
 * - Every stored file: its object is in the restored file store, opens with the key version it names, and the hash of
 *   what it opens to is its content hash, taken before encryption. Every receipt's sealed name opens too. A file that
 *   fails is named by its object key.
 * - Every attachment: its file passed, a synthetic reader authorised for its record is allowed by Authorise's own rule
 *   and one outside the record's scope is refused (access, `attachmentReaderCheck`). One that fails is named by its
 *   identifier.
 * - Every object under the Organisation's identifier that no stored file names is listed with the time it was
 *   stored, as a recovery gap, and kept (3.3, 8.2): one stored after the recovery point may be evidence of lost work.
 */
export function filesImportsRestoreChecks(dependencies: FilesRestoreCheckDependencies): RestoreCheckStep[] {
  return [
    {
      kind: 'check',
      unit: 'files-imports',
      tier: 1,
      async run(context, run) {
        const results: Result[] = [];
        const gaps: Gap[] = [];
        const code = run.organisationCode;
        const files = (
          await context.tx.execute<{
            id: string;
            content_hash: string;
            object_key: string;
            encryption_scheme: string;
            key_version: string | null;
          }>(
            sql`select id::text, content_hash, object_key, encryption_scheme, key_version
                  from files_imports.stored_file order by object_key collate "C"`,
          )
        ).rows;
        let keyVersion: string | undefined;
        try {
          keyVersion = dependencies.keys.version(code);
        } catch {
          keyVersion = undefined;
        }
        const opened = new Set<string>();
        for (const file of files) {
          const failure = await openStoredFile(
            file,
            (key) => run.objects.get(key),
            (sealed) => {
              if (file.key_version !== null && file.key_version !== keyVersion) {
                throw new Error('another key version');
              }
              return openFile(dependencies.keys, code, file.content_hash, file.encryption_scheme, sealed);
            },
          );
          if (failure === undefined) {
            opened.add(file.id);
          } else {
            results.push({
              check: `stored file ${failure}`,
              passed: false,
              checked: 1,
              failed: 1,
              subject: file.object_key,
            });
          }
        }
        results.unshift({
          check: 'every stored file is in the file store, opens with its key version and matches its hash',
          passed: opened.size === files.length,
          checked: files.length,
          failed: files.length - opened.size,
        });

        const receipts = (
          await context.tx.execute<{
            id: string;
            original_name_sealed: string;
            claimed_reference_sealed: string | null;
            encryption_scheme: string;
          }>(
            sql`select id::text, original_name_sealed, claimed_reference_sealed, encryption_scheme
                  from files_imports.file_receipt order by id`,
          )
        ).rows;
        let receiptsFailed = 0;
        for (const receipt of receipts) {
          try {
            const scheme = receipt.encryption_scheme;
            openReceiptText(dependencies.keys, code, receipt.id, 'original-name', {
              scheme,
              ciphertext: receipt.original_name_sealed,
            });
            if (receipt.claimed_reference_sealed !== null) {
              openReceiptText(dependencies.keys, code, receipt.id, 'claimed-reference', {
                scheme,
                ciphertext: receipt.claimed_reference_sealed,
              });
            }
          } catch {
            receiptsFailed += 1;
            results.push({
              check: 'file receipt does not open with its key version',
              passed: false,
              checked: 1,
              failed: 1,
              subject: receipt.id,
            });
          }
        }
        results.push({
          check: 'every file receipt opens with its key version',
          passed: receiptsFailed === 0,
          checked: receipts.length,
          failed: receiptsFailed,
        });

        const attachments = (
          await context.tx.execute<{
            id: string;
            stored_file_id: string;
            record_type: string;
            restricted_classes: FieldClass[];
            legal_entity_id: string | null;
            site_id: string | null;
            store_id: string | null;
            business_unit_id: string | null;
            brand_id: string | null;
          }>(
            sql`select id::text, stored_file_id::text, record_type, restricted_classes, legal_entity_id::text,
                       site_id::text, store_id::text, business_unit_id::text, brand_id::text
                  from files_imports.attachment order by id`,
          )
        ).rows;
        let attachmentsFailed = 0;
        for (const attachment of attachments) {
          const readers = dependencies.readerCheck({
            recordType: attachment.record_type,
            facts: {
              ...(attachment.legal_entity_id === null ? {} : { legalEntityId: attachment.legal_entity_id }),
              ...(attachment.site_id === null ? {} : { siteId: attachment.site_id }),
              ...(attachment.store_id === null ? {} : { storeId: attachment.store_id }),
              ...(attachment.business_unit_id === null ? {} : { businessUnitId: attachment.business_unit_id }),
              ...(attachment.brand_id === null ? {} : { brandId: attachment.brand_id }),
            },
            fieldClasses: attachment.restricted_classes,
          });
          const failure = !opened.has(attachment.stored_file_id)
            ? 'its file does not open'
            : !readers.authorisedAllowed
              ? 'a reader authorised for its record is refused'
              : !readers.outsiderRefused
                ? 'a reader outside its record’s scope is allowed'
                : undefined;
          if (failure !== undefined) {
            attachmentsFailed += 1;
            results.push({
              check: `attachment: ${failure}`,
              passed: false,
              checked: 1,
              failed: 1,
              subject: attachment.id,
            });
          }
        }
        results.push({
          check: 'every attachment opens from its record for an authorised reader and is refused outside its scope',
          passed: attachmentsFailed === 0,
          checked: attachments.length,
          failed: attachmentsFailed,
        });

        const named = new Set(files.map((file) => file.object_key));
        const unnamed = (await run.objects.list(`${run.organisationId}/`)).filter((object) => !named.has(object.key));
        for (const object of unnamed) {
          gaps.push({ name: 'object with no record', subject: object.key, subjectAt: object.storedAt });
        }
        results.push({
          check: 'objects with no record listed with their store time and kept',
          passed: true,
          checked: unnamed.length,
          failed: 0,
        });
        return { results, gaps };
      },
    },
  ];
}

/** Opens one stored file from the restored store: undefined when it passes, or why it fails, in words. */
async function openStoredFile(
  file: { readonly content_hash: string; readonly object_key: string },
  get: (key: string) => Promise<Buffer>,
  open: (sealed: Buffer) => Buffer,
): Promise<string | undefined> {
  let sealed: Buffer;
  try {
    sealed = await get(file.object_key);
  } catch {
    return 'missing from the file store';
  }
  let plain: Buffer;
  try {
    plain = open(sealed);
  } catch {
    return 'does not open with the key version it names';
  }
  return contentHashOf(plain) === file.content_hash ? undefined : 'does not match its content hash';
}
