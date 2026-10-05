// The runner itself (shared-calculations 12.1, 12.2): a wrong expected value fails, a pending case is reported as
// pending and never as passed, and the counter, which has no costing entry point, does not run the costing cases.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as selling from '@apparel-os/calculations';
import * as costing from '@apparel-os/calculations/costing';
import { type GoldenCase, caseShapeProblems, runCase } from './golden-runner.js';

function load(id: string): GoldenCase {
  return JSON.parse(readFileSync(new URL(`../golden/${id}.json`, import.meta.url), 'utf8')) as GoldenCase;
}

const cg03 = load('CG-03');
const cases = new Map([[cg03.id, cg03]]);

describe('golden-case runner', () => {
  it('PRD-ACP-018 fails a case whose expected result differs by one paise', () => {
    const expected = cg03.expected as { amountDue: number };
    const tampered = { ...cg03, expected: { ...expected, amountDue: expected.amountDue + 1 } };
    expect(runCase(tampered, cases, { selling, costing })).toMatchObject({ status: 'failed', run: 1 });
  });

  it('PRD-ACP-018 fails a case whose recorded versions differ', () => {
    const expected = cg03.expected as { versions: object };
    const tampered = {
      ...cg03,
      expected: { ...expected, versions: { ...expected.versions, priceBasis: 'syn-basis-other' } },
    };
    expect(runCase(tampered, cases, { selling, costing }).status).toBe('failed');
  });

  it('PRD-ACP-018 RR-042 reports a pending case as pending with its reason, never as passed', () => {
    const pending = { ...cg03, pending: 'RR-042 deferred' };
    expect(caseShapeProblems(pending, 'CG-03')).toEqual([]);
    expect(runCase(pending, cases, { selling, costing })).toEqual({ status: 'pending', reason: 'RR-042 deferred' });
  });

  it('PRD-OFF-004 does not run a costing case without the costing entry point', () => {
    expect(runCase(load('CG-21'), cases, { selling })).toEqual({ status: 'server-only' });
  });

  it('PRD-ACP-018 refuses a malformed case file', () => {
    expect(caseShapeProblems({ ...cg03, synthetic: false, covers: [] }, 'CG-03')).toEqual([
      'synthetic must be true',
      'covers must list the IDs it proves',
    ]);
    expect(caseShapeProblems(cg03, 'CG-04')).toEqual(['id must equal the file name (CG-04)']);
  });
});
