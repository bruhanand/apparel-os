import { spawn } from 'node:child_process';
import type { Writable } from 'node:stream';

// PostgreSQL's own dump tool, run on a snapshot the backup command exported (backup-and-restore 3.2 step 1). The
// command needs PostgreSQL client tools of the server's major version where it runs (GC9-A5): `pg_dump` refuses a
// newer server by itself, and the backup records that as a failure.

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

/** The dump tool failed: its exit code only, never its output, which can name the server (PRD-SEC-014). */
export class DumpToolFailed extends Error {
  constructor(readonly exitCode: number | null) {
    super(`The dump tool failed with exit code ${String(exitCode)}`);
    this.name = 'DumpToolFailed';
  }
}

/** `pg_dump` from the PATH, given the connection through libpq's variables, so no password is ever an argument. */
export const pgDumpTool: DumpTool = {
  dump(target, into) {
    const url = new URL(target.connectionString);
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      PGHOST: url.hostname,
      PGPORT: url.port === '' ? '5432' : url.port,
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    };
    const sslmode = url.searchParams.get('sslmode');
    if (sslmode !== null) env.PGSSLMODE = sslmode;
    return runDump('pg_dump', ['--format=custom', '--no-password', `--snapshot=${target.snapshot}`], env, into);
  },
};

/** Runs a dump process, piping its standard output into `into`; resolves once it exits 0 and its output is written. */
export function runDump(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  into: Writable,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'ignore'] });
    let failed = false;
    child.on('error', () => {
      failed = true;
      into.destroy(new DumpToolFailed(null));
      reject(new DumpToolFailed(null));
    });
    child.stdout.pipe(into);
    child.on('close', (code) => {
      if (failed) return;
      if (code === 0) {
        resolve();
      } else {
        into.destroy(new DumpToolFailed(code));
        reject(new DumpToolFailed(code));
      }
    });
  });
}
