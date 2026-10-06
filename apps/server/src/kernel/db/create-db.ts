import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

/** A Drizzle database over a pool. The command runner takes one connection from the pool for each command. */
export type Database = NodePgDatabase & { readonly $client: Pool };

export interface DatabaseHandle {
  readonly db: Database;
  /** Waits for running queries and closes every connection. */
  close(): Promise<void>;
}

export interface PoolOptions {
  /** The most connections the pool opens at once. Without it, the pg library's own limit applies. */
  readonly max?: number;
  /** Told of an error on an idle connection, which would otherwise end the process. */
  readonly onIdleError?: (error: Error) => void;
}

/** Opens a Drizzle database over a pooled PostgreSQL connection. One database per Organisation (PRD-MOD-001). */
export function createDb(connectionString: string, options: PoolOptions = {}): DatabaseHandle {
  const pool = new Pool(options.max === undefined ? { connectionString } : { connectionString, max: options.max });
  if (options.onIdleError !== undefined) pool.on('error', options.onIdleError);
  const db = drizzle({ client: pool });
  return {
    db,
    close: () => pool.end(),
  };
}
