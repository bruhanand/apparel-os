import type { FieldClass, MissingItem, Secret } from '@apparel-os/schemas';
import { CommandDefect } from '../command-runner/command-errors.js';
import type { TransactionContext } from '../command-runner/transaction-context.js';
import type { JsonValue } from './canonical-form.js';

// The contracts the idempotency helper defines and higher modules implement (module-map section 3, rules 4 and 6):
// `kernel` calls no module above it, so what it needs from `access` it asks through these.

/** What blocks an action, as identifiers and codes only (code-house-rules 12.3 "What is missing"; PRD-UXP-003). */
export type { MissingItem };

/**
 * The kinds of refusal kept under the key (code-house-rules 12.3, the last column). `conflict` is kept only for a
 * stale version (`kernel.stale-version`, 12.7); a key conflict is the helper's own and never kept as a result.
 */
export type KeptRefusalKind = 'unavailable' | 'not-authorised' | 'not-found' | 'refused' | 'conflict';

/** A refusal as the command decides it: a kind, a code `<unit>.<reason>`, what is missing and the next action. */
export interface CommandRefusal<Kind extends string = KeptRefusalKind> {
  readonly kind: Kind;
  readonly code: string;
  readonly missing: readonly MissingItem[];
  readonly next?: string;
}

/**
 * The refusal of a replay whose access checks fail now (code-house-rules 12.4 "Replay"; CH-14): the same refusal any
 * request failing them gets, `not-signed-in`, `not-authorised`, or `not-found` for a record the actor may not view.
 */
export type ReplayAccessRefusal = CommandRefusal<'not-signed-in' | 'not-authorised' | 'not-found'>;

/** What a key's first request left, as the replay's access check is shown it. */
export type KeptOutcome =
  | {
      readonly kind: 'success';
      /** The answer as sent, or, for an answer that showed a secret or a restricted value unmasked, only that fact. */
      readonly answer:
        | { readonly kind: 'kept'; readonly value: JsonValue }
        | { readonly kind: 'not-kept'; readonly shown: 'secret' | 'restricted-value' };
    }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

export type ReplayAccess =
  { readonly kind: 'allowed' } | { readonly kind: 'refused'; readonly refusal: ReplayAccessRefusal };

/**
 * The access checks a replay must pass before it is answered (code-house-rules 12.4 "Replay", CH-14;
 * access-and-approvals 7.1; PRD-INT-001, PRD-SEC-005). The caller supplies it for its route or job kind: for a route
 * or job step that declares an action, Authorise for that action, now, on the records the kept outcome names, within
 * scope; for an `own` route, Authenticate only, which has already passed for the request. Authenticate itself runs
 * before the helper, as for every request (module-map 6.1 step 1).
 *
 * It runs in a READ ONLY transaction with the actor set: authorising a replay only reads. It reruns no availability
 * check, validation, lock or write, and the command is never run again.
 */
export type ReplayAuthorisation = (context: TransactionContext, kept: KeptOutcome) => Promise<ReplayAccess>;

/**
 * Compares the new secrets of an identical replay with the credentials the first run wrote (code-house-rules 12.5,
 * item 2; module-map section 3, rule 6). `kernel` cannot read credentials, so it defines this contract and `access`,
 * which owns them, implements it: one Argon2 check per credential, while the credential is still the login's current
 * one. It makes no new secret material and says nothing of which field differs.
 *
 * - `same`: every new secret verifies against the credential the first run wrote for it, still current.
 * - `differs`: a credential is still current and a secret does not verify against it.
 * - `not-comparable`: a credential has since been replaced, or none can be read for a secret.
 */
export interface ReplaySecretCheck {
  compare(
    context: TransactionContext,
    check: { readonly credentialIds: readonly string[]; readonly secrets: ReadonlyMap<string, Secret> },
  ): Promise<'same' | 'differs' | 'not-comparable'>;
}

/**
 * The secret check until `access` implements it (`S1-F01-T08`, which writes the first credentials): no secret can be
 * compared, so an identical replay carrying a new secret is refused as `kernel.secret-not-comparable` and kept
 * without the secret, the fail-safe answer of code-house-rules 12.5 (CH-8). It compares nothing and reads nothing.
 */
export const secretCheckNotImplemented: ReplaySecretCheck = {
  compare: () => Promise.resolve('not-comparable'),
};

/** A restricted value encrypted under an Organisation's key: the scheme names the algorithm and key version. */
export interface EncryptedValue {
  readonly scheme: string;
  readonly ciphertext: string;
}

/**
 * Encrypts a restricted value under the Organisation's key, held outside the database, before it is kept in a
 * refused request (code-house-rules 12.4 "Changed content"; access-and-approvals 6; PRD-SEC-006, POL-18.02). The
 * helper calls it outside every transaction, so an implementation may reach a key store (code-house-rules 8.3).
 *
 * The per-Organisation key mechanism is built with the authenticator secret's encryption (`S1-F01-T08`); its owner
 * implements this contract then. The plaintext given is the canonical JSON of the value.
 */
export interface RestrictedValueCipher {
  encrypt(organisationCode: string, fieldClass: FieldClass, plaintext: string): Promise<EncryptedValue>;
}

/**
 * The cipher until the per-Organisation key exists (`S1-F01-T08`): it refuses, so a restricted value is never kept in
 * plain. No route carries a restricted field before then; one that did would fail to keep its refused request, as a
 * defect, rather than keep the value unencrypted.
 */
export const restrictedValueCipherNotConfigured: RestrictedValueCipher = {
  encrypt: () =>
    Promise.reject(
      new CommandDefect(
        'No Organisation key is configured to encrypt a restricted value; it is never kept in plain (code-house-rules 12.4; PRD-SEC-006)',
      ),
    ),
};
