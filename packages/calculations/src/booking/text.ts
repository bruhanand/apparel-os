// How text a booking and a GRN write is compared (goods-in 3.7, 3.9, 4.8, 5.4; DEC-130): one rule, shared by `booking`,
// which matches a GRN line to a booking line, `receiving`, which counts and issues the GRN line, and the booking's
// totals, so the two modules always agree on which goods are the same (shared-calculations 2.1, 2.2).

/** Text compared ignoring case and spaces at the ends: a style code, a colour or a size as written (goods-in 3.7). */
export const textKey = (text: string): string => text.trim().toUpperCase();
