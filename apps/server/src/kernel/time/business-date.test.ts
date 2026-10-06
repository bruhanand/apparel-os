import { describe, expect, it } from 'vitest';
import { businessDateIn, isKnownTimezone } from './business-date.js';

// S1-F01-T03: the business date under the Organisation's timezone (code-house-rules 9; PRD-MOD-009). The timezones
// here are SYNTHETIC test values chosen for their offsets, never an Organisation's setting: KDPS's timezone is a
// setting of `configuration`, with no default.

const SYNTHETIC_TIMEZONE_AHEAD = 'Asia/Kolkata'; // UTC+05:30, no daylight saving
const SYNTHETIC_TIMEZONE_UTC = 'UTC';
const SYNTHETIC_TIMEZONE_BEHIND = 'America/New_York'; // UTC-04:00 in October

describe('businessDateIn (code-house-rules 9)', () => {
  it('PRD-MOD-009 takes the date from the timezone, not from UTC', () => {
    const instant = new Date('2026-10-05T19:00:00Z');
    expect(businessDateIn(instant, SYNTHETIC_TIMEZONE_AHEAD)).toBe('2026-10-06');
    expect(businessDateIn(instant, SYNTHETIC_TIMEZONE_UTC)).toBe('2026-10-05');
    expect(businessDateIn(instant, SYNTHETIC_TIMEZONE_BEHIND)).toBe('2026-10-05');
  });

  it('PRD-MOD-009 changes the date at the timezone midnight', () => {
    expect(businessDateIn(new Date('2026-10-05T18:29:59.999Z'), SYNTHETIC_TIMEZONE_AHEAD)).toBe('2026-10-05');
    expect(businessDateIn(new Date('2026-10-05T18:30:00.000Z'), SYNTHETIC_TIMEZONE_AHEAD)).toBe('2026-10-06');
    expect(businessDateIn(new Date('2026-10-06T03:59:59.999Z'), SYNTHETIC_TIMEZONE_BEHIND)).toBe('2026-10-05');
    expect(businessDateIn(new Date('2026-10-06T04:00:00.000Z'), SYNTHETIC_TIMEZONE_BEHIND)).toBe('2026-10-06');
  });

  it('gives the form YYYY-MM-DD across a year end', () => {
    expect(businessDateIn(new Date('2026-12-31T18:30:00Z'), SYNTHETIC_TIMEZONE_AHEAD)).toBe('2027-01-01');
    expect(businessDateIn(new Date('2027-01-01T03:00:00Z'), SYNTHETIC_TIMEZONE_BEHIND)).toBe('2026-12-31');
  });

  it('has no default timezone: it refuses an empty or unknown one', () => {
    expect(() => businessDateIn(new Date('2026-10-05T00:00:00Z'), '')).toThrow(/no default/);
    expect(() => businessDateIn(new Date('2026-10-05T00:00:00Z'), 'Nowhere/Synthetic')).toThrow(RangeError);
    expect(isKnownTimezone('')).toBe(false);
    expect(isKnownTimezone('Nowhere/Synthetic')).toBe(false);
    expect(isKnownTimezone(SYNTHETIC_TIMEZONE_AHEAD)).toBe(true);
  });

  it('refuses an invalid instant', () => {
    expect(() => businessDateIn(new Date(Number.NaN), SYNTHETIC_TIMEZONE_UTC)).toThrow(/not a valid time/);
  });
});
