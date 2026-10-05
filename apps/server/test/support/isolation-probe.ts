import { uuidv7 } from '@apparel-os/domain';
import { Client } from 'pg';
import { expect, inject } from 'vitest';
import { connect } from './postgres.js';
import { createSyntheticOrganisations } from './organisations.js';

// The proof that two test files running at the same time never see each other's rows (code-house-rules 11.3).
// Two files, fixtures-isolation-a and -b, each run this probe. They wait for each other at two points through the
// public.syn_test_barrier table of the container's own database, so each reads its databases while the other's databases
// exist and hold rows.

export type Side = 'a' | 'b';

const WAIT_LIMIT_MS = 240_000;
const POLL_MS = 100;

export async function runIsolationProbe(side: Side): Promise<void> {
  try {
    await probe(side);
  } catch (error) {
    // Tell the other file at once, so it stops instead of waiting out its limit.
    await signal(side, 'failed', []).catch(() => undefined);
    throw error;
  }
}

async function probe(side: Side): Promise<void> {
  const other: Side = side === 'a' ? 'b' : 'a';
  const world = await createSyntheticOrganisations(`isolation_${side}`);
  const mine = [world.directory, ...world.organisations.map((organisation) => organisation.database)];
  try {
    // Each database gets a synthetic table, made by test setup as the migration role, and one row written as the
    // runtime role, naming the file and the database it was written in. "If not exists", so that if the two files
    // ever shared a database, the check on rows below is what fails.
    for (const database of mine) {
      const owner = await connect(database, 'migration');
      try {
        await owner.query(`
          create schema if not exists syn_probe;
          grant usage on schema syn_probe to aos_runtime;
          create table if not exists syn_probe.mark (id uuid primary key, written_by text not null);
          grant select, insert on syn_probe.mark to aos_runtime;`);
      } finally {
        await owner.end();
      }
      await asRuntime(database, (client) =>
        client.query('insert into syn_probe.mark (id, written_by) values ($1, $2)', [uuidv7(), mark(side, database)]),
      );
    }

    await signal(side, 'written', mine);
    const theirs = await waitFor(other, 'written');

    // Each file reads while the other's databases exist and hold their rows.
    expect(await existing(theirs)).toEqual([...theirs].sort());
    for (const database of mine) {
      const rows = await asRuntime(database, (client) =>
        client.query<{ written_by: string }>('select written_by from syn_probe.mark order by written_by'),
      );
      expect(rows.rows.map((row) => row.written_by)).toEqual([mark(side, database)]);
    }
    expect(theirs.filter((name) => mine.includes(name))).toEqual([]);

    // Neither file drops its databases before the other has read its own.
    await signal(side, 'read', mine);
    await waitFor(other, 'read');
  } finally {
    await world.reset();
  }
  expect(await existing(mine)).toEqual([]);
}

function mark(side: Side, database: string): string {
  return `SYNTHETIC file ${side}, database ${database}`;
}

async function asRuntime<T>(database: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(database, 'runtime');
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function onBarrier<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: inject('postgres').superuserUrl });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function signal(side: Side, step: string, databases: readonly string[]): Promise<void> {
  await onBarrier((client) =>
    client.query('insert into public.syn_test_barrier (side, step, databases) values ($1, $2, $3)', [
      side,
      step,
      databases,
    ]),
  );
}

/** Waits until the other file has reached a step, and returns the databases it named. Stops if it failed. */
async function waitFor(side: Side, step: string): Promise<string[]> {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  for (;;) {
    const result = await onBarrier((client) =>
      client.query<{ step: string; databases: string[] }>(
        "select step, databases from public.syn_test_barrier where side = $1 and step in ($2, 'failed')",
        [side, step],
      ),
    );
    if (result.rows.some((row) => row.step === 'failed')) {
      throw new Error(`Test file ${side} failed before "${step}"; its own error says why`);
    }
    const found = result.rows[0];
    if (found !== undefined) return found.databases;
    if (Date.now() > deadline) {
      throw new Error(
        `Test file ${side} did not reach "${step}" within ${String(WAIT_LIMIT_MS / 1000)} s: the two isolation files must run at the same time (maxWorkers of at least 2)`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function existing(names: readonly string[]): Promise<string[]> {
  const result = await onBarrier((client) =>
    client.query<{ datname: string }>('select datname from pg_catalog.pg_database where datname = any($1) order by 1', [
      names,
    ]),
  );
  return result.rows.map((row) => row.datname);
}
