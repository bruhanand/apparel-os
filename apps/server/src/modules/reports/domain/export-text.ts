import type { HoldKind, StockCondition } from '@apparel-os/schemas';

// The text `reports` writes into a file it makes (code-house-rules 12.13: "Text the server writes into a file it
// makes, such as an export's headings, comes from a catalogue in the owning unit"; S2-F11-T01, S2-F11-T02): English
// (India), each entry by its identifier, values named in braces. Hindi joins in stage 5 with the screens'
// (code-house-rules 12.13).

const EN_IN = {
  'stock-search.sheet': 'Stock search',
  'stock-search.elsewhere-sheet': 'Other Stores and warehouses',
  'stock-search.title': 'Stock search',
  'stock-search.as-of': 'As of {time}',
  'stock-search.column.goods': 'Goods',
  'stock-search.column.code': 'Product code',
  'stock-search.column.style': 'Style code',
  'stock-search.column.size': 'Size',
  'stock-search.column.identity': 'Colour and identity',
  'stock-search.column.article': 'Article number',
  'stock-search.column.brand': 'Brand',
  'stock-search.column.site': 'Site',
  'stock-search.column.unit': 'Business unit',
  'stock-search.column.location': 'Location',
  'stock-search.column.physical': 'Physical',
  'stock-search.column.available': 'Available',
  'stock-search.column.available-as': 'Available to',
  'stock-search.column.waiting': 'Waiting',
  'stock-search.column.held': 'Held',
  'stock-search.column.held-kind': 'Held: {kind}',
  'stock-search.column.frozen': 'Count in progress',
  'stock-search.column.cost': 'Cost (₹)',
  'stock-search.goods.product': 'Product',
  'stock-search.goods.counted': 'Counted, not yet set up',
  'stock-search.goods.unidentified': 'Unidentified',
  'stock-search.available.sell': 'Sell',
  'stock-search.available.move': 'Move',
  'stock-search.yes': 'Yes',
  'stock-search.unknown': 'Unknown',
  'stock-search.named': '{code} · {name}',
  'hold-kind.damage': 'Damage',
  'hold-kind.quarantine': 'Quarantine',
  'hold-kind.excess': 'Excess',
  'hold-kind.source-conflict': 'Source conflict',
  'hold-kind.expiry': 'Expiry',
  'hold-kind.ordinary': 'Ordinary hold',
  'hold-kind.inspection': 'Inspection',
  'hold-kind.write-off': 'Write-off',
  'condition.good': 'Good',
  'condition.damaged': 'Damaged',
  'condition.wrong': 'Wrong',
  'condition.unidentified': 'Unidentified',
  // The stage 2 reports (goods-in 9.3, 9.5; S2-F11-T02).
  'report.as-of': 'As of {time}',
  'report.business-date': 'Business date {date}',
  'report.yes': 'Yes',
  'booking-status.sheet': 'Booking status',
  'booking-status.title': 'Booking status',
  'booking-status.column.number': 'Booking',
  'booking-status.column.state': 'State',
  'booking-status.column.brand': 'Brand',
  'booking-status.column.season': 'Season',
  'booking-status.column.supplier': 'Supplier',
  'booking-status.column.destination': 'Destination',
  'booking-status.column.window-from': 'Window from',
  'booking-status.column.window-to': 'Window to, as extended',
  'booking-status.column.line': 'Line',
  'booking-status.column.style': 'Style code',
  'booking-status.column.colour': 'Colour',
  'booking-status.column.size': 'Size',
  'booking-status.column.delivery-date': 'Own delivery date',
  'booking-status.column.due-date': 'Due date',
  'booking-status.column.ordered': 'Ordered',
  'booking-status.column.delivered': 'Delivered',
  'booking-status.column.cancelled': 'Cancelled',
  'booking-status.column.outstanding': 'Outstanding',
  'booking-status.column.over-delivered': 'Over-delivered',
  'booking-status.column.overdue': 'Overdue',
  'booking-status.column.grns': 'Delivered by GRN',
  'booking-status.state.Approved': 'Approved',
  'booking-status.state.Issued': 'Issued',
  'booking-status.state.Confirmed': 'Confirmed',
  'receipt-problems.sheet': 'Receipt problems',
  'receipt-problems.title': 'Receipt problems',
  'receipt-problems.column.grn': 'GRN',
  'receipt-problems.column.date': 'GRN date',
  'receipt-problems.column.site': 'Site',
  'receipt-problems.column.supplier': 'Supplier',
  'receipt-problems.column.brand': 'Brand',
  'receipt-problems.column.line': 'Line',
  'receipt-problems.column.goods': 'Goods',
  'receipt-problems.column.style': 'Style code',
  'receipt-problems.column.colour': 'Colour',
  'receipt-problems.column.size': 'Size',
  'receipt-problems.column.description': 'What they look like',
  'receipt-problems.column.invoiced': 'Invoiced',
  'receipt-problems.column.counted': 'Counted',
  'receipt-problems.column.recounted': 'Recounted',
  'receipt-problems.column.shortage': 'Shortage',
  'receipt-problems.column.extra': 'Extra',
  'receipt-problems.column.extra-kept': 'Extra pieces',
  'receipt-problems.column.damaged': 'Damaged at the count',
  'receipt-problems.column.held-line': 'Held as',
  'receipt-problems.column.held-state': 'Decision',
  'receipt-problems.column.held-by': 'Decided by',
  'receipt-problems.column.held-at': 'Decided on',
  'receipt-problems.column.damage-report': 'Damage report',
  'receipt-problems.column.damage-state': 'Damage decision',
  'receipt-problems.column.damage-by': 'Damage decided by',
  'receipt-problems.column.damage-at': 'Damage decided on',
  'receipt-problems.goods.on-invoice': 'On the invoice',
  'receipt-problems.goods.wrong': 'Wrong',
  'receipt-problems.goods.unidentified': 'Unidentified',
  'receipt-problems.extra.received': 'Received and held',
  'receipt-problems.extra.not-received': 'Not received',
  'held-kind.excess-line': 'Excess',
  'held-kind.wrong-line': 'Wrong',
  'held-kind.unidentified-line': 'Unidentified',
  'held-state.Awaiting approval': 'Awaiting approval',
  'held-state.Accepted': 'Accepted',
  'held-state.Held': 'Held',
  'damage-state.Submitted': 'Submitted',
  'damage-state.Confirmed': 'Confirmed',
  'damage-state.Rejected': 'Rejected',
  'supplier-performance.sheet': 'Supplier performance',
  'supplier-performance.title': 'Supplier fill rate and timeliness',
  'supplier-performance.column.supplier': 'Supplier',
  'supplier-performance.column.brand': 'Brand',
  'supplier-performance.column.season': 'Season',
  'supplier-performance.column.fill-bookings': 'Bookings ended or closed',
  'supplier-performance.column.fill-ordered': 'Ordered',
  'supplier-performance.column.fill-delivered': 'Delivered',
  'supplier-performance.column.fill-rate': 'Fill rate',
  'supplier-performance.column.timed': 'Delivered pieces',
  'supplier-performance.column.on-time': 'On time',
  'supplier-performance.column.late': 'Late',
  'supplier-performance.column.arrival-unknown': 'Arrival not known',
  'supplier-performance.column.on-time-rate': 'On-time rate',
  'supplier-performance.column.counted': 'Counted',
  'supplier-performance.column.damaged': 'Damaged at the count, confirmed',
  'supplier-performance.column.damage-rate': 'Damage rate',
  'stock-report.sheet': 'Stock',
  'stock-report.title': 'Stock by product, size, location, condition and owner',
  'stock-report.column.condition': 'Condition',
  'stock-report.column.owner': 'Owner',
  'stock-report.column.mrp': 'MRP value (₹)',
  'stock-report.column.grns': 'Counted on GRN',
  'stock-report.owner.organisation': 'Organisation: {name}',
  'stock-report.owner.supplier': 'Supplier: {name}',
  'stock-report.owner.brand': 'Brand: {name}',
} as const;

export type ExportTextId = keyof typeof EN_IN;

/** An entry of the catalogue with its values put in. */
export function exportText(id: ExportTextId, values: Readonly<Record<string, string>> = {}): string {
  return EN_IN[id].replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);
}

export const holdKindText = (kind: HoldKind): string => exportText(`hold-kind.${kind}`);
export const conditionText = (condition: StockCondition): string => exportText(`condition.${condition}`);

/** A list in the reading language, as `Intl` joins it (code-house-rules 12.13; design-language 8). */
export const listText = (items: readonly string[]): string =>
  new Intl.ListFormat('en-IN', { style: 'long', type: 'conjunction' }).format(items);

/** A business date, DD MMM YYYY (design-language 8): a calendar day, so read in UTC, never moved by a timezone. */
export function dateText(date: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/** An instant in the Organisation's timezone, DD MMM YYYY and the time of day (design-language 8; code-house-rules 9). */
export function instantText(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
}
