import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
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

/** A fresh code refused: the refusal to give, and whether the code (a secret) caused it (code-house-rules 12.4). */
export interface FreshCodeRefusal {
  readonly refusal: CommandRefusal<'refused' | 'not-authorised'>;
  readonly causedBySecret: boolean;
}

/**
 * The refusal for a code that does not match, the same for every protected action (access-and-approvals 3.3): a person
 * with no confirmed authenticator is told to enrol; a wrong code, or one a step already used, is
 * `access.authenticator-code-refused`. Undefined when the code matches.
 */
export function freshCodeRefusal(code: FreshCode): FreshCodeRefusal | undefined {
  if (code.kind === 'not-enrolled') {
    return { refusal: { kind: 'refused', code: 'access.enrolment-not-started', missing: [] }, causedBySecret: false };
  }
  if (code.kind === 'refused') return codeRefused();
  return undefined;
}

/**
 * Checks the code matched and takes its step, in the caller's transaction, so it is never accepted again: undefined
 * when it is taken, otherwise the refusal. A step another request took first is a refused code.
 */
export async function takeFreshCode(code: FreshCode): Promise<FreshCodeRefusal | undefined> {
  const refused = freshCodeRefusal(code);
  if (refused !== undefined) return refused;
  if (code.kind === 'matches' && !(await code.take())) return codeRefused();
  return undefined;
}

function codeRefused(): FreshCodeRefusal {
  return {
    refusal: { kind: 'not-authorised', code: 'access.authenticator-code-refused', missing: [] },
    causedBySecret: true,
  };
}
