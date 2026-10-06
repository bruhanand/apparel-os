import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getConstructionPlans } from 'pg-boss';
import { describe, expect, it } from 'vitest';
import { migrationSetFolder } from '../db/migration-set.js';

// S1-F01-T06: pg-boss's schema is installed by a reviewed migration at the version pinned in the lockfile, never by
// the runtime (code-house-rules 3.2, 12.9). This fails when the package changes and the migration does not.

const START = '-- pg-boss construction plan: start\n';
const END = '-- pg-boss construction plan: end\n';

describe('the pg-boss schema migration (code-house-rules 3.2)', () => {
  it('PRD-SEC-015 holds the construction plan of the pinned pg-boss version, without its own transaction', () => {
    const file = readFileSync(join(migrationSetFolder('organisation'), '0008__kernel__job_schema.sql'), 'utf8');
    const plan = file.slice(file.indexOf(START) + START.length, file.indexOf(END));
    const expected = getConstructionPlans('pgboss')
      .replace(/^\s*BEGIN;\n/, '')
      .replace(/\n\s*COMMIT;\s*$/, '\n');
    expect(plan).toBe(expected);
    expect(plan).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });
});
