// Public interface of `booking` (module-map section 5; goods-in 10.1). Other code imports only from here.
export { BookingModule } from './booking.module.js';
export { BOOKING } from './tokens.js';
export { Booking } from './booking.js';
export type { BookingDependencies, BookingInterface } from './booking.js';
export { bookingApprovals } from './commands/effects.js';
export type { EffectDependencies as BookingApprovalDependencies } from './commands/effects.js';
export { bookingRestoreParticipant } from './restore-participant.js';
// The booking number kind (goods-in 3.1, 10.4) and a booking's approval at the policy gate (goods-in 10.5; S2-F01-T03).
export { BOOKING_KIND, BOOKING_SCOPE_KEY } from './domain/kinds.js';
export { APPROVE_BOOKING, APPROVE_BOOKING_TERMS, BOOKING_CAPABILITY, BOOKING_OPERATIONS } from './domain/gate.js';
export { bookingApproved } from './events.js';
// The lifecycle (goods-in 3.4 to 3.8; S2-F01-T04): the receipt link's types for `receiving`, the overdue job kind,
// its service identity and its exception type for the composition root.
// Receiving against a booking (goods-in 3.7, 4.10; S2-F02-T04): what `receiving` hands the receipt links and reads.
export type { ReceiptsAtIssue, ReceiptsLater, ReceiptsLinked } from './domain/receipts.js';
export type { GrnLineReceipt } from './queries/receipt-links.js';
export { BOOKING_JOBS_IDENTITY, bookingJobKinds, overdueExceptionType } from './jobs/overdue.js';
export type { OverdueJobDependencies } from './jobs/overdue.js';
export { bookingAmended } from './events.js';
// The booking status read model of the stage 2 reports, served through the read-model gateway (goods-in 9.5;
// S2-F11-T02).
export { BOOKING_STATUSES, bookingReadModels } from './queries/statuses.js';
export type { BookingStatusEntry } from './queries/statuses.js';
