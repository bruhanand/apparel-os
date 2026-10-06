import type { Secret } from '@apparel-os/schemas';
import type { TransactionContext } from '../../kernel/index.js';
import {
  authenticateInternalIdentity,
  authenticateServiceCredential,
  type AuthenticatedServiceIdentity,
} from './queries/service-identities.js';

/**
 * The access module's interface to other modules (module-map 4.3), as far as S1-F01-T08 builds it: Authenticate for
 * service identities (access-and-approvals 2.3, 7.1 step 1). Authorise, roles and assignments arrive with T11.
 * Every operation joins the caller's transaction through its context (code-house-rules 8.1).
 */
export interface AccessInterface {
  /** An internal identity, by its code, enabled today; undefined otherwise. */
  authenticateInternalIdentity(
    context: TransactionContext,
    code: string,
  ): Promise<AuthenticatedServiceIdentity | undefined>;
  /** An outside caller, by its credential and secret; undefined otherwise, whatever was wrong. */
  authenticateServiceCredential(
    context: TransactionContext,
    credentialId: string,
    secret: Secret,
  ): Promise<AuthenticatedServiceIdentity | undefined>;
}

export class Access implements AccessInterface {
  authenticateInternalIdentity(context: TransactionContext, code: string) {
    return authenticateInternalIdentity(context, code);
  }

  authenticateServiceCredential(context: TransactionContext, credentialId: string, secret: Secret) {
    return authenticateServiceCredential(context, credentialId, secret);
  }
}
