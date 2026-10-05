import { describe, expect, it } from 'vitest';
import { seedRefusal } from './environment.js';

// S0-T06: the local seed refuses to run unless the environment says it is local or dev (code-house-rules 11.2).

describe('where the seed may run (code-house-rules 11.2)', () => {
  it.each([
    { AOS_ENVIRONMENT: 'local' },
    { AOS_ENVIRONMENT: 'dev' },
    { AOS_ENVIRONMENT: 'dev', RAILWAY_ENVIRONMENT_NAME: 'dev' },
  ])('runs with %o', (env) => {
    expect(seedRefusal(env)).toBeUndefined();
  });

  it.each([
    [{}, /AOS_ENVIRONMENT is not set/],
    [{ AOS_ENVIRONMENT: '' }, /AOS_ENVIRONMENT is not set/],
    [{ AOS_ENVIRONMENT: 'kdps-test' }, /AOS_ENVIRONMENT is kdps-test/],
    [{ AOS_ENVIRONMENT: 'production' }, /AOS_ENVIRONMENT is production/],
    [{ AOS_ENVIRONMENT: 'Dev' }, /AOS_ENVIRONMENT is Dev/],
    [{ AOS_ENVIRONMENT: 'dev', RAILWAY_ENVIRONMENT_NAME: 'kdps-test' }, /RAILWAY_ENVIRONMENT_NAME is kdps-test/],
    [{ AOS_ENVIRONMENT: 'local', RAILWAY_ENVIRONMENT_NAME: 'dev' }, /on Railway the seed runs only in dev/],
    [{ AOS_ENVIRONMENT: 'dev', RAILWAY_ENVIRONMENT: 'kdps-test' }, /RAILWAY_ENVIRONMENT is kdps-test/],
  ] as const)('refuses %o', (env, reason) => {
    expect(seedRefusal(env)).toMatch(reason);
  });
});
