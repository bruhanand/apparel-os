import { describe, expect, it } from 'vitest';
import { laterScheduled, versionOn, withKindValue, type MasterRecord, type MasterVersion } from './MasterTab';

// The version facts the organisation screens show (structure-and-masters 2.2; S1-F02-T01). Every value is SYNTHETIC.

const version = (id: string, state: MasterVersion['state'], validFrom: string, validTo?: string): MasterVersion => ({
  id,
  state,
  validFrom,
  ...(validTo === undefined ? {} : { validTo }),
});

const record: MasterRecord = {
  id: 'SYNTHETIC-record',
  code: 'SYNTHETIC-CODE',
  versions: [
    version('later', 'Scheduled', '2026-10-20'),
    version('earlier', 'Scheduled', '2026-10-14', '2026-10-20'),
    version('awaiting', 'Awaiting approval', '2026-10-12'),
    version('first', 'In force', '2026-10-08', '2026-10-14'),
  ],
};

describe('a change that starts before an approved Scheduled version (structure-and-masters 2.2; product owner, 8 Oct 2026)', () => {
  it('PRD-MOD-010 names the first Scheduled version after its start, which the change stops short of', () => {
    expect(laterScheduled(record, '2026-10-10')?.id).toBe('earlier');
    expect(laterScheduled(record, '2026-10-15')?.id).toBe('later');
  });

  it('PRD-MOD-010 names none when no approved version starts after it', () => {
    expect(laterScheduled(record, '2026-10-20')).toBeUndefined();
    expect(laterScheduled(record, '2026-10-25')).toBeUndefined();
  });
});

describe('a Site’s or Store’s classifications, one value of each kind (structure-and-masters 3.1; product owner, 9 Oct 2026)', () => {
  const kindOf = new Map([
    ['SYNTHETIC-value-a1', 'SYNTHETIC-kind-a'],
    ['SYNTHETIC-value-a2', 'SYNTHETIC-kind-a'],
    ['SYNTHETIC-value-b1', 'SYNTHETIC-kind-b'],
  ]);

  it('PRD-ORG-008 choosing a value of a kind replaces the value of that kind and keeps the others', () => {
    expect(
      withKindValue(['SYNTHETIC-value-a1', 'SYNTHETIC-value-b1'], kindOf, 'SYNTHETIC-kind-a', 'SYNTHETIC-value-a2'),
    ).toEqual(['SYNTHETIC-value-b1', 'SYNTHETIC-value-a2']);
    expect(withKindValue([], kindOf, 'SYNTHETIC-kind-b', 'SYNTHETIC-value-b1')).toEqual(['SYNTHETIC-value-b1']);
  });

  it('PRD-ORG-008 choosing none for a kind removes its value', () => {
    expect(withKindValue(['SYNTHETIC-value-a1', 'SYNTHETIC-value-b1'], kindOf, 'SYNTHETIC-kind-a', undefined)).toEqual([
      'SYNTHETIC-value-b1',
    ]);
  });
});

describe('the version in force on a date (structure-and-masters 2.2)', () => {
  it('PRD-MOD-010 is the approved version whose dates hold it, never one awaiting approval', () => {
    expect(versionOn(record, '2026-10-12')?.id).toBe('first');
    expect(versionOn(record, '2026-10-14')?.id).toBe('earlier');
    expect(versionOn(record, '2026-10-21')?.id).toBe('later');
    expect(versionOn(record, '2026-10-07')).toBeUndefined();
  });
});
