import type { QueryResult } from 'pg';
import { PgBoss, type Db } from 'pg-boss';
import type { StructuredLogger } from '../logging/pino-logger.service.js';
import type { RoutedOrganisation } from '../routing/organisation-router.js';

/** pg-boss's schema in each Organisation database (code-house-rules 3.2). */
export const JOB_SCHEMA = 'pgboss';

/**
 * What every job keeps until the retention periods of CH-9 are set (code-house-rules 12.9, CH-9): pg-boss deletes
 * nothing. `deleteAfterSeconds` 0 is pg-boss's "never" for a completed, cancelled or failed job, so a failed job is
 * never removed before an operator has dealt with it. `retentionSeconds`, how long a job may wait before pg-boss
 * deletes it unrun, has no "never" in pg-boss, so it is the largest value its integer column holds. The queues of
 * migration 0009 hold the same.
 */
export const KEEP_EVERY_JOB = { deleteAfterSeconds: 0, retentionSeconds: 2_147_483_647 } as const;

/**
 * One pg-boss instance for one Organisation database, on that database's pool, as the runtime role
 * (code-house-rules 12.9: one instance per database the directory lists). It never installs or migrates its schema
 * and creates no queue, which migrations do (3.2); it never reindexes, which needs the owner. Its warnings go to the
 * service log, without the job's data (12.11).
 */
export async function startJobQueue(
  organisation: RoutedOrganisation,
  logger: StructuredLogger,
  service: string,
): Promise<PgBoss> {
  const pool = organisation.db.$client;
  const db: Db = {
    executeSql: async (text, values) => {
      // A text of several statements answers one result each; pg-boss reads their rows together, as its own pool
      // does.
      const result = (await pool.query(text, values)) as QueryResult | QueryResult[];
      const rows: unknown[] = Array.isArray(result) ? result.flatMap((each): unknown[] => each.rows) : result.rows;
      return { rows };
    },
  };
  const boss = new PgBoss({
    db,
    schema: JOB_SCHEMA,
    migrate: false,
    createSchema: false,
    schedule: false,
    reindex: false,
    persistWarnings: false,
    persistQueueStats: false,
  });
  boss.on('error', (error: Error) => {
    logger.structured(
      'error',
      { service, organisationCode: organisation.organisationCode, error: error.name },
      'The job queue reported an error',
      'JobQueue',
    );
  });
  boss.on('warning', (warning: { message?: string }) => {
    logger.structured(
      'warn',
      { service, organisationCode: organisation.organisationCode },
      `The job queue warned: ${warning.message ?? 'no message'}`,
      'JobQueue',
    );
  });
  await boss.start();
  return boss;
}
