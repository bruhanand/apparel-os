import { uuidv7 } from '@apparel-os/domain';
import { eq, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { directoryEntry } from './schema.js';

/** One Organisation in the directory: its code and the name of its database, nothing else (DEC-093). */
export interface DirectoryEntry {
  readonly organisationCode: string;
  readonly databaseName: string;
}

/**
 * Every Organisation the directory lists, in code order: byte order of the code, whatever the database's collation,
 * so every run takes them in the same order (code-house-rules 4.3).
 */
export async function listDirectory(db: NodePgDatabase): Promise<DirectoryEntry[]> {
  return db
    .select({ organisationCode: directoryEntry.organisationCode, databaseName: directoryEntry.databaseName })
    .from(directoryEntry)
    .orderBy(sql`${directoryEntry.organisationCode} collate "C"`);
}

/**
 * An Organisation's identifier (the directory row's UUIDv7) and the name of its database, by its code compared
 * exactly; undefined when the directory has none. The identifier starts every object key in the file store
 * (backup-and-restore 2.1; GC9-10).
 */
export async function findOrganisationEntry(
  db: NodePgDatabase,
  organisationCode: string,
): Promise<{ readonly organisationId: string; readonly databaseName: string } | undefined> {
  const rows = await db
    .select({ organisationId: directoryEntry.id, databaseName: directoryEntry.databaseName })
    .from(directoryEntry)
    .where(eq(directoryEntry.organisationCode, organisationCode));
  return rows[0];
}

/** The name of an Organisation's database, by its code compared exactly; undefined when the directory has none. */
export async function findDatabaseName(db: NodePgDatabase, organisationCode: string): Promise<string | undefined> {
  const rows = await db
    .select({ databaseName: directoryEntry.databaseName })
    .from(directoryEntry)
    .where(eq(directoryEntry.organisationCode, organisationCode));
  return rows[0]?.databaseName;
}

/**
 * The directory's entries that list the code, or the database name, either one: what the setup step reads first
 * (access-and-approvals 9.11). Compared exactly, as the directory keeps them.
 */
export async function findDirectoryEntries(
  db: NodePgDatabase,
  by: { readonly organisationCode: string; readonly databaseName: string },
): Promise<DirectoryEntry[]> {
  return db
    .select({ organisationCode: directoryEntry.organisationCode, databaseName: directoryEntry.databaseName })
    .from(directoryEntry)
    .where(
      or(eq(directoryEntry.organisationCode, by.organisationCode), eq(directoryEntry.databaseName, by.databaseName)),
    );
}

/**
 * Lists an Organisation in the directory: the setup step's last write (access-and-approvals 9.11; DEC-093). Unique by
 * code and by database name, so of two runs at once one lists it and the other's insert fails; the caller reads the
 * state again and never takes the failure as success. Run as the migration role, which owns the directory.
 */
export async function registerInDirectory(db: NodePgDatabase, entry: DirectoryEntry): Promise<void> {
  await db
    .insert(directoryEntry)
    .values({ id: uuidv7(), organisationCode: entry.organisationCode, databaseName: entry.databaseName });
}
