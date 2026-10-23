import type {
  BookingStatusReport,
  HoldKind,
  ReceiptProblemsReport,
  ReportNames,
  ReportRate,
  StockOwner,
  StockReport,
  SupplierPerformanceReport,
} from '@apparel-os/schemas';
import {
  emptyCell,
  goodsCells,
  goodsHeader,
  namedCell,
  quantity,
  text,
  unknownCell,
  type Cell,
  type Sheet,
} from './export.js';
import { conditionText, dateText, exportText, holdKindText, instantText, listText } from './export-text.js';

// The stage 2 reports as the sheets of their exports (goods-in 9.1 "Any report or search result exports to XLSX as
// shown", 9.5; S2-F11-T02): each a table of the rows the screen shows, with its as-of time above it, names as
// "CODE · Name", dates DD MMM YYYY and times in the Organisation's timezone (design-language 8; code-house-rules 9).
// Unknown is written as the word, never as zero or a blank (PRD-EXC-010, PRD-MOD-015); a cost the reader may not see is
// left out of the file (access-and-approvals 6). Every word from the unit's text catalogue (code-house-rules 12.13).
// Pure (code-house-rules 2).

const preface = (title: string, asOf: string, timeZone: string) => [
  title,
  exportText('report.as-of', { time: instantText(asOf, timeZone) }),
];

const yes = (value: boolean): Cell => (value ? text(exportText('report.yes')) : emptyCell());
const dateCell = (date: string | null): Cell => (date === null ? emptyCell() : text(dateText(date)));
const rateCell = (rate: ReportRate): Cell =>
  rate.kind === 'measured' ? { kind: 'rate', numerator: rate.numerator, denominator: rate.denominator } : unknownCell();
const personCell = (names: ReportNames, userId: string): Cell => {
  const found = names.people.find((each) => each.userId === userId);
  return found === undefined ? unknownCell() : text(found.name);
};
const grnNumbers = (names: ReportNames, grnIds: readonly string[]): Cell => {
  if (grnIds.length === 0) return emptyCell();
  const numbers = grnIds.map((grnId) => names.grns.find((each) => each.grnId === grnId)?.number);
  return numbers.some((each) => each === undefined)
    ? unknownCell()
    : text(listText(numbers.filter((each): each is string => each !== undefined)));
};

/** The booking status, one row a line of each booking's version in force (goods-in 9.3). */
export function bookingStatusSheets(report: BookingStatusReport, timeZone: string): Sheet[] {
  const { names } = report;
  return [
    {
      name: exportText('booking-status.sheet'),
      preface: preface(exportText('booking-status.title'), report.asOf, timeZone),
      header: [
        exportText('booking-status.column.number'),
        exportText('booking-status.column.state'),
        exportText('booking-status.column.brand'),
        exportText('booking-status.column.season'),
        exportText('booking-status.column.supplier'),
        exportText('booking-status.column.destination'),
        exportText('booking-status.column.window-from'),
        exportText('booking-status.column.window-to'),
        exportText('booking-status.column.line'),
        exportText('booking-status.column.style'),
        exportText('booking-status.column.colour'),
        exportText('booking-status.column.size'),
        exportText('booking-status.column.delivery-date'),
        exportText('booking-status.column.due-date'),
        exportText('booking-status.column.ordered'),
        exportText('booking-status.column.delivered'),
        exportText('booking-status.column.cancelled'),
        exportText('booking-status.column.outstanding'),
        exportText('booking-status.column.over-delivered'),
        exportText('booking-status.column.overdue'),
        exportText('booking-status.column.grns'),
      ],
      rows: report.bookings.flatMap((booking) =>
        booking.status.lines.map((line) => [
          text(booking.number),
          text(exportText(`booking-status.state.${booking.state}`)),
          namedCell(names.brands, booking.brandId),
          namedCell(names.seasons, booking.seasonValueId),
          namedCell(names.suppliers, booking.supplierPartyId),
          namedCell(names.sites, booking.destinationSiteId),
          dateCell(booking.status.deliveryWindow.from),
          dateCell(booking.status.deliveryWindow.to),
          quantity(line.lineNumber),
          text(line.styleCode),
          line.colour === null ? emptyCell() : text(line.colour),
          line.size === null ? emptyCell() : text(line.size),
          dateCell(line.deliveryDate),
          dateCell(line.dueDate),
          quantity(line.ordered),
          quantity(line.delivered),
          quantity(line.cancelled),
          quantity(line.outstanding),
          quantity(line.overDelivered),
          yes(line.overdue),
          grnNumbers(names, [
            ...new Set(booking.deliveries.filter((each) => each.lineKey === line.lineKey).map((each) => each.grnId)),
          ]),
        ]),
      ),
    },
  ];
}

/** The receipt problems, one row a GRN line with a finding, with each decision and who made it (goods-in 9.3). */
export function receiptProblemsSheets(report: ReceiptProblemsReport, timeZone: string): Sheet[] {
  const { names } = report;
  return [
    {
      name: exportText('receipt-problems.sheet'),
      preface: preface(exportText('receipt-problems.title'), report.asOf, timeZone),
      header: [
        exportText('receipt-problems.column.grn'),
        exportText('receipt-problems.column.date'),
        exportText('receipt-problems.column.site'),
        exportText('receipt-problems.column.supplier'),
        exportText('receipt-problems.column.brand'),
        exportText('receipt-problems.column.line'),
        exportText('receipt-problems.column.goods'),
        exportText('receipt-problems.column.style'),
        exportText('receipt-problems.column.colour'),
        exportText('receipt-problems.column.size'),
        exportText('receipt-problems.column.description'),
        exportText('receipt-problems.column.invoiced'),
        exportText('receipt-problems.column.counted'),
        exportText('receipt-problems.column.recounted'),
        exportText('receipt-problems.column.shortage'),
        exportText('receipt-problems.column.extra'),
        exportText('receipt-problems.column.extra-kept'),
        exportText('receipt-problems.column.damaged'),
        exportText('receipt-problems.column.held-line'),
        exportText('receipt-problems.column.held-state'),
        exportText('receipt-problems.column.held-by'),
        exportText('receipt-problems.column.held-at'),
        exportText('receipt-problems.column.damage-report'),
        exportText('receipt-problems.column.damage-state'),
        exportText('receipt-problems.column.damage-by'),
        exportText('receipt-problems.column.damage-at'),
      ],
      rows: report.rows.map((row) => {
        const { line } = row;
        const findings = line.recounted?.findings ?? line.findings;
        const held = line.heldLine;
        const decision = held?.decision ?? null;
        const report = row.damageReport;
        const damageCells: Cell[] =
          report === null
            ? [emptyCell(), emptyCell(), emptyCell(), emptyCell()]
            : report.kind === 'unknown'
              ? [unknownCell(), unknownCell(), unknownCell(), unknownCell()]
              : [
                  text(report.number),
                  text(exportText(`damage-state.${report.state}`)),
                  report.decision === null ? emptyCell() : personCell(names, report.decision.decidedBy),
                  report.decision === null ? emptyCell() : text(instantText(report.decision.decidedAt, timeZone)),
                ];
        return [
          text(row.grnNumber),
          dateCell(row.businessDate),
          namedCell(names.sites, row.siteId),
          namedCell(names.suppliers, row.supplierPartyId),
          namedCell(names.brands, row.brandId),
          quantity(line.lineNumber),
          text(exportText(`receipt-problems.goods.${line.goods}`)),
          line.styleCode === null ? emptyCell() : text(line.styleCode),
          line.colour === null ? emptyCell() : text(line.colour),
          line.size === null ? emptyCell() : text(line.size),
          line.description === null ? emptyCell() : text(line.description),
          quantity(line.invoiceQuantity),
          quantity(line.countedQuantity),
          line.recounted === null ? emptyCell() : quantity(line.recounted.countedQuantity),
          quantity(findings.shortage),
          quantity(findings.extra),
          line.extra === null ? emptyCell() : text(exportText(`receipt-problems.extra.${line.extra}`)),
          quantity(findings.damaged),
          held === null ? emptyCell() : text(exportText(`held-kind.${held.kind}-line`)),
          held === null ? emptyCell() : text(exportText(`held-state.${held.state}`)),
          decision === null ? emptyCell() : personCell(names, decision.decidedBy),
          decision === null ? emptyCell() : text(instantText(decision.decidedAt, timeZone)),
          ...damageCells,
        ];
      }),
    },
  ];
}

/** The supplier report, one row a supplier, brand and season, its rates as percentages (goods-in 9.3). */
export function supplierPerformanceSheets(report: SupplierPerformanceReport, timeZone: string): Sheet[] {
  const { names } = report;
  return [
    {
      name: exportText('supplier-performance.sheet'),
      preface: [
        ...preface(exportText('supplier-performance.title'), report.asOf, timeZone),
        exportText('report.business-date', { date: dateText(report.businessDate) }),
      ],
      header: [
        exportText('supplier-performance.column.supplier'),
        exportText('supplier-performance.column.brand'),
        exportText('supplier-performance.column.season'),
        exportText('supplier-performance.column.fill-bookings'),
        exportText('supplier-performance.column.fill-ordered'),
        exportText('supplier-performance.column.fill-delivered'),
        exportText('supplier-performance.column.fill-rate'),
        exportText('supplier-performance.column.timed'),
        exportText('supplier-performance.column.on-time'),
        exportText('supplier-performance.column.late'),
        exportText('supplier-performance.column.arrival-unknown'),
        exportText('supplier-performance.column.on-time-rate'),
        exportText('supplier-performance.column.counted'),
        exportText('supplier-performance.column.damaged'),
        exportText('supplier-performance.column.damage-rate'),
      ],
      rows: report.rows.map((row) => [
        namedCell(names.suppliers, row.supplierPartyId),
        namedCell(names.brands, row.brandId),
        row.season.kind === 'value' ? namedCell(names.seasons, row.season.seasonValueId) : unknownCell(),
        quantity(row.fill.bookings),
        quantity(row.fill.ordered),
        quantity(row.fill.delivered),
        rateCell(row.fill.rate),
        quantity(row.timeliness.delivered),
        quantity(row.timeliness.onTime),
        quantity(row.timeliness.late),
        quantity(row.timeliness.unknown),
        rateCell(row.timeliness.rate),
        quantity(row.damage.counted),
        quantity(row.damage.damaged),
        rateCell(row.damage.rate),
      ]),
    },
  ];
}

function ownerCell(names: ReportNames, owner: StockOwner): Cell {
  const named = (list: readonly { readonly id: string; readonly code: string; readonly name: string }[], id: string) =>
    list.find((each) => each.id === id);
  if (owner.kind === 'unknown') return unknownCell();
  const found =
    owner.kind === 'organisation'
      ? named(names.legalEntities, owner.legalEntityId)
      : owner.kind === 'supplier'
        ? named(names.suppliers, owner.partyId)
        : named(names.brands, owner.brandId);
  const name = found === undefined ? exportText('stock-search.unknown') : exportText('stock-search.named', found);
  return text(exportText(`stock-report.owner.${owner.kind}`, { name }));
}

/** The stock report, one row a product at a place in a condition of an owner (goods-in 9.3). */
export function stockReportSheets(report: StockReport, timeZone: string): Sheet[] {
  const { names } = report;
  const kinds = [...new Set(report.rows.flatMap((each) => each.heldByKind.map((held) => held.kind)))].sort();
  const withCost = report.rows.some((each) => each.cost.kind !== 'masked');
  return [
    {
      name: exportText('stock-report.sheet'),
      preface: preface(exportText('stock-report.title'), report.asOf, timeZone),
      header: [
        ...goodsHeader(),
        exportText('stock-search.column.brand'),
        exportText('stock-search.column.site'),
        exportText('stock-search.column.unit'),
        exportText('stock-search.column.location'),
        exportText('stock-report.column.condition'),
        exportText('stock-report.column.owner'),
        exportText('stock-search.column.physical'),
        exportText('stock-search.column.available-as'),
        exportText('stock-search.column.available'),
        exportText('stock-search.column.waiting'),
        exportText('stock-search.column.held'),
        ...kinds.map((kind: HoldKind) => exportText('stock-search.column.held-kind', { kind: holdKindText(kind) })),
        exportText('stock-search.column.frozen'),
        exportText('stock-report.column.mrp'),
        ...(withCost ? [exportText('stock-search.column.cost')] : []),
        exportText('stock-report.column.grns'),
      ],
      rows: report.rows.map((row) => [
        ...goodsCells(row.product),
        namedCell(names.brands, row.brandId),
        namedCell(names.sites, row.siteId),
        namedCell(names.businessUnits, row.businessUnitId),
        namedCell(names.locations, row.locationId),
        text(conditionText(row.condition)),
        ownerCell(names, row.owner),
        quantity(row.physical),
        text(exportText(`stock-search.available.${row.availableAs}`)),
        quantity(row.available),
        quantity(row.waiting),
        quantity(row.held),
        ...kinds.map((kind) => quantity(row.heldByKind.find((held) => held.kind === kind)?.quantity ?? 0)),
        yes(row.frozen),
        row.mrpValue.kind === 'known' ? { kind: 'paise', paise: row.mrpValue.value } : unknownCell(),
        ...(withCost
          ? [
              row.cost.kind === 'known'
                ? ({ kind: 'paise', paise: row.cost.value } as const)
                : row.cost.kind === 'unknown'
                  ? unknownCell()
                  : emptyCell(),
            ]
          : []),
        grnNumbers(names, row.grnIds),
      ]),
    },
  ];
}
