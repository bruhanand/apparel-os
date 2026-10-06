import { englishIndia } from './en-IN';

// The message catalogue (code-house-rules 12.13). Code holds message identifiers, never text; numbers and plurals go
// through Intl, and no translation library is added (10.6).

export type MessageId = keyof typeof englishIndia;
export type MessageParams = Readonly<Record<string, string | number>>;

const LOCALE = 'en-IN';
const plurals = new Intl.PluralRules(LOCALE);
const numbers = new Intl.NumberFormat(LOCALE);

/** Whether a string is an identifier of the catalogue, such as a refusal code's `error.<code>`. */
export function isMessageId(id: string): id is MessageId {
  return Object.hasOwn(englishIndia, id);
}

/**
 * The text of a message with its named parameters filled in. A plural message chooses its form by the `count`
 * parameter; a number is written with Indian grouping (design-language 8).
 */
export function t(id: MessageId, params: MessageParams = {}): string {
  const entry: string | Readonly<Partial<Record<Intl.LDMLPluralRule, string>>> = englishIndia[id];
  let text: string;
  if (typeof entry === 'string') {
    text = entry;
  } else {
    const count = params.count;
    if (typeof count !== 'number') throw new Error(`Message ${id} needs a count`);
    const form = entry[plurals.select(count)] ?? entry.other;
    if (form === undefined) throw new Error(`Message ${id} has no "other" form`);
    text = form;
  }
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Message ${id} needs the parameter ${name}`);
    return typeof value === 'number' ? numbers.format(value) : value;
  });
}
