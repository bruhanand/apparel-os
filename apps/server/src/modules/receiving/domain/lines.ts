import {
  extraPiecesOf,
  type EvidenceFile,
  type ExtraPieces,
  type LineGoods,
  type MissingItem,
} from '@apparel-os/schemas';
import { textKey } from './text.js';

// The count as it stands (goods-in 4.3 to 4.5; S2-F02-T02, S2-F02-T03): each line is the chain of its saved entries, the
// newest the one in force, and who counted it everyone who saved one, from their sign-ins. Pure: no database, no clock
// (code-house-rules 2).

/**
 * A size of the Organisation's size list: a value of a list attribute, named with its attribute and the version of the
 * size list's marking it was read under (code-house-rules 7.3, 12.14; RR-556), and the value's code then, the text the
 * PT file is matched on (goods-in 4.3, 5.4; GI-3).
 */
export interface Size {
  readonly attributeId: string;
  readonly valueId: string;
  readonly markedAttributeVersionId: string;
  readonly code: string;
}

/** A batch and its expiry, for a product whose tracking profile requires them (PRD-MER-011). */
export interface Batch {
  readonly code: string;
  readonly expiryDate: string;
}

/**
 * What a line counts: the style code and colour as the invoice writes them, and the size; each may be missing, and
 * unidentified goods have none of them (goods-in 4.4).
 */
export interface LineIdentity {
  readonly styleCode: string | null;
  readonly colour: string | null;
  readonly size: Pick<Size, 'valueId'> | null;
}

/** The damage the count found on a line: how many pieces, what is wrong and its photo, stored, not yet attached. */
export interface LineDamage {
  readonly quantity: number;
  readonly description: string;
  readonly photo: EvidenceFile | null;
}

/** One saved entry of a count line, as `receiving` keeps it. */
export interface CountEntryFacts {
  readonly id: string;
  readonly lineId: string;
  readonly replacesEntryId: string | null;
  readonly removed: boolean;
  readonly goods: LineGoods;
  readonly styleCode: string | null;
  readonly colour: string | null;
  readonly size: Size | null;
  readonly skuId: string | null;
  /** What unidentified goods look like; none for other goods (goods-in 4.4). */
  readonly description: string | null;
  readonly invoiceQuantity: number;
  readonly countedQuantity: number;
  /** What happens to the line's extra pieces, when it has some (goods-in 4.4). */
  readonly extra: ExtraPieces | null;
  readonly damage: LineDamage | null;
  readonly batch: Batch | null;
  readonly enteredByUserId: string;
  readonly recordedAt: Date;
}

/**
 * What a count line records of its goods, apart from its chain of entries and who saved them (goods-in 4.3, 4.4, 4.9):
 * what it counts, its identity, its quantities, what happens to its extra pieces, its damage and its batch. A GRN line
 * freezes the same (goods-in 4.5).
 */
export type LineContent = Pick<
  CountEntryFacts,
  | 'goods'
  | 'styleCode'
  | 'colour'
  | 'size'
  | 'skuId'
  | 'description'
  | 'invoiceQuantity'
  | 'countedQuantity'
  | 'extra'
  | 'damage'
  | 'batch'
>;

/** The content of an entry, the one mapping every copy of a line's content goes through. */
export function contentOf(entry: LineContent): LineContent {
  return {
    goods: entry.goods,
    styleCode: entry.styleCode,
    colour: entry.colour,
    size: entry.size,
    skuId: entry.skuId,
    description: entry.description,
    invoiceQuantity: entry.invoiceQuantity,
    countedQuantity: entry.countedQuantity,
    extra: entry.extra,
    damage: entry.damage,
    batch: entry.batch,
  };
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
 * spaces at the ends; a missing colour or size matches only another missing one (PRD-MER-005). Unidentified goods
 * carry no style code, so no line counts them already: each is told apart by what it looks like (goods-in 4.9).
 */
export function lineCounting(
  lines: readonly CurrentLine[],
  goods: LineIdentity,
  exceptLineId?: string,
): CurrentLine | undefined {
  const { styleCode } = goods;
  if (styleCode === null) return undefined;
  const colourKey = (colour: string | null) => (colour === null ? null : textKey(colour));
  return lines.find(
    ({ lineId, entry }) =>
      lineId !== exceptLineId &&
      entry.styleCode !== null &&
      textKey(entry.styleCode) === textKey(styleCode) &&
      colourKey(entry.colour) === colourKey(goods.colour) &&
      (entry.size?.valueId ?? null) === (goods.size?.valueId ?? null),
  );
}

/** A line named in a refusal, by its identifier (PRD-UXP-003). */
export const lineItem = (lineId: string): MissingItem => ({ kind: 'count-line', lineId });

/**
 * What stops a GRN being issued from the count as it stands, before anything is read under the ledger's locks
 * (goods-in 4.5; DEC-133): no invoice; no line; a line with extra pieces the count does not record as received or not
 * received, which only a line saved before the findings were built can be, since saving a line now asks for it
 * (goods-in 4.4, 4.9); a line of goods on the invoice, or of wrong goods, with no size recorded and no product named,
 * since the PT file is matched on its size (goods-in 4.3, 5.4; the product owner, 22 Oct 2026, RR-586): a line naming
 * a product takes the product's size when the GRN is issued, and is asked for one there only when the product has none
 * (commands/issue.ts; code review 7, RR-608); unidentified goods are described, not sized. A line is saved without its
 * size as the count goes, and sized before the GRN. Each names the lines concerned.
 */
export function grnBlockers(
  invoices: number,
  lines: readonly CurrentLine[],
): { readonly code: string; readonly missing: readonly MissingItem[] } | undefined {
  if (invoices === 0) return { code: 'receiving.invoice-required', missing: [{ kind: 'invoice' }] };
  if (lines.length === 0) return { code: 'receiving.no-lines', missing: [{ kind: 'count-line' }] };
  const unrecorded = lines.filter((line) => extraPiecesOf(line.entry) > 0 && line.entry.extra === null);
  if (unrecorded.length > 0) {
    return { code: 'receiving.extra-not-recorded', missing: unrecorded.map((line) => lineItem(line.lineId)) };
  }
  const unsized = lines.filter(
    (line) => line.entry.goods !== 'unidentified' && line.entry.size === null && line.entry.skuId === null,
  );
  if (unsized.length > 0) {
    return { code: 'receiving.size-required', missing: unsized.map((line) => lineItem(line.lineId)) };
  }
  return undefined;
}
