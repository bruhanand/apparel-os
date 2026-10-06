import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { errorCodes } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { families, stateFamilies, stateIds } from '../components/states';
import { englishIndia } from './en-IN';
import { isMessageId, t } from './catalogue';

const SRC = join(import.meta.dirname, '..');
const DESIGN_LANGUAGE = join(SRC, '../../../docs/design/ui/design-language.md');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('t (code-house-rules 12.13)', () => {
  it('fills named parameters', () => {
    expect(t('error-state.title', { what: 'users' })).toBe('Couldn’t load users');
  });

  it('chooses the plural form with Intl.PluralRules', () => {
    expect(t('my-work.overdue', { count: 1 })).toBe('! 1 overdue');
    expect(t('missing.count', { count: 1 })).toBe('1 thing is missing');
    expect(t('missing.count', { count: 3 })).toBe('3 things are missing');
  });
});

describe('the message catalogue (code-house-rules 12.13; design-language 11)', () => {
  it('has an English entry for every refusal code declared in packages/schemas', () => {
    const missing = Object.keys(errorCodes).filter((code) => !isMessageId(`error.${code}`));
    expect(missing).toEqual([]);
  });

  it('names every state exactly as design-language section 7 does, in its family', () => {
    const table = readFileSync(DESIGN_LANGUAGE, 'utf8')
      .split('\n')
      .flatMap((line) => {
        const match = /^\| (\d+) \| ([^|]+) \| ([^|]+) \|/.exec(line);
        return match?.[2] && match[3] ? [{ name: match[2].trim(), family: match[3].trim().toLowerCase() }] : [];
      });
    expect(table).toHaveLength(64);
    expect(stateIds.map((id) => ({ name: t(`state.${id}`), family: stateFamilies[id] }))).toEqual(table);
    expect(new Set(Object.values(stateFamilies))).toEqual(new Set(families));
  });

  it('has an English entry for every message identifier the code names', () => {
    const named = sourceFiles(SRC).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/\b(?:t\(|message=|messageId: |title=)\s*['"]([a-z][\w.-]*)['"]/g)].map(
        (match) => match[1] ?? '',
      ),
    );
    expect(named.length).toBeGreaterThan(10);
    expect(named.filter((id) => !(id in englishIndia))).toEqual([]);
  });

  it('every screen string comes from the catalogue: no text written into a component', () => {
    const literal = sourceFiles(SRC)
      .filter((file) => file.endsWith('.tsx'))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        const text = [...source.matchAll(/>\s*([^<>{}]*[A-Za-z][^<>{}]*?)\s*<\//g)].map((match) => match[1]);
        const attributes = [...source.matchAll(/\b(aria-label|placeholder|alt)="([^"]*[A-Za-z][^"]*)"/g)].map(
          (match) => match[0],
        );
        return [...text, ...attributes].map((found) => `${file}: ${found ?? ''}`);
      });
    expect(literal).toEqual([]);
  });
});
