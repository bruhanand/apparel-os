import { getTableColumns, type InferInsertModel } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { TransactionContext } from '../command-runner/transaction-context.js';

// Statements over many rows in parts of a bounded size (stock-ledger 10.6, 14.3 "Large documents"; code-house-rules
// 3.4; S1-F10-T07). PostgreSQL's protocol binds at most 65,535 parameters to one statement, and the query builder
// builds a long multi-row insert recursively, so a large document's rows (a 10,000-line PT approval) are written, read
// by key or updated in parts. Technical bounds, no business value.

/** The most parameters PostgreSQL's protocol binds to one statement. */
export const MAX_BOUND_PARAMETERS = 65_535;

/** The most rows or keys one statement takes, whatever the parameters allow. */
export const MAX_ROWS_PER_STATEMENT = 1000;

/** How many values one statement takes when each binds `parametersEach` parameters. */
function partSize(parametersEach: number): number {
  return Math.max(1, Math.min(MAX_ROWS_PER_STATEMENT, Math.floor(MAX_BOUND_PARAMETERS / Math.max(1, parametersEach))));
}

/**
 * The values in parts, in order, each part at most `MAX_ROWS_PER_STATEMENT` values and binding at most
 * `MAX_BOUND_PARAMETERS` parameters at `parametersEach` a value.
 */
export function partsOf<T>(values: readonly T[], parametersEach: number): T[][] {
  const size = partSize(parametersEach);
  const parts: T[][] = [];
  for (let start = 0; start < values.length; start += size) parts.push(values.slice(start, start + size));
  return parts;
}

/** The rows one multi-row insert into the table takes: bounded by the table's columns, each of which a row may bind. */
export function rowsPerInsert(table: PgTable): number {
  return partSize(Object.keys(getTableColumns(table)).length);
}

/** Inserts the rows set-based, in as few multi-row inserts as the bounds above allow, in the rows' order. */
export async function insertInParts<T extends PgTable>(
  context: TransactionContext,
  table: T,
  rows: readonly InferInsertModel<T>[],
): Promise<void> {
  const size = rowsPerInsert(table);
  for (let start = 0; start < rows.length; start += size) {
    await context.tx.insert(table).values(rows.slice(start, start + size));
  }
}
