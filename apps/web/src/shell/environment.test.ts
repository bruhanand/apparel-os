import { describe, expect, it } from 'vitest';
import { environmentBanner, holdsSyntheticDataOnly } from './environment';

describe('environmentBanner (RR-193; deployment.md section 1)', () => {
  it('shows SYNTHETIC on dev and locally, where data is synthetic only', () => {
    expect(environmentBanner('dev')).toEqual({ environment: 'dev', message: 'environment.dev', tone: 'info' });
    expect(environmentBanner('local')).toEqual({
      environment: 'local',
      message: 'environment.local',
      tone: 'info',
    });
  });

  it('PRD-LIF-026 shows the side-by-side test banner on kdps-test', () => {
    expect(environmentBanner('kdps-test')).toEqual({
      environment: 'kdps-test',
      message: 'environment.kdps-test',
      tone: 'warning',
    });
  });

  it('says the environment is not named when AOS_ENVIRONMENT is unset or not one it knows, never guessing one', () => {
    for (const value of [undefined, '', 'Dev', 'production', 'staging']) {
      expect(environmentBanner(value)).toEqual({
        environment: null,
        message: 'environment.not-named',
        tone: 'warning',
      });
    }
  });
});

describe('holdsSyntheticDataOnly (deployment.md section 1; code-house-rules 11.1)', () => {
  it('is true for local work and dev only, where every value is synthetic; never for kdps-test or an unnamed one', () => {
    expect(holdsSyntheticDataOnly('local')).toBe(true);
    expect(holdsSyntheticDataOnly('dev')).toBe(true);
    expect(holdsSyntheticDataOnly('kdps-test')).toBe(false);
    expect(holdsSyntheticDataOnly(null)).toBe(false);
  });
});
