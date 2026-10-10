import { sql, type InferInsertModel, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { TransactionContext } from '../../../../kernel/index.js';

// Small helpers for the ledger's raw SQL (code-house-rules 3.4): every value a bound parameter.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A `uuid[]` parameter. Only identifiers, checked, so the array's text form needs no quoting. */
export function uuidArray(ids: Iterable<string | null>): SQL {
  const values = [...ids].map((id) => {
    if (id === null) return 'NULL';
    if (!UUID.test(id)) throw new Error('not a uuid');
    return id;
  });
  return sql`${`{${values.join(',')}}`}::uuid[]`;
}

const WORD = /^[a-z][a-z-]*$/;

/** A `text[]` parameter of lower-case words, checked, so the array's text form needs no quoting. */
export function textArray(words: Iterable<string>): SQL {
  const all = [...words];
  if (all.some((word) => !WORD.test(word))) throw new Error('not a word');
  return sql`${`{${all.join(',')}}`}::text[]`;
}

/** An `integer[]` parameter. */
export function integerArray(values: Iterable<number>): SQL {
  const all = [...values];
  if (all.some((value) => !Number.isInteger(value))) throw new Error('not an integer');
  return sql`${`{${all.join(',')}}`}::integer[]`;
}

/**
 * PostgreSQL's protocol binds at most 65,535 parameters to one statement, and the query builder builds a long
 * multi-row insert recursively, so a large document's rows (stock-ledger 10.6: a 10,000-line PT approval) are written
 * in multi-row inserts of at most this many rows, each within the parameter limit. A technical bound, no business value.
 */
const ROWS_PER_INSERT = 1000;
const MAX_PARAMETERS = 65_535;

/** Inserts the rows set-based, in as few statements as the limits above allow (stock-ledger 14.3 "Large documents"). */
export async function insertRows<T extends PgTable>(
  context: TransactionContext,
  table: T,
  rows: readonly InferInsertModel<T>[],
): Promise<void> {
  const [first] = rows;
  if (first === undefined) return;
  const columns = Math.max(1, Object.keys(first).length);
  const size = Math.max(1, Math.min(ROWS_PER_INSERT, Math.floor(MAX_PARAMETERS / columns)));
  for (let start = 0; start < rows.length; start += size) {
    await context.tx.insert(table).values(rows.slice(start, start + size));
  }
}
