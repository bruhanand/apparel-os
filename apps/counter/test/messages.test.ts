import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { routes } from '@apparel-os/schemas';
import { isMessageId } from '@apparel-os/ui';
import { describe, expect, it } from 'vitest';
import { refusalText } from '../src/messages';

// The counter's screen text against the one message catalogue (code-house-rules 12.13): every identifier its code
// names has an English entry, and so does every refusal code of every route it calls, so no page shows a bare code.

const SRC = join(import.meta.dirname, '..', 'src');

function sources(): string[] {
  return readdirSync(SRC)
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => readFileSync(join(SRC, name), 'utf8'));
}

describe('the counter’s screen text (code-house-rules 12.13)', () => {
  it('has an English entry for every message identifier the counter’s code names', () => {
    const named = sources().flatMap((source) =>
      [...source.matchAll(/\bt\(\s*'([a-z][\w.-]*)'/g)].map((match) => match[1] ?? ''),
    );
    expect(named.length).toBeGreaterThan(10);
    expect(named.filter((id) => !isMessageId(id))).toEqual([]);
  });

  it('PRD-UXP-003 has an entry for every refusal code of every route the counter calls', () => {
    const called = [
      ...new Set(
        sources().flatMap((source) => [...source.matchAll(/api\.call\(\s*'(\w+)'/g)].map((match) => match[1] ?? '')),
      ),
    ];
    expect(called.length).toBeGreaterThan(3);
    const missing = called.flatMap((name) => {
      const route = (routes as Record<string, { codes?: readonly string[] }>)[name];
      if (route === undefined) return [`route ${name}`];
      return (route.codes ?? []).filter((code) => !isMessageId(`error.${code}`));
    });
    expect(missing).toEqual([]);
  });

  it('PRD-UXP-003 an unavailable sign-in names the missing setting', () => {
    expect(
      refusalText({
        code: 'access.sign-in-unavailable',
        missing: [{ kind: 'setting', setting: 'access.shared-pos-session-limits' }],
      }),
    ).toBe(
      'Sign-in is not available yet for this Organisation: a setting is missing. Not set yet: the shared POS session limits.',
    );
  });
});
