import { Writable } from 'node:stream';
import { uuidv7 } from '@apparel-os/domain';
import { sql } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CommandDefect,
  CommandRunner,
  IdempotencyHelper,
  LOCK_STEP,
  newCorrelationId,
  OrganisationRouter,
  PinoLoggerService,
  timezoneNotConfigured,
  type CommandRequest,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import {
  Numbering,
  type Allocated,
  type FormatPart,
  type NumberedKind,
  type NumberingResult,
  type SeriesDefinition,
  type SeriesState,
} from '../src/modules/numbering/index.js';
import { syntheticCode, syntheticIdentifier } from './fixtures/synthetic.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl, sqlState } from './support/postgres.js';
import { backendPid, gate, waitUntilAnyWaitingForLock } from './support/transactions.js';

// S1-F08-T01: gapless number series (numbering-and-audit 2, 3.1 to 3.3, 3.5, 3.7, 7 tests 1 to 5; module-map 4.6;
// stock-ledger 10.3 step 8; code-house-rules 8.2, 10.3, 11.4). No stage 1 document is numbered yet, so a test-only
// document kind drives the tests: its documents live in `test_numbering.document`, made by this file as the migration
// role in its own database copies (code-house-rules 11.4, as built). Every command runs as the runtime role through
// Organisation routing, as the application does (10.1). Every kind, format, financial year and scope here is
// SYNTHETIC: the financial year's dates are OPEN (GC5-1) and no format has a default (3.5; V-40, GC5-2).

const ACTOR = '01900000-0000-7000-8000-0000000fb001';
/** A synthetic pool size for these tests; the real one is each environment's AOS_DATABASE_POOL_MAX. */
const SYNTHETIC_POOL_MAX = 8;
const MODULE = syntheticIdentifier('numbering');
/** A yearly kind like a device bill: scope key device and registration, display scope registration and year. */
const BILL = `${MODULE}.bill`;
/** A kind that never restarts, like an import batch. */
const BATCH = `${MODULE}.batch`;
const DOCUMENT_TYPE = `${MODULE}.document`;
const YEAR = 'SYN-FY-1';
const NEXT_YEAR = 'SYN-FY-2';

const KINDS: readonly NumberedKind[] = [
  {
    kind: BILL,
    yearly: true,
    scopeKeyStandsFor: 'SYNTHETIC billing device and tax registration',
    displayScope: { standsFor: 'SYNTHETIC tax registration', perYear: true },
  },
  {
    kind: BATCH,
    yearly: false,
    scopeKeyStandsFor: 'SYNTHETIC Organisation',
    displayScope: { standsFor: 'SYNTHETIC Organisation', perYear: false },
  },
];

/** A synthetic bill format: carries the device, so two devices of one registration and year never meet (3.5). */
const BILL_FORMAT: FormatPart[] = [
  { kind: 'text', text: 'SYN/' },
  { kind: 'scope' },
  { kind: 'text', text: '/' },
  { kind: 'year' },
  { kind: 'text', text: '/' },
  { kind: 'sequence', width: 5 },
];
/** A synthetic format without the device: two device series of one registration and year could repeat its text. */
const NO_DEVICE_FORMAT: FormatPart[] = [
  { kind: 'text', text: 'SYN-' },
  { kind: 'year' },
  { kind: 'text', text: '-' },
  { kind: 'sequence', width: 5 },
];
const BATCH_FORMAT: FormatPart[] = [
  { kind: 'text', text: 'SYN-B' },
  { kind: 'sequence', width: 4 },
];

const TEST_SCHEMA = `
  create schema test_numbering;
  grant usage on schema test_numbering to aos_runtime;
  create table test_numbering.document (id uuid primary key, number text not null);
  grant select, insert on test_numbering.document to aos_runtime;
`;

let world: SyntheticWorld;
let router: OrganisationRouter;
let routedA: RoutedOrganisation;
let routedB: RoutedOrganisation;
let runner: CommandRunner;
const numbering = new Numbering({ kinds: KINDS });
let counter = 0;

const next = (prefix: string) => `${prefix}${String(++counter)}`;

beforeAll(async () => {
  world = await createSyntheticOrganisations('numbering');
  for (const organisation of world.organisations) {
    const owner = await connect(organisation.database, 'migration');
    try {
      await owner.query(TEST_SCHEMA);
    } finally {
      await owner.end();
    }
  }
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: SYNTHETIC_POOL_MAX },
    logger(),
  );
  routedA = await routed(world.organisations[0].code);
  routedB = await routed(world.organisations[1].code);
  runner = new CommandRunner({ clock: { now: () => new Date() }, timezones: timezoneNotConfigured, logger: logger() });
  await run((c) => numbering.defineFormatVersion(c, BILL_CODE, BILL_FORMAT));
  await run((c) => numbering.defineFormatVersion(c, NO_DEVICE_CODE, NO_DEVICE_FORMAT));
  await run((c) => numbering.defineFormatVersion(c, BATCH_CODE, BATCH_FORMAT));
});

afterAll(async () => {
  await (router as OrganisationRouter | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

const BILL_CODE = syntheticCode('BILL');
const NO_DEVICE_CODE = syntheticCode('NO-DEVICE');
const BATCH_CODE = syntheticCode('BATCH');

function logger(): PinoLoggerService {
  return new PinoLoggerService(
    pino(
      new Writable({
        write: (_chunk, _encoding, done) => {
          done();
        },
      }),
    ),
  );
}

async function routed(code: string): Promise<RoutedOrganisation> {
  const result = await router.resolveForSignIn(code);
  if (!result.routed) throw new Error(`${code} was not routed`);
  return result.organisation;
}

function request(organisation: RoutedOrganisation = routedA): CommandRequest {
  return {
    commandName: 'test-syn-numbering.number-document',
    organisation,
    correlationId: newCorrelationId(),
    actor: { kind: 'actor', actorId: ACTOR },
  };
}

function run<T>(work: (context: TransactionContext) => Promise<T>, organisation = routedA): Promise<T> {
  return runner.run(request(organisation), work);
}

function done<V>(result: NumberingResult<V>): V {
  if (result.kind !== 'done') throw new Error(`Expected done, got ${result.refusal.code}`);
  return result.value;
}

function refusedWith<V>(result: NumberingResult<V>): string | undefined {
  return result.kind === 'refused' ? result.refusal.code : undefined;
}

/** A device bill series of a fresh synthetic device in one registration, or the definition's refusal. */
function billSeries(overrides: Partial<SeriesDefinition> = {}): SeriesDefinition {
  const device = next('D');
  return {
    kind: BILL,
    scopeKey: `${device}:REG-1`,
    financialYear: YEAR,
    displayScopeKey: 'REG-1',
    scopeText: device,
    formatCode: BILL_CODE,
    ...overrides,
  };
}

const define = (definition: SeriesDefinition, organisation = routedA) =>
  run((c) => numbering.defineSeries(c, definition), organisation);

/**
 * The test-only document command: finds the live series, locks it last at step 8 (stock-ledger 10.3), and only then
 * writes the document with the number Allocate gives (numbering-and-audit 3.2). `hold` runs after the lock.
 */
function numberDocument(
  find: { kind: string; scopeKey: string; financialYear?: string },
  options: {
    hold?: (context: TransactionContext) => Promise<void>;
    fail?: boolean;
    documentId?: string;
    organisation?: RoutedOrganisation;
  } = {},
): Promise<NumberingResult<Allocated>> {
  return run(async (context) => {
    const live = await numbering.liveSeries(context, find);
    if (live === undefined)
      return { kind: 'refused', refusal: { kind: 'refused', code: 'test.no-series', missing: [] } };
    await context.lock(LOCK_STEP.numberSeries, [numbering.seriesLockTarget(live.seriesId)]);
    await options.hold?.(context);
    const documentId = options.documentId ?? uuidv7();
    const result = await numbering.allocate(context, {
      seriesId: live.seriesId,
      documentType: DOCUMENT_TYPE,
      documentId,
    });
    if (result.kind === 'done') {
      await context.tx.execute(
        sql`insert into test_numbering.document (id, number) values (${documentId}, ${result.value.formattedText}) on conflict do nothing`,
      );
    }
    if (options.fail === true) throw new Error('SYNTHETIC failure after the number was given');
    return result;
  }, options.organisation);
}

/** A definition without one of its optional parts. */
function without(definition: SeriesDefinition, part: 'financialYear' | 'scopeText'): SeriesDefinition {
  return Object.fromEntries(Object.entries(definition).filter(([key]) => key !== part)) as unknown as SeriesDefinition;
}

const findOf = (definition: SeriesDefinition) => ({
  kind: definition.kind,
  scopeKey: definition.scopeKey,
  ...(definition.financialYear === undefined ? {} : { financialYear: definition.financialYear }),
});

/** Changes a series' state in a command that locks it at step 8 first. */
function change(seriesId: string, how: 'pause' | 'release' | 'close'): Promise<NumberingResult<SeriesState>> {
  return run(async (context) => {
    await context.lock(LOCK_STEP.numberSeries, [numbering.seriesLockTarget(seriesId)]);
    return numbering[how](context, seriesId);
  });
}

async function documents(): Promise<string[]> {
  const client = await connect(world.organisations[0].database, 'migration');
  try {
    return (await client.query<{ number: string }>('select number from test_numbering.document')).rows.map(
      (row) => row.number,
    );
  } finally {
    await client.end();
  }
}

describe('Allocate in the document transaction (numbering-and-audit 3.2, 7 test 1)', () => {
  it('PRD-INT-004 numbering-and-audit 7 test 1 a number commits with its document; a rollback leaves no allocation and no gap', async () => {
    const definition = billSeries();
    const defined = done(await define(definition));
    expect(defined).toMatchObject({ state: 'Open', financialYear: YEAR, nextSequence: 1 });
    const first = done(await numberDocument(findOf(definition)));
    expect(first).toMatchObject({
      sequenceNumber: 1,
      formattedText: `SYN/${definition.scopeText ?? ''}/${YEAR}/00001`,
    });
    await expect(numberDocument(findOf(definition), { fail: true })).rejects.toThrow('SYNTHETIC failure');
    const third = done(await numberDocument(findOf(definition)));
    expect(third.sequenceNumber).toBe(2);
    const state = await run((c) => numbering.seriesState(c, defined.seriesId));
    expect(state).toMatchObject({ financialYear: YEAR, nextSequence: 3, state: 'Open' });
    expect(await documents()).toEqual(expect.arrayContaining([first.formattedText, third.formattedText]));
  });

  it('PRD-INT-004 Allocate refuses a series the transaction has not locked, or locked shared or at another step', async () => {
    const definition = billSeries();
    const { seriesId } = done(await define(definition));
    const allocate = (context: TransactionContext) =>
      numbering.allocate(context, { seriesId, documentType: DOCUMENT_TYPE, documentId: uuidv7() });
    await expect(run(allocate)).rejects.toThrow(CommandDefect);
    await expect(
      run(async (context) => {
        await context.lock(LOCK_STEP.numberSeries, [{ ...numbering.seriesLockTarget(seriesId), mode: 'shared' }]);
        return allocate(context);
      }),
    ).rejects.toThrow(CommandDefect);
    await expect(
      run(async (context) => {
        await context.lock(LOCK_STEP.document, [numbering.seriesLockTarget(seriesId)]);
        return allocate(context);
      }),
    ).rejects.toThrow(CommandDefect);
  });

  it('a yearly and a non-yearly kind both allocate', async () => {
    const batch = { kind: BATCH, scopeKey: next('ORG'), displayScopeKey: next('ORG'), formatCode: BATCH_CODE };
    done(await define(batch));
    expect(done(await numberDocument(findOf(batch))).formattedText).toBe('SYN-B0001');
    expect(done(await numberDocument(findOf(batch))).formattedText).toBe('SYN-B0002');
    const bill = billSeries();
    done(await define(bill));
    expect(done(await numberDocument(findOf(bill))).formattedText).toBe(`SYN/${bill.scopeText ?? ''}/${YEAR}/00001`);
    // The next year is its own series: the owning module supplies the year its document's business date falls in (3.3).
    const nextYear = { ...bill, financialYear: NEXT_YEAR };
    done(await define(nextYear));
    expect(done(await numberDocument(findOf(nextYear))).formattedText).toBe(
      `SYN/${bill.scopeText ?? ''}/${NEXT_YEAR}/00001`,
    );
  });

  it('refuses a year for a kind that never restarts, and no year for a yearly one', async () => {
    const noYear = without(billSeries(), 'financialYear');
    expect(refusedWith(await define(noYear))).toBe('numbering.financial-year-mismatch');
    const batch = { kind: BATCH, scopeKey: next('ORG'), displayScopeKey: 'ORG', formatCode: BATCH_CODE };
    expect(refusedWith(await define({ ...batch, financialYear: YEAR }))).toBe('numbering.financial-year-mismatch');
    expect(refusedWith(await define({ ...batch, kind: `${MODULE}.undeclared` }))).toBe('numbering.kind-not-declared');
    expect(refusedWith(await define({ ...batch, formatCode: syntheticCode('MISSING') }))).toBe(
      'numbering.format-not-found',
    );
  });

  it('PRD-INT-002 a replayed command gets its first number', async () => {
    const definition = billSeries();
    done(await define(definition));
    const helper = new IdempotencyHelper({
      runner,
      logger: logger(),
      secretCheck: { compare: () => Promise.resolve('not-comparable') },
      cipher: { encrypt: () => Promise.resolve({ scheme: 'syn-test-1', ciphertext: 'SYNTHETIC' }) },
    });
    const key = newCorrelationId();
    const command = {
      key,
      content: { pathParameters: {}, body: { note: 'SYNTHETIC' }, secretFields: [], restrictedFields: [] },
      authoriseReplay: () => Promise.resolve({ kind: 'allowed' as const }),
      work: async (context: TransactionContext) => {
        const live = await numbering.liveSeries(context, findOf(definition));
        if (live === undefined) throw new Error('no series');
        await context.lock(LOCK_STEP.numberSeries, [numbering.seriesLockTarget(live.seriesId)]);
        const result = done(
          await numbering.allocate(context, {
            seriesId: live.seriesId,
            documentType: DOCUMENT_TYPE,
            documentId: uuidv7(),
          }),
        );
        return { kind: 'success' as const, answer: { number: result.formattedText }, shows: 'nothing' as const };
      },
    };
    const first = await helper.run(request(), command);
    const second = await helper.run(request(), command);
    expect(first).toEqual({
      kind: 'success',
      answer: { number: `SYN/${definition.scopeText ?? ''}/${YEAR}/00001` },
      replayed: false,
    });
    expect(second).toEqual({ ...first, replayed: true });
    // Allocate asked again for a document that has its number gives the same number, never a second one.
    const documentId = uuidv7();
    const once = done(await numberDocument(findOf(definition), { documentId }));
    const again = done(await numberDocument(findOf(definition), { documentId }));
    expect(again).toEqual(once);
    expect((await run((c) => numbering.liveSeries(c, findOf(definition))))?.nextSequence).toBe(3);
  });
});

describe('concurrent allocations (numbering-and-audit 3.2, 7 test 2; code-house-rules 10.3)', () => {
  it('PRD-INT-003 PRD-POS-020 numbering-and-audit 7 test 2 two allocations on one series get distinct, consecutive numbers', async () => {
    const definition = billSeries();
    done(await define(definition));
    const held = gate();
    const release = gate();
    let firstPid = 0;
    const first = numberDocument(findOf(definition), {
      hold: async (context) => {
        firstPid = await backendPid(context);
        held.open();
        await release.wait;
      },
    });
    await held.wait;
    const second = numberDocument(findOf(definition));
    await waitUntilAnyWaitingForLock(world.organisations[0].database, [firstPid]);
    release.open();
    const numbers = [done(await first).sequenceNumber, done(await second).sequenceNumber];
    expect(numbers).toEqual([1, 2]);
  });

  it('PRD-POS-020 numbering-and-audit 7 test 2 two device series of one kind never wait for each other', async () => {
    const one = billSeries();
    const two = billSeries();
    done(await define(one));
    done(await define(two));
    const held = gate();
    const release = gate();
    const first = numberDocument(findOf(one), {
      hold: async () => {
        held.open();
        await release.wait;
      },
    });
    await held.wait;
    // The other device's bill commits while the first still holds its own series.
    expect(done(await numberDocument(findOf(two))).sequenceNumber).toBe(1);
    release.open();
    expect(done(await first).sequenceNumber).toBe(1);
  });
});

describe('one live series per kind, scope and year (numbering-and-audit 3.1, 3.7, 7 tests 3 and 4)', () => {
  it('PRD-POS-020 PRD-OFF-002 numbering-and-audit 7 test 3 a second open or paused series for the same kind, scope and year is refused', async () => {
    const definition = billSeries();
    const { seriesId } = done(await define(definition));
    expect(refusedWith(await define(definition))).toBe('numbering.live-series-exists');
    done(await change(seriesId, 'pause'));
    expect(refusedWith(await define(definition))).toBe('numbering.live-series-exists');
    // A paused series gives no number; released, it goes on where it stopped.
    expect(refusedWith(await numberDocument(findOf(definition)))).toBe('numbering.series-paused');
    done(await change(seriesId, 'release'));
    expect(done(await numberDocument(findOf(definition))).sequenceNumber).toBe(1);
  });

  it('PRD-POS-020 two definitions at once of the same series: one is refused', async () => {
    const definition = billSeries();
    const answers = await Promise.all([define(definition), define(definition)]);
    expect(answers.map((answer) => answer.kind).sort()).toEqual(['done', 'refused']);
    expect(answers.map(refusedWith)).toContain('numbering.live-series-exists');
  });

  it('PRD-OFF-010 PRD-LIF-015 numbering-and-audit 7 test 4 a closed series refuses allocation and never reopens', async () => {
    const definition = billSeries();
    const { seriesId } = done(await define(definition));
    done(await numberDocument(findOf(definition)));
    expect(done(await change(seriesId, 'close'))).toMatchObject({ state: 'Closed', nextSequence: 2 });
    expect(refusedWith(await change(seriesId, 'release'))).toBe('numbering.series-closed');
    expect(refusedWith(await change(seriesId, 'pause'))).toBe('numbering.series-closed');
    expect(refusedWith(await change(seriesId, 'close'))).toBe('numbering.series-closed');
    const allocate = await run(async (context) => {
      await context.lock(LOCK_STEP.numberSeries, [numbering.seriesLockTarget(seriesId)]);
      return numbering.allocate(context, { seriesId, documentType: DOCUMENT_TYPE, documentId: uuidv7() });
    });
    expect(refusedWith(allocate)).toBe('numbering.series-closed');
    expect(await run((c) => numbering.liveSeries(c, findOf(definition)))).toBeUndefined();
  });

  it('PRD-OFF-010 PRD-LIF-015 numbering-and-audit 7 test 4 a replaced device and a switched Store start fresh series', async () => {
    const old = billSeries();
    const { seriesId } = done(await define(old));
    done(await numberDocument(findOf(old)));
    done(await change(seriesId, 'close'));
    // The replacement device has its own scope key; its series starts at 1 and never continues the old one.
    const replacement = billSeries();
    done(await define(replacement));
    expect(done(await numberDocument(findOf(replacement))).sequenceNumber).toBe(1);
    // A fresh series for the same scope after a close is a new series. Its texts must never meet the closed one's,
    // so the same scope text is refused and a new one taken (3.5; PRD-ACP-019).
    expect(refusedWith(await define(old))).toBe('numbering.format-could-repeat');
    const fresh = done(await define({ ...old, scopeText: next('S') }));
    expect(fresh).toMatchObject({ state: 'Open', nextSequence: 1 });
    expect(fresh.seriesId).not.toBe(seriesId);
  });
});

describe('formats (numbering-and-audit 3.5, 7 test 5)', () => {
  it('PRD-MOD-008 numbering-and-audit 7 test 5 a format that could repeat text across two series in one registration and year is refused', async () => {
    const registration = next('REG');
    const first = billSeries({ formatCode: NO_DEVICE_CODE, displayScopeKey: registration });
    done(await define(first));
    expect(refusedWith(await define(billSeries({ formatCode: NO_DEVICE_CODE, displayScopeKey: registration })))).toBe(
      'numbering.format-could-repeat',
    );
    // Another registration is another display scope; and the next year is another one for a per-year scope.
    done(await define(billSeries({ formatCode: NO_DEVICE_CODE, displayScopeKey: next('REG') })));
    done(
      await define(billSeries({ formatCode: NO_DEVICE_CODE, displayScopeKey: registration, financialYear: NEXT_YEAR })),
    );
    // A format carrying the device is accepted in the same registration and year.
    done(await define(billSeries({ displayScopeKey: registration })));
  });

  it('PRD-MOD-008 the database keeps formatted text unique in its display scope', async () => {
    const registration = next('REG');
    const one = billSeries({ displayScopeKey: registration });
    const two = billSeries({ displayScopeKey: registration });
    const first = done(await define(one));
    const second = done(await define(two));
    const given = done(await numberDocument(findOf(one)));
    const client = await connect(world.organisations[0].database, 'runtime');
    try {
      expect(
        await sqlState(
          client.query(
            `insert into numbering.allocation (id, series_id, kind, display_scope_key, display_year, sequence_number,
               formatted_text, document_type, document_id, occurred_at)
             values ($1, $2, $3, $4, $5, 1, $6, $7, $8, now())`,
            [uuidv7(), second.seriesId, BILL, registration, YEAR, given.formattedText, DOCUMENT_TYPE, uuidv7()],
          ),
        ),
      ).toBe('23505');
    } finally {
      await client.end();
    }
    expect(first.seriesId).not.toBe(second.seriesId);
  });

  it('a series keeps its format for life; a new format version applies only to series defined after it', async () => {
    const code = syntheticCode(next('FMT'));
    done(await run((c) => numbering.defineFormatVersion(c, code, BATCH_FORMAT)));
    const before = { kind: BATCH, scopeKey: next('ORG'), displayScopeKey: next('ORG'), formatCode: code };
    done(await define(before));
    const version = done(
      await run((c) =>
        numbering.defineFormatVersion(c, code, [
          { kind: 'text', text: 'SYN-N' },
          { kind: 'sequence', width: 3 },
        ]),
      ),
    );
    expect(version.version).toBe(2);
    const after = { ...before, scopeKey: next('ORG'), displayScopeKey: next('ORG') };
    done(await define(after));
    expect(done(await numberDocument(findOf(before))).formattedText).toBe('SYN-B0001');
    expect(done(await numberDocument(findOf(after))).formattedText).toBe('SYN-N001');
  });

  it('refuses a format without exactly one sequence part, and a year label for a kind with no year', async () => {
    expect(
      refusedWith(await run((c) => numbering.defineFormatVersion(c, syntheticCode(next('FMT')), [{ kind: 'scope' }]))),
    ).toBe('numbering.format-invalid');
    expect(
      refusedWith(await define({ kind: BATCH, scopeKey: next('ORG'), displayScopeKey: 'ORG', formatCode: BILL_CODE })),
    ).toBe('numbering.format-not-for-kind');
    // The bill format takes the device from the series' scope text.
    const noText = without(billSeries(), 'scopeText');
    expect(refusedWith(await define(noText))).toBe('numbering.scope-text-missing');
  });

  it('refuses a number that no longer fits the width', async () => {
    const code = syntheticCode(next('FMT'));
    done(
      await run((c) =>
        numbering.defineFormatVersion(c, code, [
          { kind: 'text', text: 'SYN-W' },
          { kind: 'sequence', width: 1 },
        ]),
      ),
    );
    const narrow = { kind: BATCH, scopeKey: next('ORG'), displayScopeKey: next('ORG'), formatCode: code };
    done(await define(narrow));
    for (let i = 1; i <= 9; i += 1) done(await numberDocument(findOf(narrow)));
    expect(refusedWith(await numberDocument(findOf(narrow)))).toBe('numbering.series-exhausted');
  });
});

describe('Organisations apart (PRD-MOD-001, PRD-ACS-020)', () => {
  it('PRD-ACS-020 a second synthetic Organisation sees none of these series', async () => {
    const definition = billSeries();
    const { seriesId } = done(await define(definition));
    expect(await run((c) => numbering.liveSeries(c, findOf(definition)), routedB)).toBeUndefined();
    expect(await run((c) => numbering.seriesState(c, seriesId), routedB)).toBeUndefined();
    // Organisation B has no such format either, until it defines its own.
    expect(refusedWith(await define(definition, routedB))).toBe('numbering.format-not-found');
  });
});
