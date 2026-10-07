import { describe, expect, it } from 'vitest';
import {
  CommandCancelled,
  CommandDefect,
  CommandOutcomeUnknown,
  CommandTimedOut,
} from '../command-runner/command-errors.js';
import { IdempotencyConflict } from '../idempotency/idempotency-errors.js';
import { StaleAuthority } from './contracts.js';
import { retryRuleOf } from './retry-rule.js';

// S1-F01-T06: the retry rule goes by what failed (code-house-rules 12.9 "The retry rule").

const CORRELATION = '01900000-0000-7000-8000-0000006b0001';

function databaseError(code: string): Error {
  return Object.assign(new Error('SYNTHETIC database error'), { code });
}

describe('the retry rule (code-house-rules 12.9)', () => {
  it.each([
    ['a time limit', new CommandTimedOut('statement', '57014', CORRELATION)],
    ['a cancelled statement', new CommandCancelled(CORRELATION)],
    ['an outcome not known, whose key is kept', new CommandOutcomeUnknown(CORRELATION)],
    ['the first delivery still running', new IdempotencyConflict('kernel.request-in-progress', CORRELATION)],
    ['a lost connection', databaseError('08006')],
    ['the server shutting down', databaseError('57P01')],
    ['a connection reset', Object.assign(new Error('SYNTHETIC reset'), { code: 'ECONNRESET' })],
    ['a connection ended', new Error('Connection terminated unexpectedly')],
    ['DEC-118 an authority gone stale under the step-0 locks', new StaleAuthority()],
  ])('retries something transient: %s', (_what, error) => {
    expect(retryRuleOf(error)).toBe('retry');
  });

  it.each([
    ['a defect', new CommandDefect('SYNTHETIC defect')],
    ['a deadlock', databaseError('40P01')],
    ['an append-only guard', databaseError('AO001')],
    ['a key reused with other content', new IdempotencyConflict('kernel.idempotency-key-reused', CORRELATION)],
    ['an unexpected error', new TypeError('SYNTHETIC')],
    ['a constraint violation', databaseError('23505')],
  ])('never retries a defect: %s', (_what, error) => {
    expect(retryRuleOf(error)).toBe('defect');
  });
});
