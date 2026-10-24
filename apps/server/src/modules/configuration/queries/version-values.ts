import type { SettingOrigin } from '@apparel-os/schemas';
import { and, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { TransactionContext } from '../../../kernel/index.js';
import type { ConfiguredValue } from '../domain/gate.js';

// The values a validity check reports from a versions table of its own module (module-map 4.4 "Register a validity
// check", section 3 rule 6; DM-6; code-house-rules 7.3, 12.14; RR-478, RR-558), shared by the checks whose values are
// approved versions dated by business days: the tracking profiles (policy 4), the business units' verified mappings and
// the tax-rule records (policy 10). The owning module passes its own table; `configuration` reads no other module's
// tables by name.

/** A versions table dated by business days, with its identifier, validity, origin, preparer and decision columns. */
export type DatedVersions = PgTable & {
  readonly id: AnyColumn;
  readonly validDuring: AnyColumn;
  readonly origin: AnyColumn;
  readonly preparedByUserId: AnyColumn;
  readonly decision: AnyColumn;
};

/**
 * Every approved version in force today or later, with its origin and its preparer, whom the validator must not be;
 * none while no business date is set. A version's value is keyed by its identifier, and its validity is its version:
 * the part changed in place when a later version ends it, which lapses a validation (RR-478). `where` narrows the
 * versions further, as only verified mappings are policy 10's values.
 */
export async function approvedVersionValues(
  context: TransactionContext,
  versions: DatedVersions,
  where?: SQL,
): Promise<ConfiguredValue[]> {
  const date = await context.businessDate();
  if (date.kind === 'not-set') return [];
  const rows = await context.tx
    .select({
      key: sql<string>`${versions.id}`,
      version: sql<string>`${versions.validDuring}`,
      origin: sql<SettingOrigin>`${versions.origin}`,
      preparedBy: sql<string>`${versions.preparedByUserId}`,
    })
    .from(versions)
    .where(
      and(
        sql`${versions.decision} = 'Approved'`,
        sql`(pg_catalog.upper_inf(${versions.validDuring})
             or pg_catalog.upper(${versions.validDuring}) > ${date.date}::date)`,
        where,
      ),
    );
  return rows.map((row) => ({ key: row.key, version: row.version, origin: row.origin, enteredBy: [row.preparedBy] }));
}
