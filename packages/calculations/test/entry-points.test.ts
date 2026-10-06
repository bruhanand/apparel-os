// The package's shape (shared-calculations 2.1, 2.3): two entry points, the selling one never reaching costing; only
// @apparel-os/domain imported; no clock, randomness, environment or binary floating point in the calculations. This
// proves at the source what the counter's bundle check proves on the bundle, which waits for the counter build host
// (RR-015). The module check enforces the import rules on every change too (`pnpm check:modules`).

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as costing from '@apparel-os/calculations/costing';
import * as selling from '@apparel-os/calculations';

const root = fileURLToPath(new URL('../', import.meta.url));
const src = join(root, 'src');

function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function importsOf(file: string): string[] {
  const text = withoutComments(readFileSync(file, 'utf8'));
  return [...text.matchAll(/\bfrom\s+'([^']+)'|\bimport\s*\(\s*'([^']+)'\s*\)|\bimport\s+'([^']+)'/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? '',
  );
}

function graphFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const specifier of importsOf(file)) {
      if (specifier.startsWith('.')) visit(resolve(dirname(file), specifier.replace(/\.js$/, '.ts')));
    }
  };
  visit(entry);
  return seen;
}

const sources = readdirSync(src, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
  .map((e) => join(e.parentPath, e.name));

describe('entry points (shared-calculations 2.1, 2.3)', () => {
  it('PRD-OFF-004 the selling entry point never reaches the costing entry point', () => {
    const reached = [...graphFrom(join(src, 'index.ts'))].map((f) => relative(src, f));
    expect(reached.length).toBeGreaterThan(10);
    expect(reached.filter((f) => f.startsWith('costing'))).toEqual([]);
    expect(Object.keys(selling)).not.toEqual(expect.arrayContaining(['costLine']));
    expect(Object.keys(selling).filter((name) => /cost|margin/i.test(name))).toEqual([]);
  });

  it('PRD-PTW-010 PRD-PTW-011 the costing entry point holds costing and ticket margin', () => {
    expect(Object.keys(costing).sort()).toEqual(['costLine', 'matchCost', 'ticketMargin']);
  });

  it('PRD-OFF-004 declares the two entry points in the package exports', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      name: string;
      exports: Record<string, { default: string }>;
      dependencies: Record<string, string>;
    };
    expect(manifest.name).toBe('@apparel-os/calculations');
    expect(Object.keys(manifest.exports)).toEqual(['.', './costing']);
    expect(manifest.exports['.']?.default).toBe('./dist/index.js');
    expect(manifest.exports['./costing']?.default).toBe('./dist/costing/index.js');
    expect(Object.keys(manifest.dependencies)).toEqual(['@apparel-os/domain']);
  });
});

describe('purity (shared-calculations 2.1, 3.2)', () => {
  it('PRD-MOD-007 imports only @apparel-os/domain and its own files', () => {
    const outside = sources.flatMap((file) =>
      importsOf(file)
        .filter((s) => !s.startsWith('.') && s !== '@apparel-os/domain')
        .map((s) => `${relative(src, file)}: ${s}`),
    );
    expect(outside).toEqual([]);
  });

  it('PRD-MOD-014 reads no clock, randomness or environment and uses no floating-point helpers', () => {
    const forbidden =
      /\bDate\b|Math\.random|\bprocess\b|\bglobalThis\b|\bfetch\b|\bcrypto\b|parseFloat|toFixed|toPrecision|\bsetTimeout\b/;
    const found = sources.flatMap((file) => {
      const match = forbidden.exec(withoutComments(readFileSync(file, 'utf8')));
      return match === null ? [] : [`${relative(src, file)}: ${match[0]}`];
    });
    expect(found).toEqual([]);
  });
});
