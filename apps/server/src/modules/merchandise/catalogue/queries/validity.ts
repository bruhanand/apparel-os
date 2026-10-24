import { lockTable, type LockTarget } from '../../../../kernel/index.js';
import { approvedVersionValues, type ValidityCheck } from '../../../configuration/index.js';
import { trackingProfile, trackingProfileVersion } from '../db/schema.js';

// The tracking profiles as policy 4's values, for the policy gate (module-map 4.4, section 3 rule 6; DM-6;
// structure-and-masters 4.6 "As built"; goods-in 10.5; POL-04.01, POL-04.05; RR-480, RR-558, product owner, 21 Oct
// 2026; S2-F02-T02): every version in force today or later, with its origin and its preparer, whom the validator of
// policy 4 must not be. A version takes effect when recorded (structure-and-masters 2.3), so it is a value from then;
// a later version ends it in place, which changes the value's version and so lapses a validation (RR-478). Every
// version of an existing profile is written under the profile's lock, which recording a validation locks shared, so
// none changes between that read and the validation's insert (S1-F04 review S3); a new profile has no row to lock yet,
// and a validation recorded beside it does not cover it, so the policy lacks its validation again (fail closed), as
// with a new budget (booking.open-to-buy-budgets). Which profile a product's category takes,
// and what a profile requires of a receipt, are asked by the operations themselves (goods-in 4.8), so the check is
// valid whatever profiles exist and adds no condition the policy does not set.

/** The code of the check (module-map 4.4 "Register a validity check"). */
export const TRACKING_PROFILES_CHECK = 'merchandise.tracking-profiles';

export const trackingProfilesCheck: ValidityCheck = {
  code: TRACKING_PROFILES_CHECK,
  policy: 4,
  check: () => Promise.resolve({ kind: 'valid' }),
  values: (context) => approvedVersionValues(context, trackingProfileVersion),
  // Every change of a profile's versions locks the profile's row (commands/maintain.ts).
  async locks(context) {
    const rows = await context.tx.select({ id: trackingProfile.id }).from(trackingProfile);
    return rows.map((row): LockTarget => ({ table: PROFILE, id: row.id, mode: 'shared' }));
  },
};

const PROFILE = lockTable('merchandise', 'tracking_profile');
