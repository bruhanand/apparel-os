import { pgSchema, text, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of kernel's tables (code-house-rules 3.4). They mirror the reviewed migrations and never
// create or change a table; an integration test compares each with the migrated database. Never exported from the
// kernel's index.ts, so no other unit can name these tables (code-house-rules 2).

const kernel = pgSchema('kernel');

/**
 * The directory database's one routing table (migrations/directory/0002): each Organisation's code and the name of
 * its database, nothing else (DEC-093, PRD-MOD-001, PRD-ACS-020).
 */
export const directoryEntry = kernel.table('directory_entry', {
  id: uuid('id').primaryKey(),
  organisationCode: text('organisation_code').notNull().unique(),
  databaseName: text('database_name').notNull().unique(),
});
