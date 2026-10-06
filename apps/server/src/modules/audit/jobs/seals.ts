import { uuidv7 } from '@apparel-os/domain';
import { sql } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { SealProblem } from '../contracts.js';

/**
 * The sealing job's step (numbering-and-audit 4.4; PRD-SEC-007). Seals the block of audit and access records closed
 * so far, chained to the previous seal, and returns its number, or null when no row waits to be sealed.
 *
 * A row is recorded at its transaction's start (code-house-rules 9), so a transaction still open can add rows dated
 * back to when it began. The block therefore ends at the start of the oldest other transaction open in this
 * database, or at this transaction's own start when none is older: no row can still arrive before that. The open
 * transactions are read from pg_stat_activity as the runtime role, which sees the start of every session of its own
 * role, and every row is written as the runtime role. audit.seal_block runs as the owner, so it sees every row whatever
 * the job's scope; sealers take turns on the seal table.
 *
 * Sealing after the fact keeps business transactions free of a shared lock. The job is scheduled by the worker
 * (S1-F01-T06), under an internal service identity (access-and-approvals 2.3).
 */
export async function sealClosedBlock(context: TransactionContext): Promise<number | null> {
  if (context.readOnly) throw new CommandDefect('Sealing is a command, never a read');
  const result = await context.tx.execute<{ block_number: string | null }>(sql`
    select audit.seal_block(${uuidv7()}::uuid, (
      select least(pg_catalog.now(), pg_catalog.min(a.xact_start))
      from pg_catalog.pg_stat_activity a
      where a.datname = pg_catalog.current_database()
        and a.pid <> pg_catalog.pg_backend_pid()
        and a.xact_start is not null
    ))::text as block_number`);
  const blockNumber = result.rows[0]?.block_number ?? null;
  return blockNumber === null ? null : Number(blockNumber);
}

/** The seal check: recomputes the chain and returns every difference, naming blocks only (numbering-and-audit 4.4). */
export async function checkSeals(context: TransactionContext): Promise<readonly SealProblem[]> {
  const result = await context.tx.execute<{ block_number: string; problem: SealProblem['problem'] }>(
    sql`select block_number::text as block_number, problem from audit.check_seals() order by block_number, problem`,
  );
  return result.rows.map((row) => ({ blockNumber: Number(row.block_number), problem: row.problem }));
}
