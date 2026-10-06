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

/** A business date, YYYY-MM-DD, as DD MMM YYYY (design-language 8). */
export function formatDate(date: string): string {
  const [year = '', month = '', day = ''] = date.split('-');
  return t('date.date', { day, month: t(`date.month.${String(Number(month))}` as MessageId), year });
}
