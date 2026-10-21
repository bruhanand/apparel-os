// How `receiving` reads text the receiver types (goods-in 4.2, 4.3; S2-F02-T02). Pure: no database, no clock
// (code-house-rules 2).

/** Text as the receiver typed it, without spaces at its ends (goods-in 4.2, 4.3). */
export const trimmed = (text: string): string => text.trim();

/** Text compared ignoring case and spaces at the ends (goods-in 3.7, 5.4). */
export const textKey = (text: string): string => text.trim().toUpperCase();
