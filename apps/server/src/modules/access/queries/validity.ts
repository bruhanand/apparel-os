import type { SettingOrigin } from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import type { ValidityCheck } from '../../configuration/index.js';
import { settingVersion, settingVersionChange } from '../db/schema.js';
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
    const byVersion = new Map<string, { origin: SettingOrigin; enteredBy: Set<string> }>();
    for (const row of rows) {
      const entry = byVersion.get(row.id) ?? { origin: row.origin as SettingOrigin, enteredBy: new Set<string>() };
      if (row.changedBy !== null) entry.enteredBy.add(row.changedBy);
      byVersion.set(row.id, entry);
    }
    return [...byVersion].map(([key, entry]) => ({ key, origin: entry.origin, enteredBy: [...entry.enteredBy] }));
  },
};
