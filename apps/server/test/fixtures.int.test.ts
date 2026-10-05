import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { migrationSetFolder, readMigrationSet, type MigrationSetName } from '../src/kernel/index.js';
import { isSyntheticCode, isSyntheticName } from './fixtures/synthetic.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, sqlState } from './support/postgres.js';

// S0-T06: the template databases and the two synthetic Organisations (code-house-rules 11.2, 11.3).

let world: SyntheticWorld;

beforeAll(async () => {
  world = await createSyntheticOrganisations('fixtures');
});

afterAll(async () => {
  await world.reset();
});

async function appliedFiles(database: string): Promise<string[]> {
  const owner = await connect(database, 'migration');
  try {
    const result = await owner.query<{ file_name: string }>('select file_name from kernel.migration order by 1');
    return result.rows.map((row) => row.file_name);
  } finally {
    await owner.end();
  }
}

function setFiles(set: MigrationSetName): string[] {
  return readMigrationSet(migrationSetFolder(set)).map((file) => file.fileName);
}

describe('the templates (code-house-rules 11.3)', () => {
  it.each(['directory', 'organisation'] as const)(
    'the %s template takes no connection, so no test changes it',
    async (set) => {
      // 55000: object not in prerequisite state, "database is not currently accepting connections".
      expect(await sqlState(connect(inject('postgres').templates[set], 'superuser'))).toBe('55000');
    },
  );
});

describe('the two synthetic Organisations (code-house-rules 11.2)', () => {
  it('PRD-SEC-017 are labelled synthetic', () => {
    for (const organisation of world.organisations) {
      expect(isSyntheticCode(organisation.code)).toBe(true);
      expect(isSyntheticName(organisation.name)).toBe(true);
    }
  });

  it('PRD-MOD-001 each has its own database, apart from the directory, and each is fully migrated', async () => {
    const [first, second] = world.organisations;
    expect(new Set([world.directory, first.database, second.database]).size).toBe(3);
    expect(await appliedFiles(world.directory)).toEqual(setFiles('directory'));
    for (const organisation of world.organisations) {
      expect(await appliedFiles(organisation.database)).toEqual(setFiles('organisation'));
    }
  });

  it('PRD-SEC-005 the runtime role connects to each database', async () => {
    for (const database of [world.directory, ...world.organisations.map((organisation) => organisation.database)]) {
      const runtime = await connect(database, 'runtime');
      try {
        expect((await runtime.query('select current_user as role')).rows).toEqual([{ role: 'aos_runtime' }]);
      } finally {
        await runtime.end();
      }
    }
  });
});
