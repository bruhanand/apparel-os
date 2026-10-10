import { paise, uuidv7 } from '@apparel-os/domain';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rebuildAndCompare, type LedgerItem, type SkuFacts } from '../src/modules/stock/ledger/index.js';
import { syntheticCode } from './fixtures/synthetic.js';
import { trialBalance } from './harness/stock/checks.js';
import { written } from './support/stock-ledger.js';
import { ValuedWorld, type At } from './support/stock-valued.js';

// S1-F10-T06: refusals of the items the further scenarios brought (stock-ledger 13.4, 13.8): a FIFO reversal of an
// inflow beyond its own layers (SL-27), a reversal of a kind not built, a piece correction across owners (SL-28), and a
// count difference that passes only its own count's freeze (8.1, 8.2). The scenarios themselves run through the harness
// (stock-harness-further.int.test.ts). Every value is SYNTHETIC.

const world = new ValuedWorld();

beforeAll(async () => {
  await world.start('stockfur');
}, 600_000);

afterAll(async () => {
  await world.stop();
});

let codeNumber = 0;
const codes = (count: number) => Array.from({ length: count }, () => syntheticCode(`FPIECE-${String(++codeNumber)}`));
const line = () => uuidv7();
const rupees = (amount: number) => paise(Math.round(amount * 100));

const posted = async (items: readonly LedgerItem[]) => written(await world.post(world.poster, items));

async function refused(items: readonly LedgerItem[]) {
  const result = await world.post(world.poster, items);
  if (result.kind !== 'refused') throw new Error('posted');
  return result.refusal;
}

const read = <T>(work: Parameters<typeof world.run<T>>[1]) => world.run(world.poster.user.id, work);

/** Receives pieces at a P RATE, covered, accepted and costed (13.4, 13.5). */
async function receiveAt(at: At, sku: SkuFacts, count: number, pRate: number, legalEntityId: string) {
  const pieceCodes = codes(count);
  const receipt = await posted([
    {
      kind: 'receipt-count',
      lineId: line(),
      skuId: sku.skuId,
      quantity: count,
      to: at,
      condition: 'good',
      owner: { kind: 'organisation', legalEntityId },
      pieceCodes,
    },
  ]);
  const originId = receipt.receiptOriginIds[0] ?? '';
  const ptRevisionId = uuidv7();
  await posted([
    { kind: 'record-coverage', lineId: line(), ptRevisionId, receiptOriginId: originId, pieceCodes },
    { kind: 'record-acceptance', lineId: line(), at, goods: { skuId: sku.skuId, quantity: count, pieceCodes } },
    { kind: 'cost-established', lineId: line(), receiptOriginId: originId, ptRevisionId, pRatePaise: rupees(pRate) },
  ]);
  return { originId, pieceCodes, receiptMovementId: receipt.movementIds[0] ?? '' };
}

/** The movement of a kind that moved an origin's units. */
async function movementOf(kind: string, originId: string): Promise<string> {
  const id = await read(
    async (context) =>
      (
        await context.tx.execute<{ id: string }>(sql`
          select m.id from stock.movement m join stock.movement_leg l on l.movement_id = m.id
          where m.kind = ${kind} and l.receipt_origin_id = ${originId}::uuid`)
      ).rows[0]?.id,
  );
  if (id === undefined) throw new Error(`No ${kind} of ${originId}`);
  return id;
}

describe('reversals (stock-ledger 7.5, 13.4 "Reversal")', () => {
  it('SL-27 under FIFO a reversal of a receipt whose own layer no longer holds its units is refused', async () => {
    const combo = await world.book('fifo', 'book');
    const sku = world.sku(true);
    // SYNTHETIC: R1 2 @ ₹100.00 and R2 2 @ ₹130.00 at S1; selling R2's two pieces takes R1's layer first (7.4).
    const r1 = await receiveAt(combo.s1, sku, 2, 100, combo.legalEntityId);
    const r2 = await receiveAt(combo.s1, sku, 2, 130, combo.legalEntityId);
    await posted([
      {
        kind: 'sale-issue',
        lineId: line(),
        at: combo.s1,
        handover: 'now',
        goods: { skuId: sku.skuId, quantity: 2, pieceCodes: r2.pieceCodes },
      },
    ]);
    const refusal = await refused([
      {
        kind: 'reversal',
        lineId: line(),
        movementId: r1.receiptMovementId,
        at: combo.s1,
        goods: { skuId: sku.skuId, quantity: 1, pieceCodes: [r1.pieceCodes[0] ?? ''] },
      },
    ]);
    expect(refusal).toMatchObject({ code: 'stock.rule-not-set', missing: [{ kind: 'line' }, { question: 'SL-27' }] });
    // A reversal of a kind not built yet is refused, naming the kind.
    expect(
      await refused([
        {
          kind: 'reversal',
          lineId: line(),
          movementId: await movementOf('sale-issue', r2.originId),
          at: combo.s1,
          goods: { skuId: sku.skuId, quantity: 1, pieceCodes: [r2.pieceCodes[0] ?? ''] },
        },
      ]),
    ).toMatchObject({ code: 'stock.invalid-item', missing: [{ kind: 'line' }, { movementKind: 'sale-issue' }] });
  }, 300_000);
});

describe('piece correction (stock-ledger 8.4, 13.4; PRD-STK-015)', () => {
  it('SL-28 a piece correction between pieces of different owners is refused, for the no-match route', async () => {
    const combo = await world.book('moving-average', 'book');
    const sku = world.sku(true);
    const owned = await receiveAt(combo.s1, sku, 1, 100, combo.legalEntityId);
    const sold = await posted([
      {
        kind: 'sale-issue',
        lineId: line(),
        at: combo.s1,
        handover: 'now',
        goods: { skuId: sku.skuId, quantity: 1, pieceCodes: owned.pieceCodes },
      },
    ]);
    const consigned = codes(1);
    await posted([
      {
        kind: 'receipt-count',
        lineId: line(),
        skuId: sku.skuId,
        quantity: 1,
        to: combo.s1,
        condition: 'good',
        owner: { kind: 'supplier', partyId: uuidv7(), agreementVersionId: uuidv7() },
        pieceCodes: consigned,
      },
    ]);
    const refusal = await refused([
      {
        kind: 'piece-correction',
        lineId: line(),
        foundPieceCode: owned.pieceCodes[0] ?? '',
        movementId: sold.movementIds[0] ?? '',
        missingPieceCode: consigned[0] ?? '',
        at: combo.s1,
      },
    ]);
    expect(refusal).toMatchObject({ code: 'stock.rule-not-set', missing: [{ kind: 'line' }, { question: 'SL-28' }] });
  }, 300_000);
});

describe('count difference (stock-ledger 8.1, 8.2, 13.4)', () => {
  it('PRD-STK-009 PRD-STK-012 a count difference passes its own count freeze; a sale in the scope is still refused', async () => {
    const combo = await world.book('moving-average', 'book');
    const sku = world.sku(true);
    const r = await receiveAt(combo.s1, sku, 3, 100, combo.legalEntityId);
    const freeze = await posted([
      {
        kind: 'start-count-freeze',
        lineId: line(),
        siteId: combo.s1.siteId,
        businessUnitId: combo.s1.businessUnitId,
        reason: 'SYNTHETIC count',
        scope: [{ locationId: combo.s1.locationId }],
      },
    ]);
    const countId = freeze.holdIds[0] ?? '';
    expect(
      (
        await refused([
          {
            kind: 'sale-issue',
            lineId: line(),
            at: combo.s1,
            handover: 'now',
            goods: { skuId: sku.skuId, quantity: 1, pieceCodes: [r.pieceCodes[0] ?? ''] },
          },
        ])
      ).code,
    ).toBe('stock.count-freeze-active');
    const loss: LedgerItem = {
      kind: 'count-difference',
      lineId: line(),
      countId,
      at: combo.s1,
      condition: 'good',
      difference: 'loss',
      reason: 'SYNTHETIC shortage',
      goods: { skuId: sku.skuId, quantity: 1, pieceCodes: [r.pieceCodes[1] ?? ''] },
    };
    // A count difference naming no count frozen here is not the count's (8.2).
    expect((await refused([{ ...loss, countId: uuidv7() }])).code).toBe('stock.invalid-item');
    const done = await posted([loss, { kind: 'end-count-freeze', lineId: line(), holdId: countId }]);
    expect(done.movementIds).toHaveLength(1);
    expect(await trialBalance(world, combo)).toMatchObject({ INV: rupees(200), LOSS: rupees(100) });
    expect((await read((context) => rebuildAndCompare(context))).differences).toEqual([]);
  }, 300_000);
});
