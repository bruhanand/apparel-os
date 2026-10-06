import type { FieldClass, Secret } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import type {
  EncryptedValue,
  ReplaySecretCheck,
  RestrictedValueCipher,
  TransactionContext,
} from '../../../kernel/index.js';
import { passwordCredential } from '../db/schema.js';
import type { OrganisationKeys } from '../domain/organisation-keys.js';
import { verifyPassword } from '../domain/password-hash.js';

/**
 * The idempotency helper's replay secret check, implemented by `access`, which owns the credentials
 * (code-house-rules 12.5 item 2; module-map section 3, rule 6; RR-248). A replay that sets a new password is compared
 * with the one credential its first run wrote: while that credential is the user's current one, by one Argon2 check;
 * once replaced, it keeps no hash and cannot be compared (12.5 item 3). Anything other than one credential and one
 * new secret cannot be compared either. It makes no new secret material and says nothing of which field differs.
 */
export class PasswordReplayCheck implements ReplaySecretCheck {
  async compare(
    context: TransactionContext,
    check: { readonly credentialIds: readonly string[]; readonly secrets: ReadonlyMap<string, Secret> },
  ): Promise<'same' | 'differs' | 'not-comparable'> {
    const [credentialId] = check.credentialIds;
    const [secret] = check.secrets.values();
    if (check.credentialIds.length !== 1 || check.secrets.size !== 1 || credentialId === undefined || !secret) {
      return 'not-comparable';
    }
    const rows = await context.tx
      .select({ hash: passwordCredential.passwordHash })
      .from(passwordCredential)
      .where(eq(passwordCredential.id, credentialId));
    const hash = rows[0]?.hash;
    if (hash === undefined || hash === null) return 'not-comparable';
    return (await verifyPassword(hash, secret)) ? 'same' : 'differs';
  }
}

/**
 * The cipher of restricted values kept in a refused request (code-house-rules 12.4 "Changed content"; RR-248): each
 * value encrypted under its Organisation's key, held outside the database, with a subkey of its own and bound to its
 * field class (access-and-approvals 6; PRD-SEC-006, POL-18.02). An Organisation with no key refuses, so no value is
 * ever kept in plain.
 */
export class OrganisationKeyCipher implements RestrictedValueCipher {
  constructor(private readonly keys: OrganisationKeys) {}

  encrypt(organisationCode: string, fieldClass: FieldClass, plaintext: string): Promise<EncryptedValue> {
    try {
      return Promise.resolve(
        this.keys.encrypt(
          organisationCode,
          'restricted-value',
          Buffer.from(plaintext, 'utf8'),
          `field-class:${fieldClass}`,
        ),
      );
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error('The value could not be encrypted'));
    }
  }
}
