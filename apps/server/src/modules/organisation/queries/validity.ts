import { and, eq, sql } from 'drizzle-orm';
import { lockTable, type LockTarget } from '../../../kernel/index.js';
import type { ValidityCheck } from '../../configuration/index.js';
import { today } from '../commands/common.js';
import { businessUnit, businessUnitMapping, businessUnitMappingVerification } from '../db/schema.js';

// The business units' verified mappings as policy 10's values, for the policy gate (module-map 4.4, section 3 rule 6;
// DM-6; structure-and-masters 3.4 "As built"; goods-in 10.5; POL-10.01, POL-10.08; RR-480, RR-558, product owner, 21
// Oct 2026; S2-F02-T02): every approved mapping version in force today or later that is verified, with its origin and
// its preparer, whom the validator of policy 10 must not be. An unverified mapping is no value of the policy until it
// is verified (POL-10.08); verifying one adds a value, and a later mapping version ends one in place, which changes its
// version, so either lapses a validation (RR-478). A decision on a unit's mapping and a verification each lock the
// unit's row, which recording a validation locks shared, so none changes between that read and the validation's
// insert (S1-F04 review S3); a new unit's mapping is no value until it is verified. Whether the asked unit's own mapping
// is verified is asked by the operation itself (goods-in 4.8; site-lifecycle's readiness), so the check is valid
// whatever mappings exist and adds no condition the policy does not set.

/** The code of the check (module-map 4.4 "Register a validity check"). */
export const VERIFIED_MAPPINGS_CHECK = 'organisation.verified-mappings';

export const verifiedMappingsCheck: ValidityCheck = {
  code: VERIFIED_MAPPINGS_CHECK,
  policy: 10,
  check: () => Promise.resolve({ kind: 'valid' }),
  async values(context) {
    const date = await today(context);
    if (typeof date !== 'string') return [];
    const rows = await context.tx
      .select({
        id: businessUnitMapping.id,
        validDuring: businessUnitMapping.validDuring,
        origin: businessUnitMapping.origin,
        preparedBy: businessUnitMapping.preparedByUserId,
      })
      .from(businessUnitMapping)
      .innerJoin(
        businessUnitMappingVerification,
        eq(businessUnitMappingVerification.businessUnitMappingId, businessUnitMapping.id),
      )
      .where(
        and(
          eq(businessUnitMapping.decision, 'Approved'),
          sql`(pg_catalog.upper_inf(${businessUnitMapping.validDuring})
               or pg_catalog.upper(${businessUnitMapping.validDuring}) > ${date}::date)`,
        ),
      );
    // Its validity is the part changed in place, when a later version ends it (RR-478); a verification never changes.
    return rows.map((row) => ({
      key: row.id,
      version: row.validDuring,
      origin: row.origin,
      enteredBy: [row.preparedBy],
    }));
  },
  // A decision on a unit's mapping and a verification of one lock the unit's row (commands/effects.ts, verify.ts).
  async locks(context) {
    const rows = await context.tx.select({ id: businessUnit.id }).from(businessUnit);
    return rows.map((row): LockTarget => ({ table: UNIT, id: row.id, mode: 'shared' }));
  },
};

const UNIT = lockTable('organisation', 'business_unit');
