import type { TransactionContext } from '../../../kernel/index.js';
import { openFactorSecret } from '../domain/factor-secret.js';
import type { OrganisationKeys } from '../domain/organisation-keys.js';
import { matchingStep } from '../domain/totp.js';
import { credentialState } from '../queries/users.js';
import { takeStep } from './take-step.js';

/**
 * A fresh authenticator code for a protected action, checked but not yet taken (access-and-approvals 3.3;
 * PRD-SEC-001; GC3-6). `take` records its time step, so the code is never accepted again; false when another request
 * took that step first, which counts as a refused code.
 */
export type FreshCode =
  | { readonly kind: 'matches'; readonly take: () => Promise<boolean> }
  | { readonly kind: 'not-enrolled' }
  | { readonly kind: 'refused' };

/**
 * Checks the code a person gives for a protected action against their confirmed authenticator (access-and-approvals
 * 3.3): deciding an approval, changing access, changing bank details, showing or exporting an encrypted field,
 * resetting another user's credential, and changing one's own password. How long a code stays fresh is a setting
 * with no default, OPEN (GC3-6; KDPS Owner); until it is set, every protected action asks for a new code, so a code
 * counts only for a time step later than any the user's authenticator has given before (fail-safe; S1-F01-T09).
 */
export async function checkFreshCode(
  context: TransactionContext,
  keys: OrganisationKeys,
  userId: string,
  code: string,
): Promise<FreshCode> {
  const factor = (await credentialState(context, userId)).confirmedFactor;
  if (factor === undefined) return { kind: 'not-enrolled' };
  const secret = openFactorSecret(keys, context.organisationCode, factor);
  const step = matchingStep(secret, code, context.startedAt, factor.lastUsedStep);
  if (step === undefined) return { kind: 'refused' };
  return { kind: 'matches', take: () => takeStep(context, factor.id, step) };
}
