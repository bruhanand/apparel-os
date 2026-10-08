import { uuidv7 } from '@apparel-os/domain';
import { desc, eq, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { numberFormat, numberFormatVersion, seriesEvent } from '../db/schema.js';
import { checkFormat, couldRepeat, patternOf } from '../domain/format.js';
import { answered, refused, type NumberedKind, type NumberingResult } from '../domain/kinds.js';
import { liveSeries, partsOf, seriesInDisplayScope, seriesPattern, type SeriesState } from '../queries/series.js';

/** What the owning module supplies to define a series, after validating its scope (numbering-and-audit 3.1, 3.7). */
export interface SeriesDefinition {
  readonly kind: string;
  /** Opaque: what it stands for is the kind's declaration. */
  readonly scopeKey: string;
  /** For a yearly kind only: the financial year the series serves (3.3). */
  readonly financialYear?: string;
  /** Opaque: the display scope its texts are unique in, without the year (3.5). */
  readonly displayScopeKey: string;
  /** The text the format's scope part shows, such as the device code (3.5). */
  readonly scopeText?: string;
  /** The format; the series takes its latest version and keeps it for life (3.5). */
  readonly formatCode: string;
}

/**
 * Define a series (numbering-and-audit 3.7): refused while an open or paused series exists for the same kind, scope key
 * and year (PRD-POS-020, PRD-OFF-002), and when its format could give a text another series of its display scope can
 * give, closed series included, since a number is never reused (3.5; PRD-MOD-008, PRD-ACP-019). The live series'
 * unique index decides two definitions at once: the second waits for the first and is refused.
 */
export async function defineSeries(
  context: TransactionContext,
  kinds: ReadonlyMap<string, NumberedKind>,
  definition: SeriesDefinition,
): Promise<NumberingResult<SeriesState>> {
  const kind = kinds.get(definition.kind);
  if (kind === undefined) return refused('kind-not-declared');
  const year = definition.financialYear;
  if (kind.yearly !== (year !== undefined) || year === '') return refused('financial-year-mismatch');
  if (definition.scopeKey === '' || definition.displayScopeKey === '' || definition.scopeText === '') {
    return refused('invalid-series');
  }
  const format = (
    await context.tx
      .select({ versionId: numberFormatVersion.id })
      .from(numberFormatVersion)
      .innerJoin(numberFormat, eq(numberFormat.id, numberFormatVersion.numberFormatId))
      .where(eq(numberFormat.code, definition.formatCode))
      .orderBy(desc(numberFormatVersion.version))
      .limit(1)
  )[0];
  if (format === undefined) return refused('format-not-found');
  const parts = (await partsOf(context, [format.versionId])).get(format.versionId) ?? [];
  const formatRefusal = checkFormat(parts, kind);
  if (formatRefusal !== undefined)
    return refused(formatRefusal === 'numbering.format-invalid' ? 'format-invalid' : 'format-not-for-kind');
  if (parts.some((part) => part.kind === 'scope') && definition.scopeText === undefined) {
    return refused('scope-text-missing');
  }

  const key = {
    kind: definition.kind,
    scopeKey: definition.scopeKey,
    ...(year === undefined ? {} : { financialYear: year }),
  };
  if ((await liveSeries(context, key)) !== undefined) return refused('live-series-exists');

  // Its texts must never meet those of another series in its display scope (3.5). Two definitions at once in one
  // display scope are not serialised here; the allocation's unique text in its display scope is the backstop (6.1).
  const displayYear = kind.displayScope.perYear && year !== undefined ? year : '';
  const pattern = patternOf(parts, {
    ...(definition.scopeText === undefined ? {} : { scopeText: definition.scopeText }),
    ...(year === undefined ? {} : { financialYear: year }),
  });
  const others = await seriesInDisplayScope(context, definition.kind, definition.displayScopeKey, displayYear);
  const otherParts = await partsOf(context, [...new Set(others.map((row) => row.numberFormatVersionId))]);
  for (const other of others) {
    // A live series of the same kind, scope and year committed since the check above is still that refusal.
    if (other.state !== 'Closed' && other.scopeKey === definition.scopeKey && other.financialYear === (year ?? null)) {
      return refused('live-series-exists');
    }
    if (couldRepeat(pattern, seriesPattern(other, otherParts.get(other.numberFormatVersionId) ?? []))) {
      return refused('format-could-repeat');
    }
  }

  const id = uuidv7();
  const inserted = await context.tx.execute<{ id: string }>(sql`
    insert into numbering.series (id, kind, scope_key, financial_year, display_scope_key, display_year, scope_text,
      number_format_version_id, state, next_sequence)
    values (${id}, ${definition.kind}, ${definition.scopeKey}, ${year ?? null}, ${definition.displayScopeKey},
      ${displayYear}, ${definition.scopeText ?? null}, ${format.versionId}, 'Open', 1)
    on conflict (kind, scope_key, financial_year) where state in ('Open', 'Paused') do nothing
    returning id`);
  if (inserted.rows.length === 0) return refused('live-series-exists');
  await context.tx
    .insert(seriesEvent)
    .values({ id: uuidv7(), seriesId: id, event: 'defined', occurredAt: context.startedAt });
  return answered({
    seriesId: id,
    kind: definition.kind,
    scopeKey: definition.scopeKey,
    financialYear: year ?? null,
    state: 'Open',
    nextSequence: 1,
  });
}
