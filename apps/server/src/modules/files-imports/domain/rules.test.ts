import { describe, expect, it } from 'vitest';
import { dateRangeOf, followOn, matchRule, normalisedWord, type RuleInForce } from './rules.js';

// S1-F06-T03: matching a source word against the Confirmed mapping rules in force (imports-and-opening-data 6.3;
// PRD-IMP-003, PRD-IMP-008). Every word, target and identifier is SYNTHETIC.

const LAYOUT = '01900000-0000-7000-8000-000000000001';
const SUPPLIER = '01900000-0000-7000-8000-000000000002';
const BRAND = '01900000-0000-7000-8000-000000000003';

function rule(id: string, scope: RuleInForce['scope'], target: string, word = 'syn navy', caseSensitive = false) {
  return {
    ruleId: `01900000-0000-7000-8000-00000000010${id}`,
    ruleVersionId: `01900000-0000-7000-8000-00000000020${id}`,
    attribute: 'merchandise.colour',
    scope,
    normalisedWord: normalisedWord(word, caseSensitive),
    caseSensitive,
    target,
  } satisfies RuleInForce;
}

const scopes = { layoutId: LAYOUT, supplierId: SUPPLIER, brandId: BRAND };

describe('matchRule (imports-and-opening-data 6.3)', () => {
  it('PRD-IMP-003 matches the word trimmed with spaces collapsed, and case only where the rule says it matters', () => {
    const rules = [rule('1', { kind: 'organisation' }, 'SYN-NAVY')];
    expect(matchRule(rules, 'merchandise.colour', '  SYN   Navy ', scopes)).toMatchObject({
      kind: 'mapped',
      target: 'SYN-NAVY',
    });
    const exact = [rule('1', { kind: 'organisation' }, 'SYN-NAVY', 'SYN Navy', true)];
    expect(matchRule(exact, 'merchandise.colour', 'syn navy', scopes)).toEqual({ kind: 'none' });
    expect(matchRule(exact, 'merchandise.colour', 'SYN Navy', scopes).kind).toBe('mapped');
  });

  it('PRD-IMP-008 a layout-scope rule wins over any wider rule', () => {
    const rules = [
      rule('1', { kind: 'organisation' }, 'SYN-NAVY'),
      rule('2', { kind: 'brand', id: BRAND }, 'SYN-INK'),
      rule('3', { kind: 'layout', id: LAYOUT }, 'SYN-MIDNIGHT'),
    ];
    expect(matchRule(rules, 'merchandise.colour', 'syn navy', scopes)).toMatchObject({
      kind: 'mapped',
      target: 'SYN-MIDNIGHT',
    });
  });

  it('PRD-IMP-008 wider rules that disagree leave the word unmapped, naming the rules', () => {
    const rules = [
      rule('1', { kind: 'organisation' }, 'SYN-NAVY'),
      rule('2', { kind: 'supplier', id: SUPPLIER }, 'SYN-INK'),
    ];
    expect(matchRule(rules, 'merchandise.colour', 'SYN NAVY', scopes)).toEqual({
      kind: 'ambiguous',
      ruleIds: [rules[0]?.ruleId, rules[1]?.ruleId].sort(),
    });
  });

  it('PRD-IMP-003 reads only the rules of the batch scopes and the attribute', () => {
    const rules = [
      rule('1', { kind: 'supplier', id: '01900000-0000-7000-8000-000000000099' }, 'SYN-INK'),
      { ...rule('2', { kind: 'organisation' }, 'SYN-NAVY'), attribute: 'merchandise.size' },
    ];
    expect(matchRule(rules, 'merchandise.colour', 'syn navy', scopes)).toEqual({ kind: 'none' });
  });
});

describe('a rule version confirmed after another (imports-and-opening-data 6.3, 15.1; code-house-rules 7.3)', () => {
  const A = '01900000-0000-7000-8000-000000000301';
  const B = '01900000-0000-7000-8000-000000000302';

  it('reads a date range as Postgres writes it, an open end as none', () => {
    expect(dateRangeOf('[2026-10-12,)')).toEqual({ from: '2026-10-12' });
    expect(dateRangeOf('[2026-10-12,2026-11-01)')).toEqual({ from: '2026-10-12', to: '2026-11-01' });
    expect(() => dateRangeOf('(2026-10-12,)')).toThrow();
  });

  it('ends the version in force before it on its own start date', () => {
    expect(followOn({ from: '2026-10-15' }, [{ id: A, range: { from: '2026-10-11' } }])).toEqual({
      kind: 'follows',
      ends: [{ id: A, range: { from: '2026-10-11', to: '2026-10-15' } }],
    });
    expect(
      followOn({ from: '2026-10-15' }, [{ id: A, range: { from: '2026-10-11', to: '2026-10-20' } }]),
    ).toMatchObject({ kind: 'follows', ends: [{ id: A, range: { to: '2026-10-15' } }] });
  });

  it('leaves a version that ends before it as it is', () => {
    expect(followOn({ from: '2026-10-15' }, [{ id: A, range: { from: '2026-10-11', to: '2026-10-15' } }])).toEqual({
      kind: 'follows',
      ends: [],
    });
  });

  it('refuses one starting on its own start date, or a bounded one that runs into a later version', () => {
    expect(followOn({ from: '2026-10-15' }, [{ id: A, range: { from: '2026-10-15' } }])).toEqual({
      kind: 'conflict',
      with: A,
    });
    expect(followOn({ from: '2026-10-15', to: '2026-10-30' }, [{ id: B, range: { from: '2026-10-20' } }])).toEqual({
      kind: 'conflict',
      with: B,
    });
  });

  it('gives an open-ended version its end where a later version starts', () => {
    expect(
      followOn({ from: '2026-10-15' }, [
        { id: A, range: { from: '2026-10-11' } },
        { id: B, range: { from: '2026-10-20' } },
      ]),
    ).toEqual({
      kind: 'follows',
      ends: [{ id: A, range: { from: '2026-10-11', to: '2026-10-15' } }],
      ownEnd: '2026-10-20',
    });
  });
});
