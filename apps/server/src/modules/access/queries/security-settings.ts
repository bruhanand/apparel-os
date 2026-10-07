import { securitySettingsSchema, type SecuritySettingKey, type SecuritySettings } from '@apparel-os/schemas';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import { setting, settingVersion } from '../db/schema.js';
import { SETTING_FORMATS } from '../domain/sign-in-rules.js';

/** The essential security settings, in the order the form shows them (design-language 10.19). */
const KEYS: readonly SecuritySettingKey[] = [
  'access.sign-in-throttling',
  'access.password-rules',
  'access.office-session-limits',
];

/** An instant as the API writes it: ISO 8601 in UTC with milliseconds (code-house-rules 9). */
export const INSTANT_TEXT = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

/**
 * Every essential security setting with its versions, newest first, and the one in force now (access-and-approvals
 * 3.3; design-language 10.19; S1-F01-T25). A setting with no row is never set (code-house-rules 12.14). Each value is
 * read through its format's schema; a format this server does not read, or a value its schema refuses, is a defect.
 */
export async function securitySettings(context: TransactionContext): Promise<SecuritySettings> {
  const now = context.startedAt.toISOString();
  const instantText = sql.raw(INSTANT_TEXT);
  const rows = await context.tx
    .select({
      settingId: setting.id,
      key: setting.settingKey,
      id: settingVersion.id,
      value: settingVersion.value,
      valueFormat: settingVersion.valueFormat,
      origin: settingVersion.origin,
      decision: settingVersion.decision,
      startsOn: settingVersion.startsOn,
      validFrom: sql<string>`to_char(lower(${settingVersion.validDuring}) at time zone 'UTC', ${instantText})`,
      validTo: sql<string | null>`to_char(upper(${settingVersion.validDuring}) at time zone 'UTC', ${instantText})`,
      inForce: sql<boolean>`${settingVersion.decision} = 'Approved' and ${settingVersion.validDuring} @> ${now}::timestamptz`,
    })
    .from(settingVersion)
    .innerJoin(setting, eq(setting.id, settingVersion.settingId))
    .orderBy(asc(setting.settingKey), desc(settingVersion.recordedAt), desc(settingVersion.id));
  const settings = KEYS.map((key) => {
    const own = rows.filter((row) => row.key === key);
    return {
      setting: key,
      settingId: own[0]?.settingId ?? null,
      inForceVersionId: own.find((row) => row.inForce)?.id ?? null,
      versions: own.map((row) => {
        if (row.valueFormat !== SETTING_FORMATS[key]) {
          throw new CommandDefect(`Setting ${key} holds a value of a format this server does not read`);
        }
        const approved = row.decision === 'Approved';
        return {
          id: row.id,
          value: row.value,
          origin: row.origin,
          decision: row.decision,
          takesEffect: row.startsOn === null ? { kind: 'at-decision' } : { kind: 'from-date', date: row.startsOn },
          ...(approved ? { validFrom: row.validFrom } : {}),
          ...(approved && row.validTo !== null ? { validTo: row.validTo } : {}),
        };
      }),
    };
  });
  // Built through the answer's schema: each value is checked against its own setting's schema (SETTING_SCHEMAS).
  const built = securitySettingsSchema.safeParse({ asOf: now, settings });
  if (!built.success) throw new CommandDefect('A security setting holds a value its format’s schema refuses');
  return built.data;
}
