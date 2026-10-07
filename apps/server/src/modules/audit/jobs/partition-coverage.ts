import { sql } from 'drizzle-orm';
import { CommandDefect, type StructuredLogger, type TransactionContext } from '../../../kernel/index.js';
import type { PartitionCoverage } from '../contracts.js';
import { coverageFrom, type PartitionBound } from '../domain/coverage.js';

const PARENTS = ['audit.audit_record', 'audit.access_record'] as const;

/**
 * Reads how far ahead the monthly partitions of both audit tables reach from the command's start, and logs the alert
 * when they do not cover the rest of this month and all of next month (numbering-and-audit 4.4; DEC-112, CH-5). The
 * partitions are created by restricted maintenance under the migration role (audit.ensure_partitions), never by the
 * runtime; this only reads the catalogue. An insert with no partition fails its command, so no audit record is ever
 * silently dropped.
 */
export async function checkPartitionCoverage(
  context: TransactionContext,
  logger: StructuredLogger,
): Promise<PartitionCoverage> {
  const result = await context.tx.execute<{ parent: string; lower: Date | string; upper: Date | string }>(sql`
    select i.inhparent::regclass::text as parent,
      substring(pg_catalog.pg_get_expr(c.relpartbound, c.oid) from 'FROM \\(''([^'']+)''\\)')::timestamptz as lower,
      substring(pg_catalog.pg_get_expr(c.relpartbound, c.oid) from 'TO \\(''([^'']+)''\\)')::timestamptz as upper
    from pg_catalog.pg_inherits i join pg_catalog.pg_class c on c.oid = i.inhrelid
    where i.inhparent in ('audit.audit_record'::regclass, 'audit.access_record'::regclass)`);
  const bounds: PartitionBound[] = result.rows.map((row) => ({
    parent: row.parent,
    lower: new Date(row.lower),
    upper: new Date(row.upper),
  }));
  const coverage = coverageFrom(PARENTS, bounds, context.startedAt);
  if (!coverage.coversNextMonth) {
    logger.structured(
      'error',
      {
        correlationId: context.correlationId,
        organisationCode: context.organisationCode,
        alert: 'audit-partitions-short',
        coveredUntil: coverage.coveredUntil?.toISOString() ?? null,
      },
      'The audit partitions do not cover next month; run the restricted maintenance (numbering-and-audit 4.4)',
      'Audit',
    );
  }
  return coverage;
}

/**
 * The scheduled partition upkeep's step (numbering-and-audit 4.4; code-house-rules 12.9; DEC-118, RR-240). Calls
 * audit.ensure_partitions, which runs with the migration role's rights as SECURITY DEFINER and only creates the
 * missing monthly partitions of the coming months: it never drops, detaches or deletes a partition or a row. Returns
 * how many partitions both tables have afterwards. A failure logs `audit-partitions-upkeep-failed` and is thrown, so
 * the job fails and stays failed and visible (PRD-SEC-013); the coverage check raises its own alert independently.
 */
export async function ensurePartitions(context: TransactionContext, logger: StructuredLogger): Promise<number> {
  if (context.readOnly) throw new CommandDefect('The partition upkeep is a command, never a read');
  try {
    await context.tx.execute(sql`select audit.ensure_partitions()`);
  } catch (error) {
    logger.structured(
      'error',
      {
        correlationId: context.correlationId,
        organisationCode: context.organisationCode,
        alert: 'audit-partitions-upkeep-failed',
        error: error instanceof Error ? error.name : 'unknown',
      },
      'The audit partition upkeep failed; nothing was deleted (numbering-and-audit 4.4)',
      'Audit',
    );
    throw error;
  }
  const result = await context.tx.execute<{ partitions: string }>(sql`
    select pg_catalog.count(*)::text as partitions from pg_catalog.pg_inherits i
    where i.inhparent in ('audit.audit_record'::regclass, 'audit.access_record'::regclass)`);
  return Number(result.rows[0]?.partitions ?? '0');
}
