import { Writable } from 'node:stream';
import { uuidv7 } from '@apparel-os/domain';
import { pino } from 'pino';
import { PinoLoggerService } from '../../src/kernel/index.js';
import { connect } from './postgres.js';

// S1-F01-T06: what a worker test needs. Every value here is SYNTHETIC.

/**
 * Writes a SYNTHETIC internal service identity directly, as the migration role: Approved and Active from yesterday,
 * until the setup step (S1-F01-T10) writes the identities the worker runs as (code-house-rules 11.2). Returns its
 * identifier.
 */
export async function writeSyntheticServiceIdentity(database: string, code: string): Promise<string> {
  const owner = await connect(database, 'migration');
  const id = uuidv7();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  try {
    await owner.query(`insert into access.service_identity (id, code, kind) values ($1, $2, 'internal')`, [id, code]);
    await owner.query(
      `insert into access.service_identity_version (id, service_identity_id, state, valid_during, decision)
       values ($1, $2, 'Active', daterange($3::date, null), 'Approved')`,
      [uuidv7(), id, yesterday],
    );
    return id;
  } finally {
    await owner.end();
  }
}

/** A logger whose lines a test reads back, parsed. */
export function capturingLogger(): { logger: PinoLoggerService; lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const logger = new PinoLoggerService(
    pino(
      new Writable({
        write(chunk: Buffer, _encoding, done) {
          for (const line of chunk.toString('utf8').split('\n')) {
            if (line !== '') lines.push(JSON.parse(line) as Record<string, unknown>);
          }
          done();
        },
      }),
    ),
  );
  return { logger, lines };
}

/** Waits until `check` answers true, or fails after `timeoutMs`. */
export async function eventually(check: () => Promise<boolean>, timeoutMs = 20_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > until) throw new Error('The condition was not met in time');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
