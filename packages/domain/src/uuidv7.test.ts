import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from './uuidv7.js';

const FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has the UUID layout with version 7 and variant 10', () => {
    for (let i = 0; i < 50; i += 1) {
      const id = uuidv7();
      expect(id).toMatch(FORMAT);
      expect(id.charAt(14)).toBe('7');
      expect('89ab').toContain(id.charAt(19));
    }
  });

  it('puts the millisecond timestamp in the first 48 bits', () => {
    vi.useFakeTimers();
    const ms = 1_790_000_000_123;
    vi.setSystemTime(ms);
    const id = uuidv7();
    expect(Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16)).toBe(ms);
  });

  it('sorts ids made in later milliseconds after earlier ones', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_790_000_000_000);
    const ids: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      ids.push(uuidv7());
      vi.advanceTimersByTime(1);
    }
    expect([...ids].sort()).toEqual(ids);
  });

  it('gives different ids for repeated calls', () => {
    expect(new Set(Array.from({ length: 100 }, () => uuidv7())).size).toBe(100);
  });
});
