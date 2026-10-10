import { describe, expect, it } from 'vitest';
import { allPassed, failingItems, judgeReadiness, type ReadinessFacts } from './checks.js';

// The readiness checks as judged from the modules' answers (module-map 4.16; domain-model 3.6; PRD-LIF-002,
// PRD-LIF-003, PRD-ORG-006, PRD-ACS-006; DEC-116, DEC-117; S1-F04-T02). Every identifier is SYNTHETIC.

const UNIT = '01900000-0000-7000-8000-00000000a001';

const ready: ReadinessFacts = {
  businessUnitId: UNIT,
  kind: 'whole-store',
  mapping: 'verified',
  locationsInForce: 1,
  operationsDeclared: true,
  permissions: [{ action: 'create', recordType: 'syn.receipt', holders: ['p1'] }],
  approvals: [{ actionType: 'syn.receipt.approve', preparers: ['p1'], approvers: ['p2'] }],
  policies: [{ policy: 4, missing: [] }],
  openingPlanApproved: false,
  zeroStockDeclared: true,
  brandsInForce: 0,
};

const stateOf = (facts: ReadinessFacts, check: string) =>
  judgeReadiness('receiving', facts).find((each) => each.check === check);

describe('PRD-LIF-002 the readiness checks', () => {
  it('pass for a ready unit, with brand coverage not needed outside a brand counter', () => {
    const checks = judgeReadiness('receiving', ready);
    expect(allPassed(checks)).toBe(true);
    expect(checks.map((each) => [each.check, each.state])).toEqual([
      ['mappings', 'passed'],
      ['locations', 'passed'],
      ['users-and-access', 'passed'],
      ['required-policies', 'passed'],
      ['stock-plan', 'passed'],
      ['brand-coverage', 'not-needed'],
    ]);
  });

  it('POL-10.08 a mapping that is not verified, or none, fails the mappings check', () => {
    expect(stateOf({ ...ready, mapping: 'unverified' }, 'mappings')).toEqual({
      check: 'mappings',
      state: 'failed',
      missing: [{ kind: 'mapping', businessUnitId: UNIT, lacks: 'verification' }],
    });
    expect(stateOf({ ...ready, mapping: 'none' }, 'mappings')?.missing).toEqual([
      { kind: 'mapping', businessUnitId: UNIT, lacks: 'mapping' },
    ]);
  });

  it('a unit with no location fails the locations check', () => {
    expect(stateOf({ ...ready, locationsInForce: 0 }, 'locations')?.missing).toEqual([
      { kind: 'location', businessUnitId: UNIT },
    ]);
  });

  it('PRD-ACS-006 names a permission nobody holds, and an approval one person alone could do', () => {
    const facts: ReadinessFacts = {
      ...ready,
      permissions: [{ action: 'create', recordType: 'syn.receipt', holders: [] }],
      approvals: [{ actionType: 'syn.receipt.approve', preparers: ['p1'], approvers: ['p1'] }],
    };
    expect(stateOf(facts, 'users-and-access')?.missing).toEqual([
      { kind: 'permission-holder', action: 'create', recordType: 'syn.receipt' },
      { kind: 'approval-people', actionType: 'syn.receipt.approve' },
    ]);
  });

  it('names what a needed policy lacks, and an activity no operation declares', () => {
    const lacking = { kind: 'policy', policy: '4', lacks: 'signature' };
    expect(stateOf({ ...ready, policies: [{ policy: 4, missing: [lacking] }] }, 'required-policies')?.missing).toEqual([
      lacking,
    ]);
    expect(stateOf({ ...ready, operationsDeclared: false }, 'required-policies')?.missing).toEqual([
      { kind: 'activity-operation', activity: 'receiving' },
    ]);
  });

  it('PRD-LIF-003 the stock plan passes with an approved plan or a zero declaration, fails with neither, and an office needs none', () => {
    expect(stateOf({ ...ready, zeroStockDeclared: false, openingPlanApproved: true }, 'stock-plan')?.state).toBe(
      'passed',
    );
    expect(stateOf({ ...ready, zeroStockDeclared: false }, 'stock-plan')?.missing).toEqual([
      { kind: 'stock-plan', businessUnitId: UNIT },
    ]);
    expect(stateOf({ ...ready, kind: 'office', zeroStockDeclared: false }, 'stock-plan')?.state).toBe('not-needed');
  });

  it('PRD-ORG-006 a brand counter with no brand in force fails brand coverage (product owner, 10 Oct 2026)', () => {
    expect(stateOf({ ...ready, kind: 'brand-counter' }, 'brand-coverage')?.missing).toEqual([
      { kind: 'brand-coverage', businessUnitId: UNIT },
    ]);
    expect(stateOf({ ...ready, kind: 'brand-counter', brandsInForce: 1 }, 'brand-coverage')?.state).toBe('passed');
  });

  it('a refusal names each failing check, then what it lacks', () => {
    const checks = judgeReadiness('receiving', { ...ready, locationsInForce: 0 });
    expect(allPassed(checks)).toBe(false);
    expect(failingItems(checks)).toEqual([
      { kind: 'readiness-check', check: 'locations' },
      { kind: 'location', businessUnitId: UNIT },
    ]);
  });
});
