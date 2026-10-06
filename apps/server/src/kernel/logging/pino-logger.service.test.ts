import { Writable } from 'node:stream';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { PinoLoggerService } from './pino-logger.service.js';

// code-house-rules 12.11 "What never appears in a log": a database error's detail or bound parameters; only its
// SQLSTATE, constraint and table (PRD-SEC-006, PRD-SEC-014). Every value here is SYNTHETIC.

function captured(): { logger: PinoLoggerService; text: () => string; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(chunk.toString('utf8'));
      done();
    },
  });
  return {
    logger: new PinoLoggerService(pino(stream)),
    text: () => chunks.join(''),
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

/** A unique violation as pg raises it, naming the value in its detail. */
function uniqueViolation(): DatabaseError {
  const error = new DatabaseError('duplicate key value violates unique constraint "app_user_login_key"', 0, 'error');
  error.code = '23505';
  error.detail = 'Key (login)=(SYNTHETIC-MARKER-LOGIN) already exists.';
  error.constraint = 'app_user_login_key';
  error.table = 'app_user';
  error.schema = 'access';
  error.where = 'SQL statement "insert ... SYNTHETIC-MARKER-WHERE"';
  return error;
}

describe('errors in the log (code-house-rules 12.11)', () => {
  it('PRD-SEC-014 keeps a database error’s SQLSTATE, constraint and table, never its detail', () => {
    const log = captured();
    log.logger.error(uniqueViolation(), 'Routing');
    expect(log.text()).not.toContain('SYNTHETIC-MARKER');
    expect(log.lines()[0]).toMatchObject({
      level: 50,
      context: 'Routing',
      error: { type: 'DatabaseError', sqlState: '23505', constraint: 'app_user_login_key', table: 'app_user' },
    });
  });

  it('PRD-SEC-014 keeps a wrapped query’s bound parameters and text out, looking through its causes', () => {
    const log = captured();
    const wrapped = new DrizzleQueryError(
      'insert into access.app_user (id, login) values ($1, $2)',
      ['0199b3c4-5d6e-7f80-91a2-b3c4d5e6f701', 'SYNTHETIC-MARKER-PARAM'],
      uniqueViolation(),
    );
    log.logger.error(wrapped, 'Setup');
    expect(log.text()).not.toContain('SYNTHETIC-MARKER');
    expect(log.text()).not.toContain('insert into');
    expect(log.lines()[0]).toMatchObject({ error: { sqlState: '23505', table: 'app_user' } });
  });

  it('keeps the message of the application’s own wrapper, such as a failed migration, without the database’s words', () => {
    const log = captured();
    log.logger.error(
      new Error('Migration 0001__kernel__migration_record.sql failed', { cause: uniqueViolation() }),
      'Migrate',
    );
    expect(log.text()).not.toContain('SYNTHETIC-MARKER');
    expect(log.text()).not.toContain('duplicate key');
    expect(log.lines()[0]).toMatchObject({
      msg: 'Migration 0001__kernel__migration_record.sql failed',
      error: { sqlState: '23505' },
    });
  });

  it('keeps another error’s name, message and stack', () => {
    const log = captured();
    log.logger.error(new TypeError('SYNTHETIC defect'), 'Setup');
    expect(log.lines()[0]).toMatchObject({
      msg: 'SYNTHETIC defect',
      error: { type: 'TypeError', message: 'SYNTHETIC defect', stack: expect.stringContaining('TypeError') as unknown },
    });
  });
});
