import { randomInt } from 'node:crypto';
import { paise, uuidv7 } from '@apparel-os/domain';
import { exceptionViewSchema, myWorkSchema, routingListSchema } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CommandRunner,
  CommandTimedOut,
  defineConsumer,
  defineEvent,
  IdempotencyHelper,
  jobFailed,
  LOCK_STEP,
  newCorrelationId,
  OrganisationRouter,
  OUTBOX_AUTHORITY,
  OUTBOX_PROCESSOR_IDENTITY,
  restrictedValueCipherNotConfigured,
  secretCheckNotImplemented,
  Worker,
  type ConsumerDefinition,
  type JobRegistry,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
// The access module's JobIdentities, as AccessJobIdentitiesModule provides it to the worker (RR-273).
import { jobIdentities } from '../src/modules/access/commands/job-identities.js';
import { Audit } from '../src/modules/audit/index.js';
import {
  EXCEPTION_CODE_KIND,
  EXCEPTION_CODE_SCOPE_KEY,
  Exceptions,
  EXCEPTIONS_IDENTITY,
  exceptionsConsumers,
  unfinishedOperation,
  type RaiseInput,
} from '../src/modules/exceptions/index.js';
import { Inbox } from '../src/modules/inbox/index.js';
import { Numbering } from '../src/modules/numbering/index.js';
import { syntheticCode } from './fixtures/synthetic.js';
import { SYNTHETIC_RETRY, SYNTHETIC_TEST_SPEED } from './fixtures/worker-settings.js';
import {
  codeFor,
  startAccessApp,
  SYNTHETIC_ORIGIN,
  SyntheticClock,
  syntheticKeysEnvironment,
  syntheticTimezone,
  writeSyntheticReason,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import {
  createTestExceptionsSchema,
  defineSyntheticCodeSeries,
  syntheticMismatch,
  TEST_DOCUMENT_TYPE,
  TEST_EXCEPTIONS_MODULE,
  writeTestDocument,
} from './support/exceptions.js';
import { grantSynthetic } from './support/grants.js';
import { capturingLogger, eventually, writeSyntheticServiceIdentity } from './support/jobs.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';

// S1-F08-T02: exceptions in My work (access-and-approvals 11, 12, 15 test 21; module-map 4.13; code-house-rules 12.9;
// PRD-EXC-001 to PRD-EXC-004, PRD-INT-008, PRD-ACS-010, POL-02.16, POL-03.05, DEC-116). A test-only module in the
// `test_exceptions` schema registers a SYNTHETIC type with its resolution check (code-house-rules 11.4). Its interface
// is driven directly for the raise inside and after a rolled-back transaction; everything a person does goes through
// the HTTP API. Every format, routing, due time, escalation and worker setting here is SYNTHETIC (V-03, CH-10).

const SYNTHETIC_THROTTLING = { failureLimit: 50, windowSeconds: 600 };
const SYNTHETIC_PASSWORD_RULES = { minimumLength: 12 };
const SYNTHETIC_LIMITS = { idleLockSeconds: 3600, absoluteSeconds: 7200 };
/** SYNTHETIC due-time rule: due half an hour after the exception is raised. */
const SYNTHETIC_DUE = { format: 'elapsed-minutes-v1', minutes: 30 } as const;
const SITE = '01900000-0000-7000-8000-0000000e5001';
const ROLE_SITE = '01900000-0000-7000-8000-0000000e5002';
const ACTOR = '01900000-0000-7000-8000-0000000e5a01';
const JOB_SITE = '01900000-0000-7000-8000-0000000e5003';

type Enrolled = SyntheticUser & { factorSecret: Buffer };

let world: SyntheticWorld;
let databaseA: string;
let databaseB: string;
let keys: Record<string, string>;
let api: AccessTestApp;
let clock: SyntheticClock;
let router: OrganisationRouter;
let routedA: RoutedOrganisation;
let routedB: RoutedOrganisation;
let runner: CommandRunner;
const log = capturingLogger();
const numbering = new Numbering({ kinds: [EXCEPTION_CODE_KIND] });
const exceptions = new Exceptions({
  numbering,
  inbox: new Inbox(),
  audit: new Audit(log.logger),
  types: [syntheticMismatch],
});
let admin: Enrolled;
let approver: Enrolled;
let approveReasonId: string;
let owner: Enrolled;
let escalation: Enrolled;
let outsider: Enrolled;
let holder: Enrolled;
let holderRoleId: string;
let reader: Enrolled;
let readerB: Enrolled;
const cookies = new Map<string, string>();

beforeAll(async () => {
  world = await createSyntheticOrganisations('exceptions');
  [databaseA, databaseB] = world.organisations.map((organisation) => organisation.database) as [string, string];
  keys = syntheticKeysEnvironment(world);
  for (const database of [databaseA, databaseB]) {
    await createTestExceptionsSchema(database);
    await writeSyntheticSetting(database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
    await writeSyntheticSetting(database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
    await writeSyntheticSetting(database, 'access.office-session-limits', SYNTHETIC_LIMITS);
  }
  const enrolled = async (label: string, database = databaseA, code = world.organisations[0].code) =>
    (await writeSyntheticUser(database, code, keys, { label, enrolled: true })) as Enrolled;
  admin = await enrolled('ADMIN');
  approver = await enrolled('APPROVER');
  owner = await enrolled('OWNER');
  escalation = await enrolled('ESCALATION');
  outsider = await enrolled('OUTSIDER');
  holder = await enrolled('HOLDER');
  reader = await enrolled('READER');
  readerB = await enrolled('READER-B', databaseB, world.organisations[1].code);
  await grantSynthetic(databaseA, { kind: 'user', id: admin.id }, [
    { recordType: 'exceptions.exception_routing', action: 'view' },
    { recordType: 'exceptions.exception_routing', action: 'edit' },
  ]);
  await grantSynthetic(databaseA, { kind: 'user', id: approver.id }, [
    { recordType: 'exceptions.exception_routing', action: 'view' },
    { recordType: 'exceptions.exception_routing', action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
  ]);
  approveReasonId = await writeSyntheticReason(databaseA, 'approve');
  await grantSynthetic(databaseA, { kind: 'user', id: reader.id }, [
    { recordType: 'exceptions.exception', action: 'view' },
  ]);
  await grantSynthetic(databaseB, { kind: 'user', id: readerB.id }, [
    { recordType: 'exceptions.exception', action: 'view' },
  ]);
  // A role within one Site's scope: its holder sees the exceptions routed to it there (12.2).
  holderRoleId = (
    await grantSynthetic(
      databaseA,
      { kind: 'user', id: holder.id },
      [{ recordType: 'exceptions.exception', action: 'view' }],
      {
        scope: {
          kind: 'dimensions',
          legalEntity: { kind: 'all' },
          place: { kind: 'selected', members: [{ type: 'site', id: ROLE_SITE }] },
          brand: { kind: 'all' },
        },
      },
    )
  ).roleId;
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, { clock, exceptionTypes: [syntheticMismatch] });
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    log.logger,
  );
  routedA = await routed(world.organisations[0].code);
  routedB = await routed(world.organisations[1].code);
  runner = new CommandRunner({ clock: { now: () => new Date() }, timezones: syntheticTimezone, logger: log.logger });
});

afterAll(async () => {
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

async function routed(code: string): Promise<RoutedOrganisation> {
  const found = await router.resolveForSignIn(code);
  if (!found.routed) throw new Error(`${code} was not routed`);
  return found.organisation;
}

function run<T>(work: (context: TransactionContext) => Promise<T>, organisation = routedA, at?: Date): Promise<T> {
  const command =
    at === undefined
      ? runner
      : new CommandRunner({ clock: { now: () => at }, timezones: syntheticTimezone, logger: log.logger });
  return command.run(
    {
      commandName: 'test-syn-exceptions.raise',
      organisation,
      correlationId: newCorrelationId(),
      actor: { kind: 'actor', actorId: ACTOR },
    },
    work,
  );
}

interface Call {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;
}

function freshAddress(): string {
  return `10.${String(randomInt(256))}.${String(randomInt(256))}.${String(randomInt(1, 255))}`;
}

async function post(path: string, body: unknown, options: { cookie?: string; key?: string | null } = {}) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': freshAddress(),
    origin: SYNTHETIC_ORIGIN,
  };
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  if (options.key !== null) headers['idempotency-key'] = options.key ?? uuidv7();
  const response = await fetch(`${api.baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json(), headers: response.headers } as Call;
}

async function get(path: string, cookie: string): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, { headers: { cookie } });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

async function cookieOf(user: Enrolled, organisationCode = world.organisations[0].code): Promise<string> {
  const known = cookies.get(user.id);
  if (known !== undefined) return known;
  clock.advance(30);
  const call = await post(
    '/api/access/sign-in',
    {
      organisationCode,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret, 0, clock.now()),
    },
    { key: null },
  );
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  const cookie = (call.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  cookies.set(user.id, cookie);
  return cookie;
}

async function myWork(user: Enrolled) {
  const call = await get('/api/inbox/my-work', await cookieOf(user));
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return myWorkSchema.parse(call.body).items;
}

async function rows<T extends object>(database: string, text: string, values: unknown[] = []): Promise<T[]> {
  const client = await connect(database, 'migration');
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

const today = () => clock.now().toISOString().slice(0, 10);

function mismatchOn(documentId: string, overrides: Partial<RaiseInput> = {}): RaiseInput {
  return {
    raisingEvent: `${TEST_EXCEPTIONS_MODULE}.document-checked:${documentId}`,
    typeCode: syntheticMismatch.code,
    facts: { siteId: SITE, storeId: null, businessUnitId: null, brandId: null },
    links: [{ module: TEST_EXCEPTIONS_MODULE, recordType: TEST_DOCUMENT_TYPE, recordId: documentId, versionId: null }],
    exposure: { kind: 'known', amount: paise(125_000) },
    raisedBy: { kind: 'user', id: ACTOR },
    ...overrides,
  };
}

async function routeTo(body: Record<string, unknown>) {
  return post(
    '/api/exceptions/routing',
    { typeCode: syntheticMismatch.code, dueRule: SYNTHETIC_DUE, validFrom: today(), origin: 'synthetic', ...body },
    { cookie: await cookieOf(admin) },
  );
}

/** Decides a routing version's request as a user (access-and-approvals 9.5), with a fresh code. */
async function decide(user: Enrolled, prepared: Call) {
  const { versionId, requestId } = prepared.body as { versionId: string; requestId: string };
  const cookie = await cookieOf(user);
  clock.advance(30);
  return post(
    `/api/access/approval-requests/${requestId}/decision`,
    {
      versionId,
      outcome: 'approve',
      reason: { kind: 'listed', reasonId: approveReasonId },
      totpCode: codeFor(user.factorSecret, 0, clock.now()),
    },
    { cookie },
  );
}

/** Routing prepared by the Admin and approved by the approver, a different person (12.4 "As built"; POL-02.11). */
async function approvedRouting(body: Record<string, unknown>) {
  const prepared = await routeTo(body);
  expect(prepared.status, JSON.stringify(prepared.body)).toBe(200);
  const decided = await decide(approver, prepared);
  expect(decided.status, JSON.stringify(decided.body)).toBe(200);
  return prepared;
}

describe('an exception needs its series and its routing (access-and-approvals 12.1, 12.2; DEC-116, POL-02.16)', () => {
  it('DEC-116 with no Open exception-code series, the answer names the series and raising is unavailable', async () => {
    const refusal = await run((context) => exceptions.available(context, syntheticMismatch.code, SITE));
    expect(refusal).toEqual({
      kind: 'unavailable',
      code: 'exceptions.no-exception-code-series',
      missing: [{ kind: 'number-series', numberedKind: 'exceptions.exception-code' }],
    });
    const raised = await run((context) => exceptions.raiseInOwnCommand(context, mismatchOn(uuidv7())));
    expect(raised).toMatchObject({ kind: 'refused', refusal: { code: 'exceptions.no-exception-code-series' } });
    expect(await rows(databaseA, 'select id from exceptions.exception')).toEqual([]);
  });

  it('POL-02.16 with no routing in force, the answer names the type and the Site', async () => {
    await run((context) => defineSyntheticCodeSeries(context, numbering));
    const refusal = await run((context) => exceptions.available(context, syntheticMismatch.code, SITE));
    expect(refusal).toEqual({
      kind: 'unavailable',
      code: 'exceptions.no-routing',
      missing: [{ kind: 'exception-routing', exceptionType: syntheticMismatch.code, siteId: SITE }],
    });
    const raised = await run((context) => exceptions.raiseInOwnCommand(context, mismatchOn(uuidv7())));
    expect(raised).toMatchObject({ kind: 'refused', refusal: { code: 'exceptions.no-routing' } });
  });

  it('POL-02.16 PRD-MOD-010 routing is set per type and Site as a dated version, never in the past', async () => {
    const past = await routeTo({
      siteId: SITE,
      owner: { kind: 'user', userId: owner.id },
      escalation: { kind: 'user', userId: escalation.id },
      validFrom: '2000-01-01',
    });
    expect((past.body as { error: { code: string } }).error.code).toBe('exceptions.starts-in-past');
    const unknownParty = await routeTo({
      siteId: SITE,
      owner: { kind: 'user', userId: uuidv7() },
      escalation: { kind: 'user', userId: escalation.id },
    });
    expect((unknownParty.body as { error: { code: string } }).error.code).toBe('exceptions.party-not-found');
    const set = await routeTo({
      siteId: SITE,
      owner: { kind: 'user', userId: owner.id },
      escalation: { kind: 'user', userId: escalation.id },
    });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    // Until a different authorised person approves it, it is not in force, and its preparer may not approve it.
    const waiting = routingListSchema.parse((await get('/api/exceptions/routing', await cookieOf(admin))).body);
    expect(waiting.routings[0]?.versions[0]?.state).toBe('Awaiting approval');
    expect(await run((context) => exceptions.available(context, syntheticMismatch.code, SITE))).toMatchObject({
      code: 'exceptions.no-routing',
    });
    const own = await decide(admin, set);
    expect((own.body as { error: { code: string } }).error.code).toMatch(/^access\.(not-eligible|self-preparation)$/);
    const decided = await decide(approver, set);
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    const listed = routingListSchema.parse((await get('/api/exceptions/routing', await cookieOf(admin))).body);
    expect(listed.types.map((type) => type.code)).toEqual([unfinishedOperation.code, syntheticMismatch.code]);
    expect(listed.routings).toMatchObject([
      {
        typeCode: syntheticMismatch.code,
        siteId: SITE,
        versions: [
          {
            owner: { party: { kind: 'user', userId: owner.id }, name: owner.displayName },
            dueRule: SYNTHETIC_DUE,
            escalation: { party: { kind: 'user', userId: escalation.id } },
            validFrom: today(),
            validUntil: null,
            origin: 'synthetic',
            state: 'In force',
          },
        ],
      },
    ]);
    const refused = await get('/api/exceptions/routing', await cookieOf(outsider));
    expect(refused.status).toBe(403);
    expect(await run((context) => exceptions.available(context, syntheticMismatch.code, SITE))).toBeUndefined();
  });
});

describe('raising and closing (access-and-approvals 12.1, 12.3; test 21)', () => {
  let documentId = '';
  let exceptionId = '';
  let code = '';

  it('PRD-EXC-002 test 21 an exception raised after a rollback survives; a replay makes no second one', async () => {
    // The transaction that found the problem raises in itself, then rolls back: nothing of it is kept.
    let found = '';
    await expect(
      run(async (context) => {
        found = await writeTestDocument(context);
        const target = await exceptions.codeSeriesTarget(context);
        if (target.kind !== 'done') throw new Error('no series');
        await context.lock(LOCK_STEP.numberSeries, [target.value]);
        const raised = await exceptions.raise(context, mismatchOn(found));
        expect(raised.kind).toBe('done');
        throw new Error('SYNTHETIC rollback of the transaction that found the problem');
      }),
    ).rejects.toThrow('SYNTHETIC rollback');
    expect(await rows(databaseA, 'select id from exceptions.exception')).toEqual([]);
    expect(await rows(databaseA, 'select id from test_exceptions.document where id = $1', [found])).toEqual([]);

    // So it is raised again in a transaction of its own (module-map 4.13; code-house-rules 8.1), and survives.
    documentId = await run((context) => writeTestDocument(context));
    const before = Date.now();
    const raised = await run((context) => exceptions.raiseInOwnCommand(context, mismatchOn(documentId)));
    if (raised.kind !== 'done') throw new Error(raised.refusal.code);
    ({ exceptionId, code } = raised.value);
    expect(code).toMatch(/^SYN-EX-\d{5}$/);
    expect(raised.value.replayed).toBe(false);
    const [row] = await rows<{ state: string; owner_user_id: string; due_at: Date; raised_at: Date; site_id: string }>(
      databaseA,
      'select state, owner_user_id, due_at, raised_at, site_id from exceptions.exception where id = $1',
      [exceptionId],
    );
    expect(row).toMatchObject({ state: 'Unresolved', owner_user_id: owner.id, site_id: SITE });
    expect((row?.due_at.getTime() ?? 0) - (row?.raised_at.getTime() ?? 0)).toBe(30 * 60_000);
    expect(row?.raised_at.getTime()).toBeGreaterThanOrEqual(before - 1000);

    // PRD-INT-008: the same raising event again answers the same exception and writes nothing.
    const replay = await run((context) => exceptions.raiseInOwnCommand(context, mismatchOn(documentId)));
    expect(replay).toEqual({ kind: 'done', value: { exceptionId, code, replayed: true } });
    expect(await rows(databaseA, 'select id from exceptions.exception')).toHaveLength(1);
    expect(
      await rows(databaseA, `select id from numbering.allocation where kind = 'exceptions.exception-code'`),
    ).toHaveLength(1);
  });

  it('PRD-EXC-001 POL-03.05 it shows in its owner’s My work with its due time and exposure, and to no one else', async () => {
    const items = await myWork(owner);
    expect(items).toMatchObject([
      {
        kind: 'exception',
        owner: { module: 'exceptions', recordType: 'exceptions.exception', recordId: exceptionId },
        exposure: { kind: 'known', amount: 125_000 },
        state: 'Unresolved',
        nextAction: 'exceptions.open-exception',
        due: { kind: 'at' },
      },
    ]);
    expect(await myWork(outsider)).toEqual([]);
    expect(await myWork(escalation)).toEqual([]);
  });

  it('PRD-EXC-001 its owner opens it without a permission; another reader needs view covering it', async () => {
    const opened = await get(`/api/exceptions/exceptions/${exceptionId}`, await cookieOf(owner));
    expect(opened.status, JSON.stringify(opened.body)).toBe(200);
    const view = exceptionViewSchema.parse(opened.body);
    expect(view).toMatchObject({
      code,
      type: { code: syntheticMismatch.code, category: 'mismatch' },
      state: 'Unresolved',
      overdue: false,
      owner: { party: { kind: 'user', userId: owner.id }, name: owner.displayName },
      exposure: { kind: 'known', amount: 125_000 },
      siteId: SITE,
      links: [{ recordType: TEST_DOCUMENT_TYPE, recordId: documentId }],
      mayAct: true,
      mayTake: false,
    });
    expect(view.events.map((event) => event.kind)).toEqual(['raised']);
    const hidden = await get(`/api/exceptions/exceptions/${exceptionId}`, await cookieOf(outsider));
    expect(hidden.status).toBe(404);
    const seen = exceptionViewSchema.parse(
      (await get(`/api/exceptions/exceptions/${exceptionId}`, await cookieOf(reader))).body,
    );
    expect(seen.mayAct).toBe(false);
  });

  it('PRD-EXC-002 PRD-EXC-003 test 21 closing waits for the resolution check and changes no stock or money', async () => {
    const cookie = await cookieOf(owner);
    const commented = await post(
      `/api/exceptions/exceptions/${exceptionId}/comment`,
      { comment: 'SYNTHETIC looked at it' },
      { cookie },
    );
    expect(commented.status, JSON.stringify(commented.body)).toBe(200);
    const stockBefore = await rows(databaseA, 'select id from stock.movement');
    const refused = await post(`/api/exceptions/exceptions/${exceptionId}/close`, {}, { cookie });
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({
      error: {
        kind: 'refused',
        code: 'exceptions.resolution-not-verified',
        missing: [
          { kind: 'resolution-check', exceptionType: syntheticMismatch.code },
          { kind: 'test-document-unresolved', documentId },
        ],
      },
    });
    expect((await myWork(owner)).map((item) => item.owner.recordId)).toEqual([exceptionId]);

    // The owning module records its correction; the check now verifies it.
    await rows(databaseA, 'update test_exceptions.document set resolved = true where id = $1', [documentId]);
    const closed = await post(`/api/exceptions/exceptions/${exceptionId}/close`, {}, { cookie });
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    expect(closed.body).toEqual({ exceptionId, state: 'Closed' });
    expect(await myWork(owner)).toEqual([]);
    expect(await rows(databaseA, 'select id from stock.movement')).toEqual(stockBefore);
    const view = exceptionViewSchema.parse((await get(`/api/exceptions/exceptions/${exceptionId}`, cookie)).body);
    expect(view.events.map((event) => [event.kind, event.comment])).toEqual([
      ['raised', null],
      ['comment', 'SYNTHETIC looked at it'],
      ['closed', null],
    ]);
    const again = await post(
      `/api/exceptions/exceptions/${exceptionId}/comment`,
      { comment: 'SYNTHETIC late' },
      { cookie },
    );
    expect((again.body as { error: { code: string } }).error.code).toBe('exceptions.not-open');
  });

  it('PRD-EXC-003 a closed exception is reopened when the problem comes back, back in My work', async () => {
    const cookie = await cookieOf(owner);
    const reopened = await post(
      `/api/exceptions/exceptions/${exceptionId}/reopen`,
      { comment: 'SYNTHETIC back again' },
      { cookie },
    );
    expect(reopened.body).toEqual({ exceptionId, state: 'Reopened' });
    expect(await myWork(owner)).toMatchObject([{ owner: { recordId: exceptionId }, state: 'Reopened' }]);
  });

  it('PRD-EXC-004 a new exception of the type on the same record links to the earlier one', async () => {
    const raised = await run((context) =>
      exceptions.raiseInOwnCommand(
        context,
        mismatchOn(documentId, { raisingEvent: `${TEST_EXCEPTIONS_MODULE}.again:${documentId}` }),
      ),
    );
    if (raised.kind !== 'done') throw new Error(raised.refusal.code);
    const view = exceptionViewSchema.parse(
      (await get(`/api/exceptions/exceptions/${raised.value.exceptionId}`, await cookieOf(owner))).body,
    );
    expect(view.earlierExceptionCode).toBe(code);
    const summary = await get('/api/exceptions/open-summary', await cookieOf(reader));
    expect(summary.body).toMatchObject({
      rows: [
        {
          storeId: null,
          brandId: null,
          typeCode: syntheticMismatch.code,
          open: 2,
          knownExposure: 250_000,
          unknownExposures: 0,
          repeats: 1,
        },
      ],
    });
  });

  it('PRD-ACS-010 past its due time it escalates: the recipient is added, the owner kept, the escalation recorded', async () => {
    const later = new Date(Date.now() + 2 * 3600_000);
    const escalated = await run(
      (context) => exceptions.escalateOverdue(context, { actor: { kind: 'service-identity', id: ACTOR } }),
      routedA,
      later,
    );
    expect(escalated).toBe(2);
    // Run again: each is escalated once (PRD-INT-008).
    expect(
      await run(
        (context) => exceptions.escalateOverdue(context, { actor: { kind: 'service-identity', id: ACTOR } }),
        routedA,
        later,
      ),
    ).toBe(0);
    const [row] = await rows<{ owner_user_id: string }>(
      databaseA,
      'select owner_user_id from exceptions.exception where id = $1',
      [exceptionId],
    );
    expect(row?.owner_user_id).toBe(owner.id);
    expect(
      await rows(databaseA, 'select recipient_user_id from inbox.work_item_escalation where recipient_user_id = $1', [
        escalation.id,
      ]),
    ).toHaveLength(2);
    expect((await myWork(escalation)).map((item) => item.owner.recordId)).toContain(exceptionId);
    expect((await myWork(owner)).map((item) => item.owner.recordId)).toContain(exceptionId);
    const view = exceptionViewSchema.parse(
      (await get(`/api/exceptions/exceptions/${exceptionId}`, await cookieOf(escalation))).body,
    );
    expect(view.events.at(-1)).toMatchObject({
      kind: 'escalated',
      to: { party: { kind: 'user', userId: escalation.id } },
    });
    expect(view.mayAct).toBe(true);
  });
});

describe('routing to a role within the Site’s scope (access-and-approvals 12.2)', () => {
  it('POL-02.16 each holder whose scope covers the Site sees it until one takes it', async () => {
    await approvedRouting({
      siteId: ROLE_SITE,
      owner: { kind: 'role', roleId: holderRoleId },
      escalation: { kind: 'user', userId: escalation.id },
    });
    const document = await run((context) => writeTestDocument(context));
    const raised = await run((context) =>
      exceptions.raiseInOwnCommand(
        context,
        mismatchOn(document, { facts: { siteId: ROLE_SITE, storeId: null, businessUnitId: null, brandId: null } }),
      ),
    );
    if (raised.kind !== 'done') throw new Error(raised.refusal.code);
    const { exceptionId } = raised.value;
    expect((await myWork(holder)).map((item) => item.owner.recordId)).toEqual([exceptionId]);
    expect((await myWork(outsider)).map((item) => item.owner.recordId)).not.toContain(exceptionId);
    const view = exceptionViewSchema.parse(
      (await get(`/api/exceptions/exceptions/${exceptionId}`, await cookieOf(holder))).body,
    );
    expect(view).toMatchObject({ mayAct: true, mayTake: true });
    const taken = await post(`/api/exceptions/exceptions/${exceptionId}/take`, {}, { cookie: await cookieOf(holder) });
    expect(taken.status, JSON.stringify(taken.body)).toBe(200);
    const after = exceptionViewSchema.parse(
      (await get(`/api/exceptions/exceptions/${exceptionId}`, await cookieOf(holder))).body,
    );
    expect(after.owner.party).toEqual({ kind: 'user', userId: holder.id });
    expect(after.mayTake).toBe(false);
    expect((await myWork(holder)).filter((item) => item.owner.recordId === exceptionId)).toHaveLength(1);
  });
});

describe('a job that still fails after its retries (code-house-rules 12.9; access-and-approvals 9.8 step 4)', () => {
  const failed = defineEvent({
    type: 'kernel.synthetic-work-requested',
    version: 1,
    payload: z.object({ recordId: z.uuid() }),
  });
  const attempts: number[] = [];
  const alwaysFails: ConsumerDefinition = defineConsumer({
    name: 'kernel.synthetic-always-fails',
    event: failed,
    serviceIdentity: 'synthetic-failing-consumer',
    authorises: { action: 'view', recordType: 'kernel.outbox_event' },
    handle: (context) => {
      attempts.push(Date.now());
      return Promise.reject(new CommandTimedOut('statement', '57014', context.correlationId));
    },
  });
  let worker: Worker;

  afterAll(async () => {
    await (worker as Worker | undefined)?.stop();
  });

  it('PRD-EXC-001 raises exactly one unfinished-operation exception, at the Site of the work that failed', async () => {
    await writeSyntheticServiceIdentity(databaseA, OUTBOX_PROCESSOR_IDENTITY, [OUTBOX_AUTHORITY]);
    await writeSyntheticServiceIdentity(databaseA, 'synthetic-failing-consumer', [alwaysFails.authorises]);
    await writeSyntheticServiceIdentity(databaseA, EXCEPTIONS_IDENTITY, [
      { action: 'create', recordType: 'exceptions.exception' },
    ]);
    await approvedRouting({
      typeCode: unfinishedOperation.code,
      siteId: JOB_SITE,
      owner: { kind: 'user', userId: owner.id },
      escalation: { kind: 'user', userId: escalation.id },
    });
    const registry: JobRegistry = {
      events: [failed, jobFailed],
      consumers: [alwaysFails, ...exceptionsConsumers],
      jobKinds: [],
    };
    // SYNTHETIC: five attempts in all with growing delays (DEC-118, DEC-119); only the first wait is shortened.
    const retry = { ...SYNTHETIC_RETRY, retryDelaySeconds: SYNTHETIC_TEST_SPEED.retryDelaySeconds };
    const workerRunner = new CommandRunner({
      clock: { now: () => new Date() },
      timezones: syntheticTimezone,
      logger: log.logger,
    });
    worker = new Worker({
      router,
      runner: workerRunner,
      helper: new IdempotencyHelper({
        runner: workerRunner,
        logger: log.logger,
        secretCheck: secretCheckNotImplemented,
        cipher: restrictedValueCipherNotConfigured,
      }),
      identities: jobIdentities(),
      logger: log.logger,
      registry,
      settings: {
        pollSeconds: SYNTHETIC_TEST_SPEED.pollSeconds,
        consumers: { [alwaysFails.name]: retry, 'exceptions.raise-unfinished-operation': retry },
        jobKinds: {},
      },
    });
    await worker.start();
    const recordId = uuidv7();
    await run((context) =>
      context.publish(failed, {
        subject: { module: 'kernel', recordType: 'kernel.synthetic_record', recordId },
        scope: { siteId: JOB_SITE },
        payload: { recordId },
      }),
    );
    const unfinished = () =>
      rows<{ id: string; site_id: string; record_id: string; state: string }>(
        databaseA,
        `select e.id, e.site_id, l.record_id, e.state from exceptions.exception e
         join exceptions.exception_type t on t.id = e.exception_type_id
         join exceptions.exception_link l on l.exception_id = e.id
         where t.code = 'exceptions.unfinished-operation'`,
      );
    await eventually(async () => (await unfinished()).length > 0, 120_000);
    expect(attempts).toHaveLength(SYNTHETIC_RETRY.retries + 1);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const [raised, ...more] = await unfinished();
    expect(more).toEqual([]);
    const [job] = await rows<{ job_id: string }>(
      databaseA,
      `select d.job_id from kernel.outbox_dispatch d join kernel.outbox_event e on e.id = d.outbox_event_id
       where e.event_type = 'kernel.synthetic-work-requested' and e.subject_record_id = $1`,
      [recordId],
    );
    expect(raised).toMatchObject({ site_id: JOB_SITE, record_id: job?.job_id, state: 'Unresolved' });
    expect((await myWork(owner)).map((item) => item.owner.recordId)).toContain(raised?.id);

    // Closing waits for the job to complete when an operator runs it again (S1-F08-T04).
    const refused = await post(
      `/api/exceptions/exceptions/${raised?.id ?? ''}/close`,
      {},
      { cookie: await cookieOf(owner) },
    );
    expect(refused.body).toMatchObject({
      error: {
        code: 'exceptions.resolution-not-verified',
        missing: [{ kind: 'resolution-check' }, { kind: 'job-not-completed', jobId: job?.job_id, state: 'failed' }],
      },
    });
  }, 180_000);
});

describe('a second Organisation (PRD-ACS-020)', () => {
  it('PRD-ACS-020 sees none of these exceptions', async () => {
    expect(await rows(databaseB, 'select id from exceptions.exception')).toEqual([]);
    const [anyException] = await rows<{ id: string }>(databaseA, 'select id from exceptions.exception limit 1');
    const cookie = await cookieOf(readerB, world.organisations[1].code);
    const read = await get(`/api/exceptions/exceptions/${anyException?.id ?? ''}`, cookie);
    expect(read.status).toBe(404);
    const summary = await get('/api/exceptions/open-summary', cookie);
    expect(summary.body).toMatchObject({ rows: [] });
    expect(await run((context) => exceptions.available(context, syntheticMismatch.code, SITE), routedB)).toMatchObject({
      code: 'exceptions.no-exception-code-series',
    });
  });
});

describe('the exception-code series names why it cannot number (access-and-approvals 12.1; S1-F08 review)', () => {
  const live = () =>
    run(async (context) => {
      const series = await numbering.liveSeries(context, {
        kind: EXCEPTION_CODE_KIND.kind,
        scopeKey: EXCEPTION_CODE_SCOPE_KEY,
      });
      if (series === undefined) throw new Error('no live exception-code series');
      return series.seriesId;
    });
  const change = (seriesId: string, how: 'pause' | 'release' | 'close') =>
    run(async (context) => {
      await context.lock(LOCK_STEP.numberSeries, [numbering.seriesLockTarget(seriesId)]);
      const changed = await numbering[how](context, seriesId);
      if (changed.kind !== 'done') throw new Error(changed.refusal.code);
    });
  const raiseOn = async () => {
    const documentId = await run((context) => writeTestDocument(context));
    return run((context) => exceptions.raiseInOwnCommand(context, mismatchOn(documentId)));
  };
  const SERIES = [{ kind: 'number-series', numberedKind: 'exceptions.exception-code' }];

  it('PRD-UXP-003 a paused series is named as paused, not as missing', async () => {
    const seriesId = await live();
    await change(seriesId, 'pause');
    try {
      expect(await run((context) => exceptions.available(context, syntheticMismatch.code, SITE))).toEqual({
        kind: 'unavailable',
        code: 'exceptions.exception-code-series-paused',
        missing: SERIES,
      });
      expect(await raiseOn()).toMatchObject({
        kind: 'refused',
        refusal: { kind: 'unavailable', code: 'exceptions.exception-code-series-paused', missing: SERIES },
      });
    } finally {
      await change(seriesId, 'release');
    }
  });

  it('PRD-UXP-003 a series whose numbers no longer fit its format is named as used up, not as missing', async () => {
    await change(await live(), 'close');
    // A SYNTHETIC format one digit wide: nine numbers, then none.
    const code = syntheticCode('EXCEPTION-CODE-NARROW');
    await run(async (context) => {
      const format = await numbering.defineFormatVersion(context, code, [
        { kind: 'text', text: 'SYN-EY-' },
        { kind: 'sequence', width: 1 },
      ]);
      if (format.kind !== 'done') throw new Error(format.refusal.code);
      const series = await numbering.defineSeries(context, {
        kind: EXCEPTION_CODE_KIND.kind,
        scopeKey: EXCEPTION_CODE_SCOPE_KEY,
        displayScopeKey: EXCEPTION_CODE_SCOPE_KEY,
        formatCode: code,
      });
      if (series.kind !== 'done') throw new Error(series.refusal.code);
    });
    for (let i = 1; i <= 9; i += 1) expect((await raiseOn()).kind).toBe('done');
    expect(await raiseOn()).toMatchObject({
      kind: 'refused',
      refusal: { kind: 'unavailable', code: 'exceptions.exception-code-series-exhausted', missing: SERIES },
    });
  });
});
