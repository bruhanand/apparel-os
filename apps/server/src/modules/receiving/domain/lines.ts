import type { MissingItem } from '@apparel-os/schemas';
import { textKey } from './text.js';

// The count as it stands (goods-in 4.3, 4.5; S2-F02-T02): each line is the chain of its saved entries, the newest the
// one in force, and who counted it everyone who saved one, from their sign-ins. Pure: no database, no clock
// (code-house-rules 2).

/**
 * A size of the Organisation's size list: a value of a list attribute, named with its attribute, and the value's code
 * then, the text the PT file is matched on (goods-in 4.3, 5.4; GI-3).
 */
export interface Size {
  readonly attributeId: string;
  readonly valueId: string;
  readonly code: string;
}

/** A batch and its expiry, for a product whose tracking profile requires them (PRD-MER-011). */
export interface Batch {
  readonly code: string;
  readonly expiryDate: string;
}

/** What a line counts: the style code and colour as the invoice writes them, and the size; each may be missing. */
export interface LineGoods {
  readonly styleCode: string;
  readonly colour: string | null;
  readonly size: Pick<Size, 'valueId'> | null;
}

/** One saved entry of a count line, as `receiving` keeps it. */
export interface CountEntryFacts {
  readonly id: string;
  readonly lineId: string;
  readonly replacesEntryId: string | null;
  readonly removed: boolean;
  readonly styleCode: string;
  readonly colour: string | null;
  readonly size: Size | null;
  readonly skuId: string | null;
  readonly invoiceQuantity: number;
  readonly countedQuantity: number;
  readonly batch: Batch | null;
  readonly enteredByUserId: string;
  readonly recordedAt: Date;
}

/** A line of the count with its newest entry and who counted it. */
export interface CurrentLine {
  readonly lineId: string;
  readonly entry: CountEntryFacts;
  readonly countedBy: readonly string[];
}

/** The newest entry of a line: the one no other entry replaces. */
export function newestEntry(entries: readonly CountEntryFacts[], lineId: string): CountEntryFacts | undefined {
  const own = entries.filter((each) => each.lineId === lineId);
  const replaced = new Set(own.map((each) => each.replacesEntryId).filter((id): id is string => id !== null));
  return own.find((each) => !replaced.has(each.id));
}

/**
 * The lines in force, in the order they were first saved (a line's identifier is its first entry's), without the
 * removed ones; who counted each is everyone who saved an entry of it, in the order they first did.
 */
export function currentLines(entries: readonly CountEntryFacts[]): CurrentLine[] {
  const firstSaved = [...entries]
    .filter((each) => each.id === each.lineId)
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime() || a.id.localeCompare(b.id));
  const lines: CurrentLine[] = [];
  for (const first of firstSaved) {
    const entry = newestEntry(entries, first.lineId);
    if (entry === undefined || entry.removed) continue;
    const countedBy: string[] = [];
    for (const each of chainOf(entries, first)) {
      if (!countedBy.includes(each.enteredByUserId)) countedBy.push(each.enteredByUserId);
    }
    lines.push({ lineId: first.lineId, entry, countedBy });
  }
  return lines;
}

/** A line's entries from its first, each followed by the one that replaces it. */
function chainOf(entries: readonly CountEntryFacts[], first: CountEntryFacts): CountEntryFacts[] {
  const byReplaced = new Map(
    entries.filter((each) => each.replacesEntryId !== null).map((each) => [each.replacesEntryId, each] as const),
  );
  const chain = [first];
  for (let next = byReplaced.get(first.id); next !== undefined; next = byReplaced.get(next.id)) chain.push(next);
  return chain;
}

/**
 * The line in force that counts the same style, colour and size already, other than the line being saved, or
 * undefined: one line per style, colour and size (goods-in 4.3). The style code and colour compare ignoring case and
 * spaces at the ends; a missing colour or size matches only another missing one (PRD-MER-005).
 */
export function lineCounting(
  lines: readonly CurrentLine[],
  goods: LineGoods,
  exceptLineId?: string,
): CurrentLine | undefined {
  const colourKey = (colour: string | null) => (colour === null ? null : textKey(colour));
  return lines.find(
    ({ lineId, entry }) =>
      lineId !== exceptLineId &&
      textKey(entry.styleCode) === textKey(goods.styleCode) &&
      colourKey(entry.colour) === colourKey(goods.colour) &&
      (entry.size?.valueId ?? null) === (goods.size?.valueId ?? null),
  );
}

/** A line named in a refusal, by its identifier (PRD-UXP-003). */
export const lineItem = (lineId: string): MissingItem => ({ kind: 'count-line', lineId });

/**
 * What stops a GRN being issued from the count as it stands, before anything is read under the ledger's locks
 * (goods-in 4.5; DEC-133): no invoice; no line; a line whose counted quantity differs from its invoice quantity, since
 * the findings at the count come with S2-F02-T03. Each names the lines concerned.
 */
export function grnBlockers(
  invoices: number,
  lines: readonly CurrentLine[],
): { readonly code: string; readonly missing: readonly MissingItem[] } | undefined {
  if (invoices === 0) return { code: 'receiving.invoice-required', missing: [{ kind: 'invoice' }] };
  if (lines.length === 0) return { code: 'receiving.no-lines', missing: [{ kind: 'count-line' }] };
  const differing = lines.filter((line) => line.entry.countedQuantity !== line.entry.invoiceQuantity);
  if (differing.length > 0) {
    return { code: 'receiving.line-differs-from-invoice', missing: differing.map((line) => lineItem(line.lineId)) };
  }
  return undefined;
}
