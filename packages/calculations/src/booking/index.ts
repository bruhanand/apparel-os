// The booking entry point, @apparel-os/calculations/booking (shared-calculations 2.1, 2.2; goods-in 3.7, 3.9): a
// booking's totals, which `booking` on the server and the web app's booking screens both compute, and how a booking's
// and a GRN's text is compared, which `booking` and `receiving` both apply. Neither the selling nor the costing entry
// point imports this folder, nor this folder them.

export { bookingTotals } from './totals.js';
export { textKey } from './text.js';
export type { BookingAmounts, BookingStyleAmounts, BookingTotalsLine } from './totals.js';
