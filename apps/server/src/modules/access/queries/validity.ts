import type { SettingOrigin } from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import { lockTable } from '../../../kernel/index.js';
import type { ValidityCheck } from '../../configuration/index.js';
import { setting, settingVersion, settingVersionChange } from '../db/schema.js';
import { securitySettings } from './security-settings.js';

/**
 * The essential security settings as policy 2's values (module-map 4.4, section 3 rule 6; access-and-approvals 3.3;
 * POL-02.18; DM-6, V-04; RR-252; S1-F04-T01): valid while each is set, and each Approved version in force now or
 * later reported with its origin and its preparers, so the gate refuses a synthetic or test-setup version where this
 * environment does not accept one, and the person who entered a version cannot validate it (code-house-rules 12.14).
 */
export const securitySettingsCheck: ValidityCheck = {
  code: 'access.security-settings',
  policy: 2,
  async check(context) {
    const read = await securitySettings(context);
    const missing = read.settings
      .filter((each) => each.inForceVersionId === null)
      .map((each) => ({ kind: 'setting', setting: each.setting }));
    return missing.length === 0 ? { kind: 'valid' } : { kind: 'invalid', missing };
  },
  async values(context) {
    const now = context.startedAt.toISOString();
    const rows = await context.tx
      .select({
        id: settingVersion.id,
        validDuring: settingVersion.validDuring,
        origin: settingVersion.origin,
        changedBy: settingVersionChange.changedByUserId,
      })
      .from(settingVersion)
      .leftJoin(settingVersionChange, eq(settingVersionChange.settingVersionId, settingVersion.id))
      .where(
        and(
          eq(settingVersion.decision, 'Approved'),
          sql`(pg_catalog.upper_inf(${settingVersion.validDuring})
               or pg_catalog.upper(${settingVersion.validDuring}) > ${now}::timestamptz)`,
        ),
      );
    const byVersion = new Map<string, { version: string; origin: SettingOrigin; enteredBy: Set<string> }>();
    for (const row of rows) {
      const entry = byVersion.get(row.id) ?? {
        // Its validity is the part changed in place, when a later version ends it (RR-478).
        version: row.validDuring,
        origin: row.origin as SettingOrigin,
        enteredBy: new Set<string>(),
      };
      if (row.changedBy !== null) entry.enteredBy.add(row.changedBy);
      byVersion.set(row.id, entry);
    }
    return [...byVersion].map(([key, entry]) => ({
      key,
      version: entry.version,
      origin: entry.origin,
      enteredBy: [...entry.enteredBy],
    }));
  },
  // Every change of a setting's versions locks the setting's row (commands/security-settings.ts).
  async locks(context) {
    const rows = await context.tx.select({ id: setting.id }).from(setting);
    return rows.map((row) => ({ table: SETTING, id: row.id, mode: 'shared' as const }));
  },
};

const SETTING = lockTable('access', 'setting');
