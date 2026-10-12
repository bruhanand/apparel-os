import { spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { DATABASE_NAME } from '../db/connection.js';

// PostgreSQL's own client tools, `pg_dump` and `pg_restore` (backup-and-restore 3.2 step 1, 4.2 step 2, 10.4, 10.5).
// The backup runs the dump tool on a snapshot it exported; the restore runs the restore tool into a database it
// created. Each needs client tools of the server's major version where it runs (GC9-A5): `pg_dump` refuses a newer
// server by itself, and the backup records that as a failure.
//
// The connection reaches each tool through libpq's environment variables, never its arguments, so no password is ever
// an argument a process listing shows; and every database name is checked before it is used (DATABASE_NAME), so a
// name holding `=` or starting with `postgresql://` can never be read by a tool as a connection string.

/** One database to dump, on the snapshot its transaction exported. */
export interface DumpTarget {
  /** The migration role's connection string to the database. Never logged. */
  readonly connectionString: string;
  readonly snapshot: string;
}

/** Dumps one database in PostgreSQL's custom format into `into`, ending it. Rejects naming no secret. */
export interface DumpTool {
  dump(target: DumpTarget, into: Writable): Promise<void>;
}

/** Loads one dump in PostgreSQL's custom format, read from `from`, into an empty database. Rejects naming no secret. */
export interface RestoreTool {
  restore(target: { readonly connectionString: string }, from: Readable): Promise<void>;
}

/** A client tool failed: its exit code only, never its output, which can name the server (PRD-SEC-014). */
export class DumpToolFailed extends Error {
  constructor(readonly exitCode: number | null) {
    super(`The client tool failed with exit code ${String(exitCode)}`);
    this.name = 'DumpToolFailed';
  }
}

/**
 * The libpq variable of each connection parameter a connection string may carry as a query parameter (PostgreSQL 17,
 * libpq "Environment Variables"), so a parameter such as `sslrootcert` or `options` reaches the tool as it would
 * reach `pg` itself, never dropped. A parameter libpq has no variable for is refused rather than silently left out.
 */
const LIBPQ_VARIABLES: Readonly<Record<string, string>> = {
  hostaddr: 'PGHOSTADDR',
  passfile: 'PGPASSFILE',
  channel_binding: 'PGCHANNELBINDING',
  service: 'PGSERVICE',
  options: 'PGOPTIONS',
  application_name: 'PGAPPNAME',
  sslmode: 'PGSSLMODE',
  sslnegotiation: 'PGSSLNEGOTIATION',
  sslcompression: 'PGSSLCOMPRESSION',
  sslcert: 'PGSSLCERT',
  sslkey: 'PGSSLKEY',
  sslcertmode: 'PGSSLCERTMODE',
  sslrootcert: 'PGSSLROOTCERT',
  sslcrl: 'PGSSLCRL',
  sslcrldir: 'PGSSLCRLDIR',
  sslsni: 'PGSSLSNI',
  requirepeer: 'PGREQUIREPEER',
  require_auth: 'PGREQUIREAUTH',
  ssl_min_protocol_version: 'PGSSLMINPROTOCOLVERSION',
  ssl_max_protocol_version: 'PGSSLMAXPROTOCOLVERSION',
  gssencmode: 'PGGSSENCMODE',
  krbsrvname: 'PGKRBSRVNAME',
  gsslib: 'PGGSSLIB',
  gssdelegation: 'PGGSSDELEGATION',
  connect_timeout: 'PGCONNECT_TIMEOUT',
  client_encoding: 'PGCLIENTENCODING',
  target_session_attrs: 'PGTARGETSESSIONATTRS',
  load_balance_hosts: 'PGLOADBALANCEHOSTS',
};

/**
 * libpq's variables for a connection string (`postgres://user:password@host:port/database?param=value`): the user and
 * password percent-decoded, the port 5432 when none is given (libpq's default), the database name checked, and every
 * other parameter passed through as its libpq variable. Throws, naming no value, on a name or parameter it cannot pass.
 */
export function libpqEnvironment(connectionString: string): Record<string, string> {
  const url = new URL(connectionString);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('The connection is not a postgres:// connection string');
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!DATABASE_NAME.test(database)) {
    throw new Error('The database name is not letters, digits and _ of at most 63 characters');
  }
  const env: Record<string, string> = {
    PGHOST: decodeURIComponent(url.hostname).replace(/^\[(.*)\]$/, '$1'),
    PGPORT: url.port === '' ? '5432' : url.port,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
  };
  for (const [name, value] of url.searchParams) {
    const variable = LIBPQ_VARIABLES[name];
    if (variable === undefined) throw new Error(`The connection parameter ${name} has no libpq variable`);
    env[variable] = value;
  }
  return env;
}

/**
 * How a client tool is started: from the PATH by default; a test runs the tool of the server's version inside its
 * PostgreSQL container instead (test/support/backup.ts), passing the same libpq variables through.
 */
export type ClientToolLauncher = (
  tool: 'pg_dump' | 'pg_restore',
  args: readonly string[],
  env: Readonly<Record<string, string>>,
) => { readonly command: string; readonly args: readonly string[]; readonly env: NodeJS.ProcessEnv };

/** Starts the tool from the PATH, with libpq's variables and the PATH only. */
export const fromPath: ClientToolLauncher = (tool, args, env) => ({
  command: tool,
  args,
  env: { PATH: process.env.PATH, ...env },
});

/** `pg_dump` in custom format on the exported snapshot, the connection through libpq's variables. */
export function pgDumpToolVia(launch: ClientToolLauncher): DumpTool {
  return {
    dump(target, into) {
      const env = libpqEnvironment(target.connectionString);
      const started = launch('pg_dump', ['--format=custom', '--no-password', `--snapshot=${target.snapshot}`], env);
      return runClientTool(started, { output: into });
    },
  };
}

/**
 * `pg_restore` into the database the connection names, in one transaction, stopping at the first error, so a failed
 * load leaves the database empty. `--dbname` takes the name libpqEnvironment checked, which is never a connection
 * string; the rest of the connection comes through libpq's variables.
 */
export function pgRestoreToolVia(launch: ClientToolLauncher): RestoreTool {
  return {
    restore(target, from) {
      const env = libpqEnvironment(target.connectionString);
      const started = launch(
        'pg_restore',
        ['--exit-on-error', '--single-transaction', '--no-password', `--dbname=${env.PGDATABASE ?? ''}`],
        env,
      );
      return runClientTool(started, { input: from });
    },
  };
}

export const pgDumpTool: DumpTool = pgDumpToolVia(fromPath);
export const pgRestoreTool: RestoreTool = pgRestoreToolVia(fromPath);

/**
 * Runs one client tool to its end: piping its standard output into `output` (the dump tool), or `input` into its
 * standard input (the restore tool). Resolves once it exits 0 and its output is written; rejects with its exit code
 * only. A stream that fails, such as a dump that does not open, stops the tool.
 */
export function runClientTool(
  started: { readonly command: string; readonly args: readonly string[]; readonly env: NodeJS.ProcessEnv },
  streams: { readonly output?: Writable; readonly input?: Readable },
): Promise<void> {
  const { output, input } = streams;
  return new Promise((resolve, reject) => {
    const child = spawn(started.command, [...started.args], {
      env: started.env,
      stdio: [input === undefined ? 'ignore' : 'pipe', output === undefined ? 'ignore' : 'pipe', 'ignore'],
    });
    let failed = false;
    const fail = (error: DumpToolFailed): void => {
      if (failed) return;
      failed = true;
      if (input !== undefined && child.stdin !== null) {
        input.unpipe(child.stdin);
        input.destroy();
      }
      output?.destroy(error);
      reject(error);
    };
    child.on('error', () => {
      fail(new DumpToolFailed(null));
    });
    if (input !== undefined && child.stdin !== null) {
      input.on('error', () => {
        child.stdin?.destroy();
        fail(new DumpToolFailed(null));
      });
      child.stdin.on('error', () => undefined);
      input.pipe(child.stdin);
    }
    if (output !== undefined && child.stdout !== null) child.stdout.pipe(output);
    child.on('close', (code) => {
      if (failed) return;
      if (code === 0) resolve();
      else fail(new DumpToolFailed(code));
    });
  });
}
