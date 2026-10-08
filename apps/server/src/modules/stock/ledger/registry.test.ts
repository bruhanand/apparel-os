import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LedgerSource } from './domain/request.js';
import { CallerRegistry, type CallerRegistration } from './registry.js';

// S1-F10-T02: registered callers (stock-ledger 13.2; DEC-112, H2). Every name here is SYNTHETIC test data.

const synthetic: CallerRegistration = {
  module: 'test-stock-ledger',
  synthetic: true,
  recordTypes: [{ recordType: 'document', itemKinds: ['receipt-count'], importKinds: ['none'] }],
};

function source(overrides: Partial<LedgerSource> = {}): LedgerSource {
  return {
    module: 'test-stock-ledger',
    recordType: 'document',
    recordId: '01900000-0000-7000-8000-000000000001',
    versionId: '01900000-0000-7000-8000-000000000002',
    importKind: 'none',
    ...overrides,
  };
}

const line = '01900000-0000-7000-8000-000000000003';

describe('registered callers (stock-ledger 13.2; DEC-112, H2)', () => {
  it('stock-ledger 13.2 a synthetic caller outside a test composition fails the start', () => {
    expect(() => new CallerRegistry([synthetic], 'production')).toThrow(/outside a test composition/);
  });

  it('stock-ledger 13.2 a synthetic caller is accepted in a test composition', () => {
    const registry = new CallerRegistry([synthetic], 'test');
    expect(registry.check(source(), [{ kind: 'receipt-count', lineId: line }])).toBeUndefined();
  });

  it('PRD-LIF-014 a registration carrying historical reference fails the start', () => {
    const wrong: CallerRegistration = {
      ...synthetic,
      recordTypes: [{ recordType: 'document', itemKinds: [], importKinds: ['historical-reference' as 'none'] }],
    };
    expect(() => new CallerRegistry([wrong], 'test')).toThrow(/historical reference/);
  });

  it('stock-ledger 13.2 refuses an unregistered caller, an unlisted item kind and a historical-reference source', () => {
    const registry = new CallerRegistry([synthetic], 'test');
    expect(registry.check(source({ recordType: 'other' }), [])?.code).toBe('stock.caller-not-registered');
    expect(registry.check(source({ importKind: 'transaction' }), [])?.code).toBe('stock.caller-not-registered');
    expect(registry.check(source(), [{ kind: 'reserve', lineId: line }])).toEqual({
      kind: 'refused',
      code: 'stock.item-not-registered',
      missing: [
        { kind: 'line', lineId: line },
        { kind: 'item', itemKind: 'reserve' },
      ],
    });
    expect(registry.check(source({ importKind: 'historical-reference' }), [])?.code).toBe(
      'stock.historical-reference-source',
    );
  });

  it('stock-ledger 13.2 the production composition registers no caller, and no file under src names the test composition', () => {
    const SRC = join(import.meta.dirname, '../../..');
    const files = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return files(path);
        return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
      });
    const naming = files(SRC).filter((file) => /composition:\s*'test'/.test(readFileSync(file, 'utf8')));
    expect(naming).toEqual([]);
    const module = readFileSync(join(import.meta.dirname, 'stock-ledger.module.ts'), 'utf8');
    expect(module).toMatch(/registrations: \[\]/);
    expect(module).toMatch(/composition: 'production'/);
  });
});
