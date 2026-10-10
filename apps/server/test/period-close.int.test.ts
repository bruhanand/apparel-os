import { uuidv7 } from '@apparel-os/domain';
import { PERIOD_REOPENING_TYPE, type NamedCorrection } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PostRequest, PostResult } from '../src/modules/finance/books/index.js';
import { syntheticKeysEnvironment } from './support/access.js';
import {
  postDocument,
  postIn,
  recorded,
  reverseIn,
  syntheticBooks,
  syntheticDocument,
  SYNTHETIC_DOCUMENT_TYPE,
  SYNTHETIC_SOURCE,
  SYNTHETIC_VALUE_IN,
  type SyntheticBook,
} from './support/books.js';
import { grantSynthetic } from './support/grants.js';
import { approvedGeography, decided, structureSetup, type StructureSetup } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';
import { backendPid, gate, waitUntilAnyWaitingForLock, waitUntilWaitingForLock } from './support/transactions.js';

// S1-F09-T03: lock and reopening of financial periods through the books part's interface and access's Decide, on
// real PostgreSQL (books-and-posting 4.2 to 4.5, 9.1, 13.1; 15 tests 9 to 13). Tests 9 and 10 run their transactions
// on separate connections and order them by what PostgreSQL reports (code-house-rules 10.3). Who may lock, request,
// approve and withdraw is KDPS's (V-01): the people here hold labelled synthetic grants, and every period, financial
// year, account, map and number format is SYNTHETIC (GC4-1, GC5-1, V-10).

let world: SyntheticWorld;
let setup: StructureSetup;
let books: ReturnType<typeof syntheticBooks>;
let database: string;

beforeAll(async () => {
  world = await createSyntheticOrganisations('periods');
  const [orgA] = world.organisations;
  database = orgA.database;
  setup = await structureSetup({
    directory: world.directory,
    database: orgA.database,
    organisationCode: orgA.code,
    keysEnvironment: syntheticKeysEnvironment(world),
    label: 'PERIOD-A',
    eventKinds: [SYNTHETIC_VALUE_IN],
  });
  const geography = await approvedGeography(setup, 'PERIOD');
  books = syntheticBooks(setup, { stateId: geography.state.recordId, areaId: geography.area.recordId });
  // The requester may approve and withdraw too, so the refusal of their own approval is for the request alone
  // (PRD-LED-019, PRD-ACS-006). SYNTHETIC grants: who holds them is KDPS's (V-01).
  await grantSynthetic(orgA.database, { kind: 'user', id: setup.preparer.id }, [
    { recordType: PERIOD_REOPENING_TYPE, action: 'approve' },
    { recordType: PERIOD_REOPENING_TYPE, action: 'cancel' },
  ]);
}, 180_000);

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

const lock = (periodId: string) => setup.asPreparerDo((c, p) => setup.books.lockPeriod(c, p, periodId));

const states = async (b: SyntheticBook) =>
  (await setup.run(setup.preparer.id, (c) => setup.books.listPeriods(c, b.bookId))).map((each) => each.state);

const periodClose = (b: SyntheticBook) => setup.run(setup.preparer.id, (c) => setup.books.periodClose(c, b.bookId));

const correctionOf = (request: PostRequest): NamedCorrection => ({
  module: request.sourceModule,
  recordType: request.document.recordType,
  recordId: request.document.recordId,
});

const requestReopening = (periodId: string, corrections: NamedCorrection[]) =>
  setup.asPreparerDo((c, p) =>
    setup.books.requestReopening(c, p, periodId, { reason: 'SYNTHETIC correction of a late receipt', corrections }),
  );

/** A reopening of the period naming the corrections, requested by the preparer and approved by the approver. */
async function reopened(periodId: string, corrections: NamedCorrection[]) {
  const asked = recorded(await requestReopening(periodId, corrections));
  decided(await setup.decide(asked.requestId, asked.reopeningId));
  return asked;
}

/** The requester withdraws their own reopening, holding no cancel (RR-489; product owner, 10 Oct 2026). */
const withdraw = (reopeningId: string) =>
  setup.run(setup.preparer.id, (c) => setup.books.withdrawReopening(c, { userId: setup.preparer.id }, reopeningId));

function posted(result: PostResult) {
  if (result.kind !== 'posted') throw new Error(`Not posted: ${JSON.stringify(result)}`);
  return result.journals;
}

const lockedRefusal = (periodId: string | undefined) => ({
  kind: 'refused',
  items: [
    {
      refusal: {
        code: 'finance.period-locked',
        missing: [{ kind: 'financial-period', periodId, code: expect.any(String) as unknown }],
      },
    },
  ],
});

describe('Lock a period (books-and-posting 4.2, 15 test 13; PRD-LED-009)', () => {
  it('PRD-LED-009 books-and-posting 15 test 13 a period cannot be locked while an earlier one is open; locked in date order, each shows Locked', async () => {
    const b = await books.book(2);
    const [p1, p2] = b.periods;
    expect(await lock(p2?.id ?? '')).toMatchObject({ refusal: { code: 'finance.earlier-period-open' } });
    expect(await states(b)).toEqual(['Open', 'Open']);
    recorded(await lock(p1?.id ?? ''));
    expect(await lock(p1?.id ?? '')).toMatchObject({ refusal: { code: 'finance.period-not-open' } });
    expect(await states(b)).toEqual(['Locked', 'Open']);
    recorded(await lock(p2?.id ?? ''));
    expect(await states(b)).toEqual(['Locked', 'Locked']);
  });

  it('PRD-LED-009 a posting into a Locked period is refused, naming the period; Hold periods refuses one locked since Check postable', async () => {
    const b = await books.book(1);
    const [p1] = b.periods;
    const request = syntheticDocument(setup, b, { businessDate: setup.today() });
    const checked = gate();
    const lockedMeanwhile = gate();
    const holding = setup.run(setup.preparer.id, async (context) => {
      const checks = await setup.books.checkPostable(context, request);
      expect(checks).toMatchObject([{ kind: 'postable', period: { state: 'Open' } }]);
      checked.open();
      await lockedMeanwhile.wait;
      return setup.books.holdPeriods(context, checks);
    });
    await checked.wait;
    recorded(await lock(p1?.id ?? ''));
    lockedMeanwhile.open();
    expect(await holding).toMatchObject({ kind: 'refused', refusal: { code: 'finance.period-locked' } });
    expect(await postDocument(setup, request)).toMatchObject(lockedRefusal(p1?.id));
  });
});

describe('Locking against posting (books-and-posting 4.5, 15 tests 9 and 10; PRD-INT-003, PRD-PRF-003)', () => {
  it('PRD-LED-009 PRD-INT-003 books-and-posting 15 test 9 a lock waits for a posting in flight in the same period; a posting after the lock is refused', async () => {
    const b = await books.book(1);
    const [p1] = b.periods;
    const holding = gate();
    const release = gate();
    let postingPid = 0;
    const inFlight = setup.run(setup.preparer.id, async (context) => {
      postingPid = await backendPid(context);
      const result = await postIn(setup, context, syntheticDocument(setup, b, { businessDate: setup.today() }));
      holding.open();
      await release.wait;
      return result;
    });
    await holding.wait;
    let lockDone = false;
    const locking = lock(p1?.id ?? '').then((outcome) => {
      lockDone = true;
      return outcome;
    });
    // The lock waits on the period row the posting holds in shared mode (4.5).
    await waitUntilAnyWaitingForLock(database, [postingPid]);
    expect(lockDone).toBe(false);
    release.open();
    expect(posted(await inFlight)).toHaveLength(1);
    recorded(await locking);
    expect(await states(b)).toEqual(['Locked']);
    expect(await postDocument(setup, syntheticDocument(setup, b, { businessDate: setup.today() }))).toMatchObject(
      lockedRefusal(p1?.id),
    );
  });

  it('PRD-PRF-003 books-and-posting 15 test 10 postings into one period do not wait for each other on the period row; the wait on the journal series is measured', async () => {
    const b = await books.book(1);
    const first = gate();
    const release = gate();
    const secondHeld = gate();
    let firstPid = 0;
    const one = setup.run(setup.preparer.id, async (context) => {
      firstPid = await backendPid(context);
      const result = await postIn(setup, context, syntheticDocument(setup, b, { businessDate: setup.today() }));
      first.open();
      await release.wait;
      return result;
    });
    await first.wait;
    let secondPid = 0;
    const two = setup.run(setup.preparer.id, async (context) => {
      secondPid = await backendPid(context);
      return postIn(setup, context, syntheticDocument(setup, b, { businessDate: setup.today() }), {
        // Past step 7 while the first still holds the period row: no wait on it (4.5).
        afterHold: () => {
          secondHeld.open();
          return Promise.resolve();
        },
      });
    });
    await secondHeld.wait;
    // It waits at step 8, on the book's journal series the first holds until commit (5.4; GC4-4).
    await waitUntilWaitingForLock(database, secondPid);
    expect(secondPid).not.toBe(firstPid);
    release.open();
    expect(posted(await one)).toHaveLength(1);
    expect(posted(await two)).toHaveLength(1);

    // The wait measured, not assumed away: rounds of postings at once into one period, each timing its step 8 lock
    // call. SYNTHETIC load on the test container; PRD-PRF-003 sets no number, so the result is reported, and a
    // breach goes back to Accounts under GC4-4.
    const waits: number[] = [];
    const concurrency = 4;
    const rounds = 10;
    for (let round = 0; round < rounds; round += 1) {
      const results = await Promise.all(
        Array.from({ length: concurrency }, () =>
          setup.run(setup.preparer.id, (context) =>
            postIn(setup, context, syntheticDocument(setup, b, { businessDate: setup.today() }), {
              atStep8: (waited) => waits.push(waited),
            }),
          ),
        ),
      );
      for (const result of results) expect(result.kind).toBe('posted');
    }
    const sorted = [...waits].sort((x, y) => x - y);
    const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
    const report = {
      postings: waits.length,
      concurrency,
      meanMs: Number((waits.reduce((sum, each) => sum + each, 0) / waits.length).toFixed(2)),
      p50Ms: Number(at(0.5).toFixed(2)),
      p95Ms: Number(at(0.95).toFixed(2)),
      maxMs: Number(at(1).toFixed(2)),
    };
    console.info(`books-and-posting 15 test 10, wait on the journal series (GC4-4): ${JSON.stringify(report)}`);
    expect(waits).toHaveLength(concurrency * rounds);
  });
});

describe('Request and approve a reopening (books-and-posting 4.3, 15 test 11; PRD-LED-019; DEC-106)', () => {
  it('PRD-LED-019 books-and-posting 15 test 11 a reopening approved by its requester is refused; approved by another authorised person, the period shows Reopened', async () => {
    const b = await books.book(1);
    const [p1] = b.periods;
    const correction = correctionOf(syntheticDocument(setup, b, { businessDate: setup.today() }));
    expect(await requestReopening(p1?.id ?? '', [correction])).toMatchObject({
      refusal: { code: 'finance.period-not-locked' },
    });
    recorded(await lock(p1?.id ?? ''));
    expect(await requestReopening(p1?.id ?? '', [])).toMatchObject({
      refusal: { code: 'finance.no-correction-named' },
    });
    const asked = recorded(await requestReopening(p1?.id ?? '', [correction]));
    expect(await setup.decide(asked.requestId, asked.reopeningId, 'approve', setup.preparer)).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.self-preparation' },
    });
    expect(await states(b)).toEqual(['Locked']);
    expect((await periodClose(b))[0]?.reopenings).toMatchObject([
      { id: asked.reopeningId, state: 'Awaiting approval', request: { id: asked.requestId } },
    ]);
    decided(await setup.decide(asked.requestId, asked.reopeningId));
    expect(await states(b)).toEqual(['Reopened']);
    expect((await periodClose(b))[0]).toMatchObject({
      state: 'Reopened',
      lockedAt: expect.any(String) as unknown,
      reopenings: [
        {
          id: asked.reopeningId,
          reason: 'SYNTHETIC correction of a late receipt',
          state: 'In force',
          corrections: [{ ...correction }],
        },
      ],
    });
    expect((await periodClose(b))[0]?.reopenings[0]?.corrections[0]?.postedJournalId).toBeUndefined();
  });

  it('PRD-LED-019 the database refuses an approval by the requester even when written past the service', async () => {
    const b = await books.book(1);
    const [p1] = b.periods;
    recorded(await lock(p1?.id ?? ''));
    const asked = recorded(
      await requestReopening(p1?.id ?? '', [
        correctionOf(syntheticDocument(setup, b, { businessDate: setup.today() })),
      ]),
    );
    const client = await connect(database, 'runtime');
    try {
      await expect(
        client.query(
          `insert into finance.period_event
             (id, financial_period_id, kind, period_reopening_id, by_user_id, approval_decision_id, occurred_at)
           values ($1, $2, 'reopening-approved', $3, $4, $5, now())`,
          [uuidv7(), p1?.id, asked.reopeningId, setup.preparer.id, uuidv7()],
        ),
      ).rejects.toThrow(/other than its requester/);
    } finally {
      await client.end();
    }
  });
});

describe('Withdrawing a reopening (books-and-posting 4.3 step 4; PRD-LED-020; RR-489, product owner, 10 Oct 2026)', () => {
  it('PRD-LED-020 RR-489 the requester withdraws a reopening still awaiting its decision, holding no cancel; its request is Withdrawn and can no longer be decided', async () => {
    const b = await books.book(1);
    const [p1] = b.periods;
    recorded(await lock(p1?.id ?? ''));
    const x = syntheticDocument(setup, b, { businessDate: setup.today() });
    const pending = recorded(await requestReopening(p1?.id ?? '', [correctionOf(x)]));
    expect(await withdraw(pending.reopeningId)).toEqual({
      kind: 'success',
      answer: { reopeningId: pending.reopeningId },
    });
    const requests = await setup.run(setup.preparer.id, (c) =>
      setup.access.approvalRequestsOf(c, [pending.reopeningId]),
    );
    expect(requests.get(pending.reopeningId)).toMatchObject({ id: pending.requestId, state: 'Withdrawn' });
    expect(await setup.decide(pending.requestId, pending.reopeningId)).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.approval-not-open' },
    });
    expect(await states(b)).toEqual(['Locked']);
    expect((await periodClose(b))[0]?.reopenings).toMatchObject([{ id: pending.reopeningId, state: 'Withdrawn' }]);
    expect(await postDocument(setup, x)).toMatchObject(lockedRefusal(p1?.id));
    expect(await withdraw(pending.reopeningId)).toMatchObject({ refusal: { code: 'finance.reopening-not-in-force' } });
  });

  it('PRD-LED-020 RR-489 anyone but the requester needs cancel to withdraw, pending or in force', async () => {
    const b = await books.book(1);
    const [p1] = b.periods;
    recorded(await lock(p1?.id ?? ''));
    const pending = recorded(
      await requestReopening(p1?.id ?? '', [
        correctionOf(syntheticDocument(setup, b, { businessDate: setup.today() })),
      ]),
    );
    const other = await setup.anotherApprover(`WITHDRAWER-${pending.reopeningId.slice(-6).toUpperCase()}`);
    const by = (cancelHeldThrough?: string) =>
      setup.run(other.id, (c) =>
        setup.books.withdrawReopening(
          c,
          { userId: other.id, ...(cancelHeldThrough === undefined ? {} : { cancelHeldThrough }) },
          pending.reopeningId,
        ),
      );
    expect(await by()).toMatchObject({
      kind: 'refusal',
      refusal: {
        code: 'access.not-authorised',
        missing: [{ kind: 'permission', action: 'cancel', recordType: PERIOD_REOPENING_TYPE }],
      },
    });
    const cancel = await grantSynthetic(database, { kind: 'user', id: other.id }, [
      { recordType: PERIOD_REOPENING_TYPE, action: 'cancel' },
    ]);
    expect(await by(cancel.assignmentId)).toMatchObject({ kind: 'success' });
    expect((await periodClose(b))[0]?.reopenings).toMatchObject([{ state: 'Withdrawn' }]);
  });
});

describe('Postings in a Reopened period (books-and-posting 4.3, 15 test 12; PRD-LED-020; DEC-107)', () => {
  it('PRD-LED-020 books-and-posting 15 test 12 a named correction posts once; any other posting is refused; when the last one posts the period shows Locked', async () => {
    const b = await books.book(1);
    const [p1] = b.periods;
    recorded(await lock(p1?.id ?? ''));
    const x = syntheticDocument(setup, b, { businessDate: setup.today(), amount: 11_000 });
    const y = syntheticDocument(setup, b, { businessDate: setup.today(), amount: 22_000 });
    const asked = await reopened(p1?.id ?? '', [correctionOf(x), correctionOf(y)]);
    expect(await postDocument(setup, syntheticDocument(setup, b, { businessDate: setup.today() }))).toMatchObject(
      lockedRefusal(p1?.id),
    );
    const journals = posted(await postDocument(setup, x));
    // The same item again answers its first result (9.3); a new item of the same source no longer enters.
    expect(posted(await postDocument(setup, x))).toEqual(journals);
    expect(
      await postDocument(
        setup,
        syntheticDocument(setup, b, { businessDate: setup.today(), recordId: x.document.recordId }),
      ),
    ).toMatchObject(lockedRefusal(p1?.id));
    expect(await states(b)).toEqual(['Reopened']);
    const yJournals = posted(await postDocument(setup, y));
    expect(await states(b)).toEqual(['Locked']);
    const [row] = await periodClose(b);
    expect(row?.reopenings).toMatchObject([
      {
        id: asked.reopeningId,
        state: 'Completed',
        corrections: expect.arrayContaining([
          { ...correctionOf(x), postedJournalId: journals[0]?.journalId },
          { ...correctionOf(y), postedJournalId: yJournals[0]?.journalId },
        ]) as unknown,
      },
    ]);
    expect(await withdraw(asked.reopeningId)).toMatchObject({ refusal: { code: 'finance.reopening-not-in-force' } });
  });

  it('PRD-LED-020 a reopening withdrawn leaves the period Locked, and its correction refused', async () => {
    const b = await books.book(1);
    const [p1] = b.periods;
    recorded(await lock(p1?.id ?? ''));
    const x = syntheticDocument(setup, b, { businessDate: setup.today() });
    const pending = recorded(await requestReopening(p1?.id ?? '', [correctionOf(x)]));
    decided(await setup.decide(pending.requestId, pending.reopeningId));
    expect(await states(b)).toEqual(['Reopened']);
    recorded(await withdraw(pending.reopeningId));
    expect(await states(b)).toEqual(['Locked']);
    expect(await postDocument(setup, x)).toMatchObject(lockedRefusal(p1?.id));
    expect(await withdraw(pending.reopeningId)).toMatchObject({ refusal: { code: 'finance.reopening-not-in-force' } });
    expect((await periodClose(b))[0]?.reopenings).toMatchObject([{ state: 'Withdrawn' }]);
  });

  it('PRD-LED-020 several reopenings may be in force at once; the period shows Reopened while any has a correction to post', async () => {
    const b = await books.book(1);
    const [p1] = b.periods;
    recorded(await lock(p1?.id ?? ''));
    const x = syntheticDocument(setup, b, { businessDate: setup.today() });
    const y = syntheticDocument(setup, b, { businessDate: setup.today() });
    await reopened(p1?.id ?? '', [correctionOf(x)]);
    await reopened(p1?.id ?? '', [correctionOf(y)]);
    posted(await postDocument(setup, x));
    expect(await states(b)).toEqual(['Reopened']);
    posted(await postDocument(setup, y));
    expect(await states(b)).toEqual(['Locked']);
    expect((await periodClose(b))[0]?.reopenings.map((each) => each.state)).toEqual(['Completed', 'Completed']);
  });

  it('PRD-LED-009 PRD-LED-020 a reversal into a Locked period is refused unless a reopening names its source', async () => {
    const b = await books.book(1);
    const [p1] = b.periods;
    const x = syntheticDocument(setup, b, { businessDate: setup.today() });
    const [journal] = posted(await postDocument(setup, x));
    recorded(await lock(p1?.id ?? ''));
    const reverse = () =>
      setup.run(setup.preparer.id, (context) =>
        reverseIn(setup, context, {
          journalId: journal?.journalId ?? '',
          businessDate: setup.day(1),
          actorId: setup.preparer.id,
        }),
      );
    expect(await reverse()).toMatchObject({ kind: 'refused', refusal: { code: 'finance.period-locked' } });
    await reopened(p1?.id ?? '', [correctionOf(x)]);
    expect(await reverse()).toMatchObject({ kind: 'reversed' });
    expect(await states(b)).toEqual(['Locked']);
  });

  it('PRD-LED-009 books-and-posting 13.1 the journal’s guard refuses a Locked period, even when written past the service', async () => {
    const b = await books.book(1);
    const [p1] = b.periods;
    recorded(await lock(p1?.id ?? ''));
    const client = await connect(database, 'runtime');
    try {
      await expect(
        client.query(
          `insert into finance.journal (id, book_id, legal_entity_id, financial_period_id, accounting_date,
             business_date, event_kind, source_module, source_record_type, source_record_id, posting_map_version_id,
             number_allocation_id, number, actor_user_id, occurred_at)
           values ($1, $2, $3, $4, $5::date, $5::date, $6, $7, $8, $9, $10, $11, 'SYN-X', $12, now())`,
          [
            uuidv7(),
            b.bookId,
            uuidv7(),
            p1?.id,
            setup.today(),
            SYNTHETIC_VALUE_IN.kind,
            SYNTHETIC_SOURCE,
            SYNTHETIC_DOCUMENT_TYPE,
            uuidv7(),
            uuidv7(),
            uuidv7(),
            setup.preparer.id,
          ],
        ),
      ).rejects.toThrow(/enters a Locked period only as a correction/);
    } finally {
      await client.end();
    }
  });
});
