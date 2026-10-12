import { uuidv7 } from '@apparel-os/domain';
import { desc, eq, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { financialYear, kindFormat, numberFormat } from '../db/schema.js';
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
  await context.tx.execute(sql`
    insert into numbering.financial_year (id, label, dates, origin)
    values (${id}, ${draft.label}, ${range}, ${draft.origin})`);
  return answered({ financialYearId: id });
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
