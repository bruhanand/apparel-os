import type { BackupStore, S3Bucket } from '../../../kernel/index.js';

// The file-store copy of an application backup (backup-and-restore 3.3, 10.2; PRD-IMP-002, POL-18.02): run after
// every database snapshot is taken, so a copy holds every object the snapshots' records name, because an object is
// stored before the transaction that records it and is never overwritten or deleted while a record names it. Objects
// are copied as they are, already encrypted with the Organisation's key; they need no second layer (2.3).
//
// The copy is incremental: an object whose key is already in the backup store is not copied again, since a key is
// never reused for other content (3.3). The backup command checks the result against the backup store's own listing.
// Objects no snapshot references, such as a file stored after the snapshot or by a transaction that rolled back, are
// copied and kept too (3.3, 8.2).

/** Where a file-store object is kept in the backup store. */
export function backupFileName(objectKey: string): string {
  return `files/${objectKey}`;
}

export interface FileCopyOutcome {
  /** Objects copied by this run. */
  readonly copied: number;
  /** Objects an earlier backup had copied already. */
  readonly alreadyThere: number;
}

/**
 * Copies every object of one Organisation, those under its identifier (GC9-10), from the file store into the backup
 * store. Reads and writes outside every transaction (code-house-rules 8.3).
 */
export async function copyOrganisationFiles(input: {
  readonly fileStore: S3Bucket;
  readonly backupStore: BackupStore;
  readonly organisationId: string;
}): Promise<FileCopyOutcome> {
  const prefix = `${input.organisationId}/`;
  const present = new Set(await input.backupStore.list(backupFileName(prefix)));
  let copied = 0;
  let alreadyThere = 0;
  for (const key of await input.fileStore.list(prefix)) {
    const name = backupFileName(key);
    if (present.has(name)) {
      alreadyThere += 1;
      continue;
    }
    const object = await input.fileStore.getWithLength(key);
    const written = await input.backupStore.putOnce(name, object.body, object.length);
    if (written === 'written') copied += 1;
    else alreadyThere += 1;
  }
  return { copied, alreadyThere };
}
