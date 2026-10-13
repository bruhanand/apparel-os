import { uuidv7 } from '@apparel-os/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stockLedgerRestoreParticipant } from '../src/modules/stock/ledger/index.js';
import { syntheticCode } from './fixtures/synthetic.js';
import { connect } from './support/postgres.js';
import { at, PLACES, SKUS, StockWorld, written } from './support/stock-ledger.js';

// S1-F14-T04: the stock ledger's restore check counts exactly the projection rows it compares, each once, against a
// world whose rows are known (backup-and-restore 5.1, section 6; stock-ledger 11.7, 13.6; PRD-ACP-019). Every place,
// SKU, piece and actor is SYNTHETIC.

const world = new StockWorld();

async function invariant() {
  const results = await world.run(world.poster.user.id, async (context) => {
    const answer = await stockLedgerRestoreParticipant.invariants?.({
      organisationCode: world.routed.organisationCode,
      tx: context.tx,
    });
    if (answer === undefined) throw new Error('The stock ledger has no invariant');
    return answer;
  });
  expect(results).toHaveLength(1);
  return results[0];
}

beforeAll(async () => {
  await world.start('stockrestore');
  // Two receipt counts at one rack: three of a quantity-tracked SKU, and two pieces of a piece-tracked SKU.
  for (const [sku, quantity, pieceCodes] of [
    [SKUS.quantityA, 3, undefined],
    [SKUS.pieceA, 2, [syntheticCode('RESTORE-PIECE-1'), syntheticCode('RESTORE-PIECE-2')]],
  ] as const) {
    written(
      await world.post(world.poster, [
        {
          kind: 'receipt-count',
          lineId: uuidv7(),
          skuId: sku.skuId,
          quantity,
          to: at('rack'),
          condition: 'good',
          owner: { kind: 'organisation', legalEntityId: PLACES.legalEntity },
          ...(pieceCodes === undefined ? {} : { pieceCodes }),
        },
      ]),
    );
  }
});

afterAll(async () => {
  await world.stop();
});

describe('the stock ledger’s restore check (backup-and-restore 5.1, section 6)', () => {
  it('PRD-ACP-019 counts as checked every projection row it compares, each once', async () => {
    // Each receipt count gives one balance, one SKU balance and one receipt origin's state; the piece-tracked one two
    // pieces, each compared with its last movement. No claim, pool or transit value: the world is unvalued.
    expect(await invariant()).toEqual({
      check: 'stock balances equal the sum of their movements',
      passed: true,
      checked: 2 + 2 + 2 + 2,
      failed: 0,
    });
  });

  it('PRD-ACP-019 counts a difference as failed and still counts what it compared', async () => {
    // The SKU balance of the quantity-tracked SKU is made to differ from its movements, then put back.
    const tamper = async (by: number) => {
      const owner = await connect(world.database, 'migration');
      try {
        await owner.query('update stock.sku_balance set quantity = quantity + $2 where sku_id = $1', [
          SKUS.quantityA.skuId,
          by,
        ]);
      } finally {
        await owner.end();
      }
    };
    await tamper(1);
    try {
      expect(await invariant()).toMatchObject({ passed: false, checked: 8, failed: 1 });
    } finally {
      await tamper(-1);
    }
  });
});
