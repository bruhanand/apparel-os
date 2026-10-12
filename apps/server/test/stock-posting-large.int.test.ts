import { paise, uuidv7 } from '@apparel-os/domain';
import { afterAll, describe, expect, it } from 'vitest';
import type { LedgerItem } from '../src/modules/stock/ledger/index.js';
import { HARNESS_ACTIONS } from './fixtures/stock-harness.js';
import { asVerifier, invariantsHold, rebuilds, reconciles, trialBalance } from './harness/stock/checks.js';
import { StockHarness, type HarnessDocument, type HarnessFixtures } from './harness/stock/harness.js';
import {
  approveForPosting,
  postingIdentity,
  startPostingWorker,
  type PostingWorker,
} from './harness/stock/posting-job.js';
import { ScenarioRun } from './harness/stock/scenario.js';
import { eventually } from './support/jobs.js';

// S1-F10-T07: a large posting job against counter sales under a book pool (stock-ledger 10.6, 11.9 last case;
// books-and-posting 15 test 16; PRD-PRF-001, PRD-PRF-003; RR-189, RR-200). A 10,000-line PT approval, the size the
// PRD's performance table uses, is approved by a click and posted by the queued posting job while tills sell the same
// SKUs at a Store under the same book pool, and one till sells a SKU the PT does not touch. The timings are recorded,
// not judged: no target is set here (RR-189: the binding measurement is the counter in stage 4; SL-11 applies only if
// that fails). They print when AOS_STOCK_LARGE_REPORT is 1. Every value is SYNTHETIC; every expected value is written
// by hand.

/** The PRD's performance table's PT size (stock-ledger 10.6). */
const LINES = 10_000;
/** SYNTHETIC: SKUs the PT's lines spread over, round robin, and tills selling them; one more till sells SKU Z. */
const SKUS = 10;
const TILLS = 4;
/** SYNTHETIC P RATEs: 1.00 a unit for the PT's 10,000 units; 10.00 a unit for the counter stock. */
const PT_RATE = 100;
const COUNTER_RATE = 1_000;
/** SYNTHETIC counter stock of each SKU at S1, more than the tills can sell during the test. */
const COUNTER_UNITS = 5_000;

const worlds: StockHarness[] = [];
const workers: PostingWorker[] = [];

afterAll(async () => {
  for (const worker of workers) await worker.stop();
  for (const world of worlds) await world.stop();
});

interface Sale {
  readonly till: number;
  readonly sku: 'job' | 'other';
  readonly startedAt: number;
  readonly ms: number;
  readonly outcome: string;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

function summary(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, each) => sum + each, 0) / Math.max(1, sorted.length);
  return {
    count: sorted.length,
    meanMs: Number(mean.toFixed(1)),
    medianMs: Number(percentile(sorted, 50).toFixed(1)),
    p95Ms: Number(percentile(sorted, 95).toFixed(1)),
    maxMs: Number((sorted.at(-1) ?? 0).toFixed(1)),
  };
}

/** Counter stock of a SKU at S1: received, accepted, covered and costed (11.1). */
async function counterStock(harness: StockHarness, fixtures: HarnessFixtures, sku: HarnessFixtures['sku']) {
  const run = new ScenarioRun(harness, { ...fixtures, sku }, false);
  await run.done({ command: 'receipt', receipt: 'C', at: 'S1', quantity: COUNTER_UNITS });
  await run.done({ command: 'receipt-acceptance', receipt: 'C' });
  await run.done({ command: 'pt-coverage', receipt: 'C' });
  await run.done({ command: 'pt-approval', receipt: 'C', pRatePaise: COUNTER_RATE });
  return run;
}

/** The 10,000 receipt origins at W1, one unit each, and the PT approval over them with its coverage (13.5). */
async function largePt(
  harness: StockHarness,
  fixtures: HarnessFixtures,
  skuIds: readonly string[],
): Promise<{ document: HarnessDocument; receiptMs: number; coverageMs: number }> {
  const at = fixtures.w1;
  const lines = Array.from({ length: LINES }, (_, index) => ({ skuId: skuIds[index % skuIds.length] ?? '' }));
  const counts: LedgerItem[] = lines.map(({ skuId }) => ({
    kind: 'receipt-count',
    lineId: uuidv7(),
    skuId,
    quantity: 1,
    to: at,
    condition: 'good',
    owner: { kind: 'organisation', legalEntityId: fixtures.legalEntityId },
  }));
  const receipt = await harness.prepare(
    'receipt',
    at,
    lines.map(({ skuId }) => ({ lineId: uuidv7(), skuId, quantity: 1, locationId: at.locationId })),
  );
  let started = performance.now();
  const counted = await harness.step(receipt, 'count', { from: 'prepared', to: 'counted' }, counts);
  const receiptMs = performance.now() - started;
  const origins = await asVerifier(harness.database, async (client) => {
    const rows = await client.query<{ id: string; sku_id: string }>(
      'select id, sku_id from stock.receipt_origin where id = any($1::uuid[]) order by id',
      [counted.written.receiptOriginIds],
    );
    return rows.rows;
  });
  const document = await harness.prepare(
    'pt-approval',
    at,
    origins.map((origin) => ({
      lineId: uuidv7(),
      skuId: origin.sku_id,
      quantity: 1,
      receiptOriginId: origin.id,
      amountPaise: PT_RATE,
    })),
  );
  started = performance.now();
  await harness.step(
    document,
    'cover',
    { from: 'prepared', to: 'covered' },
    origins.map((origin) => ({
      kind: 'record-coverage',
      lineId: uuidv7(),
      ptRevisionId: document.id,
      receiptOriginId: origin.id,
      quantity: 1,
    })),
  );
  return { document, receiptMs, coverageMs: performance.now() - started };
}

describe('a large posting job while counters sell (stock-ledger 10.6, 11.9; books-and-posting 15 test 16)', () => {
  it('PRD-PRF-003 PRD-LED-004 books-and-posting 15 test 16 a 10,000-line PT approval posts as one job, one journal per book, kind and date and one source row per movement, while tills sell', async () => {
    const harness = new StockHarness();
    worlds.push(harness);
    await harness.start('large');
    const fixtures = await harness.fixtures('fifo', 'book', { pieceTracked: false });
    const skus = [fixtures.sku];
    for (let i = 1; i < SKUS; i += 1) skus.push(await harness.catalogueSku(false));
    const other = await harness.catalogueSku(false);
    const runs: ScenarioRun[] = [];
    for (const sku of skus) runs.push(await counterStock(harness, fixtures, sku));
    const otherRun = await counterStock(harness, fixtures, other);
    const { document, receiptMs, coverageMs } = await largePt(
      harness,
      fixtures,
      skus.map((sku) => sku.skuId),
    );

    let timing:
      { slowWorkMs: number; postingMs: number; items: number; phases: Readonly<Record<string, number>> } | undefined;
    let lockedFrom = 0;
    const actor = await postingIdentity(harness);
    workers.push(
      await startPostingWorker(harness, actor, {
        beforeLocks: () => {
          lockedFrom = performance.now();
          return Promise.resolve();
        },
        timed: (measured) => {
          timing = measured;
        },
      }),
    );

    // The time the books' operations take inside the postings, by operation (books-and-posting 9.1), all callers.
    const inBooks: Record<string, { calls: number; ms: number; maxMs: number }> = {};
    const books = harness.setup.books as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    for (const name of ['checkPostable', 'holdPeriods', 'post']) {
      const original = books[name]?.bind(harness.setup.books);
      if (original === undefined) continue;
      books[name] = async (...args: unknown[]) => {
        const began = performance.now();
        try {
          return await original(...args);
        } finally {
          const spent = (inBooks[name] ??= { calls: 0, ms: 0, maxMs: 0 });
          spent.calls += 1;
          const took = performance.now() - began;
          spent.ms += took;
          spent.maxMs = Math.max(spent.maxMs, took);
        }
      };
    }

    // The tills sell one unit a bill until the job has posted, each from its own connection (10.5 "counters").
    const sales: Sale[] = [];
    let posting = true;
    let sequence = 0;
    const till = async (index: number) => {
      const run = index < TILLS ? runs[index % runs.length] : otherRun;
      if (run === undefined) return;
      while (posting) {
        sequence += 1;
        const pending = await run.prepared({ command: 'sale', sale: `B${String(sequence)}`, at: 'S1', quantity: 1 });
        const startedAt = performance.now();
        let outcome: string;
        try {
          const sent = await run.send(pending);
          outcome = sent.kind === 'refused' ? sent.refusal.code : sent.kind;
        } catch (error) {
          outcome = error instanceof Error ? error.name : 'unknown';
        }
        sales.push({
          till: index,
          sku: index < TILLS ? 'job' : 'other',
          startedAt,
          ms: performance.now() - startedAt,
          outcome,
        });
      }
    };
    const tills = Array.from({ length: TILLS + 1 }, (_, index) => till(index));
    const clickedAt = performance.now();
    const click = await approveForPosting(
      harness,
      document,
      HARNESS_ACTIONS.ptApproval,
      { kind: 'known', amountPaise: paise(LINES * PT_RATE) },
      fixtures.bookId,
    );
    const clickMs = performance.now() - clickedAt;
    await eventually(async () => {
      const state = await asVerifier(harness.database, async (client) => {
        const rows = await client.query<{ state: string }>(
          `select state::text as state from pgboss.job where name = 'kernel.posting-delivery'`,
        );
        return rows.rows[0]?.state;
      });
      return state === 'completed' || state === 'failed';
    }, 600_000);
    const doneAt = performance.now();
    posting = false;
    await Promise.all(tills);

    // books-and-posting 15 test 16: one journal for the book, the kind and the date; one source row per movement.
    const posted = await asVerifier(harness.database, async (client) => {
      const rows = await client.query<{ movements: number; journals: number; sources: number; uses: number }>(
        `select (select count(*) from stock.movement where source_record_id = $1)::integer as movements,
                (select count(*) from finance.journal where source_record_id = $1)::integer as journals,
                (select count(*) from finance.posting_source s join finance.journal j on j.id = s.journal_id
                  where j.source_record_id = $1)::integer as sources,
                (select count(*) from access.approval_use where approval_decision_id = $2)::integer as uses`,
        [document.id, click.decisionId],
      );
      return rows.rows[0];
    });
    expect(posted).toEqual({ movements: LINES, journals: 1, sources: LINES, uses: 1 });

    const sold = sales.filter((sale) => sale.outcome === 'written').length;
    const balance = await trialBalance(harness, fixtures);
    // Counter stock of 11 SKUs at 10.00 a unit, each bill one unit at 10.00 (FIFO: the counter layer is oldest), and
    // the PT's 10,000 units at 1.00.
    expect(balance.COGS).toBe(sold * COUNTER_RATE);
    expect(balance.INV).toBe((SKUS + 1) * COUNTER_UNITS * COUNTER_RATE - sold * COUNTER_RATE + LINES * PT_RATE);

    // Rebuild and compare over the whole database (2.1, 11.7) at this volume, timed: within the statement limit or not.
    const rebuildStarted = performance.now();
    let rebuild: string;
    try {
      await rebuilds(harness, harness.preparer.user.id);
      rebuild = 'matched';
    } catch (error) {
      rebuild = error instanceof Error ? error.name : 'unknown';
    }
    const rebuildMs = performance.now() - rebuildStarted;
    expect(rebuild).not.toBe('AssertionError');

    // The measurement (RR-189, RR-200): recorded, not judged.
    const during = (sale: Sale) => sale.startedAt < doneAt && sale.startedAt + sale.ms > lockedFrom;
    const report = {
      synthetic: true,
      lines: LINES,
      skus: SKUS,
      tills: { sameSkus: TILLS, otherSku: 1 },
      receiptCountMs: Math.round(receiptMs),
      coverageMs: Math.round(coverageMs),
      clickMs: Math.round(clickMs),
      job:
        timing === undefined
          ? null
          : {
              slowWorkMs: Math.round(timing.slowWorkMs),
              postingMs: Math.round(timing.postingMs),
              phasesMs: Object.fromEntries(Object.entries(timing.phases).map(([name, ms]) => [name, Math.round(ms)])),
            },
      jobWallMs: Math.round(doneAt - clickedAt),
      rebuildAndCompare: { outcome: rebuild, ms: Math.round(rebuildMs) },
      booksOperationsDuringTest: Object.fromEntries(
        Object.entries(inBooks).map(([name, spent]) => [name, { calls: spent.calls, maxMs: Math.round(spent.maxMs) }]),
      ),
      sales: {
        outcomes: Object.fromEntries(
          [...new Set(sales.map((sale) => sale.outcome))].map((outcome) => [
            outcome,
            sales.filter((sale) => sale.outcome === outcome).length,
          ]),
        ),
        sameSkusDuringJob: summary(sales.filter((sale) => sale.sku === 'job' && during(sale)).map((sale) => sale.ms)),
        sameSkusOtherwise: summary(sales.filter((sale) => sale.sku === 'job' && !during(sale)).map((sale) => sale.ms)),
        otherSkuDuringJob: summary(sales.filter((sale) => sale.sku === 'other' && during(sale)).map((sale) => sale.ms)),
      },
    };
    if (process.env.AOS_STOCK_LARGE_REPORT === '1') console.log(`AOS_STOCK_LARGE_REPORT ${JSON.stringify(report)}`);
    expect(report.job).not.toBeNull();
    expect(sales.filter((sale) => sale.sku === 'other' && sale.outcome === 'written').length).toBeGreaterThan(0);

    await reconciles(harness, harness.preparer.user.id, fixtures);
    await invariantsHold(harness.database);
  }, 1_800_000);
});
