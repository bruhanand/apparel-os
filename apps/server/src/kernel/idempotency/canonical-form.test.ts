import { Secret } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { CommandDefect } from '../command-runner/command-errors.js';
import { canonicalJson, prepareRequest, type RequestContent } from './canonical-form.js';

// S1-F01-T04: the canonical form of a request and its hash (code-house-rules 12.4 "What is hashed", 12.5).

function content(body: unknown, extra: Partial<RequestContent> = {}): RequestContent {
  return { pathParameters: {}, body, secretFields: [], restrictedFields: [], ...extra };
}

describe('the canonical JSON (code-house-rules 12.4)', () => {
  it('sorts object keys, keeps list order and leaves no insignificant space', () => {
    expect(canonicalJson({ b: [3, 1, { d: true, c: null }], a: 'x' })).toBe('{"a":"x","b":[3,1,{"c":null,"d":true}]}');
  });
});

describe('prepareRequest (code-house-rules 12.4, 12.5)', () => {
  it('PRD-INT-002 gives the same hash for the same content whatever the order of its keys', () => {
    const first = prepareRequest('kernel.synthetic', content({ a: 1, b: { c: 'x', d: 'y' } }));
    const second = prepareRequest('kernel.synthetic', content({ b: { d: 'y', c: 'x' }, a: 1 }));
    expect(second.hash).toBe(first.hash);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('PRD-INT-002 gives another hash for another operation, path parameter or body', () => {
    const base = prepareRequest('kernel.synthetic', content({ a: 1 }, { pathParameters: { id: 'x' } }));
    const hashes = [
      prepareRequest('kernel.other', content({ a: 1 }, { pathParameters: { id: 'x' } })).hash,
      prepareRequest('kernel.synthetic', content({ a: 1 }, { pathParameters: { id: 'y' } })).hash,
      prepareRequest('kernel.synthetic', content({ a: 2 }, { pathParameters: { id: 'x' } })).hash,
    ];
    expect(new Set([base.hash, ...hashes]).size).toBe(4);
  });

  it('PRD-SEC-014 leaves every secret field out of the form and the hash, keeping only its name', () => {
    const fields: Partial<RequestContent> = {
      secretFields: [
        { path: ['newPassword'], kind: 'new-secret' },
        { path: ['totpCode'], kind: 'authenticator-code' },
      ],
    };
    const first = prepareRequest(
      'kernel.synthetic',
      content({ note: 'n', newPassword: new Secret('SYNTHETIC-one'), totpCode: '111111' }, fields),
    );
    const second = prepareRequest(
      'kernel.synthetic',
      content({ note: 'n', newPassword: new Secret('SYNTHETIC-two'), totpCode: '222222' }, fields),
    );
    expect(first.form).toEqual({
      operation: 'kernel.synthetic',
      pathParameters: {},
      body: { note: 'n' },
      secretFields: ['newPassword', 'totpCode'],
    });
    expect(second.hash).toBe(first.hash);
    expect(first.newSecrets.get('newPassword')?.reveal()).toBe('SYNTHETIC-one');
    expect(JSON.stringify(first.form)).not.toContain('111111');
  });

  it('PRD-SEC-014 refuses a secret its route did not declare, so none can enter the hash by being left out', () => {
    expect(() => prepareRequest('kernel.synthetic', content({ password: new Secret('SYNTHETIC') }))).toThrow(
      CommandDefect,
    );
  });

  it('refuses a new secret that was not parsed into a Secret', () => {
    expect(() =>
      prepareRequest(
        'kernel.synthetic',
        content({ newPassword: 'SYNTHETIC' }, { secretFields: [{ path: ['newPassword'], kind: 'new-secret' }] }),
      ),
    ).toThrow(CommandDefect);
  });

  it('finds every restricted value at a declared path, through lists', () => {
    const prepared = prepareRequest(
      'kernel.synthetic',
      content(
        { lines: [{ cost: 100 }, { cost: 200 }] },
        { restrictedFields: [{ path: ['lines', '*', 'cost'], fieldClass: 'cost' }] },
      ),
    );
    expect(prepared.restrictedLeaves).toEqual([
      { path: ['lines', 0, 'cost'], fieldClass: 'cost', value: 100 },
      { path: ['lines', 1, 'cost'], fieldClass: 'cost', value: 200 },
    ]);
  });

  it('refuses a restricted path that meets a value of the wrong shape, rather than leave a value in plain', () => {
    expect(() =>
      prepareRequest(
        'kernel.synthetic',
        content({ lines: { cost: 1 } }, { restrictedFields: [{ path: ['lines', '*', 'cost'], fieldClass: 'cost' }] }),
      ),
    ).toThrow(CommandDefect);
  });
});
