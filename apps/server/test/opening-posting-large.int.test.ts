import { afterAll, describe, expect, it } from 'vitest';
import { asVerifier, invariantsHold } from './harness/stock/checks.js';
import { ScenarioRun } from './harness/stock/scenario.js';
import { OpeningApp } from './support/opening-app.js';

// S1-F13-T03: a synthetic opening of 30,000 rows posts through one queued job while counters sell
// (imports-and-opening-data 10.6, 17 test 24; stock-ledger 10.6; PRD-PRF-003, PRD-INT-004; RR-189). The opening is staged,
// validated and verified through the application, then Publish asks for the job, which posts every opening count in
// one transaction, one job per book, while tills sell the opening's SKUs at the same Store, each bill one unit, and one
// till sells a SKU the opening does not name. By the method of S1-F10-T07 (stock-posting-large.int.test.ts): the
// target is the PRD's online local bill finalisation, under 1 second ("Performance"; PRD-PRF-003). The timings are
// recorded against it, not asserted: on a shared laptop they are an early signal, a miss of the same pattern as RR-504
// is accepted for stage 1 by the product owner, and the binding measurement is the counter in stage 4 (RR-189, RR-504).
// They print when AOS_STOCK_LARGE_REPORT is 1. Every value is SYNTHETIC.

/** SYNTHETIC: the opening's size, the size GC-6 17 test 24 names. */
const ROWS = 30_000;
/** SYNTHETIC: the SKUs its rows spread over, round robin, and the tills selling them; one more till sells SKU Z. */
const SKUS = 10;
const TILLS = 4;
/** SYNTHETIC counter stock of each SKU at S1 and its P RATE, 10.00 a unit. */
const COUNTER_UNITS = 5_000;
const COUNTER_RATE = 1_000;

const world = new OpeningApp();

afterAll(async () => {
  await world.stop();
});

interface Sale {
  readonly sku: 'opening' | 'other';
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

describe('a large opening posts while counters sell (10.6; GC-6 17 test 24)', () => {
  it('GC-6 17 test 24 PRD-PRF-003 PRD-INT-004 a synthetic opening of 30,000 rows posts through one queued job while tills sell', async () => {
    await world.start('openlarge');
    const { harness, fixtures } = world;
    const { setup } = harness;
    const skus = [fixtures.sku];
    for (let i = 1; i < SKUS; i += 1) skus.push(await harness.catalogueSku(false));
    const other = await harness.catalogueSku(false);
    const barcodes: string[] = [];
    for (const sku of skus) {
      const code = world.next('BC');
      const mapped = await setup.asPreparerDo((c, p) =>
        setup.catalogue.mapCode(c, p, {
          code,
          kind: 'internal',
          scope: { kind: 'organisation' },
          skuId: sku.skuId,
          alias: false,
          validFrom: setup.today(),
        }),
      );
      if (mapped.kind !== 'success') throw new Error(`The SYNTHETIC barcode was refused: ${mapped.refusal.code}`);
      barcodes.push(code);
    }
    // Counter stock of each SKU at S1: received, accepted, covered and costed (stock-ledger 11.1).
    const counterStock = async (sku: (typeof skus)[number]) => {
      const run = new ScenarioRun(harness, { ...fixtures, sku }, false);
      await run.done({ command: 'receipt', receipt: 'C', at: 'S1', quantity: COUNTER_UNITS });
      await run.done({ command: 'receipt-acceptance', receipt: 'C' });
      await run.done({ command: 'pt-coverage', receipt: 'C' });
      await run.done({ command: 'pt-approval', receipt: 'C', pRatePaise: COUNTER_RATE });
      return run;
    };
    const runs: ScenarioRun[] = [];
    for (const sku of skus.slice(0, TILLS)) runs.push(await counterStock(sku));
    const otherRun = await counterStock(other);

    // The opening: one manifest of S1's unit, 30,000 rows, one unit each, with valuation evidence.
    let started = performance.now();
    const batchId = await world.opening(
      Array.from({ length: ROWS }, (_, index) =>
        world.manifestRow('SYN-L-1', {
          barcode: barcodes[index % barcodes.length] ?? '',
          quantity: '1',
          valuationEvidence: 'SYN invoice 1',
        }),
      ),
    );
    const stagedMs = performance.now() - started;
    started = performance.now();
    const { versionId, decisionId } = await world.verified(batchId);
    const verifiedMs = performance.now() - started;
    await world.policyFourteenSigned();
    await world.switchApproved();
    let lockedFrom = 0;
    await world.worker({
      beforeStep: () => {
        lockedFrom = performance.now();
        return Promise.resolve();
      },
    });

    // The tills sell one unit a bill until the job has posted, each from its own connection.
    const sales: Sale[] = [];
    const defects = new Set<string>();
    let posting = true;
    let sequence = 0;
    const till = async (index: number) => {
      const run = index < TILLS ? runs[index] : otherRun;
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
          if (error instanceof Error && error.name === 'CommandDefect') defects.add(error.message);
        }
        sales.push({ sku: index < TILLS ? 'opening' : 'other', startedAt, ms: performance.now() - startedAt, outcome });
      }
    };
    const tills = Array.from({ length: TILLS + 1 }, (_, index) => till(index));
    const clickedAt = performance.now();
    const queued = await world.publish(batchId, versionId, decisionId);
    const clickMs = performance.now() - clickedAt;
    expect(queued.body).toMatchObject({ result: 'queued' });
    const publishRequestId = queued.body.publishRequestId as string;
    const answered = async () =>
      asVerifier(world.database, async (client) => {
        const rows = await client.query<{ result: string }>(
          'select result from files_imports.import_outcome where publish_request_id = $1',
          [publishRequestId],
        );
        return rows.rows[0]?.result;
      });
    let result: string | undefined;
    while (result === undefined && performance.now() - clickedAt < 1_200_000) {
      result = await answered();
      if (result === undefined) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const doneAt = performance.now();
    posting = false;
    await Promise.all(tills);
    expect(result).toBe('published');

    const posted = await asVerifier(world.database, async (client) => {
      const rows = await client.query<{ movements: number; units: number; uses: number }>(
        `select count(*)::integer as movements, coalesce(sum(l.quantity), 0)::integer as units,
                (select count(*) from access.approval_use where approval_decision_id = $2)::integer as uses
           from stock.movement m join stock.movement_leg l on l.movement_id = m.id
          where m.kind = 'opening-count'
            and m.source_record_id in (select id from files_imports.import_document where batch_id = $1)`,
        [batchId, decisionId],
      );
      return rows.rows[0];
    });
    expect(posted).toEqual({ movements: ROWS, units: ROWS, uses: 1 });

    // The measurement (RR-189): recorded, not judged.
    const during = (sale: Sale) => sale.startedAt < doneAt && sale.startedAt + sale.ms > lockedFrom;
    const report = {
      synthetic: true,
      rows: ROWS,
      skus: SKUS,
      tills: { openingSkus: TILLS, otherSku: 1 },
      stageMs: Math.round(stagedMs),
      validateSubmitVerifyMs: Math.round(verifiedMs),
      clickMs: Math.round(clickMs),
      jobWallMs: Math.round(doneAt - clickedAt),
      stepFromStartMs: Math.round(doneAt - lockedFrom),
      ledgerPhasesMs: Object.fromEntries(Object.entries(world.timings).map(([name, ms]) => [name, Math.round(ms)])),
      salesDefects: [...defects],
      sales: {
        outcomes: Object.fromEntries(
          [...new Set(sales.map((sale) => sale.outcome))].map((outcome) => [
            outcome,
            sales.filter((sale) => sale.outcome === outcome).length,
          ]),
        ),
        openingSkusDuringJob: summary(
          sales.filter((sale) => sale.sku === 'opening' && during(sale)).map((sale) => sale.ms),
        ),
        openingSkusOtherwise: summary(
          sales.filter((sale) => sale.sku === 'opening' && !during(sale)).map((sale) => sale.ms),
        ),
        otherSkuDuringJob: summary(sales.filter((sale) => sale.sku === 'other' && during(sale)).map((sale) => sale.ms)),
      },
    };
    if (process.env.AOS_STOCK_LARGE_REPORT === '1') console.log(`AOS_STOCK_LARGE_REPORT ${JSON.stringify(report)}`);
    expect(sales.filter((sale) => sale.outcome === 'written').length).toBeGreaterThan(0);
    await invariantsHold(world.database);
  }, 3_600_000);
});
