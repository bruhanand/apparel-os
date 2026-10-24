import type { GatedOperation } from '../../configuration/index.js';

// A booking's approval and the policy gate (goods-in 3.4, 10.5; module-map 4.4; PRD-SEC-017; S2-F01-T03). Approving
// a booking needs policies 5 and 1. An operation the gate knows names one governing policy, so `booking` declares one
// operation for each, sharing one capability, as `receiving` does (goods-in 10.5 "As built"): Available answers yes
// only when both do. Neither has an activity: a booking records no stock at a unit (goods-in 3). Recording, changing
// and submitting a Draft record no business effect, so they are not gated (DEC-116). **Design choice.**
//
// Which records are policy 5's values is OPEN (RR-561): since budgets are not (DEC-142), no module reports a value of
// policy 5, so it cannot be validated and a booking's approval stays unavailable until the product owner settles it.
// Policy 1's values, the Agreements, are not reported yet either (RR-480).

/** The capability that switches bookings' approval on, off for every Organisation until an Admin switches it on. */
export const BOOKING_CAPABILITY = 'booking.bookings';

/** Approving a booking under policy 5, booking (POL-05.01, POL-05.02; goods-in 10.5). */
export const APPROVE_BOOKING: GatedOperation = {
  code: 'booking.approve-booking',
  policy: 5,
  capability: BOOKING_CAPABILITY,
  activity: null,
  checks: [],
};

/** Approving a booking under policy 1, commercial ownership, whose Agreement it fixes (POL-01.02, POL-01.04). */
export const APPROVE_BOOKING_TERMS: GatedOperation = {
  code: 'booking.approve-booking-terms',
  policy: 1,
  capability: BOOKING_CAPABILITY,
  activity: null,
  checks: [],
};

/** Both, in the order Available is asked. */
export const BOOKING_OPERATIONS: readonly GatedOperation[] = [APPROVE_BOOKING, APPROVE_BOOKING_TERMS];
