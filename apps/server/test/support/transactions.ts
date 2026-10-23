import { sql } from 'drizzle-orm';
import type { PoolClient } from 'pg';
import type { RoutedOrganisation, TransactionContext } from '../../src/kernel/index.js';
import { connect } from './postgres.js';

// Helpers that drive transactions step by step for the concurrency and uncertain-commit tests (code-house-rules
// 10.3): the order comes from what PostgreSQL reports, never from a sleep.

/** A gate a test opens to let a waiting command go on. */
export function gate(): { wait: Promise<void>; open: () => void } {
  let open = (): void => undefined;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

/** The backend process of the command's connection. */
export async function backendPid(context: TransactionContext): Promise<number> {
  const result = await context.tx.execute<{ pid: number }>(sql`select pg_catalog.pg_backend_pid() as pid`);
  const pid = result.rows[0]?.pid;
  if (pid === undefined) throw new Error('No backend pid');
  return pid;
}

/** Waits until PostgreSQL shows the backend waiting for a lock (code-house-rules 10.3). */
export async function waitUntilWaitingForLock(database: string, pid: number): Promise<void> {
  const observer = await connect(database, 'superuser');
  try {
    const deadline = Date.now() + 20_000;
    for (;;) {
      const result = await observer.query<{ wait_event_type: string | null }>(
        'select wait_event_type from pg_catalog.pg_stat_activity where pid = $1',
        [pid],
      );
      if (result.rows[0]?.wait_event_type === 'Lock') return;
      if (Date.now() > deadline) throw new Error(`Backend ${String(pid)} never waited for a lock`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    await observer.end();
  }
}

/**
 * Waits until some backend of the database other than `except` waits for a lock, and gives its pid back, for a test
 * that cannot ask the waiting command for its pid because the command is blocked before it could tell.
 */
export async function waitUntilAnyWaitingForLock(database: string, except: readonly number[]): Promise<number> {
  const observer = await connect(database, 'superuser');
  try {
    const deadline = Date.now() + 20_000;
    for (;;) {
      const result = await observer.query<{ pid: number }>(
        `select pid from pg_catalog.pg_stat_activity
         where datname = current_database() and wait_event_type = 'Lock' and pid <> all($1::int[])`,
        [except],
      );
      const pid = result.rows[0]?.pid;
      if (pid !== undefined) return pid;
      if (Date.now() > deadline) throw new Error('No backend waited for a lock');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    await observer.end();
  }
}

/**
 * Forces a race (code-house-rules 10.3): runs `first` in the transaction `inTransaction` opens, and holds that
 * transaction open once `first` has taken its locks and written, until `second`, started only then, is seen waiting for
 * a lock; then lets the first commit and answers both. Where the lock both should take is missing, the second never
 * waits and this fails, so a race test built on it fails when the lock is taken out.
 */
export async function heldUntilSecondWaits<First, Second>(
  database: string,
  inTransaction: <T>(work: (context: TransactionContext) => Promise<T>) => Promise<T>,
  first: (context: TransactionContext) => Promise<First>,
  second: () => Promise<Second>,
): Promise<{ readonly first: First; readonly second: Second }> {
  const held = gate();
  const release = gate();
  let pid: number | undefined;
  const firstDone = inTransaction(async (context) => {
    const answer = await first(context);
    pid = await backendPid(context);
    held.open();
    await release.wait;
    return answer;
  });
  // A first command that fails before it holds answers with its failure.
  await Promise.race([held.wait, firstDone]);
  if (pid === undefined) throw new Error('The first command ended without holding its transaction');
  const secondDone = second();
  const waited = waitUntilAnyWaitingForLock(database, [pid]).finally(release.open);
  const [, firstAnswer, secondAnswer] = await Promise.all([waited, firstDone, secondDone]);
  return { first: firstAnswer, second: secondAnswer };
}

/** Ends a backend from another session, as a lost connection would, and waits until PostgreSQL shows it gone. */
export async function terminateBackend(database: string, pid: number): Promise<void> {
  const operator = await connect(database, 'superuser');
  try {
    await operator.query('select pg_catalog.pg_terminate_backend($1)', [pid]);
    const deadline = Date.now() + 10_000;
    for (;;) {
      const left = await operator.query('select 1 from pg_catalog.pg_stat_activity where pid = $1', [pid]);
      if (left.rows.length === 0) return;
      if (Date.now() > deadline) throw new Error(`Backend ${String(pid)} did not end`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    await operator.end();
  }
}

type Query = (...args: unknown[]) => Promise<unknown>;

/**
 * The Organisation as the runner sees it, with every COMMIT its connections send handed to `intercept`, which
 * decides when the real COMMIT is sent. Everything else reaches the real connection unchanged.
 */
export function interceptingCommit(
  base: RoutedOrganisation,
  intercept: (send: () => Promise<unknown>, pid: number) => Promise<unknown>,
): RoutedOrganisation {
  const pool = base.db.$client;
  const connectClient = async (): Promise<PoolClient> => {
    const raw = await pool.connect();
    const pid = (await raw.query<{ pid: number }>('select pg_catalog.pg_backend_pid() as pid')).rows[0]?.pid ?? 0;
    return new Proxy(raw, {
      get: (target, property) => {
        if (property !== 'query') return Reflect.get(target, property, target) as unknown;
        return (...args: unknown[]) => {
          const send = (): Promise<unknown> => (target.query as unknown as Query).apply(target, args);
          const statement = args[0];
          const text =
            typeof statement === 'object' && statement !== null && 'text' in statement ? statement.text : statement;
          return text === 'commit' ? intercept(send, pid) : send();
        };
      },
    });
  };
  return { ...base, db: { $client: { connect: connectClient } } as unknown as RoutedOrganisation['db'] };
}
