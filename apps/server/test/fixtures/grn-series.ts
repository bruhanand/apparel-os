import type { TransactionContext } from '../../src/kernel/index.js';
import type { NumberingInterface } from '../../src/modules/numbering/index.js';
import { GRN_KIND, GRN_SCOPE_KEY } from '../../src/modules/receiving/index.js';
import { syntheticCode } from './synthetic.js';

// The SYNTHETIC GRN series (goods-in 4.5, 4.8; numbering-and-audit 3.5, 3.7; RR-449; DEC-118): no screen defines a
// GRN series or its format yet, so the tests, the server of the browser journeys and the local seed, which `dev` runs,
// define it here with a format labelled SYNTHETIC. No format is the Organisation's until it chooses one. Never a KDPS
// value.

/** The SYNTHETIC format of GRN numbers: `SYN-GRN-` and a five-digit sequence. */
export const SYNTHETIC_GRN_FORMAT = [
  { kind: 'text' as const, text: 'SYN-GRN-' },
  { kind: 'sequence' as const, width: 5 },
];

/** The code of the SYNTHETIC GRN format. */
export const SYNTHETIC_GRN_FORMAT_CODE = syntheticCode('GRN');

/**
 * Defines the GRN series with the SYNTHETIC format, unless a live one exists: the series of the Organisation, which
 * never restarts (receiving's GRN_KIND). Answers whether it defined one.
 */
export async function defineSyntheticGrnSeries(
  context: TransactionContext,
  numbering: Pick<NumberingInterface, 'liveSeries' | 'defineFormatVersion' | 'defineSeries'>,
): Promise<'defined' | 'unchanged'> {
  if ((await numbering.liveSeries(context, { kind: GRN_KIND.kind, scopeKey: GRN_SCOPE_KEY })) !== undefined) {
    return 'unchanged';
  }
  const format = await numbering.defineFormatVersion(context, SYNTHETIC_GRN_FORMAT_CODE, SYNTHETIC_GRN_FORMAT);
  if (format.kind !== 'done') throw new Error(`The SYNTHETIC GRN format was refused: ${format.refusal.code}`);
  const series = await numbering.defineSeries(context, {
    kind: GRN_KIND.kind,
    scopeKey: GRN_SCOPE_KEY,
    displayScopeKey: GRN_SCOPE_KEY,
    formatCode: SYNTHETIC_GRN_FORMAT_CODE,
  });
  if (series.kind !== 'done') throw new Error(`The SYNTHETIC GRN series was refused: ${series.refusal.code}`);
  return 'defined';
}
