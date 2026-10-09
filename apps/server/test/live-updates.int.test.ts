import { randomInt } from 'node:crypto';
import { paise, uuidv7 } from '@apparel-os/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CommandRunner,
  defineEvent,
  newCorrelationId,
  OrganisationRouter,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import { Audit } from '../src/modules/audit/index.js';
import { EXCEPTION_CODE_KIND, Exceptions, type RaiseInput } from '../src/modules/exceptions/index.js';
import { Inbox } from '../src/modules/inbox/index.js';
import { Numbering } from '../src/modules/numbering/index.js';
import {
  codeFor,
  startAccessApp,
  SYNTHETIC_ORIGIN,
  SyntheticClock,
  syntheticKeysEnvironment,
  syntheticTimezone,
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
import { capturingLogger } from './support/jobs.js';
import { openLiveStream } from './support/live.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';

// S1-F08-T04: live updates (code-house-rules 12.12; deployment.md section 5; access-and-approvals 6, 7.2, 11.1, 11.3;
// PRD Stack: Live updates; PRD-SEC-005, PRD-SEC-006, PRD-SEC-008, PRD-ACS-020). One stream per session at
// `GET /api/kernel/live`, read here as a browser's EventSource reads it. A SYNTHETIC exception is raised through the
// exceptions interface, as a raising module does, and the stream is watched by its owner, a reader whose grant covers
// its Site, a reader whose grant covers another Site, and a reader of the second Organisation. Every routing, format,
// due time, amount, setting and heartbeat interval here is SYNTHETIC.

const SYNTHETIC_THROTTLING = { failureLimit: 50, windowSeconds: 600 };
const SYNTHETIC_PASSWORD_RULES = { minimumLength: 12 };
const SYNTHETIC_LIMITS = { idleLockSeconds: 3600, absoluteSeconds: 7200 };
/** SYNTHETIC: a heartbeat and a stream length short enough for a test to sit through (12.12: builders' values). */
const SYNTHETIC_LIVE = { heartbeatMs: 400, streamMs: 60_000 };
/** A SYNTHETIC exposure whose figures must never reach a stream (PRD-SEC-006). */
const SYNTHETIC_AMOUNT = 987_654_321;
const SITE = '01900000-0000-7000-8000-0000000f4001';
const OTHER_SITE = '01900000-0000-7000-8000-0000000f4002';
const ACTOR = '01900000-0000-7000-8000-0000000f4a01';
/** SYNTHETIC: a heartbeat too far off to matter, so only the outbox notification and the stream's own checks act. */
const SYNTHETIC_SLOW_LIVE = { heartbeatMs: 600_000, streamMs: 600_000 };
/** A SYNTHETIC event no reader may view, published only to commit an identifier above another. */
const unrelated = defineEvent({ type: 'kernel.synthetic-unrelated', version: 1, payload: z.object({}) });

type Enrolled = SyntheticUser & { factorSecret: Buffer };

let world: SyntheticWorld;
let databaseA: string;
let api: AccessTestApp;
let clock: SyntheticClock;
let router: OrganisationRouter;
let routedA: RoutedOrganisation;
let runner: CommandRunner;
const log = capturingLogger();
const numbering = new Numbering({ kinds: [EXCEPTION_CODE_KIND] });
const exceptions = new Exceptions({
  numbering,
  inbox: new Inbox(),
  audit: new Audit(log.logger),
  types: [syntheticMismatch],
});
let owner: Enrolled;
let reader: Enrolled;
let outsider: Enrolled;
let admin: Enrolled;
let readerB: Enrolled;
let keys: Record<string, string>;

beforeAll(async () => {
  world = await createSyntheticOrganisations('live');
  const [a, b] = world.organisations;
  databaseA = a.database;
  keys = syntheticKeysEnvironment(world);
  for (const database of [a.database, b.database]) {
    await createTestExceptionsSchema(database);
    await writeSyntheticSetting(database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
    await writeSyntheticSetting(database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
    await writeSyntheticSetting(database, 'access.office-session-limits', SYNTHETIC_LIMITS);
  }
  const enrolled = async (label: string, database = a.database, code = a.code) =>
    (await writeSyntheticUser(database, code, keys, { label, enrolled: true })) as Enrolled;
  owner = await enrolled('LIVE-OWNER');
  reader = await enrolled('LIVE-READER');
  outsider = await enrolled('LIVE-OUTSIDER');
  admin = await enrolled('LIVE-ADMIN');
  readerB = await enrolled('LIVE-READER-B', b.database, b.code);
  const onSite = (site: string) => ({
    scope: {
      kind: 'dimensions' as const,
      legalEntity: { kind: 'all' as const },
      place: { kind: 'selected' as const, members: [{ type: 'site' as const, id: site }] },
      brand: { kind: 'all' as const },
    },
  });
  await grantSynthetic(a.database, { kind: 'user', id: reader.id }, [view('exceptions.exception')], onSite(SITE));
  await grantSynthetic(
    a.database,
    { kind: 'user', id: outsider.id },
    [view('exceptions.exception')],
    onSite(OTHER_SITE),
  );
  await grantSynthetic(a.database, { kind: 'user', id: admin.id }, [{ recordType: 'access.session', action: 'edit' }]);
  await grantSynthetic(b.database, { kind: 'user', id: readerB.id }, [view('exceptions.exception')]);

  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, { clock, exceptionTypes: [syntheticMismatch], liveSettings: SYNTHETIC_LIVE });
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 2 },
    log.logger,
  );
  const found = await router.resolveForSignIn(a.code);
  if (!found.routed) throw new Error('not routed');
  routedA = found.organisation;
  runner = new CommandRunner({ clock: { now: () => new Date() }, timezones: syntheticTimezone, logger: log.logger });

  // A SYNTHETIC series and a SYNTHETIC rule routing the SYNTHETIC type at SITE to the owner, approved here as a
  // fixture (code-house-rules 11.2).
  await run((context) => defineSyntheticCodeSeries(context, numbering));
  const routing = await run(
    (context) =>
      exceptions.prepareRouting(
        context,
        { userId: admin.id, roleAssignmentId: uuidv7() },
        {
          typeCode: syntheticMismatch.code,
          siteId: SITE,
          owner: { kind: 'user', userId: owner.id },
          dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
          escalation: { kind: 'user', userId: owner.id },
          validFrom: new Date().toISOString().slice(0, 10),
          origin: 'synthetic',
        },
      ),
    admin.id,
  );
  if (routing.kind !== 'done') throw new Error(`The synthetic routing was refused: ${routing.refusal.code}`);
  const migration = await connect(a.database, 'migration');
  try {
    await migration.query(`update exceptions.exception_routing_version set decision = 'Approved' where id = $1`, [
      routing.value.versionId,
    ]);
  } finally {
    await migration.end();
  }
});

afterAll(async () => {
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

function view(recordType: string) {
  return { recordType, action: 'view' as const };
}

function run<T>(work: (context: TransactionContext) => Promise<T>, actorId = ACTOR): Promise<T> {
  return runner.run(
    {
      commandName: 'test-syn-live.fixture',
      organisation: routedA,
      correlationId: newCorrelationId(),
      actor: { kind: 'actor', actorId },
    },
    work,
  );
}

function freshAddress(): string {
  return `10.${String(randomInt(256))}.${String(randomInt(256))}.${String(randomInt(1, 255))}`;
}

async function post(path: string, body: unknown, cookie?: string, key: string | null = uuidv7()) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': freshAddress(),
    origin: SYNTHETIC_ORIGIN,
  };
  if (cookie !== undefined) headers.cookie = cookie;
  if (key !== null) headers['idempotency-key'] = key;
  const response = await fetch(`${api.baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

/** Signs a user in afresh: a new session each time (access-and-approvals 3.3). */
async function signIn(user: Enrolled, organisationCode = world.organisations[0].code): Promise<string> {
  clock.advance(30);
  const call = await post(
    '/api/access/sign-in',
    {
      organisationCode,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret, 0, clock.now()),
    },
    undefined,
    null,
  );
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return (call.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

async function raiseOne(): Promise<{ exceptionId: string }> {
  const documentId = await run((context) => writeTestDocument(context));
  const raised = await run((context) => exceptions.raiseInOwnCommand(context, raiseInput(documentId)));
  if (raised.kind !== 'done') throw new Error(`The synthetic exception was refused: ${raised.refusal.code}`);
  return { exceptionId: raised.value.exceptionId };
}

function raiseInput(documentId: string): RaiseInput {
  return {
    raisingEvent: `${TEST_EXCEPTIONS_MODULE}.live:${documentId}`,
    typeCode: syntheticMismatch.code,
    facts: { siteId: SITE, storeId: null, businessUnitId: null, brandId: null },
    links: [{ module: TEST_EXCEPTIONS_MODULE, recordType: TEST_DOCUMENT_TYPE, recordId: documentId, versionId: null }],
    exposure: { kind: 'known', amount: paise(SYNTHETIC_AMOUNT) },
    raisedBy: { kind: 'user', id: ACTOR },
  };
}

/** Whether a message is an event about one record. */
const about = (recordId: string) => (message: { data: { kind: string } & Record<string, unknown> }) =>
  message.data.kind === 'event' && (message.data.subject as { recordId: string }).recordId === recordId;

/** Whether the stream ended within `ms`. */
async function endsWithin(stream: { ended: Promise<void> }, ms: number): Promise<boolean> {
  return Promise.race([
    stream.ended.then(() => true),
    new Promise<boolean>((resolve) => {
      setTimeout(() => {
        resolve(false);
      }, ms);
    }),
  ]);
}

describe('the live-update stream (code-house-rules 12.12)', () => {
  it('PRD-SEC-005 PRD-SEC-006 an event reaches only sessions whose actor may view its record, with identifiers only', async () => {
    const ownerStream = await openLiveStream(api.baseUrl, await signIn(owner));
    const readerStream = await openLiveStream(api.baseUrl, await signIn(reader));
    const outsiderStream = await openLiveStream(api.baseUrl, await signIn(outsider));
    const streamB = await openLiveStream(api.baseUrl, await signIn(readerB, world.organisations[1].code));
    try {
      expect([ownerStream.status, readerStream.status, outsiderStream.status, streamB.status]).toEqual([
        200, 200, 200, 200,
      ]);
      const { exceptionId } = await raiseOne();
      const aboutIt = (type: string) => (message: { data: { kind: string } & Record<string, unknown> }) =>
        message.data.kind === 'event' &&
        message.data.type === type &&
        (message.data.subject as { recordId: string }).recordId === exceptionId;

      // The owner may act on its work item and view the exception: both reach them (access-and-approvals 11.1).
      const raised = await ownerStream.waitFor(aboutIt('exceptions.raised'));
      expect(raised.event).toBe('exceptions.raised');
      expect(raised.id).toMatch(/^[0-9a-f-]{36}$/);
      const item = await ownerStream.waitFor(
        (message) => message.data.kind === 'event' && message.data.type === 'inbox.work-item-changed',
      );
      expect(item.data).toMatchObject({ subject: { module: 'inbox', recordType: 'inbox.work_item' } });
      // A grant covering its Site views the exception, but the work item is for those who may act on it only.
      await readerStream.waitFor(aboutIt('exceptions.raised'));
      await new Promise((resolve) => setTimeout(resolve, 2 * SYNTHETIC_LIVE.heartbeatMs));
      expect(readerStream.messages.filter((message) => message.data.kind === 'event').map((m) => m.event)).toEqual([
        'exceptions.raised',
      ]);
      // A grant covering another Site sees nothing, and neither does the second Organisation (PRD-ACS-020).
      expect(outsiderStream.messages).toEqual([]);
      expect(streamB.messages).toEqual([]);

      // Identity, type and subject only: no name, amount, restricted value or secret (PRD-SEC-006).
      for (const message of [raised, item]) {
        expect(Object.keys(message.data).sort()).toEqual(['kind', 'subject', 'type']);
      }
      for (const text of [ownerStream.text(), readerStream.text()]) {
        expect(text).not.toContain(String(SYNTHETIC_AMOUNT));
        expect(text).not.toContain(owner.displayName);
        expect(text).not.toContain(owner.login);
        expect(text).not.toContain('SYN-EX-');
      }
      // The heartbeat is a comment line, and an open session's stream stays open through it (deployment.md 5).
      const still = await Promise.race([
        ownerStream.ended.then(() => 'ended'),
        new Promise((resolve) => {
          setTimeout(() => {
            resolve('open');
          }, 3 * SYNTHETIC_LIVE.heartbeatMs);
        }),
      ]);
      expect(still).toBe('open');
      expect(ownerStream.text()).toMatch(/^: heartbeat$/m);
    } finally {
      for (const stream of [ownerStream, readerStream, outsiderStream, streamB]) stream.close();
    }
  });

  it('deployment.md 5 a reconnect sends the events after Last-Event-ID; an unknown one gets a resync', async () => {
    const cookie = await signIn(owner);
    const first = await openLiveStream(api.baseUrl, cookie);
    const { exceptionId: earlier } = await raiseOne();
    const seen = await first.waitFor(
      (message) => message.data.kind === 'event' && message.data.subject.recordId === earlier,
    );
    first.close();
    const { exceptionId: missed } = await raiseOne();

    const again = await openLiveStream(api.baseUrl, cookie, seen.id);
    try {
      await again.waitFor((message) => message.data.kind === 'event' && message.data.subject.recordId === missed);
      expect(
        again.messages.some((message) => message.data.kind === 'event' && message.data.subject.recordId === earlier),
      ).toBe(false);
    } finally {
      again.close();
    }

    const unknown = await openLiveStream(api.baseUrl, cookie, uuidv7());
    try {
      const resync = await unknown.waitFor((message) => message.data.kind === 'resync');
      expect(resync.event).toBe('resync');
      expect(unknown.messages[0]?.data).toEqual({ kind: 'resync' });
    } finally {
      unknown.close();
    }
  });

  it('PRD-SEC-008 a revoked session’s stream closes', async () => {
    const stream = await openLiveStream(api.baseUrl, await signIn(reader));
    expect(stream.status).toBe(200);
    const revoked = await post(`/api/access/users/${reader.id}/sessions/revoke`, {}, await signIn(admin));
    expect(revoked.status, JSON.stringify(revoked.body)).toBe(200);
    const closed = await Promise.race([
      stream.ended.then(() => 'closed'),
      new Promise((resolve) => {
        setTimeout(() => {
          resolve('open');
        }, 10_000);
      }),
    ]);
    expect(closed).toBe('closed');
  });

  it('PRD-ACS-017 opening the stream does not count as the session’s activity, so it never keeps it from locking', async () => {
    const cookie = await signIn(reader);
    const lastActivity = async () => {
      const client = await connect(databaseA, 'migration');
      try {
        const result = await client.query<{ at: Date }>(
          `select last_activity_at as at from access.session where app_user_id = $1 and state = 'In force'`,
          [reader.id],
        );
        return result.rows.map((row) => row.at.toISOString());
      } finally {
        await client.end();
      }
    };
    const before = await lastActivity();
    clock.advance(60);
    const stream = await openLiveStream(api.baseUrl, cookie);
    try {
      expect(stream.status).toBe(200);
      expect(await lastActivity()).toEqual(before);
    } finally {
      stream.close();
    }
  });

  it('access-and-approvals 7.1 a request without a session is refused before any stream opens', async () => {
    const refused = await openLiveStream(api.baseUrl, '');
    expect(refused.status).toBe(401);
    expect(refused.body).toMatchObject({ error: { code: 'access.not-signed-in' } });
  });

  it('code-house-rules 12.12 an event made before the stream opened that commits after it still reaches it', async () => {
    const cookie = await signIn(owner);
    const documentId = await run((context) => writeTestDocument(context));
    let made!: () => void;
    const madeIt = new Promise<void>((resolve) => {
      made = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The exception's event gets its identifier now, and commits only after the stream has opened.
    const pending = run(async (context) => {
      const raised = await exceptions.raiseInOwnCommand(context, raiseInput(documentId));
      made();
      await released;
      return raised;
    });
    await madeIt;
    // A later identifier commits first, so the outbox's latest event at open is above the one in flight.
    await run((context) =>
      context.publish(unrelated, {
        subject: { module: 'kernel', recordType: 'kernel.synthetic_record', recordId: uuidv7() },
        scope: {},
        payload: {},
      }),
    );
    const stream = await openLiveStream(api.baseUrl, cookie);
    try {
      release();
      const raised = await pending;
      if (raised.kind !== 'done') throw new Error(`The synthetic exception was refused: ${raised.refusal.code}`);
      await stream.waitFor(about(raised.value.exceptionId));
    } finally {
      release();
      stream.close();
    }
  });
});

describe('the stream without its heartbeat (code-house-rules 12.12)', () => {
  let slow: AccessTestApp;

  beforeAll(async () => {
    slow = await startAccessApp(world, keys, {
      clock,
      exceptionTypes: [syntheticMismatch],
      liveSettings: SYNTHETIC_SLOW_LIVE,
    });
  });

  afterAll(async () => {
    await (slow as AccessTestApp | undefined)?.close();
  });

  it('code-house-rules 12.12 after its outbox connection is lost, the next stream listens again', async () => {
    const first = await openLiveStream(slow.baseUrl, await signIn(owner));
    const superuser = await connect(databaseA, 'superuser');
    try {
      const { exceptionId: before } = await raiseOne();
      await first.waitFor(about(before));
      // The LISTEN connection is cut, as a network fault or a database restart would.
      const cut = await superuser.query<{ cut: boolean }>(
        `select pg_terminate_backend(pid) as cut from pg_stat_activity
          where datname = current_database() and query ilike 'listen %'`,
      );
      expect(cut.rows.length).toBeGreaterThan(0);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const second = await openLiveStream(slow.baseUrl, await signIn(owner));
      try {
        const { exceptionId: after } = await raiseOne();
        await second.waitFor(about(after), 10_000);
      } finally {
        second.close();
      }
    } finally {
      first.close();
      await superuser.end();
    }
  });

  it('PRD-SEC-008 PRD-ACS-017 a session that locks gets no further event, without waiting for the heartbeat', async () => {
    const stream = await openLiveStream(slow.baseUrl, await signIn(owner));
    try {
      const { exceptionId: before } = await raiseOne();
      await stream.waitFor(about(before));
      // Past the SYNTHETIC idle limit the session is locked (access-and-approvals 3.3).
      clock.advance(SYNTHETIC_LIMITS.idleLockSeconds + 1);
      const { exceptionId: after } = await raiseOne();
      expect(await endsWithin(stream, 10_000)).toBe(true);
      expect(stream.messages.some(about(after))).toBe(false);
    } finally {
      stream.close();
    }
  });
});
