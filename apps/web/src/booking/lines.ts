import { BOOKING_CAPS, type BookingLine, type BookingLineDraft } from '@apparel-os/schemas';
import { formatPaise, paiseOfRupees } from '../setup/format';

// The lines of the booking form (goods-in 3.1; PRD-BKG-001, PRD-BKG-003; DEC-130; S2-F01-T03): each line as the form
// holds it, as text a person types; the size-colour grid that enters one style's lines at once, colours down and sizes
// across, one indicative cost and MRP for the style that each line can then change; and the draft lines the route
// takes. Pure: no screen, no request.

/** One line as the form holds it: text as typed. */
export interface LineInput {
  readonly styleCode: string;
  readonly colour: string;
  readonly size: string;
  readonly quantity: string;
  readonly cost: string;
  readonly mrp: string;
  readonly deliveryDate: string;
}

/** The size-colour grid of one style (goods-in 3.1): quantities by colour and size, as typed. */
export interface GridInput {
  readonly styleCode: string;
  readonly cost: string;
  readonly mrp: string;
  readonly colours: readonly string[];
  readonly sizes: readonly string[];
  /** The quantity typed in each cell, by `cellKey(colour, size)`; an empty cell orders nothing. */
  readonly cells: Readonly<Record<string, string>>;
}

/** The key of a grid cell. */
export const cellKey = (colour: string, size: string): string => JSON.stringify([colour, size]);

/**
 * A list as typed, separated by commas: each part as written, without spaces at its ends, empty parts left out and
 * each kept once (goods-in 3.1: colours and sizes as the document writes them).
 */
export function splitList(text: string): string[] {
  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return [...new Set(parts)];
}

/** Whole pieces, more than zero, at most the cap (goods-in 3.1; BOOKING_CAPS). */
export function piecesOf(text: string): number | undefined {
  if (!/^\d{1,7}$/.test(text.trim())) return undefined;
  const pieces = Number(text.trim());
  return pieces >= 1 && pieces <= BOOKING_CAPS.pieces ? pieces : undefined;
}

/**
 * The lines of a grid: one line per cell with a quantity, colour by colour in the order typed and size by size, each at
 * the grid's cost and MRP, which each line can then change (goods-in 3.1). An empty cell orders nothing.
 */
export function gridLines(grid: GridInput): LineInput[] {
  const lines: LineInput[] = [];
  for (const colour of grid.colours) {
    for (const size of grid.sizes) {
      const quantity = (grid.cells[cellKey(colour, size)] ?? '').trim();
      if (quantity === '') continue;
      lines.push({
        styleCode: grid.styleCode.trim(),
        colour,
        size,
        quantity,
        cost: grid.cost,
        mrp: grid.mrp,
        deliveryDate: '',
      });
    }
  }
  return lines;
}

/** What is wrong with one line, field by field; empty when it is a line the route takes. */
export type LineProblems = Partial<Record<keyof LineInput, true>>;

/** The problems of one line as typed (goods-in 3.1): style code required; whole pieces; amounts in rupees. */
export function lineProblems(line: LineInput): LineProblems {
  const problems: LineProblems = {};
  const tooLong = (text: string) => text.trim().length > BOOKING_CAPS.codeText;
  if (line.styleCode.trim() === '' || tooLong(line.styleCode)) problems.styleCode = true;
  if (tooLong(line.colour)) problems.colour = true;
  if (tooLong(line.size)) problems.size = true;
  if (piecesOf(line.quantity) === undefined) problems.quantity = true;
  if (paiseOfRupees(line.cost) === undefined) problems.cost = true;
  if (paiseOfRupees(line.mrp) === undefined) problems.mrp = true;
  if (line.deliveryDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(line.deliveryDate)) problems.deliveryDate = true;
  return problems;
}

/**
 * The line as the route takes it, or undefined while it has a problem: text as written without spaces at its ends, a
 * colour or size left empty stays missing, never a default (PRD-MER-005; PRD-MOD-015); amounts in whole paise.
 */
export function draftLineOf(line: LineInput): BookingLineDraft | undefined {
  if (Object.keys(lineProblems(line)).length > 0) return undefined;
  const quantity = piecesOf(line.quantity);
  const cost = paiseOfRupees(line.cost);
  const mrp = paiseOfRupees(line.mrp);
  if (quantity === undefined || cost === undefined || mrp === undefined) return undefined;
  const optional = (text: string) => (text.trim() === '' ? null : text.trim());
  return {
    styleCode: line.styleCode.trim(),
    colour: optional(line.colour),
    size: optional(line.size),
    quantity,
    indicativeCost: cost as BookingLineDraft['indicativeCost'],
    mrp: mrp as BookingLineDraft['mrp'],
    deliveryDate: line.deliveryDate === '' ? null : line.deliveryDate,
  };
}

/** Rupees as the form shows a saved amount, "1,234.50", typed back as the same paise (paiseOfRupees). */
export function rupeesText(paise: number): string {
  return formatPaise(paise).replace(/^₹/, '');
}

/** A saved line, as the form holds it to change it. */
export function inputOf(line: BookingLine): LineInput {
  return {
    styleCode: line.styleCode,
    colour: line.colour ?? '',
    size: line.size ?? '',
    quantity: String(line.quantity),
    cost: rupeesText(line.indicativeCost),
    mrp: rupeesText(line.mrp),
    deliveryDate: line.deliveryDate ?? '',
  };
}
