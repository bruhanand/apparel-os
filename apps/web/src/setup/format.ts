import { t, type MessageId } from '../messages/catalogue';

// India formatting (design-language 8) for the access setup screens and My work.

const grouping = new Intl.NumberFormat('en-IN');

/**
 * An amount in integer paise as rupees with Indian grouping and two decimals, "₹1,23,456.78" (design-language 8;
 * PRD-MOD-014): split with integer arithmetic, never through a binary fraction.
 */
export function formatPaise(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const whole = Math.abs(paise);
  const rest = whole % 100;
  const rupees = (whole - rest) / 100;
  return t('money.inr', { sign, rupees: grouping.format(rupees), paise: String(rest).padStart(2, '0') });
}

/** A whole quantity with Indian grouping, "1,23,456" (design-language 8; code-house-rules 12.13). */
export function formatQuantity(quantity: number): string {
  return grouping.format(quantity);
}

const twoDecimals = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * An exact decimal the server sends as text with two decimals, such as a PT row's MARGIN "52.73", which its route's
 * schema checks on read, with Indian grouping (design-language 8; code-house-rules 12.13): formatted from the text itself,
 * as `Intl` formats a numeric string, never through a binary fraction.
 */
export function formatDecimal(decimal: string): string {
  return twoDecimals.format(decimal as `${number}`);
}

/**
 * Rupees as a person types them, with Indian grouping commas allowed and at most two decimals, as whole paise
 * (PRD-MOD-014): read with integer arithmetic, never through a binary fraction. Undefined for anything else, or an
 * amount past the safe integer range.
 */
export function paiseOfRupees(text: string): number | undefined {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim().replaceAll(',', ''));
  if (match === null) return undefined;
  const [, rupees = '', fraction = ''] = match;
  const amount = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && rupees.length <= 13 ? amount : undefined;
}

const lists = new Intl.ListFormat('en-IN', { style: 'short', type: 'unit' });

/** Several names, numbers or codes as one text, "A, B, C", joined by `Intl` (code-house-rules 12.13). */
export function formatList(items: readonly string[]): string {
  return lists.format(items);
}

/** A business date, YYYY-MM-DD, as DD MMM YYYY (design-language 8). */
export function formatDate(date: string): string {
  const [year = '', month = '', day = ''] = date.split('-');
  return t('date.date', { day, month: t(`date.month.${String(Number(month))}` as MessageId), year });
}

const percent = new Intl.NumberFormat('en-IN', { style: 'percent', maximumFractionDigits: 1 });

/**
 * A rate of two whole numbers as a percentage, "91.7%" (design-language 8; goods-in 9.5; S2-F11-T02): shown to one
 * decimal by `Intl`; the server sends the two whole numbers, so nothing is stored rounded.
 */
export function formatRate(numerator: number, denominator: number): string {
  return percent.format(numerator / denominator);
}
