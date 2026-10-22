// How `receiving` reads text the receiver types (goods-in 4.2, 4.3; S2-F02-T02). Pure: no database, no clock
// (code-house-rules 2).

/** Text as the receiver typed it, without spaces at its ends (goods-in 4.2, 4.3). */
export const trimmed = (text: string): string => text.trim();

/**
 * Text compared ignoring case and spaces at the ends (goods-in 3.7, 4.8, 5.4): the one rule `booking` matches a GRN
 * line to a booking line by, from the booking entry point of the shared calculations, so the two always agree.
 */
export { textKey } from '@apparel-os/calculations/booking';
