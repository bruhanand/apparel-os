import { uuidv7 } from '@apparel-os/domain';
import { asc, desc, eq, sql } from 'drizzle-orm';
import {
  EXCLUSION_VIOLATION,
  UNIQUE_VIOLATION,
  withSavepoint,
  type TransactionContext,
} from '../../../kernel/index.js';
import { financialYear, kindFormat, numberFormat, numberFormatPart, numberFormatVersion } from '../db/schema.js';
import type { FormatPart } from '../domain/format.js';
import { answered, refused, type NumberedKind, type NumberingResult } from '../domain/kinds.js';

// The two Organisation settings numbering keeps for the series it serves (numbering-and-audit 3.3, 3.5; module-map
// 4.6; code-house-rules 12.14; S1-F12-T01): the financial years and the format each declared kind's new series take.
// Neither has a default: the financial year's dates are OPEN (GC5-1, RR-060) and the bill-number format is OPEN (V-40,
// RR-101; POL-10.07). The owning module has authorised the change; tests use labelled synthetic values. A year is
// found by an explicit business date (PRD-MOD-009); years never overlap, and a series keeps the format version and
// the year it was defined with (PRD-MOD-010).

/** Where a setting's value came from (code-house-rules 12.14). */
export type SettingOrigin = 'kdps' | 'test-setup' | 'synthetic';

/** A financial year as defined: its label and its first and last day, as `YYYY-MM-DD` (3.3). */
export interface FinancialYearDraft {
  readonly label: string;
  readonly firstDay: string;
  readonly lastDay: string;
  readonly origin: SettingOrigin;
}

/** A financial year read for a date: its label, which yearly series name, and the record's identifier (PRD-MOD-010). */
export type FinancialYearRead =
  { readonly kind: 'set'; readonly label: string; readonly financialYearId: string } | { readonly kind: 'not-set' };

/** The format in force for a kind: its code, or not set (3.5; code-house-rules 12.14). */
export type KindFormatRead =
  { readonly kind: 'set'; readonly formatCode: string; readonly kindFormatId: string } | { readonly kind: 'not-set' };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Define a financial year (3.3): refused when its label is empty or taken, when its last day is before its first, or
 * when it overlaps a year already defined (the exclusion constraint is the backstop).
 */
export async function defineFinancialYear(
  context: TransactionContext,
  draft: FinancialYearDraft,
): Promise<NumberingResult<{ readonly financialYearId: string }>> {
  if (draft.label.trim() === '' || !DAY.test(draft.firstDay) || !DAY.test(draft.lastDay)) {
    return refused('financial-year-invalid');
  }
  if (draft.lastDay < draft.firstDay) return refused('financial-year-invalid');
  const range = sql`daterange(${draft.firstDay}::date, ${draft.lastDay}::date, '[]')`;
  const [taken] = await context.tx
    .select({ id: financialYear.id })
    .from(financialYear)
    .where(eq(financialYear.label, draft.label));
  if (taken !== undefined) return refused('financial-year-label-taken');
  const [overlapping] = await context.tx
    .select({ id: financialYear.id })
    .from(financialYear)
    .where(sql`${financialYear.dates} && ${range}`);
  if (overlapping !== undefined) return refused('financial-year-overlaps');
  const id = uuidv7();
  // Two approvals at once meet the unique label or the exclusion constraint, which answer as the checks above would
  // (code-house-rules 8.1; S1-F12-T03).
  const written = await withSavepoint(context, 'financial_year', [UNIQUE_VIOLATION, EXCLUSION_VIOLATION], () =>
    context.tx.execute(sql`
      insert into numbering.financial_year (id, label, dates, origin)
      values (${id}, ${draft.label}, ${range}, ${draft.origin})`),
  );
  if (written.kind === 'caught') {
    return refused(
      written.violation.sqlState === UNIQUE_VIOLATION ? 'financial-year-label-taken' : 'financial-year-overlaps',
    );
  }
  return answered({ financialYearId: id });
}

/** A financial year as defined, with its dates and origin (3.3), for the screen that shows them. */
export interface FinancialYearDefined {
  readonly financialYearId: string;
  readonly label: string;
  readonly firstDay: string;
  readonly lastDay: string;
  readonly origin: SettingOrigin;
}

/** Every financial year defined, in date order (3.3; S1-F12-T03). */
export async function financialYears(context: TransactionContext): Promise<FinancialYearDefined[]> {
  const rows = await context.tx
    .select({
      financialYearId: financialYear.id,
      label: financialYear.label,
      firstDay: sql<string>`lower(${financialYear.dates})::text`,
      lastDay: sql<string>`(upper(${financialYear.dates}) - 1)::text`,
      origin: financialYear.origin,
    })
    .from(financialYear)
    .orderBy(sql`lower(${financialYear.dates})`);
  return rows;
}

/** The financial year a business date falls in (3.3; PRD-MOD-009), or not set while none is defined for it. */
export async function financialYearOn(context: TransactionContext, date: string): Promise<FinancialYearRead> {
  const [row] = await context.tx
    .select({ id: financialYear.id, label: financialYear.label })
    .from(financialYear)
    .where(sql`${financialYear.dates} @> ${date}::date`);
  return row === undefined ? { kind: 'not-set' } : { kind: 'set', label: row.label, financialYearId: row.id };
}

/**
 * Set the format a declared kind's new series take (3.5): refused for a kind no module declares or a format that does
 * not exist. Series already defined keep the format version they were defined with.
 */
export async function setKindFormat(
  context: TransactionContext,
  kinds: ReadonlyMap<string, NumberedKind>,
  kind: string,
  formatCode: string,
  origin: SettingOrigin,
): Promise<NumberingResult<{ readonly kindFormatId: string }>> {
  if (!kinds.has(kind)) return refused('kind-not-declared');
  const [format] = await context.tx
    .select({ id: numberFormat.id })
    .from(numberFormat)
    .where(eq(numberFormat.code, formatCode));
  if (format === undefined) return refused('format-not-found');
  const id = uuidv7();
  await context.tx.insert(kindFormat).values({ id, kind, numberFormatId: format.id, origin });
  return answered({ kindFormatId: id });
}

/** The format in force for a kind: the latest one set (3.5), or not set. */
export async function kindFormatOf(context: TransactionContext, kind: string): Promise<KindFormatRead> {
  const [row] = await context.tx
    .select({ id: kindFormat.id, code: numberFormat.code })
    .from(kindFormat)
    .innerJoin(numberFormat, eq(numberFormat.id, kindFormat.numberFormatId))
    .where(eq(kindFormat.kind, kind))
    .orderBy(desc(kindFormat.id))
    .limit(1);
  return row === undefined ? { kind: 'not-set' } : { kind: 'set', formatCode: row.code, kindFormatId: row.id };
}

/** The format in force for a kind with the parts of its latest version and its origin, or not set (3.5; S1-F12-T03). */
export type KindFormatDetail =
  | {
      readonly kind: 'set';
      readonly formatCode: string;
      readonly parts: FormatPart[];
      readonly origin: SettingOrigin;
    }
  | { readonly kind: 'not-set' };

export async function kindFormatDetail(context: TransactionContext, kind: string): Promise<KindFormatDetail> {
  const [row] = await context.tx
    .select({ code: numberFormat.code, formatId: numberFormat.id, origin: kindFormat.origin })
    .from(kindFormat)
    .innerJoin(numberFormat, eq(numberFormat.id, kindFormat.numberFormatId))
    .where(eq(kindFormat.kind, kind))
    .orderBy(desc(kindFormat.id))
    .limit(1);
  if (row === undefined) return { kind: 'not-set' };
  const [version] = await context.tx
    .select({ id: numberFormatVersion.id })
    .from(numberFormatVersion)
    .where(eq(numberFormatVersion.numberFormatId, row.formatId))
    .orderBy(desc(numberFormatVersion.version))
    .limit(1);
  const parts =
    version === undefined
      ? []
      : await context.tx
          .select({ kind: numberFormatPart.kind, text: numberFormatPart.text, width: numberFormatPart.width })
          .from(numberFormatPart)
          .where(eq(numberFormatPart.numberFormatVersionId, version.id))
          .orderBy(asc(numberFormatPart.position));
  return {
    kind: 'set',
    formatCode: row.code,
    origin: row.origin,
    parts: parts.map((part): FormatPart => {
      if (part.kind === 'text') return { kind: 'text', text: part.text ?? '' };
      if (part.kind === 'sequence') return { kind: 'sequence', width: part.width ?? 0 };
      return { kind: part.kind === 'scope' ? 'scope' : 'year' };
    }),
  };
}

/** Whether a format of the code exists, for any kind (3.5; S1-F12-T03). */
export async function formatExists(context: TransactionContext, code: string): Promise<boolean> {
  const [row] = await context.tx.select({ id: numberFormat.id }).from(numberFormat).where(eq(numberFormat.code, code));
  return row !== undefined;
}
