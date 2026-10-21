import type { TransactionContext } from '../../src/kernel/index.js';
import type { NumberingInterface } from '../../src/modules/numbering/index.js';
import { DAMAGE_REPORT_KIND, DAMAGE_REPORT_SCOPE_KEY } from '../../src/modules/stock/documents/index.js';
import { syntheticCode } from './synthetic.js';

// The SYNTHETIC damage-report series (goods-in 8.5, 10.4; numbering-and-audit 3.5, 3.7; RR-449; DEC-118): no screen
// defines a damage-report series or its format yet, so the tests and the server of the browser journeys define it here
// with a format labelled SYNTHETIC, as the GRN's (fixtures/grn-series.ts). The local seed does not: DEC-143 lets it add
// only the GRN series to a finished synthetic Organisation (goods-in 8.5). No format is the Organisation's until it
// chooses one. Never a KDPS value.

/** The SYNTHETIC format of damage-report numbers: `SYN-DMG-` and a five-digit sequence. */
export const SYNTHETIC_DAMAGE_REPORT_FORMAT = [
  { kind: 'text' as const, text: 'SYN-DMG-' },
  { kind: 'sequence' as const, width: 5 },
];

/** The code of the SYNTHETIC damage-report format. */
export const SYNTHETIC_DAMAGE_REPORT_FORMAT_CODE = syntheticCode('DMG');

/**
 * Defines the damage-report series with the SYNTHETIC format, unless a live one exists: the series of the Organisation,
 * which never restarts (DAMAGE_REPORT_KIND). Answers whether it defined one.
 */
export async function defineSyntheticDamageReportSeries(
  context: TransactionContext,
  numbering: Pick<NumberingInterface, 'liveSeries' | 'defineFormatVersion' | 'defineSeries'>,
): Promise<'defined' | 'unchanged'> {
  const scope = { kind: DAMAGE_REPORT_KIND.kind, scopeKey: DAMAGE_REPORT_SCOPE_KEY };
  if ((await numbering.liveSeries(context, scope)) !== undefined) return 'unchanged';
  const format = await numbering.defineFormatVersion(
    context,
    SYNTHETIC_DAMAGE_REPORT_FORMAT_CODE,
    SYNTHETIC_DAMAGE_REPORT_FORMAT,
  );
  if (format.kind !== 'done') throw new Error(`The SYNTHETIC damage-report format was refused: ${format.refusal.code}`);
  const series = await numbering.defineSeries(context, {
    ...scope,
    displayScopeKey: DAMAGE_REPORT_SCOPE_KEY,
    formatCode: SYNTHETIC_DAMAGE_REPORT_FORMAT_CODE,
  });
  if (series.kind !== 'done') throw new Error(`The SYNTHETIC damage-report series was refused: ${series.refusal.code}`);
  return 'defined';
}
