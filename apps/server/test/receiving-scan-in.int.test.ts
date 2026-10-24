import { uuidv7 } from '@apparel-os/domain';
import {
  inboxSchema,
  RECEIVING_CAPS,
  scanAnsweredSchema,
  scanInReadSchema,
  scanRefusalSchema,
  type ScanInRead,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RECEIVING, type ReceivingInterface } from '../src/modules/receiving/index.js';
import { availability, custody } from '../src/modules/stock/ledger/index.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { asUserIn, RECEIVER_REPORTER_AUTHORITY } from './support/damage.js';
import { approved, decided } from './support/organisation.js';
import { ptApprovalWorld, type Person, type PtApprovalWorld } from './support/pt-approval.js';
import { allowVerifier, connect } from './support/postgres.js';
import { RECEIVE_GOODS } from '../src/modules/receiving/domain/gate.js';
import { agreementTerms, capabilitySwitched, placeScope, STOCK_VIEW } from './support/receiving.js';
import { heldUntilSecondWaits } from './support/transactions.js';

// S2-F07-T01: the scan-in at the Site, through the whole application on real PostgreSQL (goods-in 7, 7.5, 10.3, 12
// tests 13, 14 and 17; PRD-REC-021, PRD-REC-022, PRD-STK-003, PRD-ACP-003, PRD-MER-007; DEC-135, DEC-141). The GRN, its
// PT file and the PT's approval go through their own routes; each scan through the scan route, and what it makes is
// read through the scan-in's read, the inbox and the ledger's reads. Every person, place, product, barcode and number is
// SYNTHETIC.

let w: PtApprovalWorld;
let scanner: Person;
let secondScanner: Person;
let otherStoreScanner: Person;
let floor: string;
let backstore: string;
let storeBin: string;
let warehouseBin: string;
/** A brand whose Agreement passes ownership at receipt and acceptance (DEC-141), linked to the fixture's supplier. */
let accepting: { readonly id: string; readonly code: string };

/** What a scanner holds (goods-in 7.1, 11): the receiver's, reporting damage, and scanning pieces in. */
const SCANNER_AUTHORITY = [...RECEIVER_REPORTER_AUTHORITY, { recordType: 'receiving.scan', action: 'create' as const }];

beforeAll(async () => {
  w = await ptApprovalWorld('SCN');
  await allowVerifier(w.database);
  const { setup } = w;
  const location = async (businessUnitId: string, kind: 'floor' | 'backstore' | 'bin', name: string) =>
    (
      await approved(setup, (c, p) =>
        setup.organisation.prepareLocation(c, p, {
          code: syntheticCode(`SCN-${name.toUpperCase().replaceAll(' ', '-')}`),
          siteId: w.fixture.siteId,
          businessUnitId,
          name: syntheticName(name),
          kind,
          validFrom: setup.today(),
        }),
      )
    ).recordId;
  floor = await location(w.fixture.wholeStore, 'floor', 'Shop floor');
  backstore = await location(w.fixture.wholeStore, 'backstore', 'Backstore');
  storeBin = await location(w.fixture.wholeStore, 'bin', 'Store bin');
  warehouseBin = await location(w.fixture.warehouse, 'bin', 'Warehouse bin');
  // The brand whose goods pass to the Organisation at their acceptance, the scan-in (DEC-141; POL-01.05).
  const code = syntheticCode('SCN-ACCEPTING');
  const made = await setup.asPreparerDo((c, p) =>
    setup.catalogue.prepareBrand(c, p, {
      code,
      name: syntheticName('Accepting brand'),
      aliases: [],
      validFrom: setup.today(),
    }),
  );
  if (made.kind !== 'success') throw new Error(made.refusal.code);
  accepting = { id: made.answer.recordId, code };
  const linked = await setup.asPreparerDo((c, p) =>
    setup.parties.prepareBrandSupplierLink(c, p, {
      brandId: accepting.id,
      partyId: w.fixture.supplier.id,
      linked: true,
      validFrom: setup.today(),
    }),
  );
  if (linked.kind !== 'success') throw new Error(linked.refusal.code);
  const agreement = await setup.asPreparerDo((c, p) =>
    setup.parties.prepareAgreement(c, p, {
      code: syntheticCode('SCN-ACCEPTING-AGR'),
      counterparty: { kind: 'brand', brandId: accepting.id },
      terms: agreementTerms({ kind: 'receipt-and-acceptance' }),
      margins: null,
      signedAgreement: [],
      validFrom: setup.today(),
    }),
  );
  if (agreement.kind !== 'success' || agreement.answer.requestId === undefined) {
    throw new Error('The Agreement version was not sent for approval');
  }
  decided(await setup.decide(agreement.answer.requestId, agreement.answer.versionId));
  scanner = await w.enrol('SCN-SCANNER', SCANNER_AUTHORITY);
  secondScanner = await w.enrol('SCN-SECOND', SCANNER_AUTHORITY);
  otherStoreScanner = await w.enrol('SCN-OTHER-STORE', SCANNER_AUTHORITY, {
    scope: placeScope([{ type: 'store', id: w.fixture.otherStoreId }]),
  });
}, 900_000);

afterAll(async () => {
  await (w as PtApprovalWorld | undefined)?.close();
});

const errorOf = (call: { body: Record<string, unknown> }) =>
  (call.body as { error?: { kind: string; code: string; missing?: Record<string, string>[] } }).error;

/** A GRN counted, its PT file of the rows given submitted and approved by a different person; answers its parts. */
async function approvedPt(
  label: string,
  lines: readonly { readonly sizeAt: 0 | 1; readonly counted: number }[],
  rows: (style: string) => readonly Parameters<PtApprovalWorld['ptRow']>[2][],
  at: Parameters<PtApprovalWorld['issuedGrn']>[1] = {},
) {
  const style = syntheticCode(label);
  const brandCode = at.brandId === accepting.id ? accepting.code : at.brand === 'owned' ? w.owned.code : undefined;
  const { grnId, arrivalId } = await w.issuedGrn(
    lines.map((line) => ({ style, ...line })),
    at,
  );
  const ptRows = rows(style).map((values, index) =>
    w.ptRow(style, lines[index % lines.length]?.sizeAt ?? 0, values, brandCode),
  );
  const { revisionId, requestId } = await w.submittedPt(grnId, ptRows);
  const decision = await w.decide(w.people.ptApprover, requestId, revisionId);
  expect(decision.status, JSON.stringify(decision.body)).toBe(200);
  return { style, grnId, arrivalId, revisionId, barcodes: ptRows.map((row) => String(row.BARCODE)) };
}

const scan = (
  person: Person,
  grnId: string,
  barcode: string,
  destinationLocationId: string,
  skuId?: string,
  key?: string,
) =>
  w.post(
    person,
    `/api/receiving/grns/${grnId}/scans`,
    { barcode, destinationLocationId, ...(skuId === undefined ? {} : { skuId }) },
    key,
  );

async function accepted(person: Person, grnId: string, barcode: string, destination: string) {
  const call = await scan(person, grnId, barcode, destination);
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  const answer = scanAnsweredSchema.parse(call.body);
  expect(answer).toMatchObject({ outcome: 'accepted', reason: null });
  return answer;
}

async function scanIn(grnId: string, person: Person = scanner): Promise<ScanInRead> {
  const read = await w.get(person, `/api/receiving/grns/${grnId}/scan-in`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return scanInReadSchema.parse(read.body);
}

/** What the delivery waits for in the Site's inbox, and in which view it is (goods-in 4.1; RR-606). */
async function inboxOf(arrivalId: string, person: Person = scanner) {
  for (const view of ['pending', 'history'] as const) {
    let after: string | null = null;
    do {
      const query: string = after === null ? `view=${view}` : `view=${view}&after=${after}`;
      const read = await w.get(person, `/api/receiving/sites/${w.fixture.siteId}/inbox?${query}`);
      expect(read.status, JSON.stringify(read.body)).toBe(200);
      const inbox = inboxSchema.parse(read.body);
      const entry = inbox.entries.find((each) => each.arrivalId === arrivalId);
      if (entry !== undefined) return { view, waitingFor: entry.waitingFor };
      after = inbox.next;
    } while (after !== null);
  }
  return undefined;
}

/** The custody and what is available of a SKU at a unit, as the PT's approver may see it (stock-ledger 13.6). */
async function stockOf(skuId: string, businessUnitId: string = w.fixture.wholeStore) {
  return asUserIn(w.api.app, w.organisation, w.people.ptApprover.user.id, async (context) => {
    const { rows } = await custody(context, { siteId: w.fixture.siteId, businessUnitId, skuId });
    const available = await availability(context, { siteId: w.fixture.siteId, businessUnitId, skuId });
    return {
      at: rows.map((row) => ({
        locationId: row.locationId,
        condition: row.condition,
        quantity: row.quantity,
        accepted: row.acceptedQuantity,
      })),
      available: available.rows.reduce((sum, row) => sum + row.available, 0),
    };
  });
}

const anyAccepted = (grnId: string) =>
  asUserIn(w.api.app, w.organisation, scanner.user.id, (context) =>
    w.api.app.get<ReceivingInterface>(RECEIVING).anyAccepted(context, grnId),
  );

describe('the scan-in at a Store (goods-in 7; 12 tests 13 and 14)', () => {
  it('PRD-STK-003 PRD-REC-021 DEC-135 after approval nothing is sellable; a scanned piece is accepted on the floor and sellable there', async () => {
    const { style, arrivalId, grnId, barcodes } = await approvedPt('SCN-SELL', [{ sizeAt: 0, counted: 2 }], () => [
      {},
      {},
    ]);
    // Approved: the GRN waits for its scan-in in the inbox (goods-in 7.1; RR-606), and nothing is sellable yet.
    expect(await inboxOf(arrivalId)).toEqual({ view: 'pending', waitingFor: 'scan-in' });
    const before = await scanIn(grnId);
    expect(before.state).toBe('scanning');
    expect(before.products).toEqual([
      expect.objectContaining({
        covered: 2,
        accepted: 0,
        waiting: 2,
        damaged: 0,
        held: 0,
        name: {
          kind: 'known',
          code: expect.any(String) as string,
          styleCode: style,
          size: { kind: 'known', value: w.code.size(0) },
        },
      }),
    ]);
    const skuId = before.products[0]?.skuId ?? '';
    expect((await stockOf(skuId)).available).toBe(0);
    expect(await anyAccepted(grnId)).toBe(false);
    // The destinations at a Store: its floor and backstore, never a bin or the receiving location (goods-in 7.2).
    expect(before.destinations.map((each) => each.id).sort()).toEqual([floor, backstore].sort());

    const first = await accepted(scanner, grnId, barcodes[0] ?? '', floor);
    expect(first.skuId).toBe(skuId);
    // The piece is on the floor, accepted, and sellable there; the other waits, unaccepted, where it was received.
    const stock = await stockOf(skuId);
    expect(stock.at).toEqual(
      expect.arrayContaining([
        { locationId: floor, condition: 'good', quantity: 1, accepted: 1 },
        { locationId: w.fixture.storeLocation, condition: 'good', quantity: 1, accepted: 0 },
      ]),
    );
    expect(stock.available).toBe(1);
    expect(await anyAccepted(grnId)).toBe(true);
    const after = await scanIn(grnId);
    expect(after.products[0]).toMatchObject({ accepted: 1, waiting: 1 });
    expect(after.scans[0]).toMatchObject({
      id: first.scanId,
      outcome: 'accepted',
      skuId,
      destinationLocationId: floor,
      scannedBy: scanner.user.id,
    });
    expect(after.people.map((each) => each.userId)).toContain(scanner.user.id);
  });

  it('PRD-REC-022 a barcode the PT does not cover is refused and kept in the record, and no stock changes', async () => {
    const { grnId } = await approvedPt('SCN-NOT-ON-PT', [{ sizeAt: 0, counted: 1 }], () => [{}]);
    const before = await scanIn(grnId);
    const skuId = before.products[0]?.skuId ?? '';
    const call = await scan(scanner, grnId, '8900000000999', floor);
    expect(call.status, JSON.stringify(call.body)).toBe(200);
    expect(scanAnsweredSchema.parse(call.body)).toMatchObject({
      outcome: 'refused',
      reason: 'not-covered',
      skuId: null,
    });
    const after = await scanIn(grnId);
    expect(after.scans[0]).toMatchObject({ outcome: 'refused', reason: 'not-covered', barcode: '8900000000999' });
    expect(after.products).toEqual(before.products);
    expect((await stockOf(skuId)).at).toEqual([
      { locationId: w.fixture.storeLocation, condition: 'good', quantity: 1, accepted: 0 },
    ]);
  });

  it("PRD-MER-007 DEC-135 a barcode on two of the PT's products asks which, and the person's choice is accepted", async () => {
    const { grnId, barcodes } = await approvedPt(
      'SCN-REPEATED',
      [
        { sizeAt: 0, counted: 1 },
        { sizeAt: 1, counted: 1 },
      ],
      () => [{ BARCODE: '8901234500017' }, { BARCODE: '8901234500017' }],
    );
    expect(barcodes).toEqual(['8901234500017', '8901234500017']);
    const products = (await scanIn(grnId)).products.map((each) => each.skuId);
    expect(products).toHaveLength(2);
    const ask = await scan(scanner, grnId, '8901234500017', backstore);
    expect(ask.status, JSON.stringify(ask.body)).toBe(422);
    expect(errorOf(ask)?.code).toBe('receiving.barcode-repeated');
    expect(errorOf(ask)?.missing).toEqual(
      expect.arrayContaining(
        products.map((skuId) => ({ kind: 'record', recordType: 'merchandise.sku', recordId: skuId })),
      ),
    );
    // Nothing was chosen silently, nor recorded: the person has not said which it is (goods-in 7.2).
    expect((await scanIn(grnId)).scans).toEqual([]);
    const notOfIt = await scan(scanner, grnId, '8901234500017', backstore, w.fixture.batchSku.id);
    expect(notOfIt.status, JSON.stringify(notOfIt.body)).toBe(422);
    expect(errorOf(notOfIt)?.code).toBe('receiving.product-not-of-barcode');
    const chosen = products[1] ?? '';
    const answer = await scan(scanner, grnId, '8901234500017', backstore, chosen);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(scanAnsweredSchema.parse(answer.body)).toMatchObject({ outcome: 'accepted', skuId: chosen });
    const read = await scanIn(grnId);
    expect(read.products.find((each) => each.skuId === chosen)).toMatchObject({ accepted: 1, waiting: 0 });
    expect(read.products.find((each) => each.skuId !== chosen)).toMatchObject({ accepted: 0, waiting: 1 });
  });

  it('PRD-DMG-001 damage found while scanning holds the piece, which is not accepted; the scan-in completes with it under its report', async () => {
    const { arrivalId, grnId, barcodes } = await approvedPt('SCN-DAMAGE', [{ sizeAt: 0, counted: 2 }], () => [{}, {}]);
    const skuId = (await scanIn(grnId)).products[0]?.skuId ?? '';
    // Reported on the product where it waits, at the receiving location (goods-in 7.2, 8.1, 8.2).
    const reported = await w.post(scanner, '/api/stock/damage-reports', {
      locationId: w.fixture.storeLocation,
      goods: { kind: 'product', skuId },
      quantity: 1,
      description: 'SYNTHETIC torn seam found while scanning',
    });
    expect(reported.status, JSON.stringify(reported.body)).toBe(200);
    expect((await scanIn(grnId)).products[0]).toMatchObject({
      covered: 2,
      accepted: 0,
      waiting: 1,
      damaged: 1,
      held: 0,
    });
    await accepted(scanner, grnId, barcodes[0] ?? '', floor);
    // The held piece is never accepted: its barcode finds nothing left of the product (goods-in 7.2, 8.4).
    const held = await scan(scanner, grnId, barcodes[1] ?? '', floor);
    expect(held.status, JSON.stringify(held.body)).toBe(200);
    expect(scanAnsweredSchema.parse(held.body)).toMatchObject({ outcome: 'refused', reason: 'nothing-left', skuId });
    const read = await scanIn(grnId);
    expect(read.state).toBe('complete');
    expect(read.products[0]).toMatchObject({ accepted: 1, waiting: 0, damaged: 1, held: 0 });
    const stock = await stockOf(skuId);
    expect(stock.available).toBe(1);
    expect(stock.at).toContainEqual({
      locationId: w.fixture.storeLocation,
      condition: 'good',
      quantity: 1,
      accepted: 0,
    });
    // Complete: the delivery leaves Pending for History (goods-in 4.1, 7.3).
    expect(await inboxOf(arrivalId)).toEqual({ view: 'history', waitingFor: null });
  });

  it('PRD-REC-022 a scan-in stopped with pieces left stays in the inbox, nothing written off, and another person resumes it', async () => {
    const { arrivalId, grnId, barcodes } = await approvedPt('SCN-RESUME', [{ sizeAt: 0, counted: 3 }], () => [
      {},
      {},
      {},
    ]);
    await accepted(scanner, grnId, barcodes[0] ?? '', floor);
    // Stopped: the two left stay unaccepted at the receiving location, and the delivery still waits (goods-in 7.3).
    const stopped = await scanIn(grnId);
    expect(stopped.state).toBe('scanning');
    expect(stopped.products[0]).toMatchObject({ covered: 3, accepted: 1, waiting: 2 });
    const skuId = stopped.products[0]?.skuId ?? '';
    expect((await stockOf(skuId)).at).toContainEqual({
      locationId: w.fixture.storeLocation,
      condition: 'good',
      quantity: 2,
      accepted: 0,
    });
    expect(await inboxOf(arrivalId)).toEqual({ view: 'pending', waitingFor: 'scan-in' });
    await accepted(secondScanner, grnId, barcodes[1] ?? '', backstore);
    await accepted(secondScanner, grnId, barcodes[2] ?? '', backstore);
    const resumed = await scanIn(grnId);
    expect(resumed.state).toBe('complete');
    expect(resumed.scans.map((each) => each.scannedBy)).toEqual([
      secondScanner.user.id,
      secondScanner.user.id,
      scanner.user.id,
    ]);
    expect((await stockOf(skuId)).available).toBe(3);
  });

  it('PRD-ACP-002 PRD-INT-003 the last piece scanned twice at once is accepted once: the second scan waits for the first under its lock', async () => {
    const { grnId, barcodes } = await approvedPt('SCN-RACE', [{ sizeAt: 0, counted: 1 }], () => [{}]);
    const [barcode] = barcodes;
    if (barcode === undefined) throw new Error('The PT has no barcode');
    const receiving = w.api.app.get<ReceivingInterface>(RECEIVING);
    // The first scan held under its lock of the GRN's row, its piece accepted, until the second is seen waiting
    // (code-house-rules 10.3; goods-in 7.2).
    const { first, second } = await heldUntilSecondWaits(
      w.database,
      (work) => asUserIn(w.api.app, w.organisation, scanner.user.id, work),
      (context) =>
        receiving.scanPiece(
          context,
          { userId: scanner.user.id, roleAssignmentId: scanner.assignmentId },
          grnId,
          { barcode, destinationLocationId: floor },
          uuidv7(),
        ),
      () => scan(secondScanner, grnId, barcode, floor),
    );
    if (first.kind !== 'success') throw new Error(`The first scan was refused: ${first.refusal.code}`);
    expect(first.answer).toMatchObject({ outcome: 'accepted', reason: null });
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    expect(scanAnsweredSchema.parse(second.body)).toMatchObject({ outcome: 'refused', reason: 'nothing-left' });
    const [product] = (await scanIn(grnId)).products;
    expect(product).toMatchObject({ covered: 1, accepted: 1, waiting: 0, skuId: first.answer.skuId });
    if (product === undefined) throw new Error('The scan-in names no product');
    expect((await stockOf(product.skuId)).at).toEqual([
      { locationId: floor, condition: 'good', quantity: 1, accepted: 1 },
    ]);
  });

  it('PRD-INT-002 a scan sent twice with the same key answers its first scan, once', async () => {
    const { grnId, barcodes } = await approvedPt('SCN-REPLAY', [{ sizeAt: 0, counted: 2 }], () => [{}, {}]);
    const key = uuidv7();
    const first = await scan(scanner, grnId, barcodes[0] ?? '', floor, undefined, key);
    const again = await scan(scanner, grnId, barcodes[0] ?? '', floor, undefined, key);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(again.body).toEqual(first.body);
    const read = await scanIn(grnId);
    expect(read.scans).toHaveLength(1);
    expect(read.products[0]).toMatchObject({ accepted: 1, waiting: 1 });
  });

  it('PRD-REC-021 refuses a scan before the PT is approved, and a destination other than the floor or backstore of the unit', async () => {
    const style = syntheticCode('SCN-BEFORE');
    const { grnId } = await w.issuedGrn([{ style, sizeAt: 0, counted: 1 }]);
    const row = w.ptRow(style, 0);
    const barcode = String(row.BARCODE);
    const { revisionId, requestId } = await w.submittedPt(grnId, [row]);
    const early = await scan(scanner, grnId, barcode, floor);
    expect(early.status, JSON.stringify(early.body)).toBe(422);
    expect(errorOf(early)?.code).toBe('receiving.pt-not-official');
    expect((await scanIn(grnId)).state).toBe('waiting-for-pt');
    expect((await w.decide(w.people.ptApprover, requestId, revisionId)).status).toBe(200);
    for (const destination of [storeBin, w.fixture.storeLocation, warehouseBin]) {
      const wrong = await scan(scanner, grnId, barcode, destination);
      expect(wrong.status, JSON.stringify(wrong.body)).toBe(422);
      expect(errorOf(wrong)).toMatchObject({
        code: 'receiving.destination-not-allowed',
        missing: [{ kind: 'record', recordType: 'organisation.location', recordId: destination }],
      });
    }
    expect((await scanIn(grnId)).scans).toEqual([]);
  });

  it('PRD-SEC-005 a GRN the scanner may not see is not found, its scan-in too', async () => {
    const { grnId, barcodes } = await approvedPt('SCN-HIDDEN', [{ sizeAt: 0, counted: 1 }], () => [{}]);
    const hidden = await scan(otherStoreScanner, grnId, barcodes[0] ?? '', floor);
    expect(hidden.status, JSON.stringify(hidden.body)).toBe(404);
    expect(errorOf(hidden)?.code).toBe('receiving.record-not-found');
    const read = await w.get(otherStoreScanner, `/api/receiving/grns/${grnId}/scan-in`);
    expect(read.status, JSON.stringify(read.body)).toBe(404);
  });

  it('DEC-117 PRD-SEC-005 the stock of the goods stays hidden from whoever may not see it: no counts, Unknown in the inbox, and no refusal names a record of it', async () => {
    const { arrivalId, grnId, barcodes } = await approvedPt('SCN-READER', [{ sizeAt: 0, counted: 2 }], () => [{}, {}]);
    await accepted(scanner, grnId, barcodes[0] ?? '', floor);
    const asScanner = await scanIn(grnId);
    const hiddenIds = [
      ...asScanner.products.map((each) => each.skuId),
      ...asScanner.scans.flatMap((each) => (each.skuId === null ? [] : [each.skuId])),
    ];
    // A reader of the Arrival with no view on the stock: the scan-in is refused, naming a permission only, never a
    // product, an origin, a balance or a hold of the goods (code-house-rules 6.2, 12.3).
    const refused = await w.get(w.people.ptReader, `/api/receiving/grns/${grnId}/scan-in`);
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    expect(errorOf(refused)).toMatchObject({ kind: 'not-authorised', code: 'access.not-authorised' });
    expect(errorOf(refused)?.missing?.map((each) => each.kind)).toEqual(['permission']);
    for (const id of hiddenIds) expect(JSON.stringify(refused.body)).not.toContain(id);
    // The inbox lists the delivery as Unknown to them: whether its scan-in is complete is read from the stock.
    expect(await inboxOf(arrivalId, w.people.ptReader)).toEqual({ view: 'pending', waitingFor: 'unknown' });
    expect(await inboxOf(arrivalId)).toEqual({ view: 'pending', waitingFor: 'scan-in' });
    // A scanner without view on the stock is refused the scan, naming the permission, and nothing is recorded.
    const blind = await w.enrol(
      'SCN-NO-STOCK',
      SCANNER_AUTHORITY.filter((each) => !STOCK_VIEW.some((stock) => stock.recordType === each.recordType)),
    );
    const scanned = await scan(blind, grnId, barcodes[1] ?? '', floor);
    expect(scanned.status, JSON.stringify(scanned.body)).toBe(403);
    expect(errorOf(scanned)).toMatchObject({ kind: 'not-authorised', code: 'access.not-authorised' });
    expect(errorOf(scanned)?.missing?.map((each) => each.kind)).toEqual(['permission']);
    expect((await scanIn(grnId)).scans).toHaveLength(1);
  });

  it('PRD-SEC-017 goods-in 10.5 a scan is refused while the receiving activity is not available, and nothing is recorded', async () => {
    const { grnId, barcodes } = await approvedPt('SCN-GATE', [{ sizeAt: 0, counted: 1 }], () => [{}]);
    await capabilitySwitched(w.setup, w.database, RECEIVE_GOODS, false);
    try {
      const refused = await scan(scanner, grnId, barcodes[0] ?? '', floor);
      expect(refused.status, JSON.stringify(refused.body)).toBe(403);
      expect(errorOf(refused)?.code).toBe('configuration.operation-unavailable');
      expect(errorOf(refused)?.missing).toContainEqual({ kind: 'capability', capability: RECEIVE_GOODS.capability });
      const read = await scanIn(grnId);
      expect(read.blocking).toContainEqual({ kind: 'capability', capability: RECEIVE_GOODS.capability });
      expect(read.scans).toEqual([]);
    } finally {
      await capabilitySwitched(w.setup, w.database, RECEIVE_GOODS, true);
    }
    await accepted(scanner, grnId, barcodes[0] ?? '', floor);
  });

  it('DEC-141 POL-01.05 under an Agreement passing ownership at receipt and acceptance, the scan waits for SL-26 and changes nothing', async () => {
    const { grnId, barcodes } = await approvedPt('SCN-ACCEPTANCE', [{ sizeAt: 0, counted: 1 }], () => [{}], {
      brandId: accepting.id,
    });
    const refusal = await scan(scanner, grnId, barcodes[0] ?? '', floor);
    expect(refusal.status, JSON.stringify(refusal.body)).toBe(403);
    expect(errorOf(refusal)).toMatchObject({ kind: 'unavailable', code: 'stock.rule-not-set' });
    expect(errorOf(refusal)?.missing).toContainEqual({ kind: 'open-question', question: 'SL-26' });
    const read = await scanIn(grnId);
    expect(read.scans).toEqual([]);
    expect(read.products[0]).toMatchObject({ accepted: 0, waiting: 1 });
  });
});

describe('the scan-in record (goods-in 7.5)', () => {
  it("PRD-REC-022 the database's cap on a scanned barcode is the shared schema's cap of a code", async () => {
    const verify = await connect(w.database, 'verify');
    try {
      const found = await verify.query<{ definition: string }>(
        `select pg_catalog.pg_get_constraintdef(oid) as definition from pg_catalog.pg_constraint
          where conname = 'scan_barcode'`,
      );
      const cap = /length\(barcode\) <= (\d+)/.exec(found.rows[0]?.definition ?? '')?.[1];
      expect(Number(cap)).toBe(RECEIVING_CAPS.codeText);
    } finally {
      await verify.end();
    }
  });

  it("PRD-REC-022 the database's check of a refused scan's reasons lists the shared schema's", async () => {
    const verify = await connect(w.database, 'verify');
    try {
      const found = await verify.query<{ definition: string }>(
        `select pg_catalog.pg_get_constraintdef(oid) as definition from pg_catalog.pg_constraint
          where conname = 'scan_outcome'`,
      );
      const definition = found.rows[0]?.definition ?? '';
      const listed = [...definition.matchAll(/'([a-z-]+)'::text/g)].map((match) => match[1]);
      // The reasons a refused scan keeps, and the two outcomes the check names besides.
      expect(new Set(listed)).toEqual(new Set([...scanRefusalSchema.options, 'accepted', 'refused']));
    } finally {
      await verify.end();
    }
  });
});

describe('goods received at a warehouse (goods-in 7.2, 7.4; 12 test 17)', () => {
  it('PRD-ACP-003 a warehouse meets the same acceptance and hold checks: scanned into a bin, the piece is available to move', async () => {
    const { arrivalId, grnId, barcodes } = await approvedPt(
      'SCN-WAREHOUSE',
      [{ sizeAt: 0, counted: 2 }],
      () => [{}, {}],
      { unit: 'warehouse' },
    );
    expect(await inboxOf(arrivalId)).toEqual({ view: 'pending', waitingFor: 'scan-in' });
    const before = await scanIn(grnId);
    expect(before.destinations.map((each) => each.id)).toEqual([warehouseBin]);
    const skuId = before.products[0]?.skuId ?? '';
    expect((await stockOf(skuId, w.fixture.warehouse)).available).toBe(0);
    // A Store's floor is no destination of a warehouse's goods (goods-in 7.2).
    const floorRefused = await scan(scanner, grnId, barcodes[0] ?? '', floor);
    expect(errorOf(floorRefused)?.code).toBe('receiving.destination-not-allowed');
    const notOnPt = await scan(scanner, grnId, '8900000000999', warehouseBin);
    expect(scanAnsweredSchema.parse(notOnPt.body)).toMatchObject({ outcome: 'refused', reason: 'not-covered' });
    const reported = await w.post(scanner, '/api/stock/damage-reports', {
      locationId: w.fixture.warehouseLocation,
      goods: { kind: 'product', skuId },
      quantity: 1,
      description: 'SYNTHETIC crushed carton found while scanning',
    });
    expect(reported.status, JSON.stringify(reported.body)).toBe(200);
    await accepted(scanner, grnId, barcodes[0] ?? '', warehouseBin);
    const left = await scan(scanner, grnId, barcodes[1] ?? '', warehouseBin);
    expect(scanAnsweredSchema.parse(left.body)).toMatchObject({ outcome: 'refused', reason: 'nothing-left' });
    const stock = await stockOf(skuId, w.fixture.warehouse);
    expect(stock.at).toContainEqual({ locationId: warehouseBin, condition: 'good', quantity: 1, accepted: 1 });
    expect(stock.available).toBe(1);
    expect((await scanIn(grnId)).state).toBe('complete');
  });
});
