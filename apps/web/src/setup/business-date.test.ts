import { describe, expect, it } from 'vitest';
import { businessDayAfter, businessToday } from './business-date';

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
