import { uuidv7 } from '@apparel-os/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { custody, rebuildAndCompare, type LedgerItem } from '../src/modules/stock/ledger/index.js';
import { SYNTHETIC_OPENING_RECORD_TYPE } from './fixtures/stock-ledger.js';
import { allowVerifier, connect } from './support/postgres.js';
import { at, PLACES, SKUS, StockWorld, SYNTHETIC_MODULE, written } from './support/stock-ledger.js';

// S1-F13-T03: the opening count (stock-ledger 9, 13.4; imports-and-opening-data 10.5, 10.6; PRD-LIF-003,
// PRD-LIF-004, PRD-LIF-008, PRD-LIF-027, PRD-STK-014, POL-14.02). An opening count is a receipt count from an opening
// batch: it creates opening receipt origins, their custody, and no value until an opening PT is approved. A counted row
// without valuation evidence is not opening stock: a surplus origin, held as excess, owner, coverage and cost Unknown. Posted by
// the synthetic caller through the real command runner, access and row-level security on real PostgreSQL. Every place,
// SKU and document is SYNTHETIC.

const world = new StockWorld();

beforeAll(async () => {
  await world.start('stockopening');
  await allowVerifier(world.database);
});

afterAll(async () => {
  await world.stop();
});

/** An opening batch's source (stock-ledger 13.2): the import kind opening balance. */
const openingSource = () => ({
  module: SYNTHETIC_MODULE,
  recordType: SYNTHETIC_OPENING_RECORD_TYPE,
  recordId: uuidv7(),
  versionId: uuidv7(),
  importKind: 'opening-balance' as const,
});

function openingCount(quantity: number, extra: Partial<Extract<LedgerItem, { kind: 'opening-count' }>> = {}) {
  return {
    kind: 'opening-count',
    lineId: uuidv7(),
    skuId: SKUS.quantityB.skuId,
    quantity,
    to: at('floor'),
    condition: 'good',
    owner: { kind: 'organisation', legalEntityId: PLACES.legalEntity },
    ...extra,
  } as LedgerItem;
}

/** The origins, movements and holds a request wrote, as the verifier role reads them. */
async function writtenRows(movementIds: readonly string[], originIds: readonly string[]) {
  const client = await connect(world.database, 'verify');
  try {
    const movements = await client.query<{ kind: string; source_import_kind: string; valued: boolean }>(
      `select m.kind, m.source_import_kind,
              exists (select 1 from stock.valuation v where v.movement_id = m.id) as valued
         from stock.movement m where m.id = any($1::uuid[])`,
      [movementIds],
    );
    const origins = await client.query<{ origin_kind: string; owner_kind: string | null; quantity: number }>(
      `select o.origin_kind, s.owner_kind, o.quantity from stock.receipt_origin o
         join stock.receipt_origin_state s on s.receipt_origin_id = o.id where o.id = any($1::uuid[])`,
      [originIds],
    );
    const holds = await client.query<{ kind: string; quantity: number }>(
      `select h.kind, sum(c.quantity)::integer as quantity from stock.hold h join stock.hold_claim c on c.hold_id = h.id
         join stock.balance b on b.id = c.balance_id
         where b.receipt_origin_id = any($1::uuid[]) group by h.kind`,
      [originIds],
    );
    return { movements: movements.rows, origins: origins.rows, holds: holds.rows };
  } finally {
    await client.end();
  }
}

describe('the opening count (stock-ledger 9, 13.4)', () => {
  it('PRD-LIF-027 PRD-LIF-004 an opening count creates opening receipt origins and their custody, with no value', async () => {
    const result = written(await world.post(world.poster, [openingCount(4)], { source: openingSource() }));
    expect(result.receiptOriginIds).toHaveLength(1);
    expect(result.posting).toBeNull();
    expect(await writtenRows(result.movementIds, result.receiptOriginIds)).toEqual({
      movements: [{ kind: 'opening-count', source_import_kind: 'opening-balance', valued: false }],
      origins: [{ origin_kind: 'opening', owner_kind: 'organisation', quantity: 4 }],
      holds: [],
    });
    const rows = await world.run(world.poster.user.id, (context) => custody(context, { skuId: SKUS.quantityB.skuId }));
    expect(rows.rows).toMatchObject([
      { locationId: at('floor').locationId, quantity: 4, receiptOriginId: result.receiptOriginIds[0] },
    ]);
    const rebuilt = await world.run(world.poster.user.id, (context) => rebuildAndCompare(context));
    expect(rebuilt.differences).toEqual([]);
  });

  it('PRD-STK-014 stock-ledger 9 a counted row without valuation evidence is not opening stock: a surplus origin held as excess, its owner Unknown', async () => {
    const result = written(
      await world.post(
        world.poster,
        [
          openingCount(2, {
            owner: { kind: 'unknown' },
            withoutValuationEvidence: { reason: 'SYNTHETIC no evidence' },
          }),
        ],
        { source: openingSource() },
      ),
    );
    expect(result.holdIds).toHaveLength(1);
    expect(await writtenRows(result.movementIds, result.receiptOriginIds)).toEqual({
      movements: [{ kind: 'opening-count', source_import_kind: 'opening-balance', valued: false }],
      // No known receipt origin (PRD-STK-014): a count surplus's origin kind, not an opening's.
      origins: [{ origin_kind: 'surplus', owner_kind: null, quantity: 2 }],
      holds: [{ kind: 'excess', quantity: 2 }],
    });
    const rebuilt = await world.run(world.poster.user.id, (context) => rebuildAndCompare(context));
    expect(rebuilt.differences).toEqual([]);
  });

  it('stock-ledger 13.4 an opening count comes from an opening batch only, and one without evidence names no owner', async () => {
    const notOpening = await world.post(world.poster, [openingCount(1)], {
      source: { ...openingSource(), importKind: 'none' },
    });
    expect(notOpening).toMatchObject({ kind: 'refused', refusal: { code: 'stock.caller-not-registered' } });
    const owned = await world.post(
      world.poster,
      [openingCount(1, { withoutValuationEvidence: { reason: 'SYNTHETIC no evidence' } })],
      { source: openingSource() },
    );
    expect(owned).toMatchObject({
      kind: 'refused',
      refusal: { code: 'stock.invalid-item', missing: expect.arrayContaining([{ kind: 'owner' }]) as unknown },
    });
  });
});
