import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { MAX_BOUND_PARAMETERS, MAX_ROWS_PER_STATEMENT, partsOf, rowsPerInsert } from './in-parts.js';

const narrow = pgTable('narrow', { id: uuid('id').primaryKey(), note: text('note') });
const wide = pgTable(
  'wide',
  Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`c${String(index)}`, integer(`c${String(index)}`)])),
);

describe('partsOf', () => {
  it('splits values into parts within the row and parameter bounds, keeping their order', () => {
    const values = Array.from({ length: 2_500 }, (_, index) => index);
    const parts = partsOf(values, 1);
    expect(parts.map((part) => part.length)).toEqual([MAX_ROWS_PER_STATEMENT, MAX_ROWS_PER_STATEMENT, 500]);
    expect(parts.flat()).toEqual(values);
  });

  it('bounds a part by the parameters each value binds', () => {
    const parts = partsOf(
      Array.from({ length: 2_000 }, () => 0),
      200,
    );
    const size = Math.floor(MAX_BOUND_PARAMETERS / 200);
    expect(parts[0]).toHaveLength(size);
    expect(parts.every((part) => part.length * 200 <= MAX_BOUND_PARAMETERS)).toBe(true);
  });

  it('answers no part for no value', () => {
    expect(partsOf([], 3)).toEqual([]);
  });
});

describe('rowsPerInsert', () => {
  it("bounds an insert by the table's column count, not by the keys of any row", () => {
    expect(rowsPerInsert(narrow)).toBe(MAX_ROWS_PER_STATEMENT);
    expect(rowsPerInsert(wide)).toBe(Math.floor(MAX_BOUND_PARAMETERS / 100));
  });
});
