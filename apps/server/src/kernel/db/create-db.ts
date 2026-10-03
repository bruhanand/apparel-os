import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export type Database = NodePgDatabase;

export interface DatabaseHandle {
  readonly db: Database;
  /** Waits for running queries and closes every connection. */
  close(): Promise<void>;
}

/** Opens a Drizzle database over a pooled PostgreSQL connection. One database per Organisation (PRD-MOD-001). */
export function createDb(connectionString: string): DatabaseHandle {
  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool });
  return {
    db,
    close: () => pool.end(),
  };
}
