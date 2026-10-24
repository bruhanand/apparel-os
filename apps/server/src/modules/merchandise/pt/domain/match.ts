import { textKey } from '@apparel-os/calculations/booking';
import type { PtIssue } from './rows.js';

// The match of a PT file against its GRN (goods-in 5.4; PRD-REC-016, DEC-135, DEC-138; S2-F04-T02): rows grouped by
// style (DESIGN) and size, text compared ignoring case and spaces at the ends, as `receiving` and `booking` compare it;
// for each style and size the file's QTY adds up to the GRN's good pieces; no style and size appears in the file that
// the GRN lacks, and none of the GRN's is missing. Colour is never compared: the GRN keeps the invoice's colour and the
// PT may carry a grade tag (DEC-138). Pure: no database.

/** The GRN's good pieces per style and size, as `receiving` reads them before the PT (goods-in 4.9 `ptBasis`). */
export type GrnGoods = readonly {
  readonly styleCode: string;
  readonly size: string | null;
  readonly quantity: number;
  readonly grnLineIds: readonly string[];
}[];

/** A row's style, size and quantity, where the row gives them. */
export interface MatchedRow {
  readonly rowNumber: number;
  readonly styleCode: string;
  readonly sizeCode: string;
  readonly quantity: number;
}

/** A style and size of the GRN the PT covers: its good pieces, its GRN lines and the file's rows of it (5.7). */
export interface Coverage {
  readonly styleCode: string;
  readonly size: string | null;
  readonly quantity: number;
  readonly grnLineIds: readonly string[];
  readonly rowNumbers: readonly number[];
}

const keyOf = (styleCode: string, size: string | null) => `${textKey(styleCode)}|${size === null ? '' : textKey(size)}`;

/** A style and size named in a refusal, with its quantities as text (code-house-rules 12.3 "What is missing"). */
function named(styleCode: string, size: string | null, quantities: Record<string, number>) {
  return {
    kind: 'pt-style-size',
    styleCode,
    ...(size === null ? {} : { size }),
    ...Object.fromEntries(Object.entries(quantities).map(([name, value]) => [name, String(value)])),
  };
}

export function matchGrn(
  rows: readonly MatchedRow[],
  goods: GrnGoods,
): { readonly issues: PtIssue[]; readonly coverage: Coverage[] } {
  const file = new Map<string, { styleCode: string; sizeCode: string; quantity: number; rowNumbers: number[] }>();
  for (const row of rows) {
    const key = keyOf(row.styleCode, row.sizeCode);
    const group = file.get(key) ?? { styleCode: row.styleCode, sizeCode: row.sizeCode, quantity: 0, rowNumbers: [] };
    group.quantity += row.quantity;
    group.rowNumbers.push(row.rowNumber);
    file.set(key, group);
  }
  const grn = new Map(goods.map((each) => [keyOf(each.styleCode, each.size), each]));
  const issues: PtIssue[] = [];
  for (const [key, group] of file) {
    const first = group.rowNumbers[0];
    const counted = grn.get(key);
    if (counted === undefined) {
      issues.push({
        code: 'merchandise.pt-style-size-not-on-grn',
        field: 'design',
        ...(first === undefined ? {} : { rowNumber: first }),
        missing: [named(group.styleCode, group.sizeCode, { fileQuantity: group.quantity })],
      });
    } else if (counted.quantity !== group.quantity) {
      issues.push({
        code: 'merchandise.pt-quantity-differs-from-grn',
        field: 'qty',
        ...(first === undefined ? {} : { rowNumber: first }),
        missing: [
          named(counted.styleCode, counted.size, { fileQuantity: group.quantity, grnQuantity: counted.quantity }),
        ],
      });
    }
  }
  for (const [key, counted] of grn) {
    if (!file.has(key)) {
      issues.push({
        code: 'merchandise.pt-style-size-missing',
        missing: [named(counted.styleCode, counted.size, { grnQuantity: counted.quantity })],
      });
    }
  }
  const coverage = goods.map((each) => ({
    styleCode: each.styleCode,
    size: each.size,
    quantity: each.quantity,
    grnLineIds: [...each.grnLineIds],
    rowNumbers: file.get(keyOf(each.styleCode, each.size))?.rowNumbers ?? [],
  }));
  return { issues, coverage };
}
