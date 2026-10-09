import { sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';

// Who may read an attached record, as its owning module answers (imports-and-opening-data 11 "As built for the owning
// module's readers"; module-map section 3, rule 6; product owner, 9 Oct 2026, RR-452). A contract files-imports
// defines and an owning module implements, handed over at start: files-imports never depends on that module.

/**
 * The owning module's answer for its record types: whether the actor may read the record, as when its owner, the
 * holder of its owning role or its escalation recipient reads an exception with no grant on `exceptions.exception`
 * (access-and-approvals 12.4). Runs as the actor, in the reader's or the attaching command's transaction. A record type
 * with no reader is read through a grant on its type alone (section 11).
 */
export interface AttachedRecordReader {
  mayRead(context: TransactionContext, actorId: string, recordId: string): Promise<boolean>;
}

/** The readers of the record types whose owning modules registered one. */
export class AttachedRecordReaders {
  private readonly readers = new Map<string, AttachedRecordReader>();

  register(recordTypes: readonly string[], reader: AttachedRecordReader): void {
    for (const recordType of recordTypes) {
      if (this.readers.has(recordType)) throw new Error(`A record reader for ${recordType} is already registered`);
      this.readers.set(recordType, reader);
    }
  }

  /**
   * Whether the record's owning module admits the transaction's actor to read it. When it does, the record is named
   * for the rest of the transaction, so the attachment's row-level security shows and takes its attachments
   * (migration 0039). No reader, or no actor, admits no one.
   */
  async admit(context: TransactionContext, recordType: string, recordId: string): Promise<boolean> {
    const reader = this.readers.get(recordType);
    if (reader === undefined || context.actor.kind !== 'actor') return false;
    if (!(await reader.mayRead(context, context.actor.actorId, recordId))) return false;
    await context.tx.execute(
      sql`select pg_catalog.set_config('aos.admitted_record', ${`${recordType}:${recordId}`}, true)`,
    );
    return true;
  }
}

/** The token of the readers, which owning modules register with at start. */
export const ATTACHED_RECORD_READERS = 'files-imports.AttachedRecordReaders';

/**
 * The record an attachment belongs to, by type and identifier only, before its row is visible to the actor
 * (`files_imports.attached_record`, migration 0039), so its owning module can be asked.
 */
export async function attachedRecord(
  context: TransactionContext,
  attachmentId: string,
): Promise<{ readonly recordType: string; readonly recordId: string } | undefined> {
  const rows = await context.tx.execute<{ record_type: string; record_id: string }>(
    sql`select record_type, record_id from files_imports.attached_record(${attachmentId}::uuid)`,
  );
  const row = rows.rows[0];
  return row === undefined ? undefined : { recordType: row.record_type, recordId: row.record_id };
}
