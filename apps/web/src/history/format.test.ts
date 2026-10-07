import { describe, expect, it } from 'vitest';
import { formatDateTime } from './format';

// SYNTHETIC: an Organisation timezone chosen only because it is unlikely to be the test machine's; never a KDPS value.
const synthetic = 'Asia/Kathmandu';

describe('formatDateTime (design-language 8; code-house-rules 9)', () => {
  it("PRD-MOD-017 shows a UTC instant in the Organisation's timezone, whatever the device's (DEC-118; RR-310)", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe(synthetic);
    // 23 Sep 2026 22:30 UTC is 24 Sep 2026 04:15 in Kathmandu (UTC+05:45): the date changes too.
    expect(formatDateTime('2026-09-23T22:30:00.000Z', synthetic)).toBe('24 Sep 2026, 04:15');
    expect(formatDateTime('2026-09-23T22:30:00.000Z', 'UTC')).toBe('23 Sep 2026, 22:30');
  });
});
