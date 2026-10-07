import { randomInt } from 'node:crypto';
import { errorEnvelopeSchema } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  startAccessApp,
  SYNTHETIC_ORIGIN,
  syntheticKeysEnvironment,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
} from './support/access.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';

// S1-F01-T28: the test sign-in of the development environments, through the API on real PostgreSQL
// (access-and-approvals 3.4; deployment.md section 3; POL-02.17, PRD-ACS-017, PRD-SEC-007; DEC-121). Every value is
// SYNTHETIC.

const SYNTHETIC_THROTTLING = { failureLimit: 3, windowSeconds: 600 };
const SYNTHETIC_PASSWORD_RULES = { minimumLength: 12 };
const SYNTHETIC_SESSION_LIMITS = { idleLockSeconds: 1800, absoluteSeconds: 28800 };

/** The SYNTHETIC logins `writeSyntheticUser` gives these labels. */
const LISTED = 'SYN-USER-DEMO-LISTED';
const LISTED_DISABLED = 'SYN-USER-DEMO-DISABLED';
const LISTED_FIRST = 'SYN-USER-DEMO-FIRST';

let world: SyntheticWorld;
let keys: Record<string, string>;
let on: AccessTestApp;
let off: AccessTestApp;
let orgA: SyntheticWorld['organisations'][0];

beforeAll(async () => {
  world = await createSyntheticOrganisations('demo_sign_in');
  [orgA] = world.organisations;
  keys = syntheticKeysEnvironment(world);
  await writeSyntheticSetting(orgA.database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
  await writeSyntheticSetting(orgA.database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
  await writeSyntheticSetting(orgA.database, 'access.office-session-limits', SYNTHETIC_SESSION_LIMITS);
  await writeSyntheticUser(orgA.database, orgA.code, keys, { label: 'DEMO-LISTED', enrolled: true, temporary: false });
  await writeSyntheticUser(orgA.database, orgA.code, keys, {
    label: 'DEMO-DISABLED',
    enrolled: true,
    temporary: false,
    state: 'Disabled',
  });
  await writeSyntheticUser(orgA.database, orgA.code, keys, { label: 'DEMO-FIRST', temporary: true });
  await writeSyntheticUser(orgA.database, orgA.code, keys, {
    label: 'DEMO-UNLISTED',
    enrolled: true,
    temporary: false,
  });
  const people = [LISTED, LISTED_DISABLED, LISTED_FIRST].map((login) => ({
    organisationCode: orgA.code,
    login,
    label: `SYNTHETIC ${login}`,
  }));
  on = await startAccessApp(world, {
    ...keys,
    AOS_ENVIRONMENT: 'dev',
    AOS_DEMO_SIGN_IN: JSON.stringify(people),
  });
  off = await startAccessApp(world, keys);
});

afterAll(async () => {
  await (on as AccessTestApp | undefined)?.close();
  await (off as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

function freshAddress(): string {
  return `10.${String(randomInt(256))}.${String(randomInt(256))}.${String(randomInt(1, 255))}`;
}

async function demo(app: AccessTestApp, login: string, organisationCode = orgA.code) {
  const response = await fetch(`${app.baseUrl}/api/access/demo-sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': freshAddress() },
    body: JSON.stringify({ organisationCode, login }),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get('set-cookie'),
  };
}

async function people(app: AccessTestApp): Promise<unknown> {
  return (await fetch(`${app.baseUrl}/api/access/demo-sign-in`)).json();
}

async function demoRecords(): Promise<{ outcome: string; user_id: string | null }[]> {
  const client = await connect(orgA.database, 'migration');
  try {
    return (
      await client.query<{ outcome: string; user_id: string | null }>(
        "select outcome, user_id from audit.access_record where kind = 'demo-sign-in' order by recorded_at",
      )
    ).rows;
  } finally {
    await client.end();
  }
}

describe('the test sign-in (access-and-approvals 3.4; DEC-121)', () => {
  it('POL-02.17 lists the configured SYNTHETIC people when on, and nobody when off', async () => {
    const list = (await people(on)) as { people: { login: string }[] };
    expect(list.people.map((person) => person.login)).toEqual([LISTED, LISTED_DISABLED, LISTED_FIRST]);
    expect(await people(off)).toEqual({ people: [] });
  });

  it('POL-02.17 PRD-SEC-007 signs a listed Active person in without password or code, with an access record of its own kind', async () => {
    const before = (await demoRecords()).length;
    const call = await demo(on, LISTED);
    expect(call.status).toBe(200);
    expect(call.body).toEqual({ outcome: 'signed-in' });
    expect(call.cookie).toMatch(/^__Host-aos-session=/);
    const session = await fetch(`${on.baseUrl}/api/access/session`, {
      headers: { cookie: (call.cookie ?? '').split(';')[0] ?? '' },
    });
    expect(session.status).toBe(200);
    const records = await demoRecords();
    expect(records).toHaveLength(before + 1);
    expect(records.at(-1)?.outcome).toBe('succeeded');
    expect(records.at(-1)?.user_id).not.toBeNull();
  });

  it('still leads a person with an unfinished first sign-in to enrolment (access-and-approvals 3.2)', async () => {
    const call = await demo(on, LISTED_FIRST);
    expect(call.status).toBe(200);
    expect(call.body).toEqual({ outcome: 'enrolment-required' });
  });

  it('refuses a disabled person, a person not listed, and another Organisation, with the one refusal', async () => {
    for (const call of [
      await demo(on, LISTED_DISABLED),
      await demo(on, 'SYN-USER-DEMO-UNLISTED'),
      await demo(on, LISTED, world.organisations[1].code),
    ]) {
      expect(call.status).toBe(401);
      expect(call.cookie).toBeNull();
      expect(errorEnvelopeSchema.parse(call.body).error.code).toBe('access.sign-in-refused');
    }
    expect((await demoRecords()).some((record) => record.outcome === 'refused')).toBe(true);
  });

  it('POL-02.17 refuses every test sign-in when the setting is off', async () => {
    const call = await demo(off, LISTED);
    expect(call.status).toBe(401);
    expect(call.cookie).toBeNull();
  });
});
