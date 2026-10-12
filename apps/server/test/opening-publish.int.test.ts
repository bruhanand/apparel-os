import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { organisationPlaces } from '../src/modules/stock/ledger/index.js';
import { asVerifier } from './harness/stock/checks.js';
import { eventually } from './support/jobs.js';
import { codeOf, OpeningApp } from './support/opening-app.js';
import { EXPLICIT_UNKNOWN, NO_VALUATION_EVIDENCE } from './support/opening-stock.js';
import { gate } from './support/transactions.js';

// S1-F13-T03: the publish gate and the synthetic opening count job (imports-and-opening-data 4.2, 10.1, 10.5, 10.6,
// 12, 17 tests 20, 22 and 24; stock-ledger 9, 10.6, 13.4; access-and-approvals 9.8; PRD-SEC-017, PRD-UXP-003,
// PRD-LIF-003 to PRD-LIF-006, PRD-LIF-008, PRD-LIF-011, PRD-STK-014, PRD-ACP-014, PRD-INT-004, POL-14.02, POL-14.07,
// DEC-071, DEC-097), through the whole application on real PostgreSQL and MinIO. The opening-balance handler is the
// test-only one of `support/opening-stock.ts`, composed into this test application only, and its posting consumer is
// the tests' own (GC6-18, DEC-116). Policy 14 is signed and validated as SYNTHETIC here only (code-house-rules 11.1).
// Every file, code and value is SYNTHETIC; every expected value is written by hand from the files below.

const world = new OpeningApp();

beforeAll(async () => {
  await world.start('openpub');
}, 600_000);

afterAll(async () => {
  await world.stop();
});

/** The barcode of SKU X, mapped as a SYNTHETIC internal code (structure-and-masters 4.7). */
let barcodeX: string;

beforeAll(async () => {
  const { setup } = world.harness;
  barcodeX = world.next('BC-X');
  const mapped = await setup.asPreparerDo((c, p) =>
    setup.catalogue.mapCode(c, p, {
      code: barcodeX,
      kind: 'internal',
      scope: { kind: 'organisation' },
      skuId: world.fixtures.sku.skuId,
      alias: false,
      validFrom: setup.today(),
    }),
  );
  if (mapped.kind !== 'success') throw new Error(`The SYNTHETIC barcode was refused: ${mapped.refusal.code}`);
}, 600_000);

/** What the read-only role reads of a batch's posting (H6): its movements, holds, origins and the decision's uses. */
async function postingOf(batchId: string, decisionId: string) {
  return asVerifier(world.database, async (client) => {
    const movements = await client.query<{ kind: string; quantity: number; owner_kind: string | null }>(
      `select m.kind, l.quantity, s.owner_kind from stock.movement m
         join stock.movement_leg l on l.movement_id = m.id
         join stock.receipt_origin o on o.id = l.receipt_origin_id
         join stock.receipt_origin_state s on s.receipt_origin_id = o.id
        where m.source_record_id in (select id from files_imports.import_document where batch_id = $1)
        order by l.quantity`,
      [batchId],
    );
    const holds = await client.query<{ kind: string; reason: string; quantity: number }>(
      `select h.kind, h.reason, sum(c.quantity)::integer as quantity from stock.hold h
         join stock.hold_claim c on c.hold_id = h.id
         join stock.balance b on b.id = c.balance_id
         join stock.receipt_origin o on o.id = b.receipt_origin_id
        where o.id in (select l.receipt_origin_id from stock.movement_leg l join stock.movement m on m.id = l.movement_id
                        where m.source_record_id in (select id from files_imports.import_document where batch_id = $1))
        group by h.kind, h.reason`,
      [batchId],
    );
    const uses = await client.query<{ uses: number; carried: number }>(
      `select (select count(*) from access.approval_use where approval_decision_id = $1)::integer as uses,
              (select count(*) from stock.movement m where m.approval_use_id in
                 (select id from access.approval_use where approval_decision_id = $1))::integer as carried`,
      [decisionId],
    );
    return { movements: movements.rows, holds: holds.rows, uses: uses.rows[0] };
  });
}

/**
 * The number of rows of every table outside the stock ledger, files-imports, the audit, the job queue and the kernel's
 * plumbing, as the read-only role reads them (H6): so a supplier delivery, booking, invoice, liability or journal
 * anywhere is seen (PRD-LIF-008). `access` is counted too, but its sessions.
 */
function recordsElsewhere() {
  return asVerifier(world.database, async (client) => {
    const tables = await client.query<{ name: string }>(
      `select n.nspname || '.' || c.relname as name
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r', 'p') and not c.relispartition
         and n.nspname not in ('pg_catalog', 'information_schema', 'stock', 'files_imports', 'audit', 'kernel',
           'pgboss')
         and n.nspname not like 'pg\\_%'
         and n.nspname || '.' || c.relname <> 'access.session' order by 1`,
    );
    const counts: Record<string, number> = {};
    for (const { name } of tables.rows) {
      const [schema, table] = name.split('.');
      const result = await client.query<{ rows: number }>(
        `select count(*)::int as rows from "${schema ?? ''}"."${table ?? ''}"`,
      );
      counts[name] = result.rows[0]?.rows ?? -1;
    }
    return counts;
  });
}

async function movementsCount(): Promise<number> {
  return asVerifier(world.database, async (client) => {
    const rows = await client.query<{ n: number }>('select count(*)::int as n from stock.movement');
    return rows.rows[0]?.n ?? -1;
  });
}

/** Waits for the batch's outcome of a request to post (10.6), answering it. */
async function outcomeOf(batchId: string, publishRequestId: string) {
  await eventually(async () => {
    const read = await world.readBatch(batchId);
    return read.outcomes.some((each) => each.publishRequestId === publishRequestId);
  }, 120_000);
  const read = await world.readBatch(batchId);
  return { read, outcome: read.outcomes.find((each) => each.publishRequestId === publishRequestId) };
}

let switchId: string;

describe('the publish gate (4.2, 10.1; GC-6 17 test 22)', () => {
  it('GC-6 17 test 22 PRD-SEC-017 PRD-UXP-003: publishing an opening batch is unavailable without policy 14 Signed and validated, and names what is missing', async () => {
    const batchId = await world.opening([world.manifestRow('SYN-G-1', { barcode: barcodeX, quantity: '1' })]);
    const { versionId, decisionId } = await world.verified(batchId);
    const missing = [
      { kind: 'capability', capability: 'files-imports.opening-publishing' },
      { kind: 'policy', policy: '14', lacks: 'signature' },
      { kind: 'policy', policy: '14', lacks: 'validation' },
      { kind: 'opening-switch', businessUnitId: world.fixtures.s1.businessUnitId },
    ];
    // The screen reads it before anyone clicks (PRD-UXP-003).
    expect((await world.readBatch(batchId)).batch.publishing).toEqual({ state: 'unavailable', missing });
    const refused = await world.publish(batchId, versionId, decisionId);
    expect(refused.status).not.toBe(200);
    expect(codeOf(refused)).toBe('configuration.operation-unavailable');
    expect(refused.body).toMatchObject({ error: { missing, next: 'configuration.open-policy-readiness' } });
    // Policy 14 Signed and validated is not enough: the unit has no approved switch yet (POL-14.07).
    await world.policyFourteenSigned();
    expect((await world.readBatch(batchId)).batch.publishing).toEqual({
      state: 'unavailable',
      missing: [{ kind: 'opening-switch', businessUnitId: world.fixtures.s1.businessUnitId }],
    });
    switchId = await world.switchApproved();
    expect((await world.readBatch(batchId)).batch.publishing).toEqual({ state: 'available', missing: [] });
    // Nothing was posted or requested by the refusals.
    expect((await world.readBatch(batchId)).batch.posting).toBeUndefined();
  }, 600_000);
});

describe('the synthetic opening count job (10.5, 10.6; GC-6 17 tests 20 and 24)', () => {
  it('GC-6 17 test 20 PRD-LIF-004 PRD-STK-014 PRD-LIF-008 PRD-LIF-006 DEC-097: one queued job posts the opening counts, a row without valuation evidence held as excess; no delivery, booking, invoice, liability or journal; the decision used once', async () => {
    const batchId = await world.opening([
      // Owned by the legal entity Operations verified, with its valuation evidence: opening stock.
      world.manifestRow('SYN-O-1', { barcode: barcodeX, quantity: '3', valuationEvidence: 'SYN invoice 12' }),
      // No valuation evidence, and an explicit Unknown season below: held as excess, owner Unknown (PRD-STK-014).
      world.manifestRow('SYN-O-1', { barcode: barcodeX, quantity: '2', season: '' }),
      // A billed-retained item, not opening stock (PRD-LIF-028): nothing posts for it.
      world.manifestRow('SYN-O-1', {
        section: 'billed-retained',
        barcode: barcodeX,
        quantity: '1',
        billReference: 'SYN-EPOS-B-3',
      }),
    ]);
    // PRD-LIF-006: Unknown selected explicitly by a person, with the reason; the entry is audited (section 5).
    let read = await world.readBatch(batchId);
    const unseasoned = read.documents[0]?.rows.find((row) => row.rowNumber === 3);
    if (unseasoned === undefined) throw new Error('no second row');
    await world.ok(
      world.preparer,
      'POST',
      `/api/files-imports/batches/${batchId}/rows/${unseasoned.stagedRowId}/entries`,
      {
        versionId: read.batch.versionId,
        field: 'season',
        value: EXPLICIT_UNKNOWN,
        reason: 'SYNTHETIC: the earlier POS holds no season for this item',
      },
    );
    const audited = await asVerifier(world.database, async (client) => {
      const rows = await client.query<{ n: number }>(
        `select count(*)::int as n from audit.audit_record where record_id = $1 and operation = 'enter-staged-value'`,
        [batchId],
      );
      return rows.rows[0]?.n;
    });
    expect(audited).toBe(1);
    const { versionId, decisionId } = await world.verified(batchId);
    // The worker serves the posting consumer from before the click (code-house-rules 12.8); its step is held until the
    // click is checked.
    const goOn = gate();
    await world.worker({ beforeStep: () => goOn.wait });
    const before = await recordsElsewhere();
    const movementsBefore = await movementsCount();

    // The click records the request to post and posts nothing; the batch shows Validated with the job waiting (3.2).
    const queued = await world.publish(batchId, versionId, decisionId);
    expect(queued.status).toBe(200);
    expect(queued.body).toMatchObject({ result: 'queued', state: 'Validated' });
    const publishRequestId = queued.body.publishRequestId as string;
    read = await world.readBatch(batchId);
    expect(read.batch.state).toBe('Validated');
    expect(read.batch.posting).toMatchObject({ publishRequestId, state: 'queued' });
    expect(await movementsCount()).toBe(movementsBefore);
    // A second click while it waits is refused (one request at a time).
    expect(codeOf(await world.publish(batchId, versionId, decisionId))).toBe('files-imports.publish-queued');
    goOn.open();
    const { read: after, outcome } = await outcomeOf(batchId, publishRequestId);
    expect(outcome).toMatchObject({ result: 'published' });
    expect(after.batch.state).toBe('Published');
    expect(after.batch.posting).toBeUndefined();
    // PRD-LIF-004 PRD-STK-014: two opening counts; the row without evidence is held as excess, owner Unknown.
    expect(await postingOf(batchId, decisionId)).toEqual({
      movements: [
        { kind: 'opening-count', quantity: 2, owner_kind: null },
        { kind: 'opening-count', quantity: 3, owner_kind: 'organisation' },
      ],
      holds: [{ kind: 'excess', reason: NO_VALUATION_EVIDENCE, quantity: 2 }],
      // DEC-097: the decision used once, and every movement keeps its use.
      uses: { uses: 1, carried: 2 },
    });
    // PRD-LIF-008: nothing outside the ledger, the import and its plumbing, but the decision's use.
    const elsewhere = await recordsElsewhere();
    expect(elsewhere).toEqual({ ...before, 'access.approval_use': (before['access.approval_use'] ?? 0) + 1 });
    // PRD-ACP-014: the explicit Unknown season reached no record outside the import: no season-specific offer exists in
    // stage 1 to match it (pricing is stage 4), and the ledger keeps no season.
    expect(Object.keys(elsewhere).filter((name) => name.includes('offer'))).toEqual([]);
  }, 600_000);

  it('GC-6 17 test 24 DEC-097 PRD-INT-004: a failed job posts nothing and leaves the decision unused; the batch shows the failure', async () => {
    const batchId = await world.opening([
      world.manifestRow('SYN-F-1', { barcode: barcodeX, quantity: '4', valuationEvidence: 'SYN invoice 13' }),
    ]);
    const { versionId, decisionId } = await world.verified(batchId);
    const movementsBefore = await movementsCount();
    const reached = gate();
    const goOn = gate();
    await world.worker({
      beforeStep: async () => {
        reached.open();
        await goOn.wait;
      },
    });
    const queued = await world.publish(batchId, versionId, decisionId);
    expect(queued.body).toMatchObject({ result: 'queued' });
    const publishRequestId = queued.body.publishRequestId as string;
    await reached.wait;
    // The switch's cutover completes while the job waits: under its locks the job finds the unit closed
    // (PRD-LIF-011), so the opening fails whole.
    await world.cutoverCompleted(switchId);
    goOn.open();
    const { read, outcome } = await outcomeOf(batchId, publishRequestId);
    expect(outcome).toMatchObject({ result: 'failed', refusalCode: 'files-imports.cutover-complete' });
    expect(read.batch.state).toBe('Validated');
    expect(await movementsCount()).toBe(movementsBefore);
    expect((await postingOf(batchId, decisionId)).uses).toEqual({ uses: 0, carried: 0 });
    // PRD-LIF-011: after the cutover, Publish and a new opening batch for the unit are refused.
    expect(codeOf(await world.publish(batchId, versionId, decisionId))).toBe('files-imports.cutover-complete');
    expect(read.batch.publishing).toEqual({
      state: 'unavailable',
      missing: [{ kind: 'opening-switch', switchId, cutover: 'complete' }],
    });
    const again = await world.start_([world.manifestRow('SYN-F-2', { barcode: barcodeX, quantity: '1' })]);
    expect(codeOf(again)).toBe('files-imports.cutover-complete');
  }, 600_000);
});

describe('an empty unit (10.1; PRD-LIF-003)', () => {
  it('GC-6 17 test 20 PRD-LIF-003: an empty unit declares zero by a declaration, not a file, and nothing is counted', async () => {
    const operations = await world.enrolled('OPENING-OPS', [
      { recordType: 'site_lifecycle.zero_stock_declaration', action: 'view' },
      { recordType: 'site_lifecycle.zero_stock_declaration', action: 'create' },
    ]);
    // A new SYNTHETIC unit at a Site of its own, which holds no stock.
    const { harness } = world;
    const site = await harness.site('retail-site');
    const s1 = world.fixtures.s1;
    const mapping = await harness.run(harness.setup.preparer.id, (context) =>
      organisationPlaces.unitAt(context, s1, harness.setup.today()),
    );
    if (mapping === undefined) throw new Error('S1 has no mapping');
    const empty = await harness.unit(
      { bookId: mapping.bookId, legalEntityId: mapping.legalEntityId, registrationId: mapping.taxRegistrationId },
      site,
      'whole-store',
      await harness.store(site),
    );
    const movementsBefore = await movementsCount();
    const declared = await world.ok(
      operations,
      'POST',
      `/api/site-lifecycle/units/${empty.businessUnitId}/zero-stock-declaration`,
      { holdsNoStock: true },
    );
    expect(declared.body).toHaveProperty('declarationId');
    expect(await movementsCount()).toBe(movementsBefore);
  }, 120_000);
});
