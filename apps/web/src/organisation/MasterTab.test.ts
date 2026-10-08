import { describe, expect, it } from 'vitest';
import { laterScheduled, versionOn, type MasterRecord, type MasterVersion } from './MasterTab';

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

describe('the version in force on a date (structure-and-masters 2.2)', () => {
  it('PRD-MOD-010 is the approved version whose dates hold it, never one awaiting approval', () => {
    expect(versionOn(record, '2026-10-12')?.id).toBe('first');
    expect(versionOn(record, '2026-10-14')?.id).toBe('earlier');
    expect(versionOn(record, '2026-10-21')?.id).toBe('later');
    expect(versionOn(record, '2026-10-07')).toBeUndefined();
  });
});
