import { uuidv7 } from '@apparel-os/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type LedgerItem } from '../src/modules/stock/ledger/index.js';
import { addSyntheticSku, at, StockWorld, written } from './support/stock-ledger.js';

// S1-F10-T02: the measurement of contention on the unit anchor (stock-ledger 10.3, 14.3; SL-24, RR-227). Every item
// takes its unit's anchor in shared mode; a count freeze takes it exclusively to start or end. The test measures, on
// real PostgreSQL in the test container, how much the shared anchor costs items of different SKUs at one unit, and how
// long a freeze start waits for items in flight and holds new ones. Numbers are printed and recorded in the ticket's
// Notes; the test asserts only that nothing fails, deadlocks or reaches the synthetic lock limit (1 s). SYNTHETIC data.

const world = new StockWorld();
const WORKERS = 8;
const PER_WORKER = 25;

beforeAll(async () => {
  await world.start('stockanchor');
});

afterAll(async () => {
  await world.stop();
});

function receipt(skuId: string, place = at('rack')): LedgerItem {
  return {
    kind: 'receipt-count',
    lineId: uuidv7(),
    skuId,
    quantity: 1,
    to: place,
    condition: 'good',
    owner: { kind: 'unknown' },
  };
}

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

type Location = Parameters<typeof at>[0];

/**
 * Runs `workers` loops of `count` receipt counts, each loop its own SKU, at the unit of the location given, or of the
 * loop's own location. Answers latencies in ms.
 */
async function receipts(workers: number, count: number, during?: () => Promise<void>, places?: readonly Location[]) {
  const skus = Array.from({ length: workers }, () => addSyntheticSku());
  const latencies: number[] = [];
  const started = performance.now();
  const loops = skus.map(async (sku, index) => {
    const place = at(places?.[index] ?? 'rack');
    for (let i = 0; i < count; i += 1) {
      const t = performance.now();
      written(await world.post(world.poster, [receipt(sku.skuId, place)]));
      latencies.push(performance.now() - t);
    }
  });
  await Promise.all([...loops, during?.()]);
  const elapsed = performance.now() - started;
  return { latencies, elapsed, throughput: (workers * count) / (elapsed / 1000) };
}

function summary(label: string, run: { latencies: number[]; elapsed: number; throughput: number }) {
  return `${label}: ${String(run.latencies.length)} commands in ${run.elapsed.toFixed(0)} ms, ${run.throughput.toFixed(0)}/s, p50 ${percentile(run.latencies, 50).toFixed(1)} ms, p95 ${percentile(run.latencies, 95).toFixed(1)} ms, max ${Math.max(...run.latencies).toFixed(1)} ms`;
}

describe('unit anchor contention (stock-ledger 14.3; SL-24)', () => {
  it('stock-ledger 14.3 items share the anchor; a freeze start waits for items in flight and holds new ones briefly', async () => {
    // Warm the pool and the anchor rows.
    await receipts(2, 3);
    const one = await receipts(1, WORKERS * PER_WORKER);
    const many = await receipts(WORKERS, PER_WORKER);
    // The control: four loops at one unit, sharing its anchor, against four loops each at a unit of its own.
    const shared = await receipts(4, 50);
    const apart = await receipts(4, 50, undefined, ['rack', 'floor', 'floor2', 'otherBookFloor']);
    let freezeMs = 0;
    let endMs = 0;
    const withFreeze = await receipts(WORKERS, PER_WORKER, async () => {
      // Once the items are flowing, a freeze over another location of the same unit starts and ends (8.1).
      await new Promise((resolve) => setImmediate(resolve));
      for (let round = 0; round < 5; round += 1) {
        const t = performance.now();
        const started = written(
          await world.post(world.poster, [
            {
              kind: 'start-count-freeze',
              lineId: uuidv7(),
              siteId: at('bin').siteId,
              businessUnitId: at('bin').businessUnitId,
              reason: 'SYNTHETIC cycle count',
              scope: [{ locationId: at('bin').locationId }],
            },
          ]),
        );
        freezeMs = Math.max(freezeMs, performance.now() - t);
        const e = performance.now();
        written(
          await world.post(world.poster, [
            { kind: 'end-count-freeze', lineId: uuidv7(), holdId: started.holdIds[0] ?? '' },
          ]),
        );
        endMs = Math.max(endMs, performance.now() - e);
      }
    });
    const lines = [
      summary('1 worker, one SKU, one unit', one),
      summary(`${String(WORKERS)} workers, own SKU each, one unit (anchor shared)`, many),
      summary('4 workers at one unit (anchor shared)', shared),
      summary('4 workers each at its own unit (no anchor shared)', apart),
      summary(`${String(WORKERS)} workers with 5 freeze starts and ends at the same unit`, withFreeze),
      `slowest freeze start ${freezeMs.toFixed(1)} ms, slowest freeze end ${endMs.toFixed(1)} ms`,
    ];
    console.log(`stock-ledger 14.3 anchor measurement\n${lines.join('\n')}`);
    expect(many.latencies).toHaveLength(WORKERS * PER_WORKER);
    expect(withFreeze.latencies).toHaveLength(WORKERS * PER_WORKER);
  });
});
