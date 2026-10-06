import { eq, sql } from 'drizzle-orm';
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

/** The name of an Organisation's database, by its code compared exactly; undefined when the directory has none. */
export async function findDatabaseName(db: NodePgDatabase, organisationCode: string): Promise<string | undefined> {
  const rows = await db
    .select({ databaseName: directoryEntry.databaseName })
    .from(directoryEntry)
    .where(eq(directoryEntry.organisationCode, organisationCode));
  return rows[0]?.databaseName;
}
