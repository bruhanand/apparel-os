import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { numberFormatPart, series } from '../db/schema.js';
import { patternOf, type FormatPart, type SeriesPattern } from '../domain/format.js';

// Reads of series (numbering-and-audit 3.7 "Read series state"). Only numbering code reads its tables.

/** A series as its owner sees it: its identity, state, financial year and next sequence number (PRD-OFF-012). */
export interface SeriesState {
  readonly seriesId: string;
  readonly kind: string;
  readonly scopeKey: string;
  /** The financial year of a yearly kind's series; null for a kind that never restarts. */
  readonly financialYear: string | null;
  readonly state: 'Open' | 'Paused' | 'Closed';
  readonly nextSequence: number;
}

/** What a live series is found by: its kind, scope key and, for a yearly kind, financial year (3.1). */
export interface SeriesKey {
  readonly kind: string;
  readonly scopeKey: string;
  readonly financialYear?: string;
}

type SeriesRow = typeof series.$inferSelect;

export function stateOf(row: SeriesRow): SeriesState {
  return {
    seriesId: row.id,
    kind: row.kind,
    scopeKey: row.scopeKey,
    financialYear: row.financialYear,
    state: row.state as SeriesState['state'],
    nextSequence: row.nextSequence,
  };
}

export async function seriesRow(context: TransactionContext, seriesId: string): Promise<SeriesRow | undefined> {
  return (await context.tx.select().from(series).where(eq(series.id, seriesId)))[0];
}

/** The open or paused series of a kind, scope and year, if one exists (3.1). */
export async function liveSeries(context: TransactionContext, key: SeriesKey): Promise<SeriesState | undefined> {
  const rows = await context.tx
    .select()
    .from(series)
    .where(
      and(
        eq(series.kind, key.kind),
        eq(series.scopeKey, key.scopeKey),
        key.financialYear === undefined ? isNull(series.financialYear) : eq(series.financialYear, key.financialYear),
        inArray(series.state, ['Open', 'Paused']),
      ),
    );
  const row = rows[0];
  return row === undefined ? undefined : stateOf(row);
}

/** The parts of format versions, in order, by version. */
export async function partsOf(
  context: TransactionContext,
  versionIds: readonly string[],
): Promise<Map<string, FormatPart[]>> {
  const parts = new Map<string, FormatPart[]>();
  if (versionIds.length === 0) return parts;
  const rows = await context.tx
    .select()
    .from(numberFormatPart)
    .where(inArray(numberFormatPart.numberFormatVersionId, [...versionIds]))
    .orderBy(asc(numberFormatPart.numberFormatVersionId), asc(numberFormatPart.position));
  for (const row of rows) {
    const list = parts.get(row.numberFormatVersionId) ?? [];
    list.push(partOf(row));
    parts.set(row.numberFormatVersionId, list);
  }
  return parts;
}

function partOf(row: typeof numberFormatPart.$inferSelect): FormatPart {
  switch (row.kind) {
    case 'text':
      return { kind: 'text', text: row.text ?? '' };
    case 'scope':
      return { kind: 'scope' };
    case 'year':
      return { kind: 'year' };
    default:
      return { kind: 'sequence', width: row.width ?? 0 };
  }
}

/** The pattern of a series' texts under the format version it keeps for life (3.5). */
export function seriesPattern(row: SeriesRow, parts: readonly FormatPart[]): SeriesPattern {
  return patternOf(parts, {
    ...(row.scopeText === null ? {} : { scopeText: row.scopeText }),
    ...(row.financialYear === null ? {} : { financialYear: row.financialYear }),
  });
}

/** Every series, of any state, in one display scope: the series a new one's texts must never meet (3.5). */
export async function seriesInDisplayScope(
  context: TransactionContext,
  kind: string,
  displayScopeKey: string,
  displayYear: string,
): Promise<SeriesRow[]> {
  return context.tx
    .select()
    .from(series)
    .where(
      and(eq(series.kind, kind), eq(series.displayScopeKey, displayScopeKey), eq(series.displayYear, displayYear)),
    );
}
