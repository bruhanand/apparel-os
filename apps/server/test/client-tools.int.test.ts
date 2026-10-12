import { randomBytes } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { Readable } from 'node:stream';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DumpToolFailed, pgDumpToolVia, pgRestoreToolVia } from '../src/kernel/index.js';
import { containerLauncher } from './support/backup.js';
import { testServer } from './support/postgres.js';

// The real client tools of backup and restore, `pg_dump` and `pg_restore` (backup-and-restore 3.2 step 1, 4.2 step 2,
// 10.4, 10.5; GC9-A5; S1-F14 review), run against the run's PostgreSQL 17 inside its container, where the tools of the
// server's version are, given the connection only through libpq's variables, as the commands give it: a password that
// needs percent-decoding, no port (so libpq's default), and other connection parameters passed through. The role, its
// password and the rows are SYNTHETIC.

const ROLE = `syn_tools_${randomBytes(4).toString('hex')}`;
/** A SYNTHETIC password with every character a URL must escape. */
const PASSWORD = `p@ss:w/rd%#?&=${randomBytes(4).toString('hex')}`;
const SOURCE = `${ROLE}_source`;
const COPY = `${ROLE}_copy`;

/**
 * The server's own address inside the container, which pg_hba admits only with a password (scram-sha-256), unlike
 * the loopback address the image trusts, so a password decoded wrongly is refused.
 */
let serverAddress: string;

/** The connection as the commands are given it, reaching the server inside the container over TCP on 5432. */
function connection(database: string, parameters = '', password = PASSWORD): string {
  return `postgresql://${ROLE}:${encodeURIComponent(password)}@${serverAddress}/${database}${parameters}`;
}

async function asSuperuser<T>(database: string, work: (client: Client) => Promise<T>): Promise<T> {
  const url = new URL(testServer().superuserUrl);
  url.pathname = `/${database}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

const launch = () => containerLauncher(testServer().containerId, { localSocket: false });

beforeAll(async () => {
  serverAddress = await asSuperuser(
    'postgres',
    async (client) => (await client.query<{ at: string }>('select host(inet_server_addr()) as at')).rows[0]?.at ?? '',
  );
  await asSuperuser('postgres', async (client) => {
    await client.query(`create role ${ROLE} login password ${client.escapeLiteral(PASSWORD)}`);
    await client.query(`create database ${SOURCE} owner ${ROLE}`);
    await client.query(`create database ${COPY} owner ${ROLE}`);
  });
  await asSuperuser(SOURCE, async (client) => {
    await client.query(`set role ${ROLE}`);
    await client.query('create table public.syn_rows (id int primary key, label text not null)');
    await client.query("insert into public.syn_rows select n, 'SYNTHETIC-' || n from generate_series(1, 25) n");
  });
});

afterAll(async () => {
  await asSuperuser('postgres', async (client) => {
    await client.query(`drop database if exists ${SOURCE} with (force)`);
    await client.query(`drop database if exists ${COPY} with (force)`);
    await client.query(`drop role if exists ${ROLE}`);
  });
});

describe('the real client tools, as the backup and restore commands run them (GC9-A5)', () => {
  it('dumps on an exported snapshot and restores into an empty database, the password decoded, the port defaulted and the other parameters passed through', async () => {
    const parameters =
      '?sslmode=disable&application_name=syn-tools&connect_timeout=10&options=-c%20statement_timeout%3D600000';
    const server = testServer();
    const snapshotHolder = new Client({
      connectionString: `postgresql://${ROLE}:${encodeURIComponent(PASSWORD)}@${server.host}:${String(server.port)}/${SOURCE}`,
    });
    await snapshotHolder.connect();
    let dump: Buffer;
    try {
      await snapshotHolder.query('begin isolation level repeatable read read only');
      const snapshot =
        (await snapshotHolder.query<{ id: string }>('select pg_catalog.pg_export_snapshot() as id')).rows[0]?.id ?? '';
      // Written after the snapshot: the dump must not hold it.
      await asSuperuser(SOURCE, (client) => client.query("insert into public.syn_rows values (99, 'SYNTHETIC-after')"));
      const into = new PassThrough();
      const read = buffer(into);
      await pgDumpToolVia(launch()).dump({ connectionString: connection(SOURCE, parameters), snapshot }, into);
      dump = await read;
      await snapshotHolder.query('rollback');
    } finally {
      await snapshotHolder.end();
    }
    expect(dump.subarray(0, 5).toString('latin1')).toBe('PGDMP');

    await pgRestoreToolVia(launch()).restore({ connectionString: connection(COPY, parameters) }, Readable.from([dump]));
    const rows = await asSuperuser(
      COPY,
      async (client) =>
        (
          await client.query<{ n: string; after: string }>(
            'select count(*)::text as n, count(*) filter (where id = 99)::text as after from public.syn_rows',
          )
        ).rows[0],
    );
    expect(rows).toEqual({ n: '25', after: '0' });
  });

  it('fails with the exit code only, never the tool’s words, when the password is wrong or the load fails', async () => {
    const wrong = connection(SOURCE, '', `${PASSWORD}-wrong`);
    const into = new PassThrough();
    void buffer(into).catch(() => undefined);
    const failed = pgDumpToolVia(launch()).dump({ connectionString: wrong, snapshot: '00000003-00000002-1' }, into);
    await expect(failed).rejects.toBeInstanceOf(DumpToolFailed);
    await expect(failed).rejects.toThrow(/^The client tool failed with exit code \d+$/);
    // A load into a database that already holds the table stops at the first error, in one transaction.
    const again = pgRestoreToolVia(launch()).restore(
      { connectionString: connection(COPY) },
      Readable.from([Buffer.from('PGDMP-not-a-dump')]),
    );
    await expect(again).rejects.toBeInstanceOf(DumpToolFailed);
  });
});
