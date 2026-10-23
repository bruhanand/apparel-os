import type { TransactionContext } from '../../src/kernel/index.js';
import { SKU_CODE_KIND, SKU_CODE_SCOPE_KEY } from '../../src/modules/merchandise/catalogue/index.js';
import { PT_KIND, PT_SCOPE_KEY } from '../../src/modules/merchandise/pt/domain/kinds.js';
import type { NumberingInterface } from '../../src/modules/numbering/index.js';
import { syntheticCode } from './synthetic.js';

// The SYNTHETIC PT and SKU code series (goods-in 6.3, 6.6, 10.4; structure-and-masters 4.2 "As built with S2-F06-T01";
// numbering-and-audit 2, 3.5, 3.7; RR-449, RR-585; DEC-118): no screen defines either series or its format yet, so the
// tests, the server of the browser journeys and the local seed, which `dev` runs, define them here with formats
// labelled SYNTHETIC, as the GRN's (fixtures/grn-series.ts). No format is the Organisation's until it chooses one.
// Never a KDPS value.

/** The SYNTHETIC format of PT numbers: `SYN-PT-` and a five-digit sequence. */
export const SYNTHETIC_PT_FORMAT = [
  { kind: 'text' as const, text: 'SYN-PT-' },
  { kind: 'sequence' as const, width: 5 },
];
export const SYNTHETIC_PT_FORMAT_CODE = syntheticCode('PT');

/** The SYNTHETIC format of the SKU codes a PT approval draws: `SYN-SKU-` and a six-digit sequence. */
export const SYNTHETIC_SKU_CODE_FORMAT = [
  { kind: 'text' as const, text: 'SYN-SKU-' },
  { kind: 'sequence' as const, width: 6 },
];
export const SYNTHETIC_SKU_CODE_FORMAT_CODE = syntheticCode('SKU-CODE');

type SeriesNumbering = Pick<NumberingInterface, 'liveSeries' | 'defineFormatVersion' | 'defineSeries'>;

async function defineOnce(
  context: TransactionContext,
  numbering: SeriesNumbering,
  series: {
    readonly kind: string;
    readonly scopeKey: string;
    readonly formatCode: string;
    readonly format: typeof SYNTHETIC_PT_FORMAT;
  },
): Promise<'defined' | 'unchanged'> {
  if ((await numbering.liveSeries(context, { kind: series.kind, scopeKey: series.scopeKey })) !== undefined) {
    return 'unchanged';
  }
  const format = await numbering.defineFormatVersion(context, series.formatCode, series.format);
  if (format.kind !== 'done')
    throw new Error(`The SYNTHETIC ${series.kind} format was refused: ${format.refusal.code}`);
  const defined = await numbering.defineSeries(context, {
    kind: series.kind,
    scopeKey: series.scopeKey,
    displayScopeKey: series.scopeKey,
    formatCode: series.formatCode,
  });
  if (defined.kind !== 'done')
    throw new Error(`The SYNTHETIC ${series.kind} series was refused: ${defined.refusal.code}`);
  return 'defined';
}

/** Defines the PT series with the SYNTHETIC format, unless a live one exists (merchandise · PT's PT_KIND). */
export function defineSyntheticPtSeries(
  context: TransactionContext,
  numbering: SeriesNumbering,
): Promise<'defined' | 'unchanged'> {
  return defineOnce(context, numbering, {
    kind: PT_KIND.kind,
    scopeKey: PT_SCOPE_KEY,
    formatCode: SYNTHETIC_PT_FORMAT_CODE,
    format: SYNTHETIC_PT_FORMAT,
  });
}

/** Defines the SKU code series with the SYNTHETIC format, unless a live one exists (the catalogue's SKU_CODE_KIND). */
export function defineSyntheticSkuCodeSeries(
  context: TransactionContext,
  numbering: SeriesNumbering,
): Promise<'defined' | 'unchanged'> {
  return defineOnce(context, numbering, {
    kind: SKU_CODE_KIND.kind,
    scopeKey: SKU_CODE_SCOPE_KEY,
    formatCode: SYNTHETIC_SKU_CODE_FORMAT_CODE,
    format: SYNTHETIC_SKU_CODE_FORMAT,
  });
}
