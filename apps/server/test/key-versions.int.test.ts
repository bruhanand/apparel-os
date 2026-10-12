import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ORGANISATION_KEYS_VARIABLE } from '../src/modules/access/index.js';
import { OrganisationKeys } from '../src/modules/access/domain/organisation-keys.js';
import { startAccessApp, syntheticKeysEnvironment } from './support/access.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, sqlState } from './support/postgres.js';

// S1-F14-T02: the start check of key versions (backup-and-restore 2.4; GC9-18; POL-18.02, PRD-SEC-014), the first half
// of GC-9 12 test 19 (the key-recovered access record is the recovery command's). Every key here is SYNTHETIC.

let world: SyntheticWorld;
let keysEnvironment: Record<string, string>;

async function listed(database: string): Promise<{ identifier: string; purpose: string }[]> {
  const client = await connect(database, 'migration');
  try {
    return (
      await client.query<{ identifier: string; purpose: string }>(
        'select identifier, purpose from access.key_version order by first_used_at, id',
      )
    ).rows;
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('key_versions');
  keysEnvironment = syntheticKeysEnvironment(world);
});

afterAll(async () => {
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('the start check of key versions (backup-and-restore 2.4)', () => {
  it('records each Organisation’s key as its first version when none is listed, by identifier and never the key', async () => {
    const versions = OrganisationKeys.fromEnvironment(keysEnvironment).versions();
    const app = await startAccessApp(world, keysEnvironment);
    await app.close();
    for (const organisation of world.organisations) {
      expect(await listed(organisation.database)).toEqual([
        { identifier: versions.get(organisation.code), purpose: 'organisation-data' },
      ]);
    }
    // Starting again with the same keys records nothing more.
    await (await startAccessApp(world, keysEnvironment)).close();
    for (const organisation of world.organisations) expect(await listed(organisation.database)).toHaveLength(1);
  });

  it('POL-18.02 PRD-SEC-014 refuses to start with a key that is not a listed version, naming the identifiers and never the key', async () => {
    const swapped = randomBytes(32).toString('base64url');
    const keys = JSON.parse(keysEnvironment[ORGANISATION_KEYS_VARIABLE] ?? '{}') as Record<string, string>;
    const code = world.organisations[0].code;
    const wrong = { [ORGANISATION_KEYS_VARIABLE]: JSON.stringify({ ...keys, [code]: swapped }) };
    const expected = OrganisationKeys.fromEnvironment(wrong).version(code);
    let message = '';
    try {
      await (await startAccessApp(world, wrong)).close();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(`Organisation ${code}`);
    expect(message).toContain(expected);
    expect(message).toContain(OrganisationKeys.fromEnvironment(keysEnvironment).version(code));
    expect(message).not.toContain(swapped);
    expect(message).not.toContain(keys[code] ?? 'none');
    // Nothing was recorded for the swapped key: the kept copy is put back, and the server starts (2.4).
    expect(await listed(world.organisations[0].database)).toHaveLength(1);
    await (await startAccessApp(world, keysEnvironment)).close();
  });

  it('PRD-MOD-011 a key version row is append-only, and a new encrypted row must name its key version', async () => {
    const client = await connect(world.organisations[0].database, 'runtime');
    try {
      expect(await sqlState(client.query("update access.key_version set purpose = 'organisation-data'"))).toBe('42501');
      expect(
        await sqlState(
          client.query(
            `insert into access.second_factor (id, app_user_id, secret_scheme, secret_ciphertext, state)
             values (gen_random_uuid(), gen_random_uuid(), 'x', 'x', 'Setting up')`,
          ),
        ),
      ).toBe('AO018');
    } finally {
      await client.end();
    }
  });
});
