import { Writable } from 'node:stream';
import { sql } from 'drizzle-orm';
import type { Client } from 'pg';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CommandRunner,
  newCorrelationId,
  OrganisationRouter,
  PinoLoggerService,
  timezoneNotConfigured,
  type ActorSetting,
  type Clock,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import { Audit, AuditChangeRefused, type AuditEntry } from '../src/modules/audit/index.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl, sqlState } from './support/postgres.js';

// S1-F01-T07: audit and access records (numbering-and-audit 4, 5 and 7; module-map 4.5). Commands run as the
// runtime role through Organisation routing, as the application does (code-house-rules 10.1); rows are checked as
// the owner, which row-level security does not filter. syn_audit.change is a scratch table made by test setup in this
// file's own database copies, standing in for a module's record; it is no part of any migration set.

// SYNTHETIC identifiers of this file only.
const USER_A = '01900000-0000-7000-8000-0000000a7001';
const USER_B = '01900000-0000-7000-8000-0000000a7002';
const SERVICE = '01900000-0000-7000-8000-0000000a7003';
const RECORD_1 = '01900000-0000-7000-8000-0000000a7101';
const RECORD_2 = '01900000-0000-7000-8000-0000000a7102';
const VERSION_OLD = '01900000-0000-7000-8000-0000000a7201';
const VERSION_NEW = '01900000-0000-7000-8000-0000000a7202';
const SITE_1 = '01900000-0000-7000-8000-0000000a7301';
/** SYNTHETIC secrets: they must never be found in an audit or access row. */
const SYNTHETIC_PASSWORD = 'SYNTHETIC-password-never-stored';
const SYNTHETIC_BANK_ACCOUNT = 'SYNTHETIC-000111222333';

const SCRATCH = `
  create schema syn_audit;
  grant usage on schema syn_audit to aos_runtime;
  create table syn_audit.change (id uuid primary key, note text not null);
  grant select, insert on syn_audit.change to aos_runtime;
`;

let world: SyntheticWorld;
let organisationA: string;
let router: OrganisationRouter;
let routedA: RoutedOrganisation;
let routedB: RoutedOrganisation;
const logLines: string[] = [];
const logger = new PinoLoggerService(pino(sink()));
const audit = new Audit(logger);

beforeAll(async () => {
  world = await createSyntheticOrganisations('audit');
  organisationA = world.organisations[0].database;
  for (const organisation of world.organisations) await asOwner(organisation.database, (c) => c.query(SCRATCH));
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    logger,
  );
  routedA = await routed(world.organisations[0].code);
  routedB = await routed(world.organisations[1].code);
});

afterAll(async () => {
  await (router as OrganisationRouter | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

async function routed(code: string): Promise<RoutedOrganisation> {
  const result = await router.resolveForSignIn(code);
  if (!result.routed) throw new Error(`${code} was not routed`);
  return result.organisation;
}

function sink(): Writable {
  return new Writable({
    write(chunk: Buffer, _encoding, done) {
      logLines.push(
        ...chunk
          .toString('utf8')
          .split('\n')
          .filter((line) => line !== ''),
      );
      done();
    },
  });
}

function runner(clock?: Clock): CommandRunner {
  return new CommandRunner({ clock: clock ?? { now: () => new Date() }, timezones: timezoneNotConfigured, logger });
}

const asActor = (actorId: string): ActorSetting => ({ kind: 'actor', actorId });

function command<T>(
  work: (context: TransactionContext) => Promise<T>,
  options: { actor?: ActorSetting; organisation?: RoutedOrganisation; clock?: Clock } = {},
): Promise<T> {
  return runner(options.clock).run(
    {
      commandName: 'audit.synthetic-command',
      organisation: options.organisation ?? routedA,
      correlationId: newCorrelationId(),
      actor: options.actor ?? asActor(USER_A),
    },
    work,
  );
}

async function asOwner<T>(database: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(database, 'migration');
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function asSuperuser<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(organisationA, 'superuser');
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function auditRowsFor(recordId: string, database = organisationA): Promise<Record<string, unknown>[]> {
  return asOwner(
    database,
    async (c) =>
      (await c.query<Record<string, unknown>>('select * from audit.audit_record where record_id = $1', [recordId]))
        .rows,
  );
}

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    actor: { kind: 'user', id: USER_A },
    record: { module: 'syn-audit', type: 'syn_audit.change', id: RECORD_1 },
    operation: 'create',
    changes: [{ kind: 'value', field: 'note', before: null, after: 'SYNTHETIC note' }],
    source: { kind: 'screen', reference: 'SYNTHETIC screen' },
    ...overrides,
  };
}

describe('Record (numbering-and-audit 4.1, 4.2)', () => {
  it('numbering-and-audit 7 test 8 PRD-INT-004 an audit record commits with its change; a rollback leaves neither', async () => {
    const committed = '01900000-0000-7000-8000-0000000a7401';
    const rolledBack = '01900000-0000-7000-8000-0000000a7402';
    await command(async (context) => {
      await context.tx.execute(sql`insert into syn_audit.change values (${committed}, 'SYNTHETIC kept')`);
      await audit.record(context, entry({ record: { module: 'syn-audit', type: 'syn_audit.change', id: committed } }));
    });
    await expect(
      command(async (context) => {
        await context.tx.execute(sql`insert into syn_audit.change values (${rolledBack}, 'SYNTHETIC lost')`);
        await audit.record(
          context,
          entry({ record: { module: 'syn-audit', type: 'syn_audit.change', id: rolledBack } }),
        );
        throw new Error('SYNTHETIC failure after the change');
      }),
    ).rejects.toThrow('SYNTHETIC failure after the change');

    expect(await auditRowsFor(committed)).toHaveLength(1);
    expect(await auditRowsFor(rolledBack)).toEqual([]);
    const changes = await asOwner(
      organisationA,
      async (c) =>
        (
          await c.query<{ id: string }>('select id from syn_audit.change where id = any($1) order by id', [
            [committed, rolledBack],
          ])
        ).rows,
    );
    expect(changes).toEqual([{ id: committed }]);
  });

  it('PRD-ACS-013 keeps the actor, times, scope, record, operation, changes, reason, source, approval and request', async () => {
    const record = '01900000-0000-7000-8000-0000000a7403';
    const correlationId = newCorrelationId();
    const occurredAt = new Date('2026-10-01T04:30:00Z');
    await runner().run(
      { commandName: 'audit.synthetic-command', organisation: routedA, correlationId, actor: asActor(SERVICE) },
      (context) =>
        audit.record(context, {
          actor: { kind: 'service-identity', id: SERVICE, onBehalfOfUserId: USER_B },
          roleAssignmentId: VERSION_OLD,
          occurredAt,
          scope: { siteId: SITE_1 },
          record: { module: 'syn-audit', type: 'syn_audit.change', id: record, versionId: VERSION_NEW },
          operation: 'post',
          changes: [{ kind: 'value', field: 'state', before: 'Approved', after: 'Posted' }],
          reason: 'SYNTHETIC reason',
          source: { kind: 'import', reference: 'SYNTHETIC-batch', row: 7 },
          approval: { decisionId: VERSION_OLD, useId: VERSION_NEW },
          idempotencyKey: 'SYNTHETIC-key',
        }),
    );
    const [row] = await auditRowsFor(record);
    expect(row).toMatchObject({
      actor_kind: 'service-identity',
      actor_id: SERVICE,
      on_behalf_of_user_id: USER_B,
      role_assignment_id: VERSION_OLD,
      occurred_at: occurredAt,
      // No timezone is set yet, so the business date is Unknown, never a guess (PRD-MOD-009, PRD-MOD-015).
      business_date: null,
      site_id: SITE_1,
      store_id: null,
      record_module: 'syn-audit',
      record_version_id: VERSION_NEW,
      operation: 'post',
      changes_format: 'audit-changes/1',
      changes: [{ kind: 'value', field: 'state', before: 'Approved', after: 'Posted' }],
      reason: 'SYNTHETIC reason',
      source_kind: 'import',
      source_reference: 'SYNTHETIC-batch',
      source_row: 7,
      approval_decision_id: VERSION_OLD,
      approval_use_id: VERSION_NEW,
      idempotency_key: 'SYNTHETIC-key',
      correlation_id: correlationId,
    });
    expect(row?.recorded_at).toBeInstanceOf(Date);
  });

  it('PRD-SEC-018 refuses a record that names an actor other than the one the command runs as', async () => {
    await expect(
      command((context) => audit.record(context, entry({ actor: { kind: 'user', id: USER_B } }))),
    ).rejects.toThrow(/names the actor the command runs as/);
  });

  it('code-house-rules 6.3 is written on the sign-in path with no actor set, asking for no row back', async () => {
    const record = '01900000-0000-7000-8000-0000000a7404';
    await command(
      (context) =>
        audit.record(
          context,
          entry({
            record: { module: 'access', type: 'access.password_credential', id: record },
            operation: 'change-password',
            changes: [{ kind: 'secret', field: 'passwordHash' }],
          }),
        ),
      { actor: { kind: 'no-actor', path: 'sign-in' } },
    );
    expect(await auditRowsFor(record)).toHaveLength(1);
  });

  it('numbering-and-audit 7 test 11 PRD-SEC-006 an encrypted value never appears in an audit record', async () => {
    const record = '01900000-0000-7000-8000-0000000a7405';
    await command((context) =>
      audit.record(
        context,
        entry({
          record: { module: 'syn-audit', type: 'syn_audit.change', id: record },
          operation: 'change-bank-details',
          changes: [
            {
              kind: 'encrypted',
              field: 'bankAccount',
              fieldClass: 'bank-details',
              before: { kind: 'version', versionId: VERSION_OLD },
              after: { kind: 'version', versionId: VERSION_NEW },
            },
            { kind: 'secret', field: 'passwordHash' },
          ],
        }),
      ),
    );
    const text = await asOwner(
      organisationA,
      async (c) =>
        (
          await c.query<{ text: string }>('select r::text as text from audit.audit_record r where record_id = $1', [
            record,
          ])
        ).rows[0]?.text,
    );
    expect(text).toContain(VERSION_OLD);
    expect(text).toContain(VERSION_NEW);
    expect(text).not.toContain(SYNTHETIC_BANK_ACCOUNT);
    expect(text).not.toContain(SYNTHETIC_PASSWORD);

    // A value carried by mistake, or a hash in a plain value, is refused and nothing is written.
    const hash = `$argon2id$v=19$m=65536,t=3,p=4$SYNTHETIC$${SYNTHETIC_PASSWORD}`;
    const refused = '01900000-0000-7000-8000-0000000a7406';
    await expect(
      command((context) =>
        audit.record(
          context,
          entry({
            record: { module: 'syn-audit', type: 'syn_audit.change', id: refused },
            changes: [{ kind: 'value', field: 'credential', before: null, after: hash }],
          }),
        ),
      ),
    ).rejects.toThrow(AuditChangeRefused);
    await expect(
      command((context) =>
        audit.record(
          context,
          entry({
            record: { module: 'syn-audit', type: 'syn_audit.change', id: refused },
            changes: [
              {
                kind: 'encrypted',
                field: 'bankAccount',
                fieldClass: 'bank-details',
                before: { kind: 'absent' },
                after: { kind: 'absent' },
                value: SYNTHETIC_BANK_ACCOUNT,
              } as never,
            ],
          }),
        ),
      ),
    ).rejects.toThrow(AuditChangeRefused);
    expect(await auditRowsFor(refused)).toEqual([]);
  });

  it('PRD-MOD-001 a record written in one Organisation is not in the other', async () => {
    const record = '01900000-0000-7000-8000-0000000a7407';
    await command(
      (context) =>
        audit.record(context, entry({ record: { module: 'syn-audit', type: 'syn_audit.change', id: record } })),
      {
        organisation: routedB,
      },
    );
    expect(await auditRowsFor(record, world.organisations[1].database)).toHaveLength(1);
    expect(await auditRowsFor(record)).toEqual([]);
  });
});

describe('Record access (numbering-and-audit 5)', () => {
  it('numbering-and-audit 7 test 13 PRD-SEC-014 a failed sign-in with an unmatched login keeps no user, password or login', async () => {
    const correlationId = newCorrelationId();
    await runner().run(
      {
        commandName: 'access.synthetic-sign-in',
        organisation: routedA,
        correlationId,
        actor: { kind: 'no-actor', path: 'sign-in' },
      },
      (context) => audit.recordAccess(context, { kind: 'sign-in', outcome: 'refused', networkAddress: '192.0.2.10' }),
    );
    const rows = await asOwner(
      organisationA,
      async (c) =>
        (
          await c.query(
            'select r::text as text, user_id, outcome, network_address from audit.access_record r where correlation_id = $1',
            [correlationId],
          )
        ).rows as { text: string; user_id: string | null; outcome: string; network_address: string }[],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: null, outcome: 'refused', network_address: '192.0.2.10' });
    expect(rows[0]?.text).not.toContain(SYNTHETIC_PASSWORD);
  });

  it('PRD-SEC-007 a permission change points to its audit record, and cannot be written without one', async () => {
    const record = '01900000-0000-7000-8000-0000000a7408';
    await command(async (context) => {
      const auditRecord = await audit.record(
        context,
        entry({ record: { module: 'access', type: 'access.role_assignment', id: record }, operation: 'decide' }),
      );
      await audit.recordAccess(context, {
        kind: 'permission-changed',
        outcome: 'succeeded',
        userId: USER_B,
        auditRecord,
      });
    });
    const linked = await asOwner(
      organisationA,
      async (c) =>
        (
          await c.query<Record<string, unknown>>(
            `select a.kind from audit.access_record a join audit.audit_record r
           on r.id = a.audit_record_id and r.recorded_at = a.recorded_at where r.record_id = $1`,
            [record],
          )
        ).rows,
    );
    expect(linked).toEqual([{ kind: 'permission-changed' }]);

    expect(
      await sqlState(
        command((context) =>
          context.tx.execute(sql`
            insert into audit.access_record (id, occurred_at, kind, outcome, correlation_id)
            values (${VERSION_OLD}, now(), 'permission-changed', 'succeeded', ${newCorrelationId()})`),
        ),
      ),
    ).toBe('23514');
  });

  it('PRD-SEC-007 sensitive access names the record, the field class and whether it was shown or exported', async () => {
    const correlationId = newCorrelationId();
    await runner().run(
      { commandName: 'audit.synthetic-command', organisation: routedA, correlationId, actor: asActor(USER_A) },
      (context) =>
        audit.recordAccess(context, {
          kind: 'sensitive-access',
          outcome: 'succeeded',
          userId: USER_A,
          record: { module: 'syn-audit', type: 'syn_audit.change', id: RECORD_2 },
          fieldClass: 'bank-details',
          exposure: 'shown',
          scope: { siteId: SITE_1 },
        }),
    );
    const rows = await asOwner(
      organisationA,
      async (c) =>
        (
          await c.query<Record<string, unknown>>(
            'select kind, record_id, field_class, exposure, site_id from audit.access_record where correlation_id = $1',
            [correlationId],
          )
        ).rows,
    );
    expect(rows).toEqual([
      {
        kind: 'sensitive-access',
        record_id: RECORD_2,
        field_class: 'bank-details',
        exposure: 'shown',
        site_id: SITE_1,
      },
    ]);
  });
});

describe('protection (numbering-and-audit 4.4)', () => {
  it('numbering-and-audit 7 test 9 PRD-SEC-007 the runtime role cannot update, delete or truncate an audit or access record', async () => {
    for (const table of ['audit.audit_record', 'audit.access_record']) {
      for (const statement of [`update ${table} set id = id`, `delete from ${table}`, `truncate ${table}`]) {
        expect(await sqlState(command((context) => context.tx.execute(sql.raw(statement)))), statement).toBe('42501');
      }
    }
  });

  it('PRD-MOD-011 the append-only guard stops the owner too, on the table and on each partition', async () => {
    await command(async (context) => {
      await audit.record(context, entry({ record: { module: 'syn-audit', type: 'syn_audit.change', id: RECORD_2 } }));
      await audit.recordAccess(context, { kind: 'sign-out', outcome: 'succeeded', userId: USER_A });
    });
    // The partition of this month, which holds the rows just written.
    const partition = await asOwner(
      organisationA,
      async (c) =>
        (
          await c.query<{ name: string }>(
            `select tableoid::regclass::text as name from audit.access_record order by recorded_at desc limit 1`,
          )
        ).rows[0]?.name ?? '',
    );
    expect(partition).toMatch(/^audit\.access_record_y\d{4}m\d{2}$/);
    for (const statement of [
      'update audit.audit_record set reason = reason',
      'delete from audit.audit_record',
      'delete from audit.access_record',
      'truncate audit.access_record',
      `truncate ${partition}`,
      `delete from ${partition}`,
    ]) {
      const state = await asOwner(organisationA, (c) => sqlState(c.query(statement)));
      expect(state, statement).toBe('AO001');
    }
  });

  it('code-house-rules 9 refuses an insert that names its own recording time, so no row lands in a sealed block', async () => {
    expect(
      await sqlState(
        command((context) =>
          context.tx.execute(sql`
            insert into audit.access_record (id, recorded_at, occurred_at, kind, outcome, correlation_id)
            values (${VERSION_NEW}, now() - interval '1 day', now(), 'sign-out', 'succeeded', ${newCorrelationId()})`),
        ),
      ),
    ).toBe('AO002');
  });
});

describe('sealing and the seal check (numbering-and-audit 4.4)', () => {
  it('numbering-and-audit 7 test 10 PRD-SEC-007 seals closed blocks in a chain, and reports an altered or removed sealed row', async () => {
    await command((context) =>
      audit.record(context, entry({ record: { module: 'syn-audit', type: 'syn_audit.change', id: RECORD_1 } })),
    );
    const first = await command((context) => audit.sealClosedBlock(context));
    expect(first).toEqual(expect.any(Number));
    // Nothing new: nothing to seal.
    expect(await command((context) => audit.sealClosedBlock(context))).toBeNull();
    await command((context) => audit.recordAccess(context, { kind: 'sign-out', outcome: 'succeeded', userId: USER_A }));
    const second = await command((context) => audit.sealClosedBlock(context));
    expect(second).toBe((first ?? 0) + 1);
    expect(await command((context) => audit.checkSeals(context))).toEqual([]);
    // A seal is append-only too (code-house-rules 7.1).
    expect(await asOwner(organisationA, (c) => sqlState(c.query('update audit.audit_seal set hash = hash')))).toBe(
      'AO001',
    );

    // Altered behind the guards, as only a superuser could.
    await asSuperuser(async (c) => {
      await c.query('begin');
      await c.query('set local session_replication_role = replica');
      await c.query(`update audit.audit_record set reason = 'SYNTHETIC tampered' where record_id = $1`, [RECORD_1]);
      await c.query('commit');
    });
    const problems = await command((context) => audit.checkSeals(context));
    expect(problems.map((problem) => problem.problem)).toContain('hash-differs');
    expect(problems.every((problem) => problem.blockNumber <= (second ?? 0))).toBe(true);

    await asSuperuser(async (c) => {
      await c.query('begin');
      await c.query('set local session_replication_role = replica');
      await c.query(`delete from audit.access_record where user_id = $1 and kind = 'sign-out'`, [USER_A]);
      await c.query('commit');
    });
    expect(await command((context) => audit.checkSeals(context))).toContainEqual({
      blockNumber: second,
      problem: 'rows-differ',
    });
  });

  it('PRD-SEC-007 never seals before a transaction still open, so its rows are sealed in a later block', async () => {
    // Seal what organisation B already holds, so the block below starts now.
    await command((context) => audit.sealClosedBlock(context), { organisation: routedB });
    // A transaction that has begun and written a row, but not committed: its row is recorded at its start.
    const open = await connect(world.organisations[1].database, 'runtime');
    const late = '01900000-0000-7000-8000-0000000a7409';
    try {
      await open.query('begin');
      await open.query(
        `insert into audit.access_record (id, occurred_at, kind, outcome, user_id, correlation_id)
         values ($1, now(), 'sign-out', 'succeeded', $2, $3)`,
        [late, USER_B, newCorrelationId()],
      );
      // Rows of other, committed transactions after the open one began.
      await command(
        (context) => audit.recordAccess(context, { kind: 'sign-out', outcome: 'succeeded', userId: USER_A }),
        {
          organisation: routedB,
        },
      );
      expect(await command((context) => audit.sealClosedBlock(context), { organisation: routedB })).toBeNull();
      await open.query('commit');
    } finally {
      await open.end();
    }
    const block = await command((context) => audit.sealClosedBlock(context), { organisation: routedB });
    expect(block).toEqual(expect.any(Number));
    const sealedRows = await asOwner(
      world.organisations[1].database,
      async (c) =>
        (
          await c.query<{ rows: string }>(
            `select (s.access_rows)::text as rows from audit.audit_seal s where s.block_number = $1`,
            [block],
          )
        ).rows[0]?.rows,
    );
    expect(Number(sealedRows)).toBeGreaterThanOrEqual(2);
    expect(await command((context) => audit.checkSeals(context), { organisation: routedB })).toEqual([]);
  });
});

describe('Read history (numbering-and-audit 4.5)', () => {
  it('PRD-SEC-005 shows the runtime role no row while no read policy exists (until S1-F01-T11 adds access.row_visible)', async () => {
    await command((context) =>
      audit.record(context, entry({ record: { module: 'syn-audit', type: 'syn_audit.change', id: RECORD_2 } })),
    );
    const history = await runner().read(
      {
        commandName: 'audit.synthetic-read',
        organisation: routedA,
        correlationId: newCorrelationId(),
        actor: asActor(USER_A),
      },
      (context) =>
        audit.readHistory(context, { of: 'record', module: 'syn-audit', type: 'syn_audit.change', id: RECORD_2 }),
    );
    expect(history).toEqual([]);
  });

  it('returns the history of a record or of an actor, oldest first, under a read policy', async () => {
    // A test-only policy admitting every row, in organisation B's copy only, to prove the query; the scoped policy is
    // T11's (numbering-and-audit 7 test 12).
    const database = world.organisations[1].database;
    const client = await connect(database, 'superuser');
    try {
      await client.query('create policy syn_read_all on audit.audit_record for select to aos_runtime using (true)');
    } finally {
      await client.end();
    }
    const record = '01900000-0000-7000-8000-0000000a7410';
    const target = { module: 'syn-audit', type: 'syn_audit.change', id: record } as const;
    for (const operation of ['create', 'submit']) {
      await command(
        (context) => audit.record(context, entry({ record: target, operation, actor: { kind: 'user', id: USER_B } })),
        {
          organisation: routedB,
          actor: asActor(USER_B),
        },
      );
    }
    const read = <T>(work: (context: TransactionContext) => Promise<T>): Promise<T> =>
      runner().read(
        {
          commandName: 'audit.synthetic-read',
          organisation: routedB,
          correlationId: newCorrelationId(),
          actor: asActor(USER_B),
        },
        work,
      );
    const byRecord = await read((context) => audit.readHistory(context, { of: 'record', ...target }));
    expect(byRecord.map((item) => item.operation)).toEqual(['create', 'submit']);
    expect(byRecord[0]).toMatchObject({
      actor: { kind: 'user', id: USER_B },
      record: target,
      changes: [{ kind: 'value', field: 'note', before: null, after: 'SYNTHETIC note' }],
      source: { kind: 'screen', reference: 'SYNTHETIC screen' },
      businessDate: null,
      approval: null,
    });
    const byActor = await read((context) => audit.readHistory(context, { of: 'actor', actorId: USER_B }));
    expect(byActor.filter((item) => item.record.id === record)).toHaveLength(2);
  });
});

describe('retention (numbering-and-audit 4.6)', () => {
  it('numbering-and-audit 7 test 14 POL-18.05 nothing is deleted while no retention period is set', async () => {
    await command((context) => audit.record(context, entry()));
    const count = (): Promise<string> =>
      asOwner(
        organisationA,
        async (c) =>
          (
            await c.query<{ n: string }>(
              `select ((select count(*) from audit.audit_record) + (select count(*) from audit.access_record))::text as n`,
            )
          ).rows[0]?.n ?? '',
      );
    const before = await count();
    expect(await command((context) => audit.applyRetention(context))).toBe(0);
    expect(await count()).toBe(before);
    const deletions = await asOwner(
      organisationA,
      async (c) => (await c.query<{ id: string }>('select id from audit.retention_deletion')).rows,
    );
    expect(deletions).toEqual([]);
  });
});

describe('partition coverage (numbering-and-audit 4.4; DEC-112, CH-5)', () => {
  it('covers this month and next, and raises the alert when it would not', async () => {
    expect(await command((context) => audit.checkPartitionCoverage(context))).toMatchObject({ coversNextMonth: true });
    expect(logLines.some((line) => line.includes('audit-partitions-short'))).toBe(false);

    // A clock set past the maintained months: the partitions no longer reach next month.
    const later: Clock = { now: () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 31 * 4) };
    const coverage = await command((context) => audit.checkPartitionCoverage(context), { clock: later });
    expect(coverage).toEqual({ coveredUntil: null, coversNextMonth: false });
    expect(logLines.some((line) => line.includes('audit-partitions-short'))).toBe(true);
  });
});
