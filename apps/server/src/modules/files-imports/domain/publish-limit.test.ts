import { describe, expect, it } from 'vitest';
import { publishLimitRefusal } from './publish-limit.js';

// S1-F06-T01: publishing is limited to synthetic Organisations, so it is reachable only in local work, tests and `dev`
// (product owner, 6 Oct 2026; deployment.md section 1; PRD-SEC-017, PRD-UXP-003). S1-F06-T02 and S1-F06-T03 have
// built their controls; the check stays until S1-F06-T04 builds duplicate control and lifts the limit.

describe('publishLimitRefusal', () => {
  it('PRD-SEC-017 leaves Publish available in local work, tests and dev', () => {
    expect(publishLimitRefusal('local')).toBeUndefined();
    expect(publishLimitRefusal('dev')).toBeUndefined();
  });

  it('PRD-UXP-003 answers unavailable anywhere else, kdps-test included, naming the publishing control still missing', () => {
    for (const name of ['kdps-test', 'production', '', 'DEV']) {
      expect(publishLimitRefusal(name)).toEqual({
        kind: 'unavailable',
        code: 'files-imports.publishing-limited',
        missing: [{ kind: 'publishing-control', control: 'duplicate-control', ticket: 'S1-F06-T04' }],
      });
    }
  });
});
