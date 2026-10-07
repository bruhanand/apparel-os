import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import { errorEnvelopeSchema, IDEMPOTENT_REPLAYED_HEADER } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CommandRunner,
  IdempotencyHelper,
  OrganisationRouter,
  OUTBOX_AUTHORITY,
  OUTBOX_PROCESSOR_IDENTITY,
  restrictedValueCipherNotConfigured,
  secretCheckNotImplemented,
  Worker,
  type JobRegistry,
} from '../src/kernel/index.js';
import { approvalDecided, approvalRequested } from '../src/modules/access/index.js';
// The access module's JobIdentities, as AccessJobIdentitiesModule provides it to the worker (RR-273).
import { jobIdentities } from '../src/modules/access/commands/job-identities.js';
import { INBOX_IDENTITY, inboxConsumers } from '../src/modules/inbox/index.js';
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
import { grantSynthetic } from './support/grants.js';
import { capturingLogger, eventually, writeSyntheticServiceIdentity } from './support/jobs.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';
import { syntheticWorkerSettings } from './fixtures/worker-settings.js';

// S1-F01-T20: the leak suite (spec section 7 "Secrets and restricted values never reach logs, errors, audit records or
// live updates"; S1-F01-AT17; access-and-approvals 15 test 23, part; numbering-and-audit 7 test 11; PRD-SEC-006,
// PRD-SEC-014). Every secret of the slice passes through the whole application once: temporary and chosen passwords,
// wrong passwords, the authenticator secret, every code given (right or wrong), a temporary password typed into a new
// user and into a credential reset, an unlock, and each session identifier. Then the service logs of the app and the
// worker, every answer the API gave (but the one that shows the enrolment secret once, by design: DEC-113), and every
// row of every table of the Organisation's database, audit, access records, idempotency records, outbox events (the
// live-update identifiers) and jobs among them, are searched for each of them. Along the way it proves S1-F01-AT14 on
// the decision through the API: one key and changed content is refused and kept. Every value is SYNTHETIC.

const SYNTHETIC_THROTTLING = { failureLimit: 50, windowSeconds: 600 };
const SYNTHETIC_PASSWORD_RULES = { minimumLength: 12 };
const SYNTHETIC_LIMITS = { idleLockSeconds: 600, absoluteSeconds: 7200 };
/** The inbox's consumers, with SYNTHETIC worker settings (DEC-118, DEC-119; CH-10). */
const inboxRegistry: JobRegistry = {
  events: [approvalRequested, approvalDecided],
  consumers: inboxConsumers,
  jobKinds: [],
};
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

type Enrolled = SyntheticUser & { factorSecret: Buffer };

let world: SyntheticWorld;
let database: string;
let code: string;
let api: AccessTestApp;
let clock: SyntheticClock;
let router: OrganisationRouter;
let worker: Worker;
const workerLog = capturingLogger();
let admin: SyntheticUser;
let approver: Enrolled;

/** Every secret given to or made by the application in this file, and every code, which a log or row may not hold. */
const secrets = new Set<string>();
const codes = new Set<string>();
/** Every answer the API gave, as text, but the one shown-once enrolment answer. */
const answers: string[] = [];

beforeAll(async () => {
  world = await createSyntheticOrganisations('leaks');
  const organisation = world.organisations[0];
  database = organisation.database;
  code = organisation.code;
  const keys = syntheticKeysEnvironment(world);
  await writeSyntheticSetting(database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
  await writeSyntheticSetting(database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
  await writeSyntheticSetting(database, 'access.office-session-limits', SYNTHETIC_LIMITS);
  await writeSyntheticServiceIdentity(database, OUTBOX_PROCESSOR_IDENTITY, [OUTBOX_AUTHORITY]);
  await writeSyntheticServiceIdentity(database, INBOX_IDENTITY, [{ action: 'edit', recordType: 'inbox.work_item' }]);
  // The Admin signs in for the first time: a temporary password and no authenticator app (access-and-approvals 3.2).
  admin = await writeSyntheticUser(database, code, keys, { label: 'ADMIN', temporary: true });
  approver = (await writeSyntheticUser(database, code, keys, { label: 'APPROVER', enrolled: true })) as Enrolled;
  secrets.add(admin.password).add(approver.password);
  addFactorSecret(approver.factorSecret);
  const prepared = ['access.user', 'access.approval_reason'];
  await grantSynthetic(database, { kind: 'user', id: admin.id }, [
    ...prepared.map((recordType) => ({ recordType, action: 'create' as const })),
    { recordType: 'access.user_credential', action: 'edit' },
  ]);
  await grantSynthetic(database, { kind: 'user', id: approver.id }, [
    ...prepared.map((recordType) => ({ recordType, action: 'approve' as const })),
    { recordType: 'access.approval_request', action: 'view' },
  ]);
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, { clock });
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    workerLog.logger,
  );
  const runner = new CommandRunner({
    clock: { now: () => new Date() },
    timezones: syntheticTimezone,
    logger: workerLog.logger,
  });
  worker = new Worker({
    router,
    runner,
    helper: new IdempotencyHelper({
      runner,
      logger: workerLog.logger,
      secretCheck: secretCheckNotImplemented,
      cipher: restrictedValueCipherNotConfigured,
    }),
    identities: jobIdentities(),
    logger: workerLog.logger,
    registry: inboxRegistry,
    settings: syntheticWorkerSettings(inboxRegistry, { fast: true }),
  });
  await worker.start();
});

afterAll(async () => {
  await (worker as Worker | undefined)?.stop();
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

function base32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let text = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      text += BASE32[(value >>> (bits - 5)) & 31] ?? '';
      bits -= 5;
    }
  }
  if (bits > 0) text += BASE32[(value << (5 - bits)) & 31] ?? '';
  return text;
}

function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of text) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function addFactorSecret(secret: Buffer): void {
  secrets.add(base32(secret)).add(secret.toString('hex')).add(secret.toString('base64'));
}

interface Call {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;
}

function freshAddress(): string {
  return `10.${String(randomInt(256))}.${String(randomInt(256))}.${String(randomInt(1, 255))}`;
}

async function call(
  method: 'GET' | 'POST',
  path: string,
  options: { body?: unknown; cookie?: string; key?: string | null; showsSecret?: true } = {},
): Promise<Call> {
  const headers: Record<string, string> = { 'x-forwarded-for': freshAddress(), origin: SYNTHETIC_ORIGIN };
  if (method === 'POST') headers['content-type'] = 'application/json';
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  if (method === 'POST' && options.key !== null) headers['idempotency-key'] = options.key ?? uuidv7();
  const response = await fetch(`${api.baseUrl}${path}`, {
    method,
    headers,
    ...(method === 'POST' ? { body: JSON.stringify(options.body ?? {}) } : {}),
  });
  const text = await response.text();
  if (options.showsSecret !== true) answers.push(text);
  return { status: response.status, body: JSON.parse(text) as unknown, headers: response.headers };
}

/** The cookie of a sign-in answer; its session identifier, after the dot, is a secret (access-and-approvals 3.3). */
function cookieOf(answer: Call): string {
  const cookie = (answer.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const identifier = cookie.split('.')[1];
  if (identifier === undefined || identifier === '') throw new Error('No session identifier');
  secrets.add(identifier);
  return cookie;
}

function freshCode(secret: Buffer): string {
  clock.advance(30);
  const given = codeFor(secret, 0, clock.now());
  codes.add(given);
  return given;
}

async function signIn(login: string, password: string, totpCode?: string): Promise<Call> {
  return call('POST', '/api/access/sign-in', {
    body: { organisationCode: code, login, password, ...(totpCode === undefined ? {} : { totpCode }) },
    key: null,
  });
}

async function owner<T extends object>(text: string, values: unknown[] = []): Promise<T[]> {
  const client = await connect(database, 'superuser');
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

/** Every row of every table of the Organisation's database, as JSON text, read as the superuser past row security. */
async function everyRow(): Promise<string> {
  const tables = await owner<{ name: string }>(
    `select format('%I.%I', table_schema, table_name) as name from information_schema.tables
     where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema') order by 1`,
  );
  const parts: string[] = [];
  for (const table of tables) {
    const [row] = await owner<{ rows: string | null }>(`select json_agg(t)::text as rows from ${table.name} t`);
    parts.push(`${table.name} ${row?.rows ?? '[]'}`);
  }
  return parts.join('\n');
}

const today = () => clock.now().toISOString().slice(0, 10);

describe('no secret leaks (spec section 7; S1-F01-AT17)', () => {
  it('PRD-SEC-006 PRD-SEC-014 no password, authenticator secret, code or session identifier reaches a log, an answer, a row, an audit record or an event', async () => {
    // Wrong sign-ins: a wrong password, a login nobody has, and a wrong code (access-and-approvals 3.1).
    const wrongPassword = 'SYNTHETIC-wrong-password-1';
    secrets.add(wrongPassword);
    expect((await signIn(approver.login, wrongPassword, freshCode(approver.factorSecret))).status).toBe(401);
    expect((await signIn('syn-nobody-at-all', wrongPassword)).status).toBe(401);
    const wrongCode = '000000' === freshCode(approver.factorSecret) ? '111111' : '000000';
    codes.add(wrongCode);
    expect((await signIn(approver.login, approver.password, wrongCode)).status).toBe(401);

    // The Admin's first sign-in: the secret is shown once, confirmed with a code, then a new password (3.2).
    const first = await signIn(admin.login, admin.password);
    expect(first.body).toEqual({ outcome: 'enrolment-required' });
    const adminCookieFirst = cookieOf(first);
    const started = await call('POST', '/api/access/enrolment/start', { cookie: adminCookieFirst, showsSecret: true });
    expect(started.status).toBe(200);
    const shown = started.body as { secret: string; otpauthUri: string };
    const adminSecret = base32Decode(shown.secret);
    addFactorSecret(adminSecret);
    secrets.add(shown.otpauthUri);
    const confirmed = await call('POST', '/api/access/enrolment/confirm', {
      body: { totpCode: freshCode(adminSecret) },
      cookie: adminCookieFirst,
    });
    expect(confirmed.status).toBe(200);
    const adminPassword = 'SYNTHETIC-admin-own-password-1';
    secrets.add(adminPassword);
    const changed = await call('POST', '/api/access/password/change', {
      body: { newPassword: adminPassword, totpCode: freshCode(adminSecret) },
      cookie: adminCookieFirst,
    });
    expect(changed.status).toBe(200);
    const adminSignIn = await signIn(admin.login, adminPassword, freshCode(adminSecret));
    expect(adminSignIn.status).toBe(200);
    const adminCookie = cookieOf(adminSignIn);
    const approverCookie = cookieOf(await signIn(approver.login, approver.password, freshCode(approver.factorSecret)));

    // The reason list (approve and reject kinds), each decided with free text (POL-02.23, DEC-104).
    const reasonIds: Record<string, string> = {};
    for (const kind of ['approve', 'reject'] as const) {
      const reason = await call('POST', '/api/access/approval-reasons', {
        body: { code: `SYN-${kind.toUpperCase()}`, kind, text: `SYNTHETIC ${kind}`, validFrom: today() },
        cookie: adminCookie,
      });
      expect(reason.status).toBe(200);
      const answer = reason.body as { reasonId: string; versionId: string; requestId: string };
      const decided = await call('POST', `/api/access/approval-requests/${answer.requestId}/decision`, {
        body: {
          versionId: answer.versionId,
          outcome: 'approve',
          reason: { kind: 'free-text', text: 'SYNTHETIC first list' },
          totpCode: freshCode(approver.factorSecret),
        },
        cookie: approverCookie,
      });
      expect(decided.status).toBe(200);
      reasonIds[kind] = answer.reasonId;
    }

    // A new user with a temporary password typed by the Admin (3.2; DEC-112).
    const userTemporary = 'SYNTHETIC-new-user-temporary-1';
    secrets.add(userTemporary);
    const user = await call('POST', '/api/access/users', {
      body: {
        login: `syn-leak-${String(randomInt(1_000_000))}`,
        displayName: 'SYNTHETIC leak user',
        personas: ['P-AUD'],
        temporaryPassword: userTemporary,
      },
      cookie: adminCookie,
    });
    expect(user.status).toBe(200);
    const prepared = user.body as { userId: string; versionId: string; requestId: string };
    await eventually(
      async () =>
        (await owner('select id from inbox.work_item where owner_record_id = $1', [prepared.requestId])).length === 1,
    );

    // S1-F01-AT14 through the API: the decision under one key, then the same key with changed content is refused
    // and kept for investigation, with no second effect (PRD-INT-002; code-house-rules 12.4).
    const key = uuidv7();
    const decisionPath = `/api/access/approval-requests/${prepared.requestId}/decision`;
    const body = {
      versionId: prepared.versionId,
      outcome: 'approve',
      reason: { kind: 'listed', reasonId: reasonIds.approve },
      totpCode: freshCode(approver.factorSecret),
    };
    const decided = await call('POST', decisionPath, { body, cookie: approverCookie, key });
    expect(decided.status).toBe(200);
    const changedContent = await call('POST', decisionPath, {
      body: {
        ...body,
        reason: { kind: 'listed', reasonId: reasonIds.reject },
        totpCode: freshCode(approver.factorSecret),
      },
      cookie: approverCookie,
      key,
    });
    expect(changedContent.status).toBe(409);
    expect(errorEnvelopeSchema.parse(changedContent.body).error.code).toBe('kernel.idempotency-key-reused');
    expect(changedContent.headers.get(IDEMPOTENT_REPLAYED_HEADER)).toBeNull();
    expect(
      await owner(
        `select c.id from kernel.idempotency_conflict c join kernel.idempotency_key k on k.id = c.idempotency_key_id
         where k.idempotency_key = $1 and c.reason = 'content-changed'`,
        [key],
      ),
    ).toHaveLength(1);
    expect(
      await owner('select id from access.approval_decision where approval_request_id = $1', [prepared.requestId]),
    ).toHaveLength(1);

    // A reset of that user's password by the Admin, with a fresh code and a new temporary password (3.2, 3.3).
    const resetTemporary = 'SYNTHETIC-reset-temporary-1';
    secrets.add(resetTemporary);
    const reset = await call('POST', `/api/access/users/${prepared.userId}/credential-reset`, {
      body: { reset: 'password', temporaryPassword: resetTemporary, totpCode: freshCode(adminSecret) },
      cookie: adminCookie,
    });
    expect(reset.status).toBe(200);

    // The Admin's session locks past its idle limit; a wrong password and then the right one unlock it (3.3).
    clock.advance(SYNTHETIC_LIMITS.idleLockSeconds + 1);
    const locked = await call('GET', '/api/access/session', { cookie: adminCookie });
    expect(errorEnvelopeSchema.parse(locked.body).error.code).toBe('access.session-locked');
    const wrongUnlock = 'SYNTHETIC-wrong-unlock-1';
    secrets.add(wrongUnlock);
    expect(
      (await call('POST', '/api/access/unlock', { body: { password: wrongUnlock }, cookie: adminCookie })).status,
    ).toBe(401);
    expect(
      (await call('POST', '/api/access/unlock', { body: { password: adminPassword }, cookie: adminCookie })).status,
    ).toBe(200);
    await eventually(
      async () =>
        (
          await owner<{ open: boolean }>('select open from inbox.work_item where owner_record_id = $1', [
            prepared.requestId,
          ])
        )[0]?.open === false,
    );

    // Now search everything.
    const places: Record<string, string> = {
      'the service log': api.logText(),
      'the worker log': JSON.stringify(workerLog.lines),
      'the answers and errors': answers.join('\n'),
      'the database': await everyRow(),
    };
    expect(places['the database']).toContain('audit.audit_record');
    expect(places['the database']).toContain('kernel.outbox_event');
    const found: string[] = [];
    for (const [where, text] of Object.entries(places)) {
      for (const secret of secrets) if (text.includes(secret)) found.push(`a secret in ${where}`);
      // A code is six digits; a leaked one would stand as a JSON string of its own.
      for (const given of codes) if (text.includes(`"${given}"`)) found.push(`a code in ${where}`);
    }
    expect(found).toEqual([]);
    expect(secrets.size).toBeGreaterThan(10);
  });
});
