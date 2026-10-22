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
export type {
  Linker,
  PlannedAtIssue,
  ReceivableBooking,
  ReceiptAtIssue,
  ReceiptsAtIssue,
  ReceiptsLater,
  ReceiptsLinked,
} from './commands/receipt-link.js';
export type { ReviewReason } from './domain/receipts.js';
export type { ReceivedGoods } from './domain/lifecycle.js';
export type { GrnLineReceipt } from './queries/receipt-links.js';
export { BOOKING_JOBS_IDENTITY, bookingJobKinds, overdueExceptionType } from './jobs/overdue.js';
export type { OverdueJobDependencies } from './jobs/overdue.js';
export { bookingAmended } from './events.js';
