import { sql, type SQL } from 'drizzle-orm';

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

/** An `integer[]` parameter. */
export function integerArray(values: Iterable<number>): SQL {
  const all = [...values];
  if (all.some((value) => !Number.isInteger(value))) throw new Error('not an integer');
  return sql`${`{${all.join(',')}}`}::integer[]`;
}
