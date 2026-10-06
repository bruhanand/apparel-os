import { describe, expect, it } from 'vitest';
import { discardDraft, readDraft, saveDraft, type DraftStore } from './kept-drafts';

// SYNTHETIC values only (code-house-rules 11.1).
function memoryStore(): DraftStore & { readonly items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

const route = {
  secretFields: [{ path: ['temporaryPassword'], kind: 'new-secret' }],
  restrictedFields: [{ path: ['bank', 'accountNumber'], fieldClass: 'bank-details' }],
} as const;
const owner = { organisationCode: 'SYN-ORG-A', userId: '01900000-0000-7000-8000-0000000000a1' };

describe('kept drafts (access-and-approvals 3.3; PRD-ACS-017, PRD-UXP-003)', () => {
  it('PRD-SEC-006 keeps unsaved input on the device for the same user and Organisation, never a secret or restricted field', () => {
    const store = memoryStore();
    saveDraft(store, owner, 'synthetic-form', route, {
      login: 'SYN-USER-TYPED',
      temporaryPassword: 'SYNTHETIC-typed-secret',
      bank: { name: 'SYNTHETIC bank', accountNumber: 'SYNTHETIC-number' },
    });
    expect(readDraft(store, owner, 'synthetic-form')).toEqual({
      login: 'SYN-USER-TYPED',
      bank: { name: 'SYNTHETIC bank' },
    });
    expect([...store.items.values()].join('')).not.toContain('SYNTHETIC-typed-secret');
    expect([...store.items.values()].join('')).not.toContain('SYNTHETIC-number');
  });

  it('PRD-ACS-020 never offers one user or Organisation the draft of another', () => {
    const store = memoryStore();
    saveDraft(store, owner, 'synthetic-form', route, { login: 'SYN-USER-TYPED' });
    expect(readDraft(store, { ...owner, userId: '01900000-0000-7000-8000-0000000000b2' }, 'synthetic-form')).toBeNull();
    expect(readDraft(store, { ...owner, organisationCode: 'SYN-ORG-B' }, 'synthetic-form')).toBeNull();
  });

  it('forgets a draft once discarded, and reads nothing it cannot parse', () => {
    const store = memoryStore();
    saveDraft(store, owner, 'synthetic-form', route, { login: 'SYN-USER-TYPED' });
    discardDraft(store, owner, 'synthetic-form');
    expect(readDraft(store, owner, 'synthetic-form')).toBeNull();
    store.items.set([...store.items.keys()][0] ?? 'aos.kept-draft/1/SYN-ORG-A/x/synthetic-form', '{not json');
    expect(readDraft(store, owner, 'synthetic-form')).toBeNull();
  });

  it('works without a store, as in a private window that refuses one', () => {
    expect(() => {
      saveDraft(null, owner, 'synthetic-form', route, { login: 'SYN-USER-TYPED' });
    }).not.toThrow();
    expect(readDraft(null, owner, 'synthetic-form')).toBeNull();
  });
});
