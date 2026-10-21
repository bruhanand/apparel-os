import type { TransactionContext } from '../../src/kernel/index.js';
import { BOOKING_KIND, BOOKING_SCOPE_KEY } from '../../src/modules/booking/index.js';
import type { NumberingInterface } from '../../src/modules/numbering/index.js';
import { syntheticCode } from './synthetic.js';

// The SYNTHETIC booking series (goods-in 3.1, 10.4; numbering-and-audit 3.5, 3.7; RR-449; DEC-118): no screen defines
// a booking series or its format yet, so the tests and the server of the browser journeys define it here with a format
// labelled SYNTHETIC. No format is the Organisation's until it chooses one. Never a KDPS value. The local seed does not
// define it: DEC-143 lets the seed add the GRN series alone to a finished synthetic Organisation.

/** The SYNTHETIC format of booking numbers: `SYN-BKG-` and a five-digit sequence. */
export const SYNTHETIC_BOOKING_FORMAT = [
  { kind: 'text' as const, text: 'SYN-BKG-' },
  { kind: 'sequence' as const, width: 5 },
];

/** The code of the SYNTHETIC booking format. */
export const SYNTHETIC_BOOKING_FORMAT_CODE = syntheticCode('BKG');

/**
 * Defines the booking series with the SYNTHETIC format, unless a live one exists: the series of the Organisation, which
 * never restarts (booking's BOOKING_KIND). Answers whether it defined one.
 */
export async function defineSyntheticBookingSeries(
  context: TransactionContext,
  numbering: Pick<NumberingInterface, 'liveSeries' | 'defineFormatVersion' | 'defineSeries'>,
): Promise<'defined' | 'unchanged'> {
  if ((await numbering.liveSeries(context, { kind: BOOKING_KIND.kind, scopeKey: BOOKING_SCOPE_KEY })) !== undefined) {
    return 'unchanged';
  }
  const format = await numbering.defineFormatVersion(context, SYNTHETIC_BOOKING_FORMAT_CODE, SYNTHETIC_BOOKING_FORMAT);
  if (format.kind !== 'done') throw new Error(`The SYNTHETIC booking format was refused: ${format.refusal.code}`);
  const series = await numbering.defineSeries(context, {
    kind: BOOKING_KIND.kind,
    scopeKey: BOOKING_SCOPE_KEY,
    displayScopeKey: BOOKING_SCOPE_KEY,
    formatCode: SYNTHETIC_BOOKING_FORMAT_CODE,
  });
  if (series.kind !== 'done') throw new Error(`The SYNTHETIC booking series was refused: ${series.refusal.code}`);
  return 'defined';
}
