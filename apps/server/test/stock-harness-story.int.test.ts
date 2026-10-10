import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyHarnessMigrations, HARNESS_MIGRATIONS, StockHarness } from './harness/stock/harness.js';
import { loadScenarios, runScenario } from './harness/stock/scenario.js';
import { connect, createTestDatabase, dropDatabase, sqlState } from './support/postgres.js';

// S1-F10-T04: the stage 1 exit check of stock and posting (stock-ledger 11.1 to 11.7; books-and-posting 15 test 1,
// 16.1 to 16.3, 16.5; S1-F10 spec 3.4 to 3.6; PRD-LED-014, PRD-LED-015, PRD-ACP-018). Each scenario file of the
// harness runs through the synthetic document driver in a world of its own: its own copies of the migrated template
// databases (code-house-rules 11.3), the two synthetic Organisations, and fixtures made through the real modules
// (S1-F10 spec 3.3). Every value is SYNTHETIC; every expected value is in the scenario file, written by hand.

const worlds: StockHarness[] = [];

afterAll(async () => {
  for (const world of worlds) await world.stop();
});

describe('the story under the four combinations (stock-ledger 11.2 to 11.6; books-and-posting 15 test 1, 16)', () => {
  it('holds one scenario file per combination, each labelled synthetic', () => {
    const combinations = loadScenarios().map(({ scenario }) => {
      expect(scenario.synthetic).toBe(true);
      return `${scenario.combination.formula} ${scenario.combination.poolMode}`;
    });
    expect(combinations.sort()).toEqual(['fifo book', 'fifo site', 'moving-average book', 'moving-average site']);
  });

  it.each(loadScenarios().map(({ file, scenario }) => [scenario.id, file, scenario] as const))(
    'PRD-ACP-018 PRD-LED-014 PRD-LED-015 %s (%s) posts each step as written, with the checks of 11.7 and 16.5',
    async (_id, _file, scenario) => {
      const world = new StockHarness();
      worlds.push(world);
      await world.start('harness');
      await runScenario(world, scenario);
    },
    600_000,
  );
});

interface RegisterEntry {
  readonly table: string;
  readonly marks: readonly string[];
  readonly runtime: readonly string[];
}

describe('the test-only migration set and the read-only role (stock-ledger 15.2, 15.4; code-house-rules 11.4)', () => {
  let database: string | undefined;
  const entries = (
    JSON.parse(readFileSync(join(HARNESS_MIGRATIONS, 'tables.json'), 'utf8')) as { tables: RegisterEntry[] }
  ).tables;

  beforeAll(async () => {
    const made = await createTestDatabase('organisation', 'harness_set');
    database = made;
    await applyHarnessMigrations(made);
  });

  afterAll(async () => {
    if (database !== undefined) await dropDatabase(database);
  });

  async function read<T extends object>(text: string): Promise<T[]> {
    const client = await connect(database ?? '', 'superuser');
    try {
      return (await client.query<T>(text)).rows;
    } finally {
      await client.end();
    }
  }

  it('code-house-rules 10.4 its register lists every table of its schema, with the runtime role’s privileges', async () => {
    const tables = await read<{ name: string }>(
      `select schemaname || '.' || tablename as name from pg_catalog.pg_tables
       where schemaname = 'test_stock_harness' order by 1`,
    );
    expect(tables.map((row) => row.name)).toEqual(entries.map((entry) => entry.table).sort());
    const grants = await read<{ name: string; privilege: string }>(
      `select n.nspname || '.' || c.relname as name, a.privilege_type as privilege
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       cross join lateral pg_catalog.aclexplode(c.relacl) a join pg_catalog.pg_roles r on r.oid = a.grantee
       where n.nspname = 'test_stock_harness' and r.rolname = 'aos_runtime'`,
    );
    for (const entry of entries) {
      expect(
        grants
          .filter((row) => row.name === entry.table)
          .map((row) => row.privilege)
          .sort(),
        entry.table,
      ).toEqual(entry.runtime.filter((privilege) => !privilege.startsWith('UPDATE (')).sort());
    }
    const guarded = await read<{ name: string }>(
      `select n.nspname || '.' || c.relname as name from pg_catalog.pg_trigger t
       join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'test_stock_harness' and t.tgname = 'refuse_row_change' order by 1`,
    );
    expect(guarded.map((row) => row.name)).toEqual(
      entries
        .filter((entry) => entry.marks.includes('append-only'))
        .map((entry) => entry.table)
        .sort(),
    );
  });

  it('stock-ledger 15.4 H6 the read-only role reads every row, bypassing row-level security, and writes nothing', async () => {
    const verifier = await connect(database ?? '', 'verify');
    try {
      const role = await verifier.query<{ bypass: boolean; readOnly: string }>(
        `select r.rolbypassrls as bypass, current_setting('default_transaction_read_only') as "readOnly"
         from pg_catalog.pg_roles r where r.rolname = current_user`,
      );
      expect(role.rows).toEqual([{ bypass: true, readOnly: 'on' }]);
      expect((await verifier.query('select count(*) from stock.movement')).rows).toHaveLength(1);
      // 25006: read_only_sql_transaction.
      expect(
        await sqlState(
          verifier.query(
            `insert into test_stock_harness.document_change (id, document_id, version_id, recorded_by_user_id)
             values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid())`,
          ),
        ),
      ).toBe('25006');
    } finally {
      await verifier.end();
    }
  });
});
