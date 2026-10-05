import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, migrateDatabase, migrationSetFolder } from '../src/kernel/index.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import {
  connect,
  createOutsiderRole,
  databaseGrants,
  databaseUrl,
  RUNNER_GRANTS,
  sqlState,
} from './support/postgres.js';

// S0-T05: the migration role and the runtime role (code-house-rules 5, 6.2, 7.1, 10.4; deployment.md section 4).
// The tables under syn_guard are made by test setup as the migration role, only to give the rules something to act
// on. They are synthetic and are no part of any migration set.

const ACTOR = '01900000-0000-7000-8000-000000000001'; // SYNTHETIC actor identifier

let world: SyntheticWorld;
let directory: string;
let organisation: string;
let owner: Client;
let runtime: Client;

beforeAll(async () => {
  // The rules act on the first synthetic Organisation's database; the second is there as in every database test
  // (code-house-rules 11.2).
  world = await createSyntheticOrganisations('roles');
  directory = world.directory;
  organisation = world.organisations[0].database;
  owner = await connect(organisation, 'migration');
  await owner.query(`
    create schema syn_guard;
    grant usage on schema syn_guard to aos_runtime;

    -- Append-only with every privilege granted, so only the guard can stop a change.
    create table syn_guard.entry_all_granted (id uuid primary key, note text not null);
    create trigger refuse_row_change before update or delete on syn_guard.entry_all_granted
      for each row execute function kernel.refuse_change();
    create trigger refuse_truncate before truncate on syn_guard.entry_all_granted
      for each statement execute function kernel.refuse_change();
    grant select, insert, update, delete, truncate on syn_guard.entry_all_granted to aos_runtime;

    -- Append-only and locked, granted as code-house-rules 5.2 says.
    create table syn_guard.entry (id uuid primary key, note text not null);
    create trigger refuse_row_change before update or delete on syn_guard.entry
      for each row execute function kernel.refuse_change();
    create trigger refuse_truncate before truncate on syn_guard.entry
      for each statement execute function kernel.refuse_change();
    grant select, insert, update (id) on syn_guard.entry to aos_runtime;

    -- Scoped, with a policy that admits a row only when an actor is set (code-house-rules 6.2).
    create table syn_guard.scoped_row (id uuid primary key, note text not null);
    alter table syn_guard.scoped_row enable row level security;
    create policy row_scope on syn_guard.scoped_row for all to aos_runtime
      using (nullif(current_setting('aos.actor_id', true), '') is not null)
      with check (nullif(current_setting('aos.actor_id', true), '') is not null);
    grant select, insert on syn_guard.scoped_row to aos_runtime;

    insert into syn_guard.entry_all_granted values ('01900000-0000-7000-8000-0000000000a1', 'SYNTHETIC');
    insert into syn_guard.entry values ('01900000-0000-7000-8000-0000000000b1', 'SYNTHETIC');
    insert into syn_guard.scoped_row values
      ('01900000-0000-7000-8000-0000000000c1', 'SYNTHETIC'),
      ('01900000-0000-7000-8000-0000000000c2', 'SYNTHETIC');
  `);
  runtime = await connect(organisation, 'runtime');
});

afterAll(async () => {
  // beforeAll may have stopped part-way: close what it opened, then drop what it made.
  const opened = [runtime, owner] as (Client | undefined)[];
  try {
    for (const client of opened) await client?.end();
  } finally {
    await (world as SyntheticWorld | undefined)?.reset();
  }
});

describe('the two roles (code-house-rules 5.1)', () => {
  it('PRD-SEC-005 the runtime role is no superuser and cannot create databases or roles or bypass row-level security', async () => {
    const result = await owner.query<{
      rolname: string;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolbypassrls: boolean;
    }>(
      `select rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_catalog.pg_roles
       where rolname in ('aos_migration', 'aos_runtime') order by rolname`,
    );
    expect(result.rows).toEqual([
      { rolname: 'aos_migration', rolsuper: false, rolcreatedb: true, rolcreaterole: false, rolbypassrls: false },
      { rolname: 'aos_runtime', rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false },
    ]);
  });

  it('PRD-SEC-005 the runtime role owns no object', async () => {
    const result = await owner.query<{ owned: string }>(`
      with r as (select oid from pg_catalog.pg_roles where rolname = 'aos_runtime')
      select (select count(*) from pg_catalog.pg_class where relowner = (select oid from r))
           + (select count(*) from pg_catalog.pg_namespace where nspowner = (select oid from r))
           + (select count(*) from pg_catalog.pg_proc where proowner = (select oid from r))
           + (select count(*) from pg_catalog.pg_type where typowner = (select oid from r))
           + (select count(*) from pg_catalog.pg_database where datdba = (select oid from r)) as owned`);
    expect(result.rows[0]?.owned).toBe('0');
  });

  it('keeps no application schema on the runtime search path (code-house-rules 3.2)', async () => {
    const result = await runtime.query<{ search_path: string }>('show search_path');
    expect(result.rows[0]?.search_path).toBe('public');
  });

  it('PRD-SEC-005 the application connects as the runtime role through createDb', async () => {
    const handle = createDb(databaseUrl(organisation, 'runtime'));
    try {
      const result = await handle.db.execute<{ who: string }>(sql`select current_user as who`);
      expect(result.rows[0]?.who).toBe('aos_runtime');
    } finally {
      await handle.close();
    }
  });
});

describe('the runtime role changes no object (code-house-rules 5.2)', () => {
  it.each(['directory', 'organisation'])('PRD-SEC-005 cannot create a table in the %s database', async (kind) => {
    const client = await connect(kind === 'directory' ? directory : organisation, 'runtime');
    try {
      expect(await sqlState(client.query('create table kernel.syn_new (id int)'))).toBe('42501');
      expect(await sqlState(client.query('create table public.syn_new (id int)'))).toBe('42501');
      expect(await sqlState(client.query('create schema syn_new'))).toBe('42501');
      expect(await sqlState(client.query('create temporary table syn_new (id int)'))).toBe('42501');
    } finally {
      await client.end();
    }
  });

  it('PRD-SEC-005 cannot alter a table', async () => {
    expect(await sqlState(runtime.query('alter table syn_guard.entry add column syn_extra text'))).toBe('42501');
  });

  it('PRD-SEC-005 cannot drop a table', async () => {
    expect(await sqlState(runtime.query('drop table syn_guard.entry'))).toBe('42501');
  });

  it('PRD-SEC-005 cannot read the migration record', async () => {
    expect(await sqlState(runtime.query('select * from kernel.migration'))).toBe('42501');
  });
});

describe('append-only guard (code-house-rules 7.1)', () => {
  it('PRD-MOD-011 refuses an update, a delete and a truncate even with the privilege granted', async () => {
    expect(await sqlState(runtime.query(`update syn_guard.entry_all_granted set note = 'changed'`))).toBe('AO001');
    expect(await sqlState(runtime.query('delete from syn_guard.entry_all_granted'))).toBe('AO001');
    expect(await sqlState(runtime.query('truncate syn_guard.entry_all_granted'))).toBe('AO001');
  });

  it('PRD-MOD-011 stops the owner too', async () => {
    expect(await sqlState(owner.query(`update syn_guard.entry set note = 'changed'`))).toBe('AO001');
    expect(await sqlState(owner.query('delete from syn_guard.entry'))).toBe('AO001');
    expect(await sqlState(owner.query('truncate syn_guard.entry'))).toBe('AO001');
  });

  it('PRD-MOD-011 under the grants of code-house-rules 5.2, refuses the change and still lets a row be locked', async () => {
    expect(await sqlState(runtime.query(`update syn_guard.entry set note = 'changed'`))).toBe('42501');
    expect(await sqlState(runtime.query('delete from syn_guard.entry'))).toBe('42501');
    expect(await sqlState(runtime.query(`update syn_guard.entry set id = id`))).toBe('AO001');
    await runtime.query('begin');
    const locked = await runtime.query('select id from syn_guard.entry order by id for no key update');
    await runtime.query('commit');
    expect(locked.rowCount).toBe(1);
    const unchanged = await owner.query<{ note: string }>('select note from syn_guard.entry');
    expect(unchanged.rows).toEqual([{ note: 'SYNTHETIC' }]);
  });
});

describe('row-level security without an actor (code-house-rules 6.2)', () => {
  it('PRD-SEC-005 shows no scoped row when no actor is set', async () => {
    const result = await runtime.query('select id from syn_guard.scoped_row');
    expect(result.rowCount).toBe(0);
  });

  it('PRD-SEC-005 shows the rows while an actor is set for the transaction, and none after it ends', async () => {
    await runtime.query('begin');
    await runtime.query(`select pg_catalog.set_config('aos.actor_id', $1, true)`, [ACTOR]);
    const inside = await runtime.query('select id from syn_guard.scoped_row');
    await runtime.query('commit');
    expect(inside.rowCount).toBe(2);

    const after = await runtime.query<{ actor: string | null }>(
      `select current_setting('aos.actor_id', true) as actor`,
    );
    expect(after.rows[0]?.actor).toBe('');
    const outside = await runtime.query('select id from syn_guard.scoped_row');
    expect(outside.rowCount).toBe(0);
  });

  it('PRD-SEC-005 refuses to write a scoped row when no actor is set', async () => {
    expect(
      await sqlState(
        runtime.query(`insert into syn_guard.scoped_row values ('01900000-0000-7000-8000-0000000000c3', 'SYNTHETIC')`),
      ),
    ).toBe('42501');
  });
});

describe('database privileges (code-house-rules 4.3, 5.2)', () => {
  it('PRD-SEC-005 leaves PUBLIC no privilege on the database or on schema public', async () => {
    const result = await owner.query<{ connect: boolean; temporary: boolean; usage: boolean }>(`
      select pg_catalog.has_database_privilege('public', current_database(), 'CONNECT') as connect,
             pg_catalog.has_database_privilege('public', current_database(), 'TEMPORARY') as temporary,
             pg_catalog.has_schema_privilege('public', 'public', 'USAGE') as usage`);
    expect(result.rows[0]).toEqual({ connect: false, temporary: false, usage: false });
  });

  it('PRD-SEC-005 refuses a connection from a role the database never granted', async () => {
    const outsider = await createOutsiderRole();
    const url = new URL(databaseUrl(organisation, 'runtime'));
    url.username = outsider.name;
    url.password = outsider.password;
    const client = new Client({ connectionString: url.toString() });
    expect(await sqlState(client.connect())).toBe('42501');
  });

  it('applies the step again on a run with nothing to migrate', async () => {
    const superuser = await connect(organisation, 'superuser');
    try {
      await superuser.query(`grant temporary on database ${superuser.escapeIdentifier(organisation)} to public`);
    } finally {
      await superuser.end();
    }
    expect((await databaseGrants(organisation)).database).toContain('PUBLIC TEMPORARY');
    const applied = await migrateDatabase({
      connectionString: databaseUrl(organisation, 'migration'),
      folder: migrationSetFolder('organisation'),
    });
    expect(applied).toEqual([]);
    expect(await databaseGrants(organisation)).toEqual(RUNNER_GRANTS);
  });
});
