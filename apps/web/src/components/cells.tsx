import type { StockCost } from '@apparel-os/schemas';
import { t } from '../messages/catalogue';
import { formatAmount } from '../setup/format';

// What a table cell shows of a value that may be Unknown, an amount or a rate (design-language 8; PRD-MOD-015): an
// Unknown value is a blank cell that a screen reader reads as unknown, never the word in the cell and never a dash; an
// amount carries no ₹, its column's header naming the currency; numbers are right-aligned with tabular figures. While a
// read is loading, the screen shows a blank cell, not the word Unknown (code review 8 of stage 2).

/** An Unknown value in a table cell: blank, read as unknown by a screen reader. */
export function UnknownInCell() {
  return <span className="sr-only">{t('receive.unknown')}</span>;
}

/** The classes of a cell holding a number: right-aligned, tabular figures (design-language 8 "Alignment"). */
export const numberCell = 'text-right tabular-nums';

/** An amount in paise in a table cell, with no ₹; Unknown blank (design-language 8 "Money · in tables"). */
export function AmountInCell({
  amount,
}: {
  amount: { readonly kind: 'known'; readonly value: number } | { readonly kind: 'unknown' };
}) {
  return amount.kind === 'known' ? <>{formatAmount(amount.value)}</> : <UnknownInCell />;
}

/**
 * A cost in a table cell (goods-in 9.4; access-and-approvals 6): the amount with no ₹; Unknown blank; Hidden for a
 * reader whose assignment does not grant the cost field class, which is no value to line up.
 */
export function CostInCell({ cost }: { cost: StockCost }) {
  if (cost.kind === 'masked') return <>{t('cost.masked')}</>;
  return <AmountInCell amount={cost} />;
}

/** A record a list names, as "CODE · Name", or Unknown when the answer does not name it (PRD-MOD-015). */
export function namedText(
  list: readonly { readonly id: string; readonly code: string; readonly name: string }[],
  id: string,
): string {
  const found = list.find((each) => each.id === id);
  return found === undefined ? t('receive.unknown') : t('record.named', { code: found.code, name: found.name });
}
