import { sql } from 'drizzle-orm';
import { tablesOf, type RestoreParticipant } from '../../kernel/index.js';
import * as filesImportsTables from './db/schema.js';

/**
 * Files-imports' part in backup and restore (backup-and-restore 3.2 step 6, 3.3, 5.1, 10.1, 10.2; PRD-IMP-002,
 * PRD-ACP-019): the totals of its tables, every table of its schema, comparison runs and their lines (RR-523) and the
 * requests to post of a queued publish (`publish_request`, migration 0082; S1-F13-T03) included; the records others
 * refer to (attachments, receipts, stored files, import batches, documents and staged rows); the object key of every
 * stored file, which the backup must hold (3.2 step 7); the key versions its files and receipts name (2.3); and that
 * every attachment's record resolves through the participant that answers for its type. Opening each file and
 * attachment after a restore is its after-restore check, restore-check.ts (S1-F14-T03).
 */
export const filesImportsRestoreParticipant: RestoreParticipant = {
  unit: 'files-imports',
  tier: 1,
  tables: tablesOf(filesImportsTables),
  records: [
    {
      recordType: 'files_imports.attachment',
      table: 'files_imports.attachment',
      suffixes: ['attachment_id'],
      arraySuffixes: ['attachment_ids'],
    },
    { recordType: 'files_imports.file_receipt', table: 'files_imports.file_receipt', suffixes: ['file_receipt_id'] },
    { recordType: 'files_imports.stored_file', table: 'files_imports.stored_file', suffixes: ['stored_file_id'] },
    { recordType: 'files_imports.import_batch', table: 'files_imports.import_batch', suffixes: ['import_batch_id'] },
    // The documents and staged rows a published record names, such as a product proposal's or an earlier-POS
    // reference document's source (imports-and-opening-data section 5; RR-523).
    {
      recordType: 'files_imports.import_document',
      table: 'files_imports.import_document',
      suffixes: ['import_document_id'],
    },
    {
      recordType: 'files_imports.staged_row',
      table: 'files_imports.staged_row',
      suffixes: ['staged_row_id'],
      arraySuffixes: ['staged_row_ids'],
    },
  ],
  typedReferences: [{ table: 'files_imports.attachment', typeColumn: 'record_type', idColumn: 'record_id' }],
  notReferences: {
    'files_imports.attachment.attached_by_id': 'a user or a service identity, as attached_by_kind says',
    'files_imports.file_receipt.received_by_id': 'a user or a service identity, as received_by_kind says',
  },
  async objectKeys(context) {
    const rows = await context.tx.execute<{ object_key: string }>(
      sql`select object_key from files_imports.stored_file order by object_key collate "C"`,
    );
    return rows.rows.map((row) => row.object_key);
  },
  async keyVersions(context) {
    const rows = await context.tx.execute<{ identifier: string | null; uses: string }>(
      sql`select key_version as identifier, count(*)::text as uses from (
            select key_version from files_imports.stored_file
            union all select key_version from files_imports.file_receipt) v
          group by 1`,
    );
    return rows.rows.map((row) => ({ identifier: row.identifier, uses: Number(row.uses) }));
  },
};
