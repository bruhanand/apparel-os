import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrationSetFolder, orderMigrationFileNames, readMigrationSet } from './migration-set.js';

describe('orderMigrationFileNames (code-house-rules 4.1)', () => {
  it('orders files by their number', () => {
    const ordered = orderMigrationFileNames([
      '0002__merchandise.catalogue__sku.sql',
      '0001__kernel__migration_record.sql',
    ]);
    expect(ordered.map((file) => file.fileName)).toEqual([
      '0001__kernel__migration_record.sql',
      '0002__merchandise.catalogue__sku.sql',
    ]);
  });

  it.each([
    '1__kernel__x.sql',
    '0001_kernel_x.sql',
    '0001__Kernel__x.sql',
    '0001__kernel__x.SQL',
    '0001__a.b.c__x.sql',
    '0001__kernel__.sql',
  ])('refuses the file name %s', (name) => {
    expect(() => orderMigrationFileNames([name])).toThrow(/does not follow/);
  });

  it('refuses two files with one number', () => {
    expect(() =>
      orderMigrationFileNames(['0001__kernel__a.sql', '0002__kernel__b.sql', '0002__access__c.sql']),
    ).toThrow(/Migration number 2 is taken/);
  });

  it('refuses a gap in the numbers', () => {
    expect(() => orderMigrationFileNames(['0001__kernel__a.sql', '0003__kernel__c.sql'])).toThrow(
      /Migration number 2 is missing/,
    );
  });

  it('refuses a set that does not start at 0001', () => {
    expect(() => orderMigrationFileNames(['0002__kernel__b.sql'])).toThrow(/Migration number 1 is missing/);
  });
});

describe("the repository's migration sets", () => {
  it.each(['directory', 'organisation'] as const)('the %s set starts with the runner record', (set) => {
    const files = readMigrationSet(migrationSetFolder(set));
    expect(files[0]?.fileName).toBe('0001__kernel__migration_record.sql');
    for (const file of files) expect(file.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('readMigrationSet refuses what it would otherwise pass over (code-house-rules 4.1)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'aos-set-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function set(files: Record<string, string>, folders: string[] = []): string {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
    for (const name of folders) mkdirSync(join(root, name));
    return root;
  }

  const register = { 'tables.json': '{ "tables": [] }\n' };
  const first = { '0001__kernel__migration_record.sql': 'select 1;' };

  it('reads a well-formed set', () => {
    const files = readMigrationSet(set({ ...register, ...first, '0002__kernel__b.sql': 'select 2;' }));
    expect(files.map((file) => file.fileName)).toEqual(['0001__kernel__migration_record.sql', '0002__kernel__b.sql']);
  });

  it.each(['0002__kernel__b.SQL', '0002__kernel__b.sql.bak', 'README.md', '.DS_Store'])(
    'refuses a set holding %s',
    (name) => {
      expect(() => readMigrationSet(set({ ...register, ...first, [name]: 'select 2;' }))).toThrow(
        new RegExp(`holds ${name.replaceAll('.', '\\.')}:`),
      );
    },
  );

  it('refuses a set holding a subfolder', () => {
    expect(() => readMigrationSet(set({ ...register, ...first }, ['0002__kernel__b.sql']))).toThrow(
      /holds 0002__kernel__b\.sql:/,
    );
  });

  it('refuses a set with no table register', () => {
    expect(() => readMigrationSet(set(first))).toThrow(/has no tables\.json/);
  });

  it('refuses a set with no migration', () => {
    expect(() => readMigrationSet(set(register))).toThrow(/holds no migration/);
  });
});
