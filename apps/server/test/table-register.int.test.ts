import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationSetFolder, type MigrationSetName } from '../src/kernel/index.js';
// The kernel's own table definitions, read only to compare them with the database (code-house-rules 3.4, 10.4).
import * as kernelTables from '../src/kernel/db/schema.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';

// S1-F01-T02: the migrated databases against their table registers (code-house-rules 3.2, 4.1, 5.2, 10.4).
// This covers the classes and marks the registers hold today: `unscoped`, with or without the `append-only` mark
// (S1-F01-T04). An entry of any other class or mark fails here until this test checks what 10.4 asks of it
// (row-level security, the lock grant, the exclusion constraint), so no table can pass unchecked.

interface RegisterEntry {
  readonly table: string;
  readonly class: string;
  readonly marks: readonly string[];
  readonly runtime: readonly string[];
  readonly design: string;
  readonly why?: string;
}

const CHECKED_CLASSES = ['unscoped'];
const CHECKED_MARKS: readonly string[] = ['append-only'];
const SYSTEM_SCHEMAS = "('pg_catalog', 'information_schema')";

function register(set: MigrationSetName): RegisterEntry[] {
  const text = readFileSync(join(migrationSetFolder(set), 'tables.json'), 'utf8');
  return (JSON.parse(text) as { tables: RegisterEntry[] }).tables;
}

let world: SyntheticWorld;
const databases = {} as Record<MigrationSetName, string>;

beforeAll(async () => {
  world = await createSyntheticOrganisations('register');
  databases.directory = world.directory;
  databases.organisation = world.organisations[0].database;
});

afterAll(async () => {
  await (world as SyntheticWorld | undefined)?.reset();
});

// Read as the superuser, which sees every object whoever owns it.
async function read<T extends object>(database: string, text: string): Promise<T[]> {
  const client: Client = await connect(database, 'superuser');
  try {
    return (await client.query<T>(text)).rows;
  } finally {
    await client.end();
  }
}

describe.each(['directory', 'organisation'] as const)('the %s set and its register (code-house-rules 10.4)', (set) => {
  it('PRD-SEC-015 lists every table the database has, and no other', async () => {
    const tables = await read<{ name: string }>(
      databases[set],
      `select n.nspname || '.' || c.relname as name
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r', 'p') and n.nspname not in ${SYSTEM_SCHEMAS} and n.nspname not like 'pg_toast%'
       order by 1`,
    );
    expect(tables.map((table) => table.name)).toEqual(
      register(set)
        .map((entry) => entry.table)
        .sort(),
    );
  });

  it('holds only classes and marks this test checks, each entry naming its design', () => {
    for (const entry of register(set)) {
      expect(CHECKED_CLASSES, entry.table).toContain(entry.class);
      expect(
        entry.marks.filter((mark) => !CHECKED_MARKS.includes(mark)),
        entry.table,
      ).toEqual([]);
      expect(entry.design, entry.table).not.toBe('');
      if (entry.class === 'unscoped') expect(entry.why ?? '', entry.table).not.toBe('');
    }
  });

  it('PRD-SEC-005 grants the runtime role exactly what the register says, on whole tables, and PUBLIC nothing', async () => {
    const grants = await read<{ name: string; grantee: string; privilege: string }>(
      databases[set],
      `select n.nspname || '.' || c.relname as name, coalesce(r.rolname, 'PUBLIC') as grantee,
              a.privilege_type as privilege
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
       left join pg_catalog.pg_roles r on r.oid = a.grantee
       where c.relkind in ('r', 'p') and n.nspname not in ${SYSTEM_SCHEMAS} and n.nspname not like 'pg_toast%'
         and a.grantee <> c.relowner
       order by 1, 2, 3`,
    );
    const expected = register(set).flatMap((entry) =>
      [...entry.runtime].sort().map((privilege) => ({ name: entry.table, grantee: 'aos_runtime', privilege })),
    );
    const byKey = (a: { name: string; privilege: string }, b: { name: string; privilege: string }): number =>
      `${a.name} ${a.privilege}`.localeCompare(`${b.name} ${b.privilege}`);
    expect(grants.sort(byKey)).toEqual(expected.sort(byKey));

    const columnGrants = await read<{ name: string }>(
      databases[set],
      `select n.nspname || '.' || c.relname || '.' || a.attname as name
       from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where a.attacl is not null and n.nspname not in ${SYSTEM_SCHEMAS} and n.nspname not like 'pg_toast%'`,
    );
    expect(columnGrants).toEqual([]);
  });

  it('PRD-MOD-011 guards every append-only table with the refuse_change triggers and gives the runtime role no DELETE or UPDATE', async () => {
    // code-house-rules 7.1: a BEFORE UPDATE OR DELETE row trigger and a BEFORE TRUNCATE statement trigger calling
    // kernel.refuse_change(). The exact grants are checked above; here, that neither DELETE nor UPDATE is among them.
    const appendOnly = register(set).filter((entry) => entry.marks.includes('append-only'));
    for (const entry of appendOnly) {
      expect(entry.runtime, entry.table).not.toContain('DELETE');
      expect(entry.runtime, entry.table).not.toContain('UPDATE');
    }
    const triggers = await read<{ name: string; timing: string }>(
      databases[set],
      `select n.nspname || '.' || c.relname as name,
              case when (t.tgtype & 1) = 1 then 'row' else 'statement' end
                || case when (t.tgtype & 2) = 2 then ' before' else ' after' end
                || case when (t.tgtype & 16) = 16 then ' update' else '' end
                || case when (t.tgtype & 8) = 8 then ' delete' else '' end
                || case when (t.tgtype & 32) = 32 then ' truncate' else '' end as timing
       from pg_catalog.pg_trigger t
       join pg_catalog.pg_class c on c.oid = t.tgrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       join pg_catalog.pg_proc p on p.oid = t.tgfoid
       join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
       where not t.tgisinternal and pn.nspname = 'kernel' and p.proname = 'refuse_change' and t.tgenabled <> 'D'
       order by 1, 2`,
    );
    expect(triggers).toEqual(
      appendOnly
        .map((entry) => entry.table)
        .sort()
        .flatMap((name) => [
          { name, timing: 'row before update delete' },
          { name, timing: 'statement before truncate' },
        ]),
    );
  });

  it('PRD-SEC-005 leaves PUBLIC nothing on an application schema or function', async () => {
    const onSchemas = await read<{ name: string }>(
      databases[set],
      `select n.nspname as name
       from pg_catalog.pg_namespace n
       cross join lateral pg_catalog.aclexplode(coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
       where a.grantee = 0 and n.nspname not in ${SYSTEM_SCHEMAS} and n.nspname not like 'pg_%'`,
    );
    const onFunctions = await read<{ name: string }>(
      databases[set],
      `select n.nspname || '.' || p.proname as name
       from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
       where a.grantee = 0 and n.nspname not in ${SYSTEM_SCHEMAS} and n.nspname not like 'pg_%'`,
    );
    expect([...onSchemas, ...onFunctions]).toEqual([]);
  });

  it('PRD-SEC-005 the runtime role owns no object in the database, nor the database itself', async () => {
    const owned = await read<{ kind: string; name: string }>(
      databases[set],
      `with r as (select oid from pg_catalog.pg_roles where rolname = 'aos_runtime')
       select 'relation' as kind, relname::text as name from pg_catalog.pg_class where relowner = (select oid from r)
       union all select 'schema', nspname::text from pg_catalog.pg_namespace where nspowner = (select oid from r)
       union all select 'function', proname::text from pg_catalog.pg_proc where proowner = (select oid from r)
       union all select 'type', typname::text from pg_catalog.pg_type where typowner = (select oid from r)
       union all select 'database', datname::text from pg_catalog.pg_database
         where datdba = (select oid from r) and datname = current_database()`,
    );
    expect(owned).toEqual([]);
  });

  it('PRD-SEC-005 gives the runtime role USAGE, and nothing else, on each application schema and on public', async () => {
    // code-house-rules 5.2: USAGE on each application schema and on public; never CREATE. No function is granted to
    // it yet: a function a design names for it adds its EXECUTE here.
    const onSchemas = await read<{ name: string; privilege: string }>(
      databases[set],
      `select n.nspname as name, a.privilege_type as privilege
       from pg_catalog.pg_namespace n
       cross join lateral pg_catalog.aclexplode(coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
       join pg_catalog.pg_roles r on r.oid = a.grantee
       where r.rolname = 'aos_runtime' and n.nspname not in ${SYSTEM_SCHEMAS} and n.nspname not like 'pg_%'
       order by 1, 2`,
    );
    const schemas = [...new Set(['public', ...register(set).map((entry) => entry.table.split('.')[0] ?? '')])].sort();
    expect(onSchemas).toEqual(schemas.map((name) => ({ name, privilege: 'USAGE' })));

    const onFunctions = await read<{ name: string }>(
      databases[set],
      `select n.nspname || '.' || p.proname as name
       from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
       join pg_catalog.pg_roles r on r.oid = a.grantee
       where r.rolname = 'aos_runtime' and n.nspname not in ${SYSTEM_SCHEMAS} and n.nspname not like 'pg_%'`,
    );
    expect(onFunctions).toEqual([]);
  });

  it('PRD-SEC-005 gives the runtime role CONNECT on the database and nothing else', async () => {
    const onDatabase = await read<{ privilege: string }>(
      databases[set],
      `select a.privilege_type as privilege
       from pg_catalog.pg_database d
       cross join lateral pg_catalog.aclexplode(coalesce(d.datacl, pg_catalog.acldefault('d', d.datdba))) a
       join pg_catalog.pg_roles r on r.oid = a.grantee
       where r.rolname = 'aos_runtime' and d.datname = current_database()`,
    );
    expect(onDatabase).toEqual([{ privilege: 'CONNECT' }]);
  });
});

describe('the directory holds only codes and locations (DEC-093; deployment.md section 4)', () => {
  it('PRD-ACS-020 DEC-093 has one routing table, with the code and the database name and no session, user or hash', async () => {
    const columns = await read<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>(
      world.directory,
      `select table_schema || '.' || table_name as table_name, column_name, data_type, is_nullable
       from information_schema.columns
       where table_schema not in ${SYSTEM_SCHEMAS} and table_name <> 'migration'
       order by table_name, ordinal_position`,
    );
    expect(columns).toEqual([
      { table_name: 'kernel.directory_entry', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
      { table_name: 'kernel.directory_entry', column_name: 'organisation_code', data_type: 'text', is_nullable: 'NO' },
      { table_name: 'kernel.directory_entry', column_name: 'database_name', data_type: 'text', is_nullable: 'NO' },
    ]);
  });
});

describe('the Drizzle definitions of kernel (code-house-rules 3.4, 10.4)', () => {
  it.each(Object.entries(kernelTables))('code-house-rules 3.4 %s matches its migrated table', async (_name, table) => {
    const config = getTableConfig(table);
    const qualified = `${config.schema ?? 'public'}.${config.name}`;
    const set = register('directory').some((entry) => entry.table === qualified) ? 'directory' : 'organisation';
    const columns = await read<{ column_name: string; data_type: string; is_nullable: string }>(
      databases[set],
      `select a.attname as column_name, pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
              case when a.attnotnull then 'NO' else 'YES' end as is_nullable
       from pg_catalog.pg_attribute a
       where a.attrelid = '${qualified}'::regclass and a.attnum > 0 and not a.attisdropped
       order by a.attname`,
    );
    const defined = config.columns
      .map((column) => ({
        column_name: column.name,
        data_type: column.getSQLType(),
        is_nullable: column.notNull ? 'NO' : 'YES',
      }))
      .sort((a, b) => a.column_name.localeCompare(b.column_name));
    expect(columns).toEqual(defined);
  });
});
