import { describe, expect, it } from 'vitest';
import { libpqEnvironment, pgRestoreToolVia, type ClientToolLauncher } from './dump-tool.js';

// The connection of PostgreSQL's client tools (backup-and-restore 10.4, 10.5; PRD-SEC-014): through libpq's variables,
// never an argument; every parameter passed through; a database name never read as a connection string. Every value
// here is SYNTHETIC.

describe('libpq variables of a connection string', () => {
  it('decodes the user and password, takes 5432 when no port is given, and checks the database name', () => {
    const env = libpqEnvironment('postgres://syn%40user:p%40ss%3Aw%2Frd%25%23@db.internal/syn_db');
    expect(env).toEqual({
      PGHOST: 'db.internal',
      PGPORT: '5432',
      PGUSER: 'syn@user',
      PGPASSWORD: 'p@ss:w/rd%#',
      PGDATABASE: 'syn_db',
    });
    expect(libpqEnvironment('postgresql://u:p@[::1]:6543/syn_db').PGHOST).toBe('::1');
    expect(libpqEnvironment('postgresql://u:p@h:6543/syn_db').PGPORT).toBe('6543');
  });

  it('passes every other connection parameter through as its libpq variable, never dropping one', () => {
    const env = libpqEnvironment(
      'postgres://u:p@h/syn_db?sslmode=verify-full&sslrootcert=%2Fcerts%2Froot.crt&options=-c%20search_path%3Dpublic&application_name=syn&connect_timeout=10&target_session_attrs=read-write',
    );
    expect(env).toMatchObject({
      PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: '/certs/root.crt',
      PGOPTIONS: '-c search_path=public',
      PGAPPNAME: 'syn',
      PGCONNECT_TIMEOUT: '10',
      PGTARGETSESSIONATTRS: 'read-write',
    });
    expect(() => libpqEnvironment('postgres://u:p@h/syn_db?syn_unknown=1')).toThrow(
      /syn_unknown has no libpq variable/,
    );
  });

  it('refuses a database name that a tool could read as a connection string, naming no value', () => {
    for (const name of ['host%3Devil', 'postgresql%3A%2F%2Fevil', 'syn db', '']) {
      expect(() => libpqEnvironment(`postgres://u:secret@h/${name}`)).toThrow(/database name/);
    }
    try {
      libpqEnvironment('postgres://u:secret@h/host%3Devil');
    } catch (error) {
      expect((error as Error).message).not.toContain('secret');
    }
  });

  it('gives the restore tool the checked name and the rest through the environment, never a password argument', async () => {
    let seen: { args: readonly string[]; env: Readonly<Record<string, string>> } | undefined;
    const launch: ClientToolLauncher = (_tool, args, env) => {
      seen = { args, env };
      return { command: 'false', args: [], env: {} };
    };
    const { Readable } = await import('node:stream');
    await expect(
      pgRestoreToolVia(launch).restore({ connectionString: 'postgres://u:syn-secret@h/syn_db' }, Readable.from([])),
    ).rejects.toThrow(/exit code/);
    expect(seen?.args).toContain('--dbname=syn_db');
    expect(seen?.args.join(' ')).not.toContain('syn-secret');
    expect(seen?.env.PGPASSWORD).toBe('syn-secret');
  });
});
