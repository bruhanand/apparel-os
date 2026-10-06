import type { SignInStep } from '@apparel-os/schemas';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { appUser, appUserVersion, passwordCredential, secondFactor } from '../db/schema.js';

/** A user found by the login typed, compared without regard to letter case (access-and-approvals 2.1). */
export interface FoundUser {
  readonly id: string;
  readonly login: string;
}

/** The user's version in force on a date: Approved, its dates covering the date (access-and-approvals 2.1). */
export interface UserInForce {
  readonly versionId: string;
  readonly state: 'Active' | 'Disabled' | 'Ended';
  readonly displayName: string;
}

/** What a user's credentials say of sign-in (access-and-approvals 3.2). */
export interface CredentialState {
  readonly password: { readonly id: string; readonly hash: string; readonly temporary: boolean } | undefined;
  readonly confirmedFactor:
    | {
        readonly id: string;
        readonly scheme: string;
        readonly ciphertext: string;
        readonly lastUsedStep: number | undefined;
      }
    | undefined;
}

export async function findUserByLogin(context: TransactionContext, login: string): Promise<FoundUser | undefined> {
  // A login PostgreSQL text cannot hold matches no user, like any other unknown login.
  if (login.includes('\u0000')) return undefined;
  const rows = await context.tx
    .select({ id: appUser.id, login: appUser.login })
    .from(appUser)
    .where(sql`lower(${appUser.login}) = lower(${login})`);
  return rows[0];
}

export async function findUser(context: TransactionContext, userId: string): Promise<FoundUser | undefined> {
  const rows = await context.tx
    .select({ id: appUser.id, login: appUser.login })
    .from(appUser)
    .where(eq(appUser.id, userId));
  return rows[0];
}

/**
 * The user's state in force on a business date (access-and-approvals 2.1, 7.1 step 1). Undefined when no Approved
 * version covers the date, as for a user whose first version still waits: such a user has no state in force and
 * cannot sign in (DEC-112).
 */
export async function userInForce(
  context: TransactionContext,
  userId: string,
  businessDate: string,
): Promise<UserInForce | undefined> {
  const rows = await context.tx
    .select({ versionId: appUserVersion.id, state: appUserVersion.state, displayName: appUserVersion.displayName })
    .from(appUserVersion)
    .where(
      and(
        eq(appUserVersion.appUserId, userId),
        eq(appUserVersion.decision, 'Approved'),
        sql`${appUserVersion.validDuring} @> ${businessDate}::date`,
      ),
    );
  const row = rows[0];
  if (row === undefined) return undefined;
  return { versionId: row.versionId, state: row.state as UserInForce['state'], displayName: row.displayName };
}

/** The user's current password credential and confirmed second factor. */
export async function credentialState(context: TransactionContext, userId: string): Promise<CredentialState> {
  const passwords = await context.tx
    .select({
      id: passwordCredential.id,
      hash: passwordCredential.passwordHash,
      temporary: passwordCredential.temporary,
    })
    .from(passwordCredential)
    .where(and(eq(passwordCredential.appUserId, userId), isNull(passwordCredential.replacedAt)));
  const factors = await context.tx
    .select({
      id: secondFactor.id,
      scheme: secondFactor.secretScheme,
      ciphertext: secondFactor.secretCiphertext,
      lastUsedStep: secondFactor.lastUsedStep,
    })
    .from(secondFactor)
    .where(and(eq(secondFactor.appUserId, userId), eq(secondFactor.state, 'Confirmed')));
  const password = passwords[0];
  const factor = factors[0];
  return {
    password:
      password?.hash == null ? undefined : { id: password.id, hash: password.hash, temporary: password.temporary },
    confirmedFactor:
      factor === undefined
        ? undefined
        : {
            id: factor.id,
            scheme: factor.scheme,
            ciphertext: factor.ciphertext,
            lastUsedStep: factor.lastUsedStep ?? undefined,
          },
  };
}

/**
 * What the session still has to do before it reaches anything else (access-and-approvals 3.2, 7.1 step 1): enrol an
 * authenticator app while no second factor is confirmed, then replace a temporary password. In that order, since the
 * password change needs a fresh code.
 */
export function pendingSteps(credentials: CredentialState): SignInStep[] {
  const steps: SignInStep[] = [];
  if (credentials.confirmedFactor === undefined) steps.push('enrolment');
  if (credentials.password?.temporary !== false) steps.push('password-change');
  return steps;
}

/** The second factor the user is setting up, if any (access-and-approvals 3.2). */
export async function factorBeingSetUp(
  context: TransactionContext,
  userId: string,
): Promise<{ readonly id: string; readonly scheme: string; readonly ciphertext: string } | undefined> {
  const rows = await context.tx
    .select({ id: secondFactor.id, scheme: secondFactor.secretScheme, ciphertext: secondFactor.secretCiphertext })
    .from(secondFactor)
    .where(and(eq(secondFactor.appUserId, userId), eq(secondFactor.state, 'Setting up')));
  return rows[0];
}
