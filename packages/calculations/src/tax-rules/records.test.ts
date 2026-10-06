import { describe, expect, it } from 'vitest';
import { isInForce } from '../dates.js';
import {
  type RegistrationApplicability,
  type TaxRateRule,
  assertApplicability,
  assertRateRule,
  versionInForce,
} from './records.js';

// shared-calculations section 10, the pure part: shapes, the checks of 10.1 and 10.3, and the version in force (10.2).
// Every value is SYNTHETIC.

function checkingRule(rule: TaxRateRule): () => void {
  return () => {
    assertRateRule(rule);
  };
}

function checkingApplicability(applicability: RegistrationApplicability): () => void {
  return () => {
    assertApplicability(applicability);
  };
}

describe('rate and value rules (10.1, 10.3)', () => {
  it('POL-10.02 refuses slabs that do not start at zero or do not rise', () => {
    const base = {
      kind: 'slabs',
      version: 'syn-tax-x',
      classification: 'SYN-HSN-9',
      comparedValue: { per: 'unit', discounts: 'after', tax: 'excluded' },
    } as const;
    expect(checkingRule({ ...base, slabs: [{ lowerBound: 1, boundIn: 'this-slab', rate: '10' }] })).toThrow(/zero/);
    expect(
      checkingRule({
        ...base,
        slabs: [
          { lowerBound: 0, boundIn: 'this-slab', rate: '10' },
          { lowerBound: 0, boundIn: 'this-slab', rate: '20' },
        ],
      }),
    ).toThrow(/rise/);
    expect(checkingRule({ ...base, slabs: [] })).toThrow(/no slabs/);
    expect(
      checkingRule({ kind: 'single-rate', version: 'syn-tax-x', classification: 'SYN-HSN-9', rate: '0.1.2' }),
    ).toThrow();
  });
});

describe('registration applicability (10.1, GC7-8)', () => {
  const base = { version: 'syn-reg-x', registration: 'SYN-REG-9' };

  it('PRD-TAX-005 needs component shares that add up to one when tax is charged, and none when it is not', () => {
    expect(
      checkingApplicability({ ...base, chargesTax: true, components: [{ component: 'SYN-X', share: '0.6' }] }),
    ).toThrow(/add up/);
    expect(
      checkingApplicability({ ...base, chargesTax: false, components: [{ component: 'SYN-X', share: '1' }] }),
    ).toThrow(/no components/);
    expect(
      checkingApplicability({
        ...base,
        chargesTax: true,
        components: [
          { component: 'SYN-X', share: '0.25' },
          { component: 'SYN-Y', share: '0.75' },
        ],
      }),
    ).not.toThrow();
  });
});

describe('the version in force (10.2; structure-and-masters 2.2)', () => {
  const versions = [
    { version: 'syn-v1', effectiveFrom: '2026-10-01', effectiveTo: '2026-10-10', approved: true },
    { version: 'syn-v2', effectiveFrom: '2026-10-10', approved: true },
    { version: 'syn-v3', effectiveFrom: '2026-10-05', approved: false },
  ];

  it('PRD-MOD-010 takes the approved version whose dates hold the business date, the end date excluded', () => {
    expect(versionInForce(versions, '2026-10-09')?.version).toBe('syn-v1');
    expect(versionInForce(versions, '2026-10-10')?.version).toBe('syn-v2');
    expect(versionInForce(versions, '2026-09-30')).toBeUndefined();
  });

  it('PRD-MOD-010 treats two approved versions in force on one date as a defect', () => {
    const overlapping = [...versions, { version: 'syn-v4', effectiveFrom: '2026-10-01', approved: true }];
    expect(() => versionInForce(overlapping, '2026-10-10')).toThrow(/Defect/);
  });

  it('PRD-MOD-009 refuses a business date that is not a calendar date', () => {
    expect(() => isInForce({ effectiveFrom: '2026-10-01' }, '10/10/2026')).toThrow(RangeError);
    expect(() => isInForce({ effectiveFrom: '2026-10-01' }, '2026-02-31')).toThrow(RangeError);
    expect(() => isInForce({ effectiveFrom: '2026-10-01' }, '2026-02-29')).toThrow(RangeError);
    expect(() => isInForce({ effectiveFrom: '2026-10-01' }, '2026-13-01')).toThrow(RangeError);
    expect(() => isInForce({ effectiveFrom: '2026-04-31' }, '2026-10-10')).toThrow(RangeError);
    expect(isInForce({ effectiveFrom: '2028-02-29' }, '2028-03-01')).toBe(true);
  });
});
