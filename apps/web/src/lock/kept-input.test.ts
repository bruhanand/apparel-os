import { describe, expect, it } from 'vitest';
import { keptInput } from './kept-input';

const route = {
  secretFields: [
    { path: ['temporaryPassword'], kind: 'new-secret' },
    { path: ['authenticatorCode'], kind: 'authenticator-code' },
  ],
  restrictedFields: [
    { path: ['bank', 'accountNumber'], fieldClass: 'bank-details' },
    { path: ['lines', '*', 'cost'], fieldClass: 'cost' },
  ],
} as const;

describe('keptInput (access-and-approvals 3.3; PRD-ACS-017)', () => {
  it('PRD-SEC-006 keeps unsaved input but never a restricted field or a secret', () => {
    const input = {
      login: 'typed-login',
      temporaryPassword: 'typed-secret',
      authenticatorCode: '123456',
      bank: { name: 'typed bank', accountNumber: 'typed-number' },
      lines: [
        { sku: 'a', cost: 100 },
        { sku: 'b', cost: 200 },
      ],
    };
    expect(keptInput(route, input)).toEqual({
      login: 'typed-login',
      bank: { name: 'typed bank' },
      lines: [{ sku: 'a' }, { sku: 'b' }],
    });
  });

  it('leaves the input it was given unchanged', () => {
    const input = { bank: { accountNumber: 'typed-number' } };
    keptInput(route, input);
    expect(input).toEqual({ bank: { accountNumber: 'typed-number' } });
  });

  it('keeps input that holds none of the declared fields as it is', () => {
    expect(keptInput(route, { login: 'typed-login', lines: 'not a list' })).toEqual({
      login: 'typed-login',
      lines: 'not a list',
    });
  });
});
