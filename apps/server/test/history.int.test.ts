import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  accessHistoryPageSchema,
  auditHistoryPageSchema,
  errorEnvelopeSchema,
  HISTORY_PAGE_CAP,
  type PersonaId,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CommandRunner,
  newCorrelationId,
  OrganisationRouter,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import { Audit, type AuditEntry } from '../src/modules/audit/index.js';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  syntheticTimezone,
  SYNTHETIC_ORIGIN,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { capturingLogger } from './support/jobs.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { databaseUrl } from './support/postgres.js';

// S1-F01-T18: the history reads behind the history screens (numbering-and-audit 4.5, 5, 7 test 12; access-and-approvals
// 6, 7.2, 9.11; code-house-rules 12.1 "Reads"; module-map 4.3 "Stage 1 report: access history"). Through the whole
// application, as the screens call it, as the runtime role. Every value here is SYNTHETIC.

/** A SYNTHETIC cost value: it must never reach a reader whose assignment does not grant the cost field class. */
const SYNTHETIC_COST = 'SYNTHETIC-COST-4242';

let world: SyntheticWorld;
let database: string;
let router: OrganisationRouter;
let routed: RoutedOrganisation;
let api: AccessTestApp;
let keys: Record<string, string>;
let writer: SyntheticUser;
const log = capturingLogger();
const audit = new Audit(log.logger);

beforeAll(async () => {
  world = await createSyntheticOrganisations('history');
  database = world.organisations[0].database;
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    log.logger,
  );
  const found = await router.resolveForSignIn(world.organisations[0].code);
  if (!found.routed) throw new Error('not routed');
  routed = found.organisation;
  keys = syntheticKeysEnvironment(world);
  await writeSyntheticSetting(database, 'access.sign-in-throttling', { failureLimit: 50, windowSeconds: 600 });
  await writeSyntheticSetting(database, 'access.password-rules', { minimumLength: 12 });
  // SYNTHETIC office session limits: sign-in is unavailable without them (S1-F01-T09).
  await writeSyntheticSetting(database, 'access.office-session-limits', {
    idleLockSeconds: 1800,
    absoluteSeconds: 28800,
  });
  writer = await writeSyntheticUser(database, routed.organisationCode, keys, { label: 'WRITER' });
  api = await startAccessApp(world, keys);
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (router as OrganisationRouter | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

/** Runs a command as the writer, as a module does when it records a change. */
function asWriter<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
  const runner = new CommandRunner({
    clock: { now: () => new Date() },
    timezones: syntheticTimezone,
    logger: log.logger,
  });
  return runner.run(
    {
      commandName: 'access.synthetic-test',
      organisation: routed,
      correlationId: newCorrelationId(),
      actor: { kind: 'actor', actorId: writer.id },
    },
    work,
  );
}

function change(type: 'role' | 'role_assignment', id: string, overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    actor: { kind: 'user', id: writer.id },
    record: { module: 'access', type, id },
    operation: 'prepare',
    changes: [{ kind: 'value', field: 'name', before: null, after: 'SYNTHETIC role' }],
    reason: 'SYNTHETIC reason',
    source: { kind: 'screen' },
    ...overrides,
  };
}

async function signedIn(
  label: string,
  authorities: readonly SyntheticAuthority[],
  options: Parameters<typeof grantSynthetic>[3] = {},
  personas: PersonaId[] = ['P-AUD'],
): Promise<{ user: SyntheticUser; cookie: string }> {
  const user = await writeSyntheticUser(database, routed.organisationCode, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
    personas,
  });
  if (authorities.length > 0) await grantSynthetic(database, { kind: 'user', id: user.id }, authorities, options);
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.18' },
    body: JSON.stringify({
      organisationCode: routed.organisationCode,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0)),
    }),
  });
  expect(response.status).toBe(200);
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  return { user, cookie };
}

function get(path: string, query: Record<string, string>, cookie: string) {
  return fetch(`${api.baseUrl}${path}?${new URLSearchParams(query).toString()}`, { headers: { cookie } });
}

const VIEW_HISTORY: SyntheticAuthority = { recordType: 'audit.audit_record', action: 'view' };
const VIEW_ROLES: SyntheticAuthority = { recordType: 'access.role', action: 'view' };
const VIEW_ACCESS_RECORDS: SyntheticAuthority = { recordType: 'audit.access_record', action: 'view' };

describe('the history of a record (numbering-and-audit 4.5; PRD-SEC-005, PRD-ACS-013)', () => {
  it('PRD-ACS-013 PRD-PRF-004 gives the record history oldest first, with names, reason, versions and the time read', async () => {
    const roleId = uuidv7();
    const versionId = uuidv7();
    await asWriter((c) => audit.record(c, change('role', roleId, { operation: 'prepare-role' })));
    await asWriter((c) =>
      audit.record(
        c,
        change('role', roleId, {
          operation: 'approve-role-version',
          record: { module: 'access', type: 'role', id: roleId, versionId },
        }),
      ),
    );
    const { cookie } = await signedIn('READER', [VIEW_HISTORY, VIEW_ROLES]);
    const before = Date.now();
    const response = await get('/api/access/history/record', { recordType: 'access.role', recordId: roleId }, cookie);
    expect(response.status).toBe(200);
    const page = auditHistoryPageSchema.parse(await response.json());
    expect(page.entries.map((entry) => entry.operation)).toEqual(['prepare-role', 'approve-role-version']);
    expect(page.entries[1]).toMatchObject({
      actor: { kind: 'user', id: writer.id, name: writer.displayName },
      onBehalfOf: null,
      recordType: 'access.role',
      recordId: roleId,
      versionId,
      reason: 'SYNTHETIC reason',
      source: { kind: 'screen', reference: null, row: null },
    });
    expect(page.next).toBeNull();
    expect(Math.abs(Date.parse(page.asOf) - before)).toBeLessThan(60_000);
  });

  it('PRD-UXP-003 refuses a reader with no view on the record type, naming the missing permission', async () => {
    const { cookie } = await signedIn('NOTYPE', [VIEW_HISTORY]);
    const response = await get(
      '/api/access/history/record',
      { recordType: 'access.role_assignment', recordId: uuidv7() },
      cookie,
    );
    expect(response.status).toBe(403);
    expect(errorEnvelopeSchema.parse(await response.json()).error).toMatchObject({
      code: 'access.not-authorised',
      missing: [{ kind: 'permission', recordType: 'access.role_assignment', action: 'view' }],
    });
  });

  it('PRD-UXP-003 refuses a reader with no view on history, naming the missing permission', async () => {
    const { cookie } = await signedIn('NOHISTORY', [VIEW_ROLES]);
    const response = await get('/api/access/history/record', { recordType: 'access.role', recordId: uuidv7() }, cookie);
    expect(response.status).toBe(403);
    expect(errorEnvelopeSchema.parse(await response.json()).error).toMatchObject({
      missing: [{ kind: 'permission', recordType: 'audit.audit_record', action: 'view' }],
    });
  });

  it('PRD-ACS-008 PRD-SEC-006 masks a restricted value unless the same assignment grants its field class', async () => {
    const roleId = uuidv7();
    await asWriter((c) =>
      audit.record(
        c,
        change('role', roleId, {
          changes: [
            { kind: 'restricted', field: 'cost', fieldClass: 'cost', before: null, after: SYNTHETIC_COST },
            {
              kind: 'encrypted',
              field: 'bank',
              fieldClass: 'bank-details',
              before: { kind: 'absent' },
              after: { kind: 'not-kept' },
            },
            { kind: 'secret', field: 'password' },
          ],
        }),
      ),
    );
    const query = { recordType: 'access.role', recordId: roleId };
    const masked = await signedIn('MASKED', [VIEW_HISTORY, VIEW_ROLES]);
    const maskedResponse = await get('/api/access/history/record', query, masked.cookie);
    const maskedText = await maskedResponse.text();
    expect(maskedText).not.toContain(SYNTHETIC_COST);
    expect(auditHistoryPageSchema.parse(JSON.parse(maskedText)).entries[0]?.changes).toEqual([
      { kind: 'masked', field: 'cost', fieldClass: 'cost' },
      {
        kind: 'encrypted',
        field: 'bank',
        fieldClass: 'bank-details',
        before: { kind: 'absent' },
        after: { kind: 'not-kept' },
      },
      { kind: 'secret', field: 'password' },
    ]);
    const shown = await signedIn('SHOWN', [VIEW_HISTORY, VIEW_ROLES], {
      fieldClasses: [{ fieldClass: 'cost', access: 'view' }],
    });
    const shownPage = auditHistoryPageSchema.parse(
      await (await get('/api/access/history/record', query, shown.cookie)).json(),
    );
    expect(shownPage.entries[0]?.changes[0]).toEqual({
      kind: 'restricted',
      field: 'cost',
      fieldClass: 'cost',
      before: null,
      after: SYNTHETIC_COST,
    });
  });

  it('pages a long history by its cursor, at most the page cap at a time', async () => {
    const roleId = uuidv7();
    await asWriter(async (c) => {
      for (let index = 0; index <= HISTORY_PAGE_CAP; index++) {
        await audit.record(c, change('role', roleId, { operation: `step-${String(index)}` }));
      }
    });
    const { cookie } = await signedIn('PAGER', [VIEW_HISTORY, VIEW_ROLES]);
    const query = { recordType: 'access.role', recordId: roleId };
    const first = auditHistoryPageSchema.parse(await (await get('/api/access/history/record', query, cookie)).json());
    expect(first.entries).toHaveLength(HISTORY_PAGE_CAP);
    expect(first.next).not.toBeNull();
    const second = auditHistoryPageSchema.parse(
      await (await get('/api/access/history/record', { ...query, after: first.next ?? '' }, cookie)).json(),
    );
    expect(second.entries).toHaveLength(1);
    expect(second.next).toBeNull();
    // Rows written in one transaction share recorded_at, and UUIDv7 ids within one millisecond
    // have no promised order, so check the two pages together hold every row exactly once.
    const operations = [...first.entries, ...second.entries].map((entry) => entry.operation);
    expect(new Set(operations).size).toBe(HISTORY_PAGE_CAP + 1);
    expect(operations.sort()).toEqual(
      Array.from({ length: HISTORY_PAGE_CAP + 1 }, (_, index) => `step-${String(index)}`).sort(),
    );
  });
});

describe('the history of an actor (numbering-and-audit 4.5; PRD-SEC-005)', () => {
  it('PRD-SEC-005 gives only the changes on record types the reader may view', async () => {
    const actorUser = await writeSyntheticUser(database, routed.organisationCode, keys, { label: 'ACTOR' });
    const runner = new CommandRunner({
      clock: { now: () => new Date() },
      timezones: syntheticTimezone,
      logger: log.logger,
    });
    const roleId = uuidv7();
    await runner.run(
      {
        commandName: 'access.synthetic-test',
        organisation: routed,
        correlationId: newCorrelationId(),
        actor: { kind: 'actor', actorId: actorUser.id },
      },
      async (c) => {
        await audit.record(c, change('role', roleId, { actor: { kind: 'user', id: actorUser.id } }));
        await audit.record(c, change('role_assignment', uuidv7(), { actor: { kind: 'user', id: actorUser.id } }));
      },
    );
    const { cookie } = await signedIn('ACTORREADER', [VIEW_HISTORY, VIEW_ROLES]);
    const page = auditHistoryPageSchema.parse(
      await (await get('/api/access/history/actor', { actorId: actorUser.id }, cookie)).json(),
    );
    expect(page.entries.map((entry) => [entry.recordType, entry.recordId])).toEqual([['access.role', roleId]]);
  });
});

describe('the access history report (numbering-and-audit 5; access-and-approvals 9.11)', () => {
  it('PRD-SEC-007 gives the sign-ins, newest first, with the user named, and of one user on asking', async () => {
    const { user, cookie } = await signedIn('ACCESSREADER', [VIEW_ACCESS_RECORDS]);
    const all = accessHistoryPageSchema.parse(
      await (await get('/api/access/history/access-records', {}, cookie)).json(),
    );
    expect(all.entries[0]).toMatchObject({
      kind: 'sign-in',
      outcome: 'succeeded',
      user: { kind: 'user', id: user.id, name: user.displayName },
      networkAddress: '10.9.9.18',
    });
    const times = all.entries.map((entry) => entry.recordedAt);
    expect([...times].sort().reverse()).toEqual(times);
    const own = accessHistoryPageSchema.parse(
      await (await get('/api/access/history/access-records', { userId: user.id }, cookie)).json(),
    );
    expect(own.entries.length).toBeGreaterThan(0);
    expect(own.entries.every((entry) => entry.user?.id === user.id)).toBe(true);
  });

  it('numbering-and-audit 5.1 names what a permission change changed, only where the reader may read its audit record', async () => {
    const roleId = uuidv7();
    await asWriter(async (context) => {
      const auditRecord = await audit.record(context, change('role', roleId, { operation: 'approve-role-version' }));
      await audit.recordAccess(context, { kind: 'permission-changed', outcome: 'succeeded', auditRecord });
    });
    const permissionChange = (entries: { kind: string; auditRecordId: string | null }[], id: string | undefined) =>
      entries.find((entry) => entry.kind === 'permission-changed' && entry.auditRecordId === id);
    const full = await signedIn('CHANGEREADER', [VIEW_ACCESS_RECORDS, VIEW_HISTORY, VIEW_ROLES]);
    const shown = accessHistoryPageSchema.parse(
      await (await get('/api/access/history/access-records', {}, full.cookie)).json(),
    );
    const row = shown.entries.find((entry) => entry.change?.operation === 'approve-role-version');
    expect(row).toMatchObject({
      kind: 'permission-changed',
      user: null,
      change: { recordType: 'access.role', operation: 'approve-role-version' },
    });
    // PRD-SEC-005: a reader who may not read that audit record sees the permission change, but not what it changed.
    const bare = await signedIn('BAREREADER', [VIEW_ACCESS_RECORDS]);
    const hidden = accessHistoryPageSchema.parse(
      await (await get('/api/access/history/access-records', {}, bare.cookie)).json(),
    );
    expect(permissionChange(hidden.entries, row?.auditRecordId ?? undefined)).toMatchObject({ change: null });
  });

  it('PRD-UXP-003 refuses a reader with no view on access records, and sensitive access apart, naming each missing permission', async () => {
    const { cookie } = await signedIn('NOACCESS', [VIEW_HISTORY]);
    const refused = await get('/api/access/history/access-records', {}, cookie);
    expect(refused.status).toBe(403);
    expect(errorEnvelopeSchema.parse(await refused.json()).error).toMatchObject({
      missing: [{ kind: 'permission', recordType: 'audit.access_record', action: 'view' }],
    });
    const reader = await signedIn('NOSENSITIVE', [VIEW_ACCESS_RECORDS]);
    const sensitive = await get('/api/access/history/sensitive-access-records', {}, reader.cookie);
    expect(sensitive.status).toBe(403);
    expect(errorEnvelopeSchema.parse(await sensitive.json()).error).toMatchObject({
      missing: [{ kind: 'permission', recordType: 'audit.sensitive_access_record', action: 'view' }],
    });
  });
});
