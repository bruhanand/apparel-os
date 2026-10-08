// Number formats (numbering-and-audit 3.5; PRD-MOD-008): plain rules, no database, clock or logger
// (code-house-rules 2). A format is made of fixed text, a part taken from the series' scope, the financial-year label
// and the sequence number at a set width. No format has a default: the Organisation chooses every one.

/** One part of a format, in the order the text is written. */
export type FormatPart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'scope' }
  | { readonly kind: 'year' }
  | { readonly kind: 'sequence'; readonly width: number };

/**
 * The widest sequence a format may set: the digits of the largest safe integer every number fits in, a technical
 * limit and no business value. The limit a statutory format must fit is the CA's (V-40, POL-10.07).
 */
export const MAX_SEQUENCE_WIDTH = 15;

export type FormatRefusal = 'numbering.format-invalid' | 'numbering.format-not-for-kind';

/**
 * Checks a format's parts: exactly one sequence part, with a width from 1 to MAX_SEQUENCE_WIDTH; fixed text never
 * empty; the scope part and the year label at most once each; the year label only for a kind that restarts each
 * financial year, since no other series has a year (3.3, 3.5).
 */
export function checkFormat(
  parts: readonly FormatPart[],
  kind: { readonly yearly: boolean },
): FormatRefusal | undefined {
  const count = (k: FormatPart['kind']) => parts.filter((part) => part.kind === k).length;
  if (count('sequence') !== 1 || count('scope') > 1 || count('year') > 1) return 'numbering.format-invalid';
  for (const part of parts) {
    if (part.kind === 'text' && part.text === '') return 'numbering.format-invalid';
    if (
      part.kind === 'sequence' &&
      (!Number.isInteger(part.width) || part.width < 1 || part.width > MAX_SEQUENCE_WIDTH)
    ) {
      return 'numbering.format-invalid';
    }
  }
  if (count('year') === 1 && !kind.yearly) return 'numbering.format-not-for-kind';
  return undefined;
}

/**
 * The texts one series can give: the fixed text before the sequence, the sequence's width, and the fixed text after
 * it, with the series' scope text and year label put in. A series gives only these texts for its life, since it keeps
 * its format (3.5).
 */
export interface SeriesPattern {
  readonly before: string;
  readonly width: number;
  readonly after: string;
}

/** The pattern of a checked format for one series. A scope or year part with no value there is a defect. */
export function patternOf(
  parts: readonly FormatPart[],
  values: { readonly scopeText?: string; readonly financialYear?: string },
): SeriesPattern {
  let before = '';
  let after = '';
  let width: number | undefined;
  for (const part of parts) {
    let text: string;
    if (part.kind === 'sequence') {
      width = part.width;
      continue;
    }
    if (part.kind === 'text') text = part.text;
    else if (part.kind === 'scope') text = required(values.scopeText, 'scope text');
    else text = required(values.financialYear, 'financial year');
    if (width === undefined) before += text;
    else after += text;
  }
  if (width === undefined) throw new Error('A format has one sequence part');
  return { before, width, after };
}

function required(value: string | undefined, what: string): string {
  if (value === undefined || value === '') throw new Error(`The format needs the series' ${what}`);
  return value;
}

/** The text of a sequence number, or undefined when it does not fit the width (3.5). */
export function formatNumber(pattern: SeriesPattern, sequence: number): string | undefined {
  const digits = String(sequence);
  if (!Number.isSafeInteger(sequence) || sequence < 1 || digits.length > pattern.width) return undefined;
  return `${pattern.before}${digits.padStart(pattern.width, '0')}${pattern.after}`;
}

const isDigit = (char: string) => char >= '0' && char <= '9';

/**
 * Whether two series could give the same text (3.5): their texts have one length, and at every position both are
 * the same fixed character, or one is a digit of the sequence and the other a digit, fixed or not. Exact for patterns
 * of fixed width, so it refuses only what could really repeat.
 */
export function couldRepeat(a: SeriesPattern, b: SeriesPattern): boolean {
  const length = (p: SeriesPattern) => p.before.length + p.width + p.after.length;
  if (length(a) !== length(b)) return false;
  const at = (p: SeriesPattern, index: number): string | undefined => {
    if (index < p.before.length) return p.before.charAt(index);
    if (index < p.before.length + p.width) return undefined; // a digit of the sequence
    return p.after.charAt(index - p.before.length - p.width);
  };
  for (let index = 0; index < length(a); index += 1) {
    const x = at(a, index);
    const y = at(b, index);
    if (x === undefined && y === undefined) continue;
    if (x === undefined) {
      if (!isDigit(y ?? '')) return false;
    } else if (y === undefined) {
      if (!isDigit(x)) return false;
    } else if (x !== y) return false;
  }
  return true;
}
