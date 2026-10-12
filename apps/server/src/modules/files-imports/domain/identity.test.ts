import { describe, expect, it } from 'vitest';
import { documentContentHash, identityFinding } from './identity.js';

// S1-F06-T04: a document's source identity and content (imports-and-opening-data 7.1, 7.2, 7.3; PRD-IMP-011,
// PRD-ACP-012). Every value is SYNTHETIC.

const FIELDS = ['styleCode', 'skuCode', 'size'];

describe('documentContentHash', () => {
  it('PRD-IMP-011 is the same for the same values in another row order or from another origin', () => {
    const first = documentContentHash(FIELDS, [
      { styleCode: { kind: 'supplied', value: 'SYN-S' }, skuCode: { kind: 'supplied', value: 'SYN-1' } },
      { styleCode: { kind: 'supplied', value: 'SYN-S' }, skuCode: { kind: 'entered', value: 'SYN-2' } },
    ]);
    const second = documentContentHash(FIELDS, [
      { styleCode: { kind: 'mapped', value: 'SYN-S' }, skuCode: { kind: 'supplied', value: 'SYN-2' } },
      { styleCode: { kind: 'supplied', value: 'SYN-S' }, skuCode: { kind: 'calculated', value: 'SYN-1' } },
    ]);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });

  it('PRD-IMP-011 PRD-MOD-015 differs when a value changes, and keeps Unknown apart from an empty text', () => {
    const base = [{ styleCode: { kind: 'supplied', value: 'SYN-S' } as const, size: { kind: 'unknown' } as const }];
    const changed = [{ styleCode: { kind: 'supplied', value: 'SYN-T' } as const, size: { kind: 'unknown' } as const }];
    const empty = [
      { styleCode: { kind: 'supplied', value: 'SYN-S' } as const, size: { kind: 'supplied', value: '' } as const },
    ];
    expect(documentContentHash(FIELDS, changed)).not.toBe(documentContentHash(FIELDS, base));
    expect(documentContentHash(FIELDS, empty)).not.toBe(documentContentHash(FIELDS, base));
  });
});

describe('identityFinding', () => {
  it('PRD-IMP-011: no published document is new; the same content is a duplicate; other content a conflict', () => {
    expect(identityFinding(undefined, 'a', false)).toEqual({ kind: 'new' });
    expect(identityFinding({ documentId: 'D', contentHash: 'a' }, 'a', false)).toEqual({ kind: 'duplicate', of: 'D' });
    expect(identityFinding({ documentId: 'D', contentHash: 'b' }, 'a', false)).toEqual({ kind: 'conflict', of: 'D' });
  });

  it('PRD-ACP-012: with a governed revision chosen, other content revises the published document; the same is a duplicate', () => {
    expect(identityFinding({ documentId: 'D', contentHash: 'b' }, 'a', true)).toEqual({ kind: 'revision', of: 'D' });
    expect(identityFinding({ documentId: 'D', contentHash: 'a' }, 'a', true)).toEqual({ kind: 'duplicate', of: 'D' });
  });

  it('PRD-MOD-015: a published document whose content is Unknown is never a duplicate', () => {
    expect(identityFinding({ documentId: 'D', contentHash: null }, 'a', false)).toEqual({ kind: 'conflict', of: 'D' });
    expect(identityFinding({ documentId: 'D', contentHash: null }, 'a', true)).toEqual({ kind: 'revision', of: 'D' });
  });
});
