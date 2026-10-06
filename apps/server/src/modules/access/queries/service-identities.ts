import type { Secret } from '@apparel-os/schemas';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { serviceCredential, serviceIdentity, serviceIdentityVersion } from '../db/schema.js';
import { verifyPassword } from '../domain/password-hash.js';

/** A service identity Authenticate found (access-and-approvals 2.3, 7.1 step 1; PRD-SEC-018). */
export interface AuthenticatedServiceIdentity {
  readonly serviceIdentityId: string;
  readonly code: string;
  readonly kind: 'internal' | 'outside-caller';
}

/** Whether the identity has an Approved version in force on the date that is Active (access-and-approvals 7.1). */
async function activeOn(
  context: TransactionContext,
  serviceIdentityId: string,
  businessDate: string,
): Promise<boolean> {
  const rows = await context.tx
    .select({ state: serviceIdentityVersion.state })
    .from(serviceIdentityVersion)
    .where(
      and(
        eq(serviceIdentityVersion.serviceIdentityId, serviceIdentityId),
        eq(serviceIdentityVersion.decision, 'Approved'),
        sql`${serviceIdentityVersion.validDuring} @> ${businessDate}::date`,
      ),
    );
  return rows[0]?.state === 'Active';
}

/**
 * Authenticate for an internal service identity, under which the worker runs a job (access-and-approvals 2.3, 7.1
 * step 1): found by its code, enabled on today's date under the Organisation's timezone. Undefined otherwise; with no
 * timezone, no identity is enabled (fail-safe).
 */
export async function authenticateInternalIdentity(
  context: TransactionContext,
  code: string,
): Promise<AuthenticatedServiceIdentity | undefined> {
  const today = await context.businessDate();
  if (today.kind === 'not-set') return undefined;
  const rows = await context.tx
    .select({ id: serviceIdentity.id, code: serviceIdentity.code, kind: serviceIdentity.kind })
    .from(serviceIdentity)
    .where(and(eq(serviceIdentity.code, code), eq(serviceIdentity.kind, 'internal')));
  const found = rows[0];
  if (found === undefined || !(await activeOn(context, found.id, today.date))) return undefined;
  return { serviceIdentityId: found.id, code: found.code, kind: 'internal' };
}

/**
 * Authenticate for an outside caller by its credential (access-and-approvals 2.3, 7.1 step 1; PRD-SEC-018): the
 * credential not revoked, its secret verifying against the Argon2id hash, the identity enabled today. Undefined
 * otherwise, the same answer whatever was wrong; the secret is never logged (PRD-SEC-014).
 */
export async function authenticateServiceCredential(
  context: TransactionContext,
  credentialId: string,
  secret: Secret,
): Promise<AuthenticatedServiceIdentity | undefined> {
  const today = await context.businessDate();
  if (today.kind === 'not-set') return undefined;
  const rows = await context.tx
    .select({
      hash: serviceCredential.secretHash,
      id: serviceIdentity.id,
      code: serviceIdentity.code,
      kind: serviceIdentity.kind,
    })
    .from(serviceCredential)
    .innerJoin(serviceIdentity, eq(serviceIdentity.id, serviceCredential.serviceIdentityId))
    .where(and(eq(serviceCredential.id, credentialId), isNull(serviceCredential.revokedAt)));
  const found = rows[0];
  if (found === undefined || !(await verifyPassword(found.hash, secret))) return undefined;
  if (!(await activeOn(context, found.id, today.date))) return undefined;
  return { serviceIdentityId: found.id, code: found.code, kind: found.kind as AuthenticatedServiceIdentity['kind'] };
}
