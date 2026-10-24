import { describe, expect, it } from 'vitest';
import { businessDayAfter, businessToday, instantOfLocal } from './business-date';

// S1-F01 review (RR-381): a date field's today is the Organisation's business date, under its configured time zone,
// whatever the device's (PRD-MOD-017, DEC-118; design-language 8). Every value here is SYNTHETIC.

describe('the Organisation’s today (PRD-MOD-017; DEC-118)', () => {
  it('is the business date under the Organisation’s time zone, not the device’s or UTC’s', () => {
    // 20:00 UTC on 6 Oct is already 7 Oct in India (UTC+05:30) and still 6 Oct in Los Angeles.
    const instant = new Date('2026-10-06T20:00:00.000Z');
    expect(businessToday('Asia/Kolkata', instant)).toBe('2026-10-07');
    expect(businessToday('Etc/UTC', instant)).toBe('2026-10-06');
    expect(businessToday('America/Los_Angeles', new Date('2026-10-07T05:00:00.000Z'))).toBe('2026-10-06');
  });

  it('names the day after a business date across a month and a year end', () => {
    expect(businessDayAfter('2026-10-07')).toBe('2026-10-08');
    expect(businessDayAfter('2026-10-31')).toBe('2026-11-01');
    expect(businessDayAfter('2026-12-31')).toBe('2027-01-01');
  });
});

describe('a date and time typed in the Organisation’s time zone (code-house-rules 9; S2-F02-T02)', () => {
  it('PRD-MOD-017 reads a datetime-local value as the Organisation’s wall clock, whatever the device’s', () => {
    // SYNTHETIC time zones, chosen to be unlikely the test machine's: 04:15 on 24 Sep in Kathmandu (UTC+05:45) is
    // 22:30 UTC on 23 Sep; 10:00 in India (UTC+05:30) is 04:30 UTC.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe('Asia/Kathmandu');
    expect(instantOfLocal('2026-09-24T04:15', 'Asia/Kathmandu')).toBe('2026-09-23T22:30:00.000Z');
    expect(instantOfLocal('2026-10-07T10:00', 'Asia/Kolkata')).toBe('2026-10-07T04:30:00.000Z');
    expect(instantOfLocal('2026-10-07T10:00', 'Etc/UTC')).toBe('2026-10-07T10:00:00.000Z');
  });

  it('PRD-MOD-017 keeps the offset in force on that day where the zone changes it', () => {
    // SYNTHETIC: New York is UTC-04:00 in July and UTC-05:00 in January.
    expect(instantOfLocal('2026-07-01T09:00', 'America/New_York')).toBe('2026-07-01T13:00:00.000Z');
    expect(instantOfLocal('2026-01-15T09:00', 'America/New_York')).toBe('2026-01-15T14:00:00.000Z');
  });
});
