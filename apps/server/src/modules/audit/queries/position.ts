import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { HistoryPosition } from '../contracts.js';

/**
 * A row's recording time as UTC text to the microsecond, the precision PostgreSQL keeps, so a cursor made from it
 * finds the exact row again (code-house-rules 12.1 "Reads": paged by a cursor, never an offset).
 */
export function positionTime(recordedAt: AnyPgColumn): SQL<string> {
  return sql<string>`to_char(${recordedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

/** Rows strictly after (`>`) or before (`<`) a position, in recording-time and identifier order. */
export function beyond(recordedAt: AnyPgColumn, id: AnyPgColumn, direction: '>' | '<', position: HistoryPosition): SQL {
  const operator = sql.raw(direction);
  return sql`(${recordedAt}, ${id}) ${operator} (${position.recordedAt}::timestamptz, ${position.id}::uuid)`;
}
