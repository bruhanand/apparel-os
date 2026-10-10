import { describe, expect, it } from 'vitest';
import { deploymentEnvironmentFromEnvironment, isDevelopmentEnvironment } from './deployment-environment.js';

// The environment's name, read at start through one schema (code-house-rules 12.14 "Technical settings"; deployment.md
// section 1; RR-193): `local`, `dev` or `kdps-test`. Unset, empty or any other value stops the service, so nothing
// guesses which environment it is in (S1-F04 review H1).

describe('AOS_ENVIRONMENT (deployment.md section 1; code-house-rules 12.14)', () => {
  it.each(['local', 'dev', 'kdps-test'] as const)('reads %s', (name) => {
    expect(deploymentEnvironmentFromEnvironment({ AOS_ENVIRONMENT: name })).toEqual({ name });
  });

  it.each([
    [{}, /AOS_ENVIRONMENT is not set/],
    [{ AOS_ENVIRONMENT: '' }, /AOS_ENVIRONMENT is not set/],
    [{ AOS_ENVIRONMENT: 'production' }, /AOS_ENVIRONMENT must be one of local, dev or kdps-test/],
    [{ AOS_ENVIRONMENT: 'Dev' }, /AOS_ENVIRONMENT must be one of local, dev or kdps-test/],
  ])('stops the service with %j', (env, message) => {
    expect(() => deploymentEnvironmentFromEnvironment(env)).toThrow(message);
  });

  it('names local and dev as the development environments, kdps-test not', () => {
    expect(isDevelopmentEnvironment('local')).toBe(true);
    expect(isDevelopmentEnvironment('dev')).toBe(true);
    expect(isDevelopmentEnvironment('kdps-test')).toBe(false);
    expect(isDevelopmentEnvironment(undefined)).toBe(false);
    expect(isDevelopmentEnvironment('production')).toBe(false);
  });
});
