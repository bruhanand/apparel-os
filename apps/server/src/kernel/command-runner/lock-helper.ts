import { sql } from 'drizzle-orm';
import type { Transaction } from './transaction-context.js';

/**
 * The steps of stock-ledger 10.3, in the order every transaction takes its row locks (code-house-rules 8.2;
 * PRD-INT-003). A command that changes no stock or money locks its authority rows at step 0, its own record rows at
 * step 1 and any number series at step 8. A later module's rows take the step its design names, and stock-ledger 10.3
 * is updated then (module-map 6.1).
 */
export const LOCK_STEP = {
  authority: 0,
  document: 1,
  receiptOrigin: 2,
  balance: 3,
  piece: 4,
  holdAndReservation: 5,
  costPoolAndDispatchValue: 6,
  financialPeriod: 7,
  numberSeries: 8,
} as const;

export type LockStep = (typeof LOCK_STEP)[keyof typeof LOCK_STEP];

/**
 * `exclusive` is `FOR NO KEY UPDATE`, never `FOR UPDATE`, so foreign-key checks stay free; `shared` is `FOR SHARE`,
 * where the step says so, such as the authority rows a command relies on and the financial period row
 * (code-house-rules 8.2).
 */
export type LockMode = 'exclusive' | 'shared';

/** A table whose rows a command may lock. Its register entry is marked `locked` (code-house-rules 3.2, 5.2). */
export interface LockTable {
  readonly schema: string;
  readonly table: string;
}

/**
 * One row to lock. A module whose rows another command locks offers them through its interface as lock targets, and
 * the command passes every target of a step to the helper in one call (code-house-rules 8.2).
 */
export interface LockTarget {
  readonly table: LockTable;
  readonly id: string;
  readonly mode: LockMode;
}

/** What one call locked. A row missing here does not exist or is not visible to the actor; the command decides. */
export interface LockResult {
  readonly locked: readonly LockTarget[];
  readonly missing: readonly LockTarget[];
}

/** One `SELECT … ORDER BY id FOR …` over a run of consecutive rows of one table in one mode. */
export interface LockRun {
  readonly table: LockTable;
  readonly mode: LockMode;
  readonly ids: readonly string[];
}

const LOCK_MODES: readonly string[] = ['exclusive', 'shared'] satisfies readonly LockMode[];
const NAME = /^[a-z][a-z0-9_]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Names a lockable table. Names are lower-case snake_case (code-house-rules 3.2), so they need no quoting rules. */
export function lockTable(schema: string, table: string): LockTable {
  if (!NAME.test(schema) || !NAME.test(table)) {
    throw new Error('A lock table is named by a lower-case snake_case schema and table');
  }
  return { schema, table };
}

/**
 * Orders the targets of one step: every row in ascending identifier order across the whole step, which is
 * PostgreSQL's order for `uuid` (byte order, the order of the lower-case text form), then each run of consecutive
 * rows of one table in one mode as one statement (code-house-rules 8.2). A row named twice is locked once; named in
 * both modes, it is locked exclusively.
 */
export function planLockRuns(targets: readonly LockTarget[]): LockRun[] {
  const rows = new Map<string, { table: LockTable; id: string; mode: LockMode }>();
  for (const target of targets) {
    const table = lockTable(target.table.schema, target.table.table);
    const id = target.id.toLowerCase();
    if (!UUID.test(id)) throw new Error('A lock target is named by its UUID');
    // Checked at run time too: a target may come from another module's interface.
    if (!LOCK_MODES.includes(target.mode)) throw new Error('A lock mode is exclusive or shared');
    const key = `${id} ${table.schema}.${table.table}`;
    const known = rows.get(key);
    const mode = known?.mode === 'exclusive' ? 'exclusive' : target.mode;
    rows.set(key, { table, id, mode });
  }
  const ordered = [...rows.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, row]) => row);

  const runs: { table: LockTable; mode: LockMode; ids: string[] }[] = [];
  for (const row of ordered) {
    const last = runs.at(-1);
    if (last?.mode === row.mode && last.table.schema === row.table.schema && last.table.table === row.table.table) {
      last.ids.push(row.id);
    } else {
      runs.push({ table: row.table, mode: row.mode, ids: [row.id] });
    }
  }
  return runs;
}

/** Takes the locks of one step, run by run, in the planned order, and says which rows it found. */
export async function takeLocks(tx: Transaction, targets: readonly LockTarget[]): Promise<LockResult> {
  const locked: LockTarget[] = [];
  const missing: LockTarget[] = [];
  for (const run of planLockRuns(targets)) {
    // PostgreSQL sorts the rows, then locks them in that order (code-house-rules 8.2). Bound parameters only.
    const ids = sql.join(
      run.ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const strength = run.mode === 'exclusive' ? sql`for no key update` : sql`for share`;
    const result = await tx.execute<{ id: string }>(
      sql`select id from ${sql.identifier(run.table.schema)}.${sql.identifier(run.table.table)} where id in (${ids}) order by id ${strength}`,
    );
    const found = new Set(result.rows.map((row) => row.id));
    for (const id of run.ids) {
      (found.has(id) ? locked : missing).push({ table: run.table, id, mode: run.mode });
    }
  }
  return { locked, missing };
}
