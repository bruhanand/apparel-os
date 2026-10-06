import { and, eq, sql } from 'drizzle-orm';
import type { OrganisationTimezoneSource, TimezoneSetting } from '../../../kernel/index.js';
import { organisationTimezoneVersion } from '../db/schema.js';

/**
 * configuration's side of the kernel's timezone contract (module-map section 3, rule 6; code-house-rules 9;
 * PRD-MOD-009, PRD-MOD-010; RR-231): the Approved version in force at the instant the command acts at, read inside the
 * command's transaction, or "not set" when there is none. It has no default anywhere.
 */
export const configurationTimezoneSource: OrganisationTimezoneSource = {
  async read(context, at): Promise<TimezoneSetting> {
    const rows = await context.tx
      .select({ id: organisationTimezoneVersion.id, timezone: organisationTimezoneVersion.timezone })
      .from(organisationTimezoneVersion)
      .where(
        and(
          eq(organisationTimezoneVersion.decision, 'Approved'),
          sql`${organisationTimezoneVersion.validDuring} @> ${at.toISOString()}::timestamptz`,
        ),
      );
    const row = rows[0];
    if (row === undefined) return { kind: 'not-set' };
    return { kind: 'set', timezone: row.timezone, versionId: row.id };
  },
};
