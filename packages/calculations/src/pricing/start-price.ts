// Step 1, the start price of each line (shared-calculations 5.2; PRD-POS-003, PRD-POS-024, PRD-OFR-004, PRD-MER-015,
// DEC-111). The price-list price the line names, otherwise the MRP of the goods sold; an authorised manual price
// change replaces it. Authority is checked by `pos`, never here (2.2).

import { isKnown } from '@apparel-os/domain';
import { amountIn } from '../numbers/amounts.js';
import { type Refusal, refusal } from '../result.js';
import type { BillLineInput, PriceList, PricedLine } from './types.js';

export interface StartPrice {
  readonly quantity: bigint;
  readonly mrp: bigint;
  readonly startPrice: bigint;
  readonly source: PricedLine['startPriceSource'];
  readonly priceListVersion: string | null;
  /** True when the start price came from a markdown price list (5.3). */
  readonly markdown: boolean;
}

export function resolveStartPrice(
  line: BillLineInput,
  priceLists: readonly PriceList[],
): { ok: true; value: StartPrice } | { ok: false; refusals: Refusal[] } {
  const refusals: Refusal[] = [];
  const named = { line: line.id };
  // 3.1: a fractional, zero or negative quantity is refused.
  const wholeQuantity = Number.isSafeInteger(line.quantity) && line.quantity > 0;
  if (!wholeQuantity) refusals.push(refusal('invalid-quantity', { ...named, input: 'quantity' }));

  // 5.2, PRD-MER-015, PRD-MOD-015: goods with no known MRP cannot be priced; Unknown is never zero.
  if (!isKnown(line.mrp))
    return { ok: false, refusals: [...refusals, refusal('price-unknown', { ...named, input: 'mrp' })] };
  const mrp = amountIn(line.mrp.value, `Line ${line.id}: MRP`);

  const source = line.startPrice;
  let startPrice: bigint;
  let priceListVersion: string | null = null;
  let markdown = false;
  if (source.source === 'mrp') {
    startPrice = mrp;
  } else if (source.source === 'manual') {
    startPrice = amountIn(source.pricePerUnit, `Line ${line.id}: manual price`);
  } else {
    const list = priceLists.find((p) => p.id === source.priceList);
    const entry = list?.prices.find((p) => p.item === line.item);
    if (list === undefined || entry === undefined) {
      return { ok: false, refusals: [...refusals, refusal('price-unknown', { ...named, input: 'price-list' })] };
    }
    startPrice = amountIn(entry.pricePerUnit, `Price list ${list.id}: price`);
    priceListVersion = list.version;
    markdown = list.markdown;
  }
  // PRD-POS-024, DEC-111: a start price above the MRP of the goods sold is refused, from a price list or a manual
  // change alike, with no override.
  if (startPrice > mrp) {
    refusals.push(
      refusal('price-above-mrp', { ...named, input: source.source === 'manual' ? 'manual-price' : 'price-list' }),
    );
  }
  if (refusals.length > 0) return { ok: false, refusals };
  return {
    ok: true,
    value: { quantity: BigInt(line.quantity), mrp, startPrice, source: source.source, priceListVersion, markdown },
  };
}
