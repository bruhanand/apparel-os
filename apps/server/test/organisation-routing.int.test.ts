import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { uuidv7 } from '@apparel-os/domain';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  connectionToDatabase,
  encodeSessionCookieValue,
  ORGANISATION_ROUTER,
  OrganisationRouter,
  OrganisationRoutingModule,
  PinoLoggerService,
  ROUTING_ENVIRONMENT,
  type RoutedOrganisation,
} from '../src/kernel/index.js';
import { syntheticCode, syntheticDatabaseName } from './fixtures/synthetic.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl, sqlState } from './support/postgres.js';

// S1-F01-T02: Organisation routing (module-map 4.1; access-and-approvals 3.1, 3.3; DEC-093). The router runs as the
// runtime role, as the application does (code-house-rules 10.1): it reads the directory and binds each Organisation's
// own database. The synthetic table syn_route.mark is made by test setup as the migration role, only to show which
// database a query reached; it is no part of any migration set.

/** A synthetic pool size for these tests; the real one is each environment's AOS_DATABASE_POOL_MAX. */
const SYNTHETIC_POOL_MAX = 2;

let world: SyntheticWorld;

beforeAll(async () => {
  world = await createSyntheticOrganisations('routing');
  for (const organisation of world.organisations) {
    const owner = await connect(organisation.database, 'migration');
    try {
      await owner.query(`
        create schema syn_route;
        grant usage on schema syn_route to aos_runtime;
        create table syn_route.mark (written_in text primary key);
        grant select, insert on syn_route.mark to aos_runtime;`);
    } finally {
      await owner.end();
    }
  }
});

afterAll(async () => {
  await (world as SyntheticWorld | undefined)?.reset();
});

/**
 * A router over this file's directory, as the runtime role, whose service log the test reads. `startupOptions` are
 * PostgreSQL settings for the router's own sessions only, passed in the connection string.
 */
function openRouter(startupOptions?: string): { router: OrganisationRouter; log: () => string[] } {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(
        ...chunk
          .toString('utf8')
          .split('\n')
          .filter((line) => line !== ''),
      );
      done();
    },
  });
  const router = new OrganisationRouter(
    {
      directoryConnectionString:
        startupOptions === undefined
          ? databaseUrl(world.directory, 'runtime')
          : `${databaseUrl(world.directory, 'runtime')}?options=${encodeURIComponent(startupOptions)}`,
      poolMax: SYNTHETIC_POOL_MAX,
    },
    new PinoLoggerService(pino(sink)),
  );
  return { router, log: () => [...lines] };
}

async function where(organisation: RoutedOrganisation): Promise<{ database: string; role: string }> {
  const result = await organisation.db.execute<{ database: string; role: string }>(
    sql`select current_database() as database, current_user as role`,
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('No row');
  return row;
}

async function routed(router: OrganisationRouter, code: string): Promise<RoutedOrganisation> {
  const result = await router.resolveForSignIn(code);
  if (!result.routed) throw new Error(`${code} was not routed`);
  return result.organisation;
}

const sessionIdentifier = (): string => randomBytes(32).toString('base64url');

describe('routing at sign-in (access-and-approvals 3.1)', () => {
  it('PRD-MOD-001 PRD-ACS-020 DEC-093 routes each synthetic Organisation to its own database, as the runtime role', async () => {
    const { router } = openRouter();
    try {
      for (const organisation of world.organisations) {
        const found = await routed(router, organisation.code);
        expect(found.organisationCode).toBe(organisation.code);
        expect(found.databaseName).toBe(organisation.database);
        expect(await where(found)).toEqual({ database: organisation.database, role: 'aos_runtime' });
      }
    } finally {
      await router.close();
    }
  });

  it('PRD-ORG-002 PRD-MOD-001 a row written through one Organisation is not there through the other', async () => {
    const { router } = openRouter();
    const [first, second] = world.organisations;
    try {
      const a = await routed(router, first.code);
      const b = await routed(router, second.code);
      await a.db.execute(sql`insert into syn_route.mark (written_in) values (${first.code})`);
      await b.db.execute(sql`insert into syn_route.mark (written_in) values (${second.code})`);
      const readA = await a.db.execute<{ written_in: string }>(sql`select written_in from syn_route.mark`);
      const readB = await b.db.execute<{ written_in: string }>(sql`select written_in from syn_route.mark`);
      expect(readA.rows).toEqual([{ written_in: first.code }]);
      expect(readB.rows).toEqual([{ written_in: second.code }]);
    } finally {
      await router.close();
    }
  });

  it('keeps one pool per Organisation database and binds the same one on every request', async () => {
    const { router } = openRouter();
    const [first, second] = world.organisations;
    try {
      const a1 = await routed(router, first.code);
      const a2 = await routed(router, first.code);
      const b = await routed(router, second.code);
      expect(a2.db).toBe(a1.db);
      expect(b.db).not.toBe(a1.db);
      // The pool opens no more connections than its configured limit, however many queries wait.
      const ids = await Promise.all(
        Array.from({ length: 6 }, () =>
          a1.db.execute<{ pid: number }>(sql`select pg_catalog.pg_backend_pid() as pid, pg_catalog.pg_sleep(0.05)`),
        ),
      );
      expect(new Set(ids.map((result) => result.rows[0]?.pid)).size).toBeLessThanOrEqual(SYNTHETIC_POOL_MAX);
    } finally {
      await router.close();
    }
  });

  it('PRD-ACS-020 DEC-093 PRD-SEC-014 refuses an unknown code with the generic refusal, leaving one service-log line without what was typed', async () => {
    const { router, log } = openRouter();
    const typed = syntheticCode('ORG-UNLISTED');
    try {
      const result = await router.resolveForSignIn(typed);
      // Not routed, and nothing else: sign-in answers it with the one refusal every wrong part gets,
      // access.sign-in-refused (access-and-approvals 3.1; S1-F01-T08).
      expect(result).toEqual({ routed: false });
      expect(JSON.stringify(result)).not.toContain(typed);

      const lines = log();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('Sign-in refused: the Organisation code is not in the directory');
      expect(lines.join('\n')).not.toContain(typed);
      expect(lines.join('\n')).not.toContain('UNLISTED');
    } finally {
      await router.close();
    }
  });

  it('PRD-ACS-020 compares the code exactly: another letter case, or the database name, is unknown', async () => {
    const { router, log } = openRouter();
    const [first] = world.organisations;
    try {
      for (const typed of [first.code.toLowerCase(), ` ${first.code}`, first.database, '']) {
        expect(await router.resolveForSignIn(typed)).toEqual({ routed: false });
      }
      expect(log().join('\n')).not.toContain(first.code.toLowerCase());
    } finally {
      await router.close();
    }
  });

  it('PRD-ACS-020 PRD-SEC-014 a code PostgreSQL text cannot hold, with U+0000, gets the generic refusal and one log line without it', async () => {
    const { router, log } = openRouter();
    const [first] = world.organisations;
    const typed = `${first.code}\u0000`;
    try {
      expect(await router.resolveForSignIn(typed)).toEqual({ routed: false });
      expect(await router.resolveForSignIn('\u0000')).toEqual({ routed: false });
      const lines = log();
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        expect(line).toContain('Sign-in refused: the Organisation code is not in the directory');
        expect(line).not.toContain(first.code);
        expect(line).not.toContain('\\u0000');
      }
    } finally {
      await router.close();
    }
  });

  it('creates no pool when it is closed while the directory read waits, and gives no Organisation', async () => {
    // The router's directory read waits for a lock while the test closes the router. Its own sessions get a longer
    // lock wait than the runtime role's 1 s (CH-3), so the limit cannot end the wait before the test does.
    const longerLockWait = '-c lock_timeout=60s';
    const [first] = world.organisations;
    const probe = openRouter(longerLockWait).router;
    try {
      const organisation = await routed(probe, first.code);
      const shown = await organisation.db.execute<{ lock_timeout: string }>(sql`show lock_timeout`);
      expect(shown.rows).toEqual([{ lock_timeout: '1min' }]);
    } finally {
      await probe.close();
    }
    const { router } = openRouter(longerLockWait);
    // The migration role holds the directory table exclusively, so the router's read waits for it
    // (code-house-rules 10.3: PostgreSQL shows the wait; no sleep orders it).
    const holder = await connect(world.directory, 'migration');
    const watcher = await connect(world.directory, 'migration');
    let closing: Promise<void> | undefined;
    try {
      await holder.query('begin');
      await holder.query('lock table kernel.directory_entry in access exclusive mode');
      const pending = router.resolveForSignIn(first.code);
      pending.catch(() => undefined);
      for (;;) {
        const waiting = await watcher.query<{ count: string }>(
          `select count(*) from pg_catalog.pg_locks l join pg_catalog.pg_stat_activity a on a.pid = l.pid
           where not l.granted and a.usename = 'aos_runtime' and a.datname = current_database()`,
        );
        if (waiting.rows[0]?.count !== '0') break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      closing = router.close();
      await holder.query('commit');
      await expect(pending).rejects.toThrow(/Organisation routing is closed/);
      await closing;
    } finally {
      await holder.end();
      await watcher.end();
      await (closing ?? router.close());
    }
  });

  it('takes a failure to read the directory as an error, never as an unknown code', async () => {
    const lines: string[] = [];
    const router = new OrganisationRouter(
      {
        directoryConnectionString: databaseUrl(`${world.directory}_missing`, 'runtime'),
        poolMax: SYNTHETIC_POOL_MAX,
      },
      new PinoLoggerService(
        pino(
          new Writable({
            write(chunk: Buffer, _encoding, done) {
              lines.push(chunk.toString('utf8'));
              done();
            },
          }),
        ),
      ),
    );
    try {
      // 3D000: invalid_catalog_name, "database does not exist".
      expect(await sqlState(router.resolveForSignIn(world.organisations[0].code))).toBe('3D000');
      expect(lines).toEqual([]);
    } finally {
      await router.close();
    }
  });
});

describe('routing from the session cookie (access-and-approvals 3.3, 15 test 3d)', () => {
  it('PRD-ACS-020 DEC-093 finds the Organisation from the code in the cookie and hands back the identifier to look for there', async () => {
    const { router } = openRouter();
    try {
      for (const organisation of world.organisations) {
        const identifier = sessionIdentifier();
        const result = await router.resolveFromSessionCookie(
          encodeSessionCookieValue({ organisationCode: organisation.code, sessionIdentifier: identifier }),
        );
        if (!result.routed) throw new Error(`${organisation.code} was not routed`);
        expect(result.sessionIdentifier).toBe(identifier);
        expect(await where(result.organisation)).toEqual({ database: organisation.database, role: 'aos_runtime' });
      }
    } finally {
      await router.close();
    }
  });

  it('PRD-ACS-020 PRD-SEC-014 a cookie naming an unknown code is not signed in, and the service log holds no cookie value', async () => {
    const { router, log } = openRouter();
    const identifier = sessionIdentifier();
    const typed = syntheticCode('ORG-UNLISTED');
    const cookie = encodeSessionCookieValue({ organisationCode: typed, sessionIdentifier: identifier });
    try {
      expect(await router.resolveFromSessionCookie(cookie)).toEqual({ routed: false });
      const text = log().join('\n');
      expect(log()).toHaveLength(1);
      expect(text).toContain('Not signed in: the session cookie names no Organisation in the directory');
      for (const value of [cookie, identifier, typed, cookie.split('.')[0] ?? cookie]) {
        expect(text).not.toContain(value);
      }
    } finally {
      await router.close();
    }
  });

  it('PRD-ACS-020 PRD-SEC-014 a cookie whose code holds U+0000 is not signed in, with one log line and no cookie value', async () => {
    const { router, log } = openRouter();
    const identifier = sessionIdentifier();
    const [first] = world.organisations;
    const cookie = encodeSessionCookieValue({ organisationCode: `${first.code}\u0000`, sessionIdentifier: identifier });
    try {
      expect(await router.resolveFromSessionCookie(cookie)).toEqual({ routed: false });
      const lines = log();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('Not signed in: the session cookie names no Organisation in the directory');
      for (const value of [cookie, identifier, first.code, cookie.split('.')[0] ?? cookie]) {
        expect(lines[0]).not.toContain(value);
      }
    } finally {
      await router.close();
    }
  });

  it('PRD-SEC-014 a malformed cookie is not signed in, and the service log holds no cookie value', async () => {
    const { router, log } = openRouter();
    const identifier = sessionIdentifier();
    const cookie = `${world.organisations[0].code}.${identifier}`;
    try {
      expect(await router.resolveFromSessionCookie(cookie)).toEqual({ routed: false });
      const text = log().join('\n');
      expect(text).toContain('Not signed in: the session cookie is malformed');
      expect(text).not.toContain(identifier);
      expect(text).not.toContain(world.organisations[0].code);
    } finally {
      await router.close();
    }
  });

  it('no cookie is not signed in, and is no event for the log', async () => {
    const { router, log } = openRouter();
    try {
      expect(await router.resolveFromSessionCookie(undefined)).toEqual({ routed: false });
      expect(await router.resolveFromSessionCookie('')).toEqual({ routed: false });
      expect(log()).toEqual([]);
    } finally {
      await router.close();
    }
  });

  it("DEC-093 changing the code in a cookie reaches only the other Organisation's own database", async () => {
    // A session exists only in its own Organisation's database, so the identifier is looked for there and nowhere
    // else; whether it matches a session there is sign-in's (S1-F01-T08).
    const { router } = openRouter();
    const [first, second] = world.organisations;
    const identifier = sessionIdentifier();
    try {
      const result = await router.resolveFromSessionCookie(
        encodeSessionCookieValue({ organisationCode: second.code, sessionIdentifier: identifier }),
      );
      if (!result.routed) throw new Error('not routed');
      expect(await where(result.organisation)).toEqual({ database: second.database, role: 'aos_runtime' });
      expect(result.organisation.databaseName).not.toBe(first.database);
    } finally {
      await router.close();
    }
  });
});

// A third synthetic code and database name, which the directory never lists.
const OTHER_CODE = syntheticCode('ORG-X');
const OTHER_DATABASE = syntheticDatabaseName(OTHER_CODE);

describe('the directory as the runtime role sees it (DEC-093)', () => {
  it('PRD-SEC-005 the runtime role reads the directory and cannot change it', async () => {
    const runtime = await connect(world.directory, 'runtime');
    try {
      const rows = await runtime.query<{ organisation_code: string }>(
        'select organisation_code from kernel.directory_entry order by organisation_code',
      );
      expect(rows.rows.map((row) => row.organisation_code)).toEqual(world.organisations.map((o) => o.code).sort());
      expect(
        await sqlState(
          runtime.query(
            `insert into kernel.directory_entry (id, organisation_code, database_name)
             values ('01900000-0000-7000-8000-0000000000d1', $1, $2)`,
            [OTHER_CODE, OTHER_DATABASE],
          ),
        ),
      ).toBe('42501');
      expect(
        await sqlState(runtime.query('update kernel.directory_entry set database_name = $1', [OTHER_DATABASE])),
      ).toBe('42501');
      expect(await sqlState(runtime.query('delete from kernel.directory_entry'))).toBe('42501');
    } finally {
      await runtime.end();
    }
  });

  it('PRD-MOD-001 refuses two codes at one database, and one code twice', async () => {
    const owner = await connect(world.directory, 'migration');
    const [first, second] = world.organisations;
    try {
      // 23505: unique_violation.
      expect(
        await sqlState(
          owner.query(
            `insert into kernel.directory_entry (id, organisation_code, database_name)
             values ('01900000-0000-7000-8000-0000000000d2', $1, $2)`,
            [OTHER_CODE, first.database],
          ),
        ),
      ).toBe('23505');
      expect(
        await sqlState(
          owner.query(
            `insert into kernel.directory_entry (id, organisation_code, database_name)
             values ('01900000-0000-7000-8000-0000000000d3', $1, $2)`,
            [second.code, OTHER_DATABASE],
          ),
        ),
      ).toBe('23505');
      // 23514: check_violation.
      expect(
        await sqlState(
          owner.query(
            `insert into kernel.directory_entry (id, organisation_code, database_name)
             values ('01900000-0000-7000-8000-0000000000d4', '', $1)`,
            [OTHER_DATABASE],
          ),
        ),
      ).toBe('23514');
    } finally {
      await owner.end();
    }
  });
});

describe('the directory takes only database names routing can reach', () => {
  it.each(['syn org', 'syn-org', 'syn/org', 'syn%2forg', '', 'a'.repeat(64)])(
    'refuses the database name "%s", as routing does',
    async (name) => {
      const owner = await connect(world.directory, 'migration');
      try {
        // 23514: check_violation.
        expect(
          await sqlState(
            owner.query(
              'insert into kernel.directory_entry (id, organisation_code, database_name) values ($1, $2, $3)',
              [uuidv7(), OTHER_CODE, name],
            ),
          ),
        ).toBe('23514');
        expect(() => connectionToDatabase(databaseUrl(world.directory, 'runtime'))?.(name)).toThrow(
          /letters, digits and _ only/,
        );
      } finally {
        await owner.end();
      }
    },
  );

  it('takes a plain name of 63 characters, and routing reaches it', async () => {
    const owner = await connect(world.directory, 'migration');
    const name = `syn_${'x'.repeat(59)}`;
    try {
      await owner.query('begin');
      await owner.query(
        'insert into kernel.directory_entry (id, organisation_code, database_name) values ($1, $2, $3)',
        [uuidv7(), OTHER_CODE, name],
      );
      await owner.query('rollback');
      expect(connectionToDatabase(databaseUrl(world.directory, 'runtime'))?.(name)).toMatch(new RegExp(`/${name}$`));
    } finally {
      await owner.end();
    }
  });
});

describe('the routing module (module-map 4.1)', () => {
  it('gives the router by its token, made from the environment, and closes its pools at shutdown', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [OrganisationRoutingModule] })
      .overrideProvider(ROUTING_ENVIRONMENT)
      .useValue({
        AOS_RUNTIME_DATABASE_URL: databaseUrl(world.directory, 'runtime'),
        AOS_DATABASE_POOL_MAX: String(SYNTHETIC_POOL_MAX),
      })
      .compile();
    const router = moduleRef.get<OrganisationRouter>(ORGANISATION_ROUTER);
    const found = await routed(router, world.organisations[0].code);
    expect(await where(found)).toEqual({ database: world.organisations[0].database, role: 'aos_runtime' });
    await moduleRef.close();
    await expect(router.resolveForSignIn(world.organisations[0].code)).rejects.toThrow(/closed/);
  });

  it('refuses to start without its configuration', async () => {
    await expect(
      Test.createTestingModule({ imports: [OrganisationRoutingModule] })
        .overrideProvider(ROUTING_ENVIRONMENT)
        .useValue({ AOS_RUNTIME_DATABASE_URL: databaseUrl(world.directory, 'runtime') })
        .compile(),
    ).rejects.toThrow(/AOS_DATABASE_POOL_MAX is not set/);
  });
});
