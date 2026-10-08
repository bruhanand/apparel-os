import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCTION_COMPOSITION } from '../src/kernel/index.js';
import type { LedgerSource } from '../src/modules/stock/ledger/index.js';
// The registry itself, which the ledger builds from its registrations (stock-ledger 13.2).
import { CallerRegistry, type CallerRegistration } from '../src/modules/stock/ledger/registry.js';
import { SYNTHETIC_MODULE, UNREGISTERED_MODULE } from './fixtures/stock-ledger.js';
import { TEST_COMPOSITION } from './support/composition.js';

// S1-F10-T02: registered callers (stock-ledger 13.2; DEC-112, H2). Every name here is SYNTHETIC test data.

const synthetic: CallerRegistration = {
  module: SYNTHETIC_MODULE,
  synthetic: true,
  recordTypes: [{ recordType: 'document', itemKinds: ['receipt-count'], importKinds: ['none'] }],
};

function source(overrides: Partial<LedgerSource> = {}): LedgerSource {
  return {
    module: SYNTHETIC_MODULE,
    recordType: 'document',
    recordId: '01900000-0000-7000-8000-000000000001',
    versionId: '01900000-0000-7000-8000-000000000002',
    importKind: 'none',
    ...overrides,
  };
}

const line = '01900000-0000-7000-8000-000000000003';

describe('registered callers (stock-ledger 13.2; DEC-112, H2)', () => {
  it('stock-ledger 13.2 a synthetic caller in the production composition fails the start', () => {
    expect(() => new CallerRegistry([synthetic], PRODUCTION_COMPOSITION)).toThrow(/outside a test composition/);
  });

  it('stock-ledger 13.2 a synthetic caller is accepted in the test composition', () => {
    const registry = new CallerRegistry([synthetic], TEST_COMPOSITION);
    expect(registry.check(source(), [{ kind: 'receipt-count', lineId: line }])).toBeUndefined();
  });

  it('PRD-LIF-014 a registration carrying historical reference fails the start', () => {
    const wrong: CallerRegistration = {
      ...synthetic,
      recordTypes: [{ recordType: 'document', itemKinds: [], importKinds: ['historical-reference' as 'none'] }],
    };
    expect(() => new CallerRegistry([wrong], TEST_COMPOSITION)).toThrow(/historical reference/);
  });

  it('stock-ledger 13.2 refuses an unregistered caller, an unlisted item kind and a historical-reference source', () => {
    const registry = new CallerRegistry([synthetic], TEST_COMPOSITION);
    expect(registry.check(source({ module: UNREGISTERED_MODULE }), [])?.code).toBe('stock.caller-not-registered');
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

  it('stock-ledger 13.2 the production composition is the only one code under src can name, and it registers no caller', () => {
    // A test composition is a branded value made only in apps/server/test/support/composition.ts; a lint rule refuses
    // a cast to it under src/ (eslint.config.mjs), and src/ never imports a test folder (code-house-rules 11.2).
    expect(PRODUCTION_COMPOSITION.kind).toBe('production');
    expect(TEST_COMPOSITION.kind).toBe('test');
    const module = readFileSync(
      join(import.meta.dirname, '../src/modules/stock/ledger/stock-ledger.module.ts'),
      'utf8',
    );
    expect(module).toMatch(/registrations: \[\]/);
    expect(module).toMatch(/composition: PRODUCTION_COMPOSITION/);
  });
});
