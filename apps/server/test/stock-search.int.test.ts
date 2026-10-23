import {
  accessHistoryPageSchema,
  arrivalReadSchema,
  scanAnsweredSchema,
  scanInReadSchema,
  stockSearchExportSchema,
  stockSearchSchema,
  type StockPosition,
  type StockSearch,
} from '@apparel-os/schemas';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { availability, custody } from '../src/modules/stock/ledger/index.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { asUserIn, RECEIVER_REPORTER_AUTHORITY } from './support/damage.js';
import { approved } from './support/organisation.js';
import { ptApprovalWorld, type Person, type PtApprovalWorld } from './support/pt-approval.js';
import { allowVerifier } from './support/postgres.js';
import { placeScope, STOCK_VIEW } from './support/receiving.js';

// S2-F11-T01: stock search through the whole application on real PostgreSQL (goods-in 9.1, 9.2, 9.4, 12 test 20;
// PRD-STK-001, PRD-STK-006, PRD-ACS-008, PRD-DMG-004, PRD-MER-007, PRD-EXC-010, PRD-SEC-007). The goods are made
// through their own routes, as a person makes them: a GRN counted and issued, its PT file submitted and approved by a
// different person, pieces scanned in, damage reported on a product at its location. Each search is read through its
// route; its four quantities are compared with the ledger's own reads (stock-ledger 13.6). Every person, place,
// product, barcode, cost and number is SYNTHETIC.

let w: PtApprovalWorld;
/** Reads stock with the cost field class, over every place: and so the export's cost and its access record. */
let searcher: Person;
/** Reads stock over every place, without the cost field class. */
let noCost: Person;
/** A Store's staff: reads stock and receipts at their own Store only, without cost (goods-in 12 test 20). */
let storeReader: Person;
/** Scans pieces in and reports damage, over every place. */
let scanner: Person;
/** Reads the sensitive-access records (numbering-and-audit 5.1). */
let auditor: Person;
/** Holds no grant on the stock record types. */
let outsider: Person;
let floor: string;

/** What a scanner holds (goods-in 7.1, 11): the receiver's, reporting damage, and scanning pieces in. */
const SCANNER_AUTHORITY = [...RECEIVER_REPORTER_AUTHORITY, { recordType: 'receiving.scan', action: 'create' as const }];

beforeAll(async () => {
  w = await ptApprovalWorld('SRC');
  await allowVerifier(w.database);
  const { setup } = w;
  floor = (
    await approved(setup, (c, p) =>
      setup.organisation.prepareLocation(c, p, {
        code: syntheticCode('SRC-FLOOR'),
        siteId: w.fixture.siteId,
        businessUnitId: w.fixture.wholeStore,
        name: syntheticName('Search shop floor'),
        kind: 'floor',
        validFrom: setup.today(),
      }),
    )
  ).recordId;
  searcher = await w.enrol('SRC-SEARCHER', STOCK_VIEW, { fieldClasses: ['cost'] });
  noCost = await w.enrol('SRC-NO-COST', STOCK_VIEW);
  storeReader = await w.enrol('SRC-STORE', [...STOCK_VIEW, { recordType: 'receiving.arrival', action: 'view' }], {
    scope: placeScope([{ type: 'store', id: w.fixture.storeId }]),
  });
  scanner = await w.enrol('SRC-SCANNER', SCANNER_AUTHORITY);
  auditor = await w.enrol('SRC-AUDITOR', [{ recordType: 'audit.sensitive_access_record', action: 'view' }]);
  outsider = await w.enrol('SRC-OUTSIDER', [{ recordType: 'receiving.arrival', action: 'view' }]);
}, 900_000);

afterAll(async () => {
  await (w as PtApprovalWorld | undefined)?.close();
});

const errorOf = (call: { body: Record<string, unknown> }) =>
  (call.body as { error?: { kind: string; code: string; missing?: Record<string, string>[] } }).error;

async function search(person: Person, query: Record<string, string>): Promise<StockSearch> {
  const read = await w.get(person, `/api/reports/stock-search?${new URLSearchParams(query).toString()}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return stockSearchSchema.parse(read.body);
}

/** A GRN counted and its PT file of the rows given submitted and approved by a different person; answers its parts. */
async function approvedPt(
  label: string,
  lines: readonly { readonly sizeAt: 0 | 1; readonly counted: number }[],
  rows: (style: string) => readonly Parameters<PtApprovalWorld['ptRow']>[2][],
) {
  const style = syntheticCode(label);
  const { grnId, arrivalId } = await w.issuedGrn(lines.map((line) => ({ style, ...line })));
  const ptRows = rows(style).map((values, index) => w.ptRow(style, lines[index % lines.length]?.sizeAt ?? 0, values));
  const { revisionId, requestId } = await w.submittedPt(grnId, ptRows);
  const decision = await w.decide(w.people.ptApprover, requestId, revisionId);
  expect(decision.status, JSON.stringify(decision.body)).toBe(200);
  const read = await w.get(scanner, `/api/receiving/grns/${grnId}/scan-in`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  const skuIds = scanInReadSchema.parse(read.body).products.map((each) => each.skuId);
  return { style, grnId, arrivalId, skuIds, barcodes: ptRows.map((row) => String(row.BARCODE)) };
}

async function scannedIn(grnId: string, barcode: string, destination: string) {
  const call = await w.post(scanner, `/api/receiving/grns/${grnId}/scans`, {
    barcode,
    destinationLocationId: destination,
  });
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  expect(scanAnsweredSchema.parse(call.body)).toMatchObject({ outcome: 'accepted' });
}

/** The results at a location. */
const at = (read: StockSearch, locationId: string) => read.positions.filter((each) => each.locationId === locationId);

/** The custody and what is available of a SKU at the Store's unit, as the ledger answers them (stock-ledger 13.6). */
async function ledgerOf(skuId: string) {
  return asUserIn(w.api.app, w.organisation, searcher.user.id, async (context) => {
    const held = await custody(context, { siteId: w.fixture.siteId, businessUnitId: w.fixture.wholeStore, skuId });
    const free = await availability(context, { siteId: w.fixture.siteId, businessUnitId: w.fixture.wholeStore, skuId });
    const physical = new Map<string, number>();
    const available = new Map<string, number>();
    for (const row of held.rows) {
      if (row.locationId !== null) physical.set(row.locationId, (physical.get(row.locationId) ?? 0) + row.quantity);
    }
    for (const row of free.rows) {
      if (row.locationId !== null) available.set(row.locationId, (available.get(row.locationId) ?? 0) + row.available);
    }
    return { physical, available };
  });
}

/** The quantities of a result: physical, available, waiting and held, with held by kind (goods-in 9.2). */
const quantitiesOf = (position: StockPosition | undefined) =>
  position === undefined
    ? undefined
    : {
        physical: position.physical,
        available: position.available,
        waiting: position.waiting,
        held: position.held,
        heldByKind: position.heldByKind,
      };

describe('stock search (goods-in 9.2)', () => {
  it('PRD-STK-001 PRD-DMG-004 the four quantities equal the ledger’s through counting, approval, scan-in and damage', async () => {
    const { style, grnId, skuIds, barcodes } = await approvedPt('SRC-FOUR', [{ sizeAt: 0, counted: 3 }], () => [
      {},
      {},
      {},
    ]);
    const skuId = skuIds[0] ?? '';
    // Approved, nothing scanned in: the three pieces wait at the receiving location (goods-in 7.4, 9.2).
    const approvedRead = await search(searcher, { text: style });
    expect(approvedRead.positions).toHaveLength(1);
    expect(approvedRead.positions[0]).toMatchObject({
      product: { kind: 'product', skuId, styleCode: style, size: w.code.size(0) },
      brandId: w.fixture.brand.id,
      siteId: w.fixture.siteId,
      storeId: w.fixture.storeId,
      businessUnitId: w.fixture.wholeStore,
      locationId: w.fixture.storeLocation,
      availableAs: 'sell',
      physical: 3,
      available: 0,
      waiting: 3,
      held: 0,
      heldByKind: [],
      frozen: false,
    });
    // Two scanned in to the floor, then damage reported on one of them there (goods-in 7.2, 8.1; PRD-DMG-004).
    await scannedIn(grnId, barcodes[0] ?? '', floor);
    await scannedIn(grnId, barcodes[1] ?? '', floor);
    const reported = await w.post(scanner, '/api/stock/damage-reports', {
      locationId: floor,
      goods: { kind: 'product', skuId },
      quantity: 1,
      description: 'SYNTHETIC stain found on the shop floor',
    });
    expect(reported.status, JSON.stringify(reported.body)).toBe(200);
    const read = await search(searcher, { text: style });
    expect(quantitiesOf(at(read, floor)[0])).toEqual({
      physical: 2,
      available: 1,
      waiting: 0,
      held: 1,
      heldByKind: [{ kind: 'damage', quantity: 1 }],
    });
    expect(quantitiesOf(at(read, w.fixture.storeLocation)[0])).toEqual({
      physical: 1,
      available: 0,
      waiting: 1,
      held: 0,
      heldByKind: [],
    });
    // The ledger's own reads say the same, place by place (stock-ledger 13.6).
    const ledger = await ledgerOf(skuId);
    for (const position of read.positions) {
      expect(position.physical).toBe(ledger.physical.get(position.locationId));
      expect(position.available).toBe(ledger.available.get(position.locationId) ?? 0);
    }
    expect(read.asOf).toBe(new Date(read.asOf).toISOString());
  });

  it('PRD-REC-008 goods before PT approval show by their counted style code, colour and size, waiting', async () => {
    const style = syntheticCode('SRC-COUNTED');
    await w.issuedGrn([{ style, sizeAt: 1, counted: 4 }]);
    const read = await search(searcher, { text: style.toLowerCase().slice(4) });
    expect(read.positions).toHaveLength(1);
    expect(read.positions[0]).toMatchObject({
      product: { kind: 'counted', styleCode: style, colour: 'SYNTHETIC NAVY', size: w.code.size(1) },
      brandId: w.fixture.brand.id,
      locationId: w.fixture.storeLocation,
      physical: 4,
      available: 0,
      waiting: 4,
      held: 0,
      // Its cost is not established before its PT: Unknown, never zero (PRD-MOD-015).
      cost: { kind: 'unknown' },
    });
    // By size too, and not under another size.
    expect((await search(searcher, { text: style, size: w.code.size(1) })).positions).toHaveLength(1);
    expect((await search(searcher, { text: style, size: w.code.size(0) })).positions).toHaveLength(0);
  });

  it('PRD-MER-007 a barcode repeated across products shows each product', async () => {
    const { skuIds } = await approvedPt(
      'SRC-REPEATED',
      [
        { sizeAt: 0, counted: 1 },
        { sizeAt: 1, counted: 1 },
      ],
      () => [{ BARCODE: '8901234500024' }, { BARCODE: '8901234500024' }],
    );
    expect(skuIds).toHaveLength(2);
    const read = await search(searcher, { barcode: '8901234500024' });
    expect(read.positions.map((each) => (each.product.kind === 'product' ? each.product.skuId : null)).sort()).toEqual(
      [...skuIds].sort(),
    );
  });

  it('PRD-STK-006 brand, place and condition narrow the search; a text matches no goods of another style', async () => {
    const { style } = await approvedPt('SRC-NARROW', [{ sizeAt: 0, counted: 1 }], () => [{}]);
    expect((await search(searcher, { text: style, brandId: w.fixture.brand.id })).positions).toHaveLength(1);
    expect((await search(searcher, { text: style, brandId: w.owned.brandId })).positions).toHaveLength(0);
    expect((await search(searcher, { text: style, locationId: w.fixture.storeLocation })).positions).toHaveLength(1);
    expect((await search(searcher, { text: style, locationId: floor })).positions).toHaveLength(0);
    expect((await search(searcher, { text: style, condition: 'good' })).positions).toHaveLength(1);
    expect((await search(searcher, { text: style, condition: 'damaged' })).positions).toHaveLength(0);
    expect((await search(searcher, { text: `${style}-NONE` })).positions).toHaveLength(0);
  });

  it('PRD-STK-006 the same product at the other Stores and warehouses the reader may see', async () => {
    const style = syntheticCode('SRC-ELSEWHERE');
    await w.issuedGrn([{ style, sizeAt: 0, counted: 2 }]);
    await w.issuedGrn([{ style, sizeAt: 0, counted: 5 }], { unit: 'warehouse' });
    const read = await search(searcher, { text: style, businessUnitId: w.fixture.wholeStore });
    expect(read.positions).toHaveLength(1);
    expect(read.elsewhere).toEqual([
      {
        productKey: read.positions[0]?.productKey,
        siteId: w.fixture.siteId,
        storeId: null,
        businessUnitId: w.fixture.warehouse,
        availableAs: 'move',
        physical: 5,
        available: 0,
        waiting: 5,
        held: 0,
      },
    ]);
    // With no place named, every place is among the results.
    const everywhere = await search(searcher, { text: style });
    expect(everywhere.positions.map((each) => each.businessUnitId).sort()).toEqual(
      [w.fixture.wholeStore, w.fixture.warehouse].sort(),
    );
    expect(everywhere.elsewhere).toEqual([]);
    expect(everywhere.names.businessUnits.map((each) => each.id).sort()).toEqual(
      [w.fixture.wholeStore, w.fixture.warehouse].sort(),
    );
  });

  it('PRD-MOD-003 a long search is read a page at a time by its cursor; a cursor it did not give is invalid', async () => {
    const style = syntheticCode('SRC-PAGES');
    await w.issuedGrn([{ style, sizeAt: 0, counted: 1 }]);
    await w.issuedGrn([{ style, sizeAt: 0, counted: 1 }], { unit: 'warehouse' });
    const first = await search(searcher, { text: style, limit: '1' });
    expect(first.positions).toHaveLength(1);
    expect(first.next).not.toBeNull();
    const second = await search(searcher, { text: style, limit: '1', after: first.next ?? '' });
    expect(second.positions).toHaveLength(1);
    expect(second.positions[0]?.businessUnitId).not.toBe(first.positions[0]?.businessUnitId);
    expect(second.next).toBeNull();
    const bogus = await w.get(searcher, '/api/reports/stock-search?after=bm90LWEtY3Vyc29y');
    expect(bogus.status, JSON.stringify(bogus.body)).toBe(400);
    expect(errorOf(bogus)?.code).toBe('kernel.invalid-request');
    const tooMany = await w.get(searcher, '/api/reports/stock-search?limit=101');
    expect(tooMany.status).toBe(400);
  });
});

describe('who sees what (goods-in 9.1; 12 test 20)', () => {
  it('PRD-ACS-008 PRD-SEC-005 a reader scoped to one Store sees only its stock and receipts, cost hidden', async () => {
    const style = syntheticCode('SRC-SCOPED');
    const store = await w.issuedGrn([{ style, sizeAt: 0, counted: 2 }]);
    const warehouse = await w.issuedGrn([{ style, sizeAt: 0, counted: 3 }], { unit: 'warehouse' });
    const read = await search(storeReader, { text: style });
    expect(read.positions.map((each) => each.businessUnitId)).toEqual([w.fixture.wholeStore]);
    expect(read.positions[0]?.cost).toEqual({ kind: 'masked' });
    // Elsewhere leaves out what the reader may not see too.
    expect((await search(storeReader, { text: style, businessUnitId: w.fixture.wholeStore })).elsewhere).toEqual([]);
    // Its receipts: the Store's Arrival is read, the warehouse's is not found (code-house-rules 12.3).
    const own = await w.get(storeReader, `/api/receiving/arrivals/${store.arrivalId}`);
    expect(own.status, JSON.stringify(own.body)).toBe(200);
    expect(arrivalReadSchema.parse(own.body).arrival.id).toBe(store.arrivalId);
    const other = await w.get(storeReader, `/api/receiving/arrivals/${warehouse.arrivalId}`);
    expect(other.status, JSON.stringify(other.body)).toBe(404);
    // A reader over every place sees both.
    expect((await search(noCost, { text: style })).positions).toHaveLength(2);
  });

  it('PRD-ACS-008 cost shows only with the cost field class: P RATE a piece times the pieces', async () => {
    const { style } = await approvedPt('SRC-COST', [{ sizeAt: 0, counted: 2 }], () => [{}, {}]);
    // SYNTHETIC: P RATE 945.00 a piece, two pieces: 1,890.00 (support/pt-approval.ts).
    expect((await search(searcher, { text: style })).positions[0]?.cost).toEqual({ kind: 'known', value: 189_000 });
    expect((await search(noCost, { text: style })).positions[0]?.cost).toEqual({ kind: 'masked' });
  });

  it('PRD-SEC-005 a person with no grant on the stock record types is refused, naming the permission', async () => {
    const read = await w.get(outsider, '/api/reports/stock-search');
    expect(read.status, JSON.stringify(read.body)).toBe(403);
    expect(errorOf(read)?.code).toBe('access.not-authorised');
  });
});

/** The rows of the first sheet of an exported file, from its header row on, as text. */
async function sheetOf(base64: string, sheet = 1): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(base64, 'base64') as unknown as ArrayBuffer);
  const rows: string[][] = [];
  workbook.worksheets[sheet - 1]?.eachRow((row) => {
    rows.push(
      (row.values as (string | number | undefined)[])
        .slice(1)
        .map((value) => (value === undefined ? '' : String(value))),
    );
  });
  return rows;
}

describe('the export (goods-in 9.1)', () => {
  it('PRD-SEC-007 an export with cost writes the sensitive-access record; one without cost writes none', async () => {
    const { style } = await approvedPt('SRC-EXPORT', [{ sizeAt: 0, counted: 2 }], () => [{}, {}]);
    const exported = await w.post(searcher, '/api/reports/stock-search/export', { text: style });
    expect(exported.status, JSON.stringify(exported.body)).toBe(200);
    const file = stockSearchExportSchema.parse(exported.body);
    expect(file.fileName).toMatch(/^stock-search-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const rows = await sheetOf(file.contentBase64);
    expect(rows[0]).toEqual(['Stock search']);
    const header = rows[2] ?? [];
    expect(header).toContain('Cost (₹)');
    const line = rows[3] ?? [];
    expect(line[header.indexOf('Style code')]).toBe(style);
    expect(line[header.indexOf('Physical')]).toBe('2');
    expect(line[header.indexOf('Waiting')]).toBe('2');
    expect(line[header.indexOf('Cost (₹)')]).toBe('1890.00');
    const history = await w.get(auditor, '/api/access/history/sensitive-access-records');
    expect(history.status, JSON.stringify(history.body)).toBe(200);
    const records = accessHistoryPageSchema
      .parse(history.body)
      .entries.filter(
        (each) => each.user?.id === searcher.user.id && each.record?.recordType === 'reports.stock_search_export',
      );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: 'sensitive-access', fieldClass: 'cost', exposure: 'exported' });

    const withoutCost = await w.post(noCost, '/api/reports/stock-search/export', { text: style });
    expect(withoutCost.status, JSON.stringify(withoutCost.body)).toBe(200);
    const plain = await sheetOf(stockSearchExportSchema.parse(withoutCost.body).contentBase64);
    expect(plain[2]).not.toContain('Cost (₹)');
    const after = accessHistoryPageSchema
      .parse((await w.get(auditor, '/api/access/history/sensitive-access-records')).body)
      .entries.filter((each) => each.user?.id === noCost.user.id);
    expect(after).toEqual([]);
  });

  it('PRD-INT-002 an export sent again under its key is not repeated: its file is never kept', async () => {
    const key = '01900000-0000-7000-8000-00000000e001';
    const first = await w.post(noCost, '/api/reports/stock-search/export', { text: 'SRC' }, key);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const again = await w.post(noCost, '/api/reports/stock-search/export', { text: 'SRC' }, key);
    expect(again.status, JSON.stringify(again.body)).toBe(409);
    expect(errorOf(again)?.code).toBe('kernel.answer-not-repeatable');
  });
});
