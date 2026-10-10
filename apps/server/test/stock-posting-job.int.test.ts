import { paise, uuidv7 } from '@apparel-os/domain';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import type { LedgerItem } from '../src/modules/stock/ledger/index.js';
import { HARNESS_ACTIONS } from './fixtures/stock-harness.js';
import { asVerifier, invariantsHold, rebuilds, reconciles, trialBalance } from './harness/stock/checks.js';
import { StockHarness, type HarnessDocument, type HarnessFixtures } from './harness/stock/harness.js';
import {
  approveForPosting,
  postingIdentity,
  retryPosting,
  startPostingWorker,
  type PostingHooks,
  type PostingWorker,
} from './harness/stock/posting-job.js';
import { SYNTHETIC_MAPS, type At } from './support/stock-valued.js';
import type { ServiceActor } from './support/stock-ledger.js';
import { eventually } from './support/jobs.js';
import { gate } from './support/transactions.js';

// S1-F10-T07: the queued posting job of a large document (stock-ledger 10.6; access-and-approvals 9.8; books-and-posting
// 10 step 4, 15 tests 8, 16 and 17; code-house-rules 12.9; DEC-097; S1-F10 spec 2, 3.6). A PT approval is approved by a
// click that records the decision and a request to post; the harness's posting consumer, under a SYNTHETIC service
// identity on behalf of the approver, posts it as one transaction in the worker, one job at a time per book. Every
// value is SYNTHETIC; every expected value is written by hand.

const worlds: StockHarness[] = [];
const workers: PostingWorker[] = [];

afterEach(async () => {
  for (const worker of workers.splice(0)) await worker.stop();
});

afterAll(async () => {
  for (const world of worlds) await world.stop();
});

interface Origin {
  readonly originId: string;
  readonly skuId: string;
}

async function world(options: { maps?: readonly string[] } = {}) {
  const harness = new StockHarness();
  worlds.push(harness);
  await harness.start('postingjob');
  const fixtures = await harness.fixtures('moving-average', 'book', {
    pieceTracked: false,
    ...(options.maps === undefined ? {} : { maps: options.maps }),
  });
  const actor = await postingIdentity(harness);
  return { harness, fixtures, actor };
}

/** Receipt counts at a place, one receipt origin per line, `quantity` units each, in one document (2.3). */
async function received(
  harness: StockHarness,
  fixtures: HarnessFixtures,
  at: At,
  lines: readonly { skuId: string; quantity: number }[],
): Promise<Origin[]> {
  const items: LedgerItem[] = lines.map(({ skuId, quantity }) => ({
    kind: 'receipt-count',
    lineId: uuidv7(),
    skuId,
    quantity,
    to: at,
    condition: 'good',
    owner: { kind: 'organisation', legalEntityId: fixtures.legalEntityId },
  }));
  const document = await harness.prepare(
    'receipt',
    at,
    lines.map(({ skuId, quantity }) => ({ lineId: uuidv7(), skuId, quantity, locationId: at.locationId })),
  );
  const sent = await harness.step(document, 'count', { from: 'prepared', to: 'counted' }, items);
  const ids = sent.written.receiptOriginIds;
  return asVerifier(harness.database, async (client) => {
    const rows = await client.query<{ id: string; sku_id: string }>(
      'select id, sku_id from stock.receipt_origin where id = any($1::uuid[])',
      [ids],
    );
    return rows.rows.map((row) => ({ originId: row.id, skuId: row.sku_id }));
  });
}

/** What the read-only role reads of a document's posting (H6): its movements, journals and a decision's uses. */
async function posted(harness: StockHarness, documentId: string, decisionId: string) {
  return asVerifier(harness.database, async (client) => {
    const rows = await client.query<{
      movements: number;
      journals: number;
      sources: number;
      uses: number;
      state: string;
    }>(
      `select (select count(*) from stock.movement where source_record_id = $1)::integer as movements,
              (select count(*) from finance.journal where source_record_id = $1)::integer as journals,
              (select count(*) from finance.posting_source s join finance.journal j on j.id = s.journal_id
                where j.source_record_id = $1)::integer as sources,
              (select count(*) from access.approval_use where approval_decision_id = $2)::integer as uses,
              (select state from test_stock_harness.document where id = $1) as state`,
      [documentId, decisionId],
    );
    const [row] = rows.rows;
    if (row === undefined) throw new Error('nothing read');
    return row;
  });
}

/** The outcome the posting job's step came to, as pg-boss keeps it (code-house-rules 12.9). */
async function jobOutcomes(harness: StockHarness): Promise<{ state: string; outcome: string; code?: string }[]> {
  return asVerifier(harness.database, async (client) => {
    const rows = await client.query<{ state: string; output: { outcome: string; code?: string } | null }>(
      `select state::text as state, output from pgboss.job where name = 'kernel.posting-delivery' order by created_on, id`,
    );
    return rows.rows.map((row) => ({
      state: row.state,
      outcome: row.output?.outcome ?? '',
      ...(row.output?.code === undefined ? {} : { code: row.output.code }),
    }));
  });
}

async function jobsSettled(harness: StockHarness, count: number): Promise<void> {
  await eventually(async () => {
    const outcomes = await jobOutcomes(harness);
    return outcomes.length === count && outcomes.every((each) => each.state === 'completed' || each.state === 'failed');
  }, 120_000);
}

/** Waits for a job to reach a point, or fails after a minute with the worker's last log lines. */
async function within(reached: Promise<void>, harness: StockHarness): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => { resolve('late'); }, 60_000);
  });
  const outcome = await Promise.race([reached, late]);
  clearTimeout(timer);
  if (outcome === 'late') throw new Error(`The job never came: ${JSON.stringify(harness.log.lines.slice(-10))}`);
}

async function start(harness: StockHarness, actor: ServiceActor, hooks: PostingHooks = {}): Promise<PostingWorker> {
  const worker = await startPostingWorker(harness, actor, hooks);
  workers.push(worker);
  return worker;
}

describe('the approval click and the queued posting job (access-and-approvals 9.8; stock-ledger 10.6)', () => {
  it('DEC-097 PRD-INT-004 the click posts nothing; the job posts the approved version once, using the decision once', async () => {
    const { harness, fixtures, actor } = await world();
    const origins = await received(harness, fixtures, fixtures.w1, [
      { skuId: fixtures.sku.skuId, quantity: 2 },
      { skuId: fixtures.sku.skuId, quantity: 3 },
    ]);
    // Coverage of each origin's own quantity (2 and 3 units) at 100.00 each: 500.00 in all.
    const document = await ptDocument(harness, fixtures.w1, origins, [2, 3], 10_000);
    // The worker runs all along (its consumer is registered before the event, code-house-rules 12.8); the job is held
    // before its locks until the click is checked.
    const reached = gate();
    const goOn = gate();
    await start(harness, actor, {
      beforeLocks: async () => {
        reached.open();
        await goOn.wait;
      },
    });
    const click = await approveForPosting(
      harness,
      document,
      HARNESS_ACTIONS.ptApproval,
      { kind: 'known', amountPaise: paise(50_000) },
      fixtures.bookId,
    );
    expect(await posted(harness, document.id, click.decisionId)).toEqual({
      movements: 0,
      journals: 0,
      sources: 0,
      uses: 0,
      state: 'posting',
    });
    await within(reached.wait, harness);
    goOn.open();
    await jobsSettled(harness, 1);
    expect(await jobOutcomes(harness)).toEqual([{ state: 'completed', outcome: 'done' }]);
    // One cost-established movement per origin, one journal for the book, kind and date, one source row per movement.
    expect(await posted(harness, document.id, click.decisionId)).toEqual({
      movements: 2,
      journals: 1,
      sources: 2,
      uses: 1,
      state: 'posted',
    });
    expect((await trialBalance(harness, fixtures)).INV).toBe(50_000);
    await rebuilds(harness, harness.preparer.user.id);
    await reconciles(harness, harness.preparer.user.id, fixtures);
    await invariantsHold(harness.database);
  }, 600_000);

  it('DEC-097 PRD-ACS-007 books-and-posting 15 test 17 a queued posting refused under its locks posts nothing and leaves its decision unused; the changed version, approved again, posts', async () => {
    const { harness, fixtures, actor } = await world();
    const origins = await received(harness, fixtures, fixtures.w1, [{ skuId: fixtures.sku.skuId, quantity: 2 }]);
    const document = await ptDocument(harness, fixtures.w1, origins, [2], 10_000);
    const reached = gate();
    const goOn = gate();
    await start(harness, actor, {
      beforeLocks: async () => {
        reached.open();
        await goOn.wait;
      },
    });
    const first = await approveForPosting(
      harness,
      document,
      HARNESS_ACTIONS.ptApproval,
      { kind: 'known', amountPaise: paise(20_000) },
      fixtures.bookId,
    );
    await within(reached.wait, harness);
    // The document changes after the click and before the job locks it (access-and-approvals 9.6).
    await harness.change(document);
    goOn.open();
    await jobsSettled(harness, 1);
    expect(await jobOutcomes(harness)).toEqual([
      { state: 'completed', outcome: 'refused', code: 'kernel.stale-version' },
    ]);
    expect(await posted(harness, document.id, first.decisionId)).toMatchObject({
      movements: 0,
      journals: 0,
      uses: 0,
    });
    // It returns for renewed approval: the new version is approved and posted, the first decision stays unused.
    const second = await approveForPosting(
      harness,
      document,
      HARNESS_ACTIONS.ptApproval,
      { kind: 'known', amountPaise: paise(20_000) },
      fixtures.bookId,
    );
    await jobsSettled(harness, 2);
    expect(await posted(harness, document.id, second.decisionId)).toMatchObject({
      movements: 1,
      journals: 1,
      uses: 1,
      state: 'posted',
    });
    expect((await posted(harness, document.id, first.decisionId)).uses).toBe(0);
    expect((await trialBalance(harness, fixtures)).INV).toBe(20_000);
    await rebuilds(harness, harness.preparer.user.id);
    await invariantsHold(harness.database);
  }, 600_000);

  it('PRD-INT-004 PRD-EXC-001 DEC-097 books-and-posting 15 test 8 with no valid map the job posts nothing; after the map is approved a retry with the same decision posts once', async () => {
    const kinds = [...new Set(SYNTHETIC_MAPS.map(([kind]) => kind))].filter(
      (kind) => kind !== 'stock.cost-established',
    );
    const { harness, fixtures, actor } = await world({ maps: kinds });
    const origins = await received(harness, fixtures, fixtures.w1, [{ skuId: fixtures.sku.skuId, quantity: 3 }]);
    const document = await ptDocument(harness, fixtures.w1, origins, [3], 10_000);
    await start(harness, actor);
    const click = await approveForPosting(
      harness,
      document,
      HARNESS_ACTIONS.ptApproval,
      { kind: 'known', amountPaise: paise(30_000) },
      fixtures.bookId,
    );
    await jobsSettled(harness, 1);
    expect(await jobOutcomes(harness)).toEqual([
      { state: 'completed', outcome: 'refused', code: 'stock.posting-refused' },
    ]);
    expect(await posted(harness, document.id, click.decisionId)).toMatchObject({
      movements: 0,
      journals: 0,
      uses: 0,
      state: 'posting',
    });
    // Accounts approve the map; an authorised person retries with the same decision (9.8 step 5; 10 step 5).
    await harness.map(fixtures.bookId, fixtures.accounts, 'stock.cost-established');
    const retry = {
      decisionId: click.decisionId,
      actionType: HARNESS_ACTIONS.ptApproval,
      versionId: document.versionId,
    };
    await retryPosting(harness, document, retry, fixtures.bookId);
    await jobsSettled(harness, 2);
    expect(await posted(harness, document.id, click.decisionId)).toMatchObject({
      movements: 1,
      journals: 1,
      uses: 1,
      state: 'posted',
    });
    // A further retry of the same decision posts nothing more: the document is posted and the decision used (DEC-097).
    await retryPosting(harness, document, retry, fixtures.bookId);
    await jobsSettled(harness, 3);
    expect((await jobOutcomes(harness))[2]).toMatchObject({ outcome: 'refused' });
    expect(await posted(harness, document.id, click.decisionId)).toMatchObject({ movements: 1, journals: 1, uses: 1 });
    expect((await trialBalance(harness, fixtures)).INV).toBe(30_000);
    await rebuilds(harness, harness.preparer.user.id);
    await invariantsHold(harness.database);
  }, 600_000);

  it('stock-ledger 10.6 code-house-rules 12.9 posting jobs run one at a time per book; another book’s job runs meanwhile', async () => {
    const { harness, fixtures, actor } = await world();
    const other = await harness.fixtures('moving-average', 'book', { pieceTracked: false });
    const documents = [];
    for (const book of [fixtures, fixtures, other]) {
      const origins = await received(harness, book, book.w1, [{ skuId: book.sku.skuId, quantity: 1 }]);
      documents.push(await ptDocument(harness, book.w1, origins, [1], 10_000));
    }
    const [a1, a2, b1] = documents as [HarnessDocument, HarnessDocument, HarnessDocument];
    const reached = new Map(documents.map((each) => [each.id, gate()]));
    const goOn = gate();
    const hooks: PostingHooks = {
      beforeLocks: async (_context, documentId) => {
        reached.get(documentId)?.open();
        await goOn.wait;
      },
    };
    // Two workers, so a second job of book A would be fetched if pg-boss let it.
    await start(harness, actor, hooks);
    await start(harness, actor, hooks);
    const value = { kind: 'known', amountPaise: paise(10_000) } as const;
    await approveForPosting(harness, a1, HARNESS_ACTIONS.ptApproval, value, fixtures.bookId);
    await within(reached.get(a1.id)?.wait ?? Promise.resolve(), harness);
    await approveForPosting(harness, a2, HARNESS_ACTIONS.ptApproval, value, fixtures.bookId);
    await approveForPosting(harness, b1, HARNESS_ACTIONS.ptApproval, value, other.bookId);
    // Book B's job starts while book A's first holds its book; A's second stays created, not dropped.
    await within(reached.get(b1.id)?.wait ?? Promise.resolve(), harness);
    const states = await asVerifier(harness.database, async (client) => {
      const rows = await client.query<{ key: string; state: string }>(
        `select singleton_key as key, state::text as state from pgboss.job where name = 'kernel.posting-delivery'
         order by created_on, id`,
      );
      return rows.rows;
    });
    expect(states).toEqual([
      { key: fixtures.bookId, state: 'active' },
      { key: fixtures.bookId, state: 'created' },
      { key: other.bookId, state: 'active' },
    ]);
    goOn.open();
    await jobsSettled(harness, 3);
    expect((await jobOutcomes(harness)).map((each) => each.outcome)).toEqual(['done', 'done', 'done']);
    expect((await trialBalance(harness, fixtures)).INV).toBe(20_000);
    expect((await trialBalance(harness, other)).INV).toBe(10_000);
  }, 600_000);
});

/** A PT approval document whose lines each cover their origin's quantity, at a P RATE, coverage recorded (13.5). */
async function ptDocument(
  harness: StockHarness,
  at: At,
  origins: readonly Origin[],
  quantities: readonly number[],
  pRatePaise: number,
): Promise<HarnessDocument> {
  const document = await harness.prepare(
    'pt-approval',
    at,
    origins.map(({ originId, skuId }, index) => ({
      lineId: uuidv7(),
      skuId,
      quantity: quantities[index] ?? 0,
      receiptOriginId: originId,
      amountPaise: pRatePaise,
    })),
  );
  await harness.step(
    document,
    'cover',
    { from: 'prepared', to: 'covered' },
    origins.map(({ originId }, index) => ({
      kind: 'record-coverage',
      lineId: uuidv7(),
      ptRevisionId: document.id,
      receiptOriginId: originId,
      quantity: quantities[index] ?? 0,
    })),
  );
  return document;
}
