import { describe, expect, it } from 'vitest';
import { cn } from './cn.js';

describe('cn', () => {
  it('joins class names and skips falsy values', () => {
    expect(cn('a', false, undefined, ['b', { c: true, d: false }])).toBe('a b c');
  });

  it('lets the later Tailwind class win a conflict', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });
});
