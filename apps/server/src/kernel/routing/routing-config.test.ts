import { describe, expect, it } from 'vitest';
import { connectionToDatabase } from '../db/connection.js';
import { routingConfigFromEnvironment } from './routing-config.js';

// S1-F01-T02: routing's configuration has no default (AGENTS.md "Never invent a value"), and no error repeats a
// connection string, which holds a password (PRD-SEC-014). Synthetic values only.

const PASSWORD = 'synthetic-password-9f3c';
const URL_OK = `postgres://aos_runtime:${PASSWORD}@db.internal:5432/aos_directory`;

describe('routingConfigFromEnvironment', () => {
  it('reads the runtime connection to the directory and the pool size', () => {
    expect(routingConfigFromEnvironment({ AOS_RUNTIME_DATABASE_URL: URL_OK, AOS_DATABASE_POOL_MAX: '4' })).toEqual({
      directoryConnectionString: URL_OK,
      poolMax: 4,
    });
  });

  it.each([
    [{ AOS_DATABASE_POOL_MAX: '4' }, /AOS_RUNTIME_DATABASE_URL is not set/],
    [{ AOS_RUNTIME_DATABASE_URL: '', AOS_DATABASE_POOL_MAX: '4' }, /AOS_RUNTIME_DATABASE_URL is not set/],
    [{ AOS_RUNTIME_DATABASE_URL: URL_OK }, /AOS_DATABASE_POOL_MAX is not set; it has no default/],
    [{ AOS_RUNTIME_DATABASE_URL: URL_OK, AOS_DATABASE_POOL_MAX: '0' }, /at least 1/],
    [{ AOS_RUNTIME_DATABASE_URL: URL_OK, AOS_DATABASE_POOL_MAX: '2.5' }, /at least 1/],
    [{ AOS_RUNTIME_DATABASE_URL: URL_OK, AOS_DATABASE_POOL_MAX: ' 4' }, /at least 1/],
  ] as const)('refuses %o', (env, reason) => {
    expect(() => routingConfigFromEnvironment(env)).toThrow(reason);
  });

  it('PRD-SEC-014 refuses a connection string it cannot point at another database, without repeating it', () => {
    const socketForm = `postgres://aos_runtime:${PASSWORD}@/aos_directory?host=/tmp`;
    let message = '';
    try {
      routingConfigFromEnvironment({ AOS_RUNTIME_DATABASE_URL: socketForm, AOS_DATABASE_POOL_MAX: '4' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/AOS_RUNTIME_DATABASE_URL must have the form/);
    expect(message).not.toContain(PASSWORD);
  });
});

describe('connectionToDatabase (DEC-093; deployment.md section 4)', () => {
  it('points the same server and role at another database', () => {
    const to = connectionToDatabase(`${URL_OK}?sslmode=require`);
    expect(to?.('syn_org_a')).toBe(`postgres://aos_runtime:${PASSWORD}@db.internal:5432/syn_org_a?sslmode=require`);
  });

  it.each(['not a url', 'postgres://aos_runtime@/aos_directory?host=/tmp', 'http://db.internal/aos_directory'])(
    'gives nothing for %s',
    (connectionString) => {
      expect(connectionToDatabase(connectionString)).toBeUndefined();
    },
  );

  it.each(['', 'syn org', 'syn/org', 'syn%2forg', 'syn-org', 'a'.repeat(64)])(
    'refuses the database name "%s"',
    (name) => {
      expect(() => connectionToDatabase(URL_OK)?.(name)).toThrow(/letters, digits and _ only/);
    },
  );
});
