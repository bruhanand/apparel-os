import type { OrganisationKeys, SealedValue } from './organisation-keys.js';

// The authenticator secret is encrypted in the application under the Organisation's key before it reaches PostgreSQL,
// bound to its own second-factor row, so a ciphertext copied onto another row does not read back
// (access-and-approvals 6; PRD-SEC-006, POL-18.02).

function contextOf(secondFactorId: string): string {
  return `access.second_factor:${secondFactorId}`;
}

export function sealFactorSecret(
  keys: OrganisationKeys,
  organisationCode: string,
  secondFactorId: string,
  secret: Buffer,
): SealedValue {
  return keys.encrypt(organisationCode, 'authenticator-secret', secret, contextOf(secondFactorId));
}

export function openFactorSecret(
  keys: OrganisationKeys,
  organisationCode: string,
  factor: { readonly id: string; readonly scheme: string; readonly ciphertext: string },
): Buffer {
  return keys.decrypt(
    organisationCode,
    'authenticator-secret',
    { scheme: factor.scheme, ciphertext: factor.ciphertext },
    contextOf(factor.id),
  );
}
