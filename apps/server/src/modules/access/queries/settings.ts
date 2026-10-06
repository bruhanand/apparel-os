import { and, eq, sql } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import { setting, settingVersion } from '../db/schema.js';
import { SETTING_FORMATS, SETTING_SCHEMAS, type AccessSettingKey } from '../domain/sign-in-rules.js';
import type { z } from 'zod';

/**
 * A setting as read for a date: its Approved version in force, with the version's identifier, which the command
 * stores, or "not set" as an answer of its own (code-house-rules 12.14; PRD-MOD-010, PRD-MOD-015).
 */
export type SettingRead<T> =
  { readonly kind: 'set'; readonly value: T; readonly versionId: string } | { readonly kind: 'not-set' };

/** Reads a setting of access in force on a business date. A value its format's schema refuses is a defect. */
export async function readSetting<K extends AccessSettingKey>(
  context: TransactionContext,
  key: K,
  businessDate: string,
): Promise<SettingRead<z.output<(typeof SETTING_SCHEMAS)[K]>>> {
  const rows = await context.tx
    .select({ id: settingVersion.id, value: settingVersion.value, valueFormat: settingVersion.valueFormat })
    .from(settingVersion)
    .innerJoin(setting, eq(setting.id, settingVersion.settingId))
    .where(
      and(
        eq(setting.settingKey, key),
        eq(settingVersion.decision, 'Approved'),
        sql`${settingVersion.validDuring} @> ${businessDate}::date`,
      ),
    );
  const row = rows[0];
  if (row === undefined) return { kind: 'not-set' };
  if (row.valueFormat !== SETTING_FORMATS[key]) {
    throw new CommandDefect(`Setting ${key} holds a value of a format this server does not read`);
  }
  const parsed = SETTING_SCHEMAS[key].safeParse(row.value);
  if (!parsed.success) throw new CommandDefect(`Setting ${key} holds a value its format's schema refuses`);
  return { kind: 'set', value: parsed.data as z.output<(typeof SETTING_SCHEMAS)[K]>, versionId: row.id };
}
