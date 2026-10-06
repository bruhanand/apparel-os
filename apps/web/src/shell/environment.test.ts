import { describe, expect, it } from 'vitest';
import { environmentBanner } from './environment';

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
