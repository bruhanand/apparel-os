import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYNTHETIC_INTAKE_CAPS_ENVIRONMENT } from './fixtures/intake-caps.js';
import { asVerifier } from './harness/stock/checks.js';
import { OpeningApp } from './support/opening-app.js';

// fix/large-batch-validate: Validate of a batch as large as the row cap at intake lets in (imports-and-opening-data
// 3.3, 8, 9.3, 10.6; PRD-IMP-005, PRD-PRF-001). Every statement of Validate must stay well within the runtime role's
// statement limit (code-house-rules 5.1, CH-3; DEC-112), whatever the batch's size: the staged rows are read in parts
// of a bounded size, the documents are ordered by an index, and the row issues are written in parts. The cap is the
// SYNTHETIC row cap of local work, tests and `dev` (intake-caps.ts): every sheet's rows together, the header row
// included, so the file holds one header and the rest data. The timings are recorded, not asserted; they print when
// AOS_STOCK_LARGE_REPORT is 1. Every value is SYNTHETIC.

/** SYNTHETIC: the most rows intake lets in, the header row among them (9.3). */
const CAP_ROWS = Number(SYNTHETIC_INTAKE_CAPS_ENVIRONMENT.AOS_INTAKE_MAX_ROWS);
/** SYNTHETIC: the rows of a batch whose every row has a Blocking issue, beyond what one insert can bind. */
const ISSUE_ROWS = 30_000;
/** SYNTHETIC: the SKUs the rows spread over, round robin. */
const SKUS = 10;

const world = new OpeningApp();
const barcodes: string[] = [];
const timings: Record<string, number> = {};

beforeAll(async () => {
  await world.start('validatelarge');
  const { harness, fixtures } = world;
  const { setup } = harness;
  const skus = [fixtures.sku];
  for (let i = 1; i < SKUS; i += 1) skus.push(await harness.catalogueSku(false));
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
}, 600_000);

afterAll(async () => {
  if (process.env.AOS_STOCK_LARGE_REPORT === '1') {
    console.log(`AOS_STOCK_LARGE_REPORT ${JSON.stringify({ synthetic: true, validateLarge: timings })}`);
  }
  await world.stop();
});

/** Stages a manifest of the rows, then validates it; answers the batch and Validate's answer, timing both. */
async function stagedThenValidated(label: string, rows: (string | null)[][]) {
  let started = performance.now();
  const batchId = await world.opening(rows);
  timings[`${label}StageMs`] = Math.round(performance.now() - started);
  started = performance.now();
  const answer = await world.call(world.preparer, 'POST', `/api/files-imports/batches/${batchId}/validate`, {});
  timings[`${label}ValidateMs`] = Math.round(performance.now() - started);
  return { batchId, answer };
}

async function issuesOf(batchId: string) {
  return asVerifier(world.database, async (client) => {
    const rows = await client.query<{ issues: number; blocking: number }>(
      `select count(*)::integer as issues, count(*) filter (where severity = 'Blocking')::integer as blocking
         from files_imports.row_issue where batch_id = $1`,
      [batchId],
    );
    return rows.rows[0];
  });
}

describe('Validate of a large batch stays within the statement limit (3.3, 8, 9.3)', () => {
  it('GC-6 9.3 PRD-IMP-005 PRD-PRF-001 a batch of the row cap validates within the time limits and is Validated', async () => {
    const { batchId, answer } = await stagedThenValidated(
      'cap',
      Array.from({ length: CAP_ROWS - 1 }, (_, index) =>
        world.manifestRow('SYN-V-1', {
          barcode: barcodes[index % barcodes.length] ?? '',
          quantity: '1',
          valuationEvidence: 'SYN invoice 1',
        }),
      ),
    );
    expect(answer).toEqual({ status: 200, body: { batchId, state: 'Validated' } });
    expect(await issuesOf(batchId)).toEqual({ issues: 0, blocking: 0 });
  }, 1_800_000);

  it('GC-6 8.2 PRD-IMP-005 a large batch whose every row has a Blocking issue keeps every issue and stays Staged', async () => {
    const unmapped = world.next('NOT-MAPPED');
    const { batchId, answer } = await stagedThenValidated(
      'issues',
      Array.from({ length: ISSUE_ROWS }, () =>
        world.manifestRow('SYN-V-2', {
          barcode: unmapped,
          quantity: '1',
          valuationEvidence: 'SYN invoice 1',
        }),
      ),
    );
    expect(answer).toEqual({ status: 200, body: { batchId, state: 'Staged' } });
    expect(await issuesOf(batchId)).toEqual({ issues: ISSUE_ROWS, blocking: ISSUE_ROWS });
  }, 1_800_000);
});
