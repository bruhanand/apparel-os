import { paise } from '@apparel-os/domain';
import { describe, expect, it } from 'vitest';
import { summarise } from './summary.js';

// access-and-approvals 12.3 (PRD-EXC-004, PRD-MOD-015): the read model groups open exceptions by Store, brand and
// type, sums the known exposure, counts Unknown exposure apart and never as zero, and counts the repeats. SYNTHETIC.

const STORE = '01900000-0000-7000-8000-00000000a001';
const BRAND = '01900000-0000-7000-8000-00000000b001';

describe('the read model of open exceptions (access-and-approvals 12.3)', () => {
  it('PRD-EXC-004 groups by Store, brand and type, Unknown exposure counted apart, never as zero', () => {
    const rows = summarise([
      {
        storeId: STORE,
        brandId: BRAND,
        typeCode: 'syn.shortage',
        exposure: { kind: 'known', amount: paise(1500) },
        repeat: false,
      },
      { storeId: STORE, brandId: BRAND, typeCode: 'syn.shortage', exposure: { kind: 'unknown' }, repeat: true },
      {
        storeId: STORE,
        brandId: BRAND,
        typeCode: 'syn.shortage',
        exposure: { kind: 'known', amount: paise(250) },
        repeat: true,
      },
      { storeId: null, brandId: null, typeCode: 'syn.unfinished', exposure: { kind: 'unknown' }, repeat: false },
    ]);
    expect(rows).toEqual([
      {
        storeId: null,
        brandId: null,
        typeCode: 'syn.unfinished',
        open: 1,
        knownExposure: null,
        unknownExposures: 1,
        repeats: 0,
      },
      {
        storeId: STORE,
        brandId: BRAND,
        typeCode: 'syn.shortage',
        open: 3,
        knownExposure: 1750,
        unknownExposures: 1,
        repeats: 2,
      },
    ]);
  });

  it('PRD-MOD-015 a group of only Unknown exposures has no known amount, never zero, only the count', () => {
    const [row] = summarise([
      { storeId: STORE, brandId: null, typeCode: 'syn.mismatch', exposure: { kind: 'unknown' }, repeat: false },
    ]);
    expect(row?.unknownExposures).toBe(1);
    expect(row?.knownExposure).toBeNull();
  });
});
