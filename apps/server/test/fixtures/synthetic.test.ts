import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  isSyntheticCode,
  isSyntheticName,
  SYNTHETIC_ORGANISATIONS,
  syntheticCode,
  syntheticDatabaseName,
  syntheticFileName,
  syntheticName,
} from './synthetic.js';

// S0-T06: synthetic labels (code-house-rules 11.1, 11.2; AGENTS.md "Never invent a value").

describe('synthetic labels (code-house-rules 11.1)', () => {
  it('marks a code with SYN, a name and a file name with SYNTHETIC', () => {
    expect(syntheticCode('ORG-A')).toBe('SYN-ORG-A');
    expect(syntheticName('Organisation A')).toBe('SYNTHETIC Organisation A');
    expect(syntheticFileName('opening-stock', 'xlsx')).toBe('SYNTHETIC-opening-stock.xlsx');
    expect(syntheticDatabaseName('SYN-ORG-A')).toBe('syn_org_a');
  });

  it.each(['', 'org-a', 'ORG A', 'SYN-ORG', 'ORG-SYN'])('refuses the code part "%s"', (code) => {
    expect(() => syntheticCode(code)).toThrow();
  });

  it.each(['', ' Organisation', 'SYNTHETIC Organisation'])('refuses the name "%s"', (name) => {
    expect(() => syntheticName(name)).toThrow();
  });

  it('refuses a database name from a code that is not synthetic', () => {
    expect(() => syntheticDatabaseName('ORG-A')).toThrow(/synthetic code/);
  });
});

describe('the synthetic Organisations (code-house-rules 11.2)', () => {
  it('PRD-ACS-020 are two, with different codes and names', () => {
    const [first, second] = SYNTHETIC_ORGANISATIONS;
    expect(first.code).not.toBe(second.code);
    expect(first.name).not.toBe(second.name);
  });

  it('PRD-SEC-017 label every value', () => {
    for (const organisation of SYNTHETIC_ORGANISATIONS) {
      expect(isSyntheticCode(organisation.code)).toBe(true);
      expect(isSyntheticName(organisation.name)).toBe(true);
    }
  });
});

// No fixture value may be read by application code as a default. Application code is every TypeScript source file
// under apps/*/src and packages/*/src except its tests, and every migration; it may hold no fixture value and no
// synthetic code or database name.
describe('application code holds no fixture value (code-house-rules 11.1)', () => {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const sources = [
    ...['apps', 'packages'].flatMap((group) =>
      readdirSync(join(root, group), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => sourceFiles(join(root, group, entry.name, 'src'), /\.(ts|tsx|mts)$/)),
    ),
    ...sourceFiles(join(root, 'apps/server/migrations'), /\.sql$/),
  ];
  const fixtureValues = SYNTHETIC_ORGANISATIONS.flatMap((organisation) => [
    organisation.code,
    organisation.name,
    syntheticDatabaseName(organisation.code),
  ]);
  const markers = /\bSYN-[A-Z0-9]|\bsyn_[a-z0-9]/;

  it('finds the application sources', () => {
    const found = sources.map((file) => relative(root, file));
    expect(found).toContain('apps/server/src/migrate.ts');
    expect(found).toContain('apps/server/migrations/organisation/0002__kernel__refuse_change.sql');
  });

  it('PRD-SEC-017 no application source holds a fixture value or a synthetic marker', () => {
    const found = sources.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      const values = fixtureValues.filter((value) => text.includes(value));
      const marker = markers.exec(text)?.[0];
      return values.length > 0 || marker !== undefined
        ? [`${relative(root, file)}: ${[...values, ...(marker === undefined ? [] : [marker])].join(', ')}`]
        : [];
    });
    expect(found).toEqual([]);
  });
});

function sourceFiles(folder: string, kind: RegExp): string[] {
  let entries;
  try {
    entries = readdirSync(folder, { withFileTypes: true, recursive: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && kind.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}
