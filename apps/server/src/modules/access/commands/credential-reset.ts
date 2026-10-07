import { uuidv7 } from '@apparel-os/domain';
import type { CredentialResetKind, Secret } from '@apparel-os/schemas';
import { and, eq, isNull } from 'drizzle-orm';
import type {
  CommandOutcome,
  CommandRefusal,
  IdempotencyHelper,
  IdempotentAnswer,
  ReplayAuthorisation,
  TransactionContext,
} from '../../../kernel/index.js';
import type { AuditChange, AuditInterface } from '../../audit/index.js';
import { passwordCredential, secondFactor } from '../db/schema.js';
import type { OrganisationKeys } from '../domain/organisation-keys.js';
import { hashPassword } from '../domain/password-hash.js';
import { meetsPasswordRules } from '../domain/sign-in-rules.js';
import { readSetting } from '../queries/settings.js';
import { findUser, userInForce } from '../queries/users.js';
import { checkFreshCode } from './fresh-code.js';
import type { OwnRequest } from './own-credentials.js';
import { revokeSessions } from './sessions.js';

export interface CredentialResetDependencies {
  readonly helper: IdempotencyHelper;
  readonly audit: AuditInterface;
  readonly keys: OrganisationKeys;
}

/** A reset as the route gives it (access-and-approvals 3.2). */
export interface CredentialReset {
  readonly userId: string;
  readonly reset: CredentialResetKind;
  readonly temporaryPassword: Secret | undefined;
  readonly totpCode: string;
}

function refusal(
  kind: CommandRefusal['kind'],
  code: string,
  causedBySecret: boolean,
  missing: CommandRefusal['missing'] = [],
): { kind: 'refusal'; refusal: CommandRefusal; causedBySecret: boolean } {
  return { kind: 'refusal', refusal: { kind, code, missing }, causedBySecret };
}

/**
 * Resets another user's credential (access-and-approvals 3.2; GC3-4, DEC-105; PRD-SEC-001, PRD-SEC-007,
 * PRD-SEC-008): the password, the authenticator, or both. The route authorised edit on `access.user_credential`.
 *
 * - Nobody resets their own credential, even holding the permission (`access.own-credential-reset`).
 * - It is a protected action: the person resetting gives a fresh authenticator code, every time while no freshness
 *   setting exists (3.3, GC3-6). A wrong or used code is `not-authorised` and never kept under the key (12.5).
 * - It needs no second approver: it takes effect at once (GC3-4).
 * - A password reset replaces the current password, which keeps no hash, with a temporary one checked against the
 *   password rules (GC3-5); the user replaces it at the next sign-in. An authenticator reset ends the confirmed second
 *   factor (Reset), so the user enrols again at the next sign-in, and until then reaches nothing else (3.2, 7.1
 *   step 1).
 * - Every session of the user is revoked in the same transaction (PRD-SEC-008), and each reset writes an access
 *   record (`password-reset`, `second-factor-reset`) and an audit record that names no secret (PRD-SEC-014).
 *
 * The temporary password's credential goes to the idempotency result, never the answer, so a replay is compared with
 * it while it is current (code-house-rules 12.5). Nothing is sent: the temporary password is handed over in person
 * (DEC-099).
 */
export class CredentialResets {
  constructor(private readonly dependencies: CredentialResetDependencies) {}

  run(
    request: OwnRequest,
    authorisation: { readonly roleAssignmentId: string; readonly authoriseReplay: ReplayAuthorisation },
    reset: CredentialReset,
  ): Promise<IdempotentAnswer<{ reset: CredentialResetKind; revokedSessionIds: string[] }>> {
    return this.dependencies.helper.run(request.request, {
      key: request.key,
      content: request.content,
      authoriseReplay: authorisation.authoriseReplay,
      work: async (context): Promise<CommandOutcome<{ reset: CredentialResetKind; revokedSessionIds: string[] }>> => {
        const today = await context.businessDate();
        if (today.kind === 'not-set') {
          return refusal('unavailable', 'access.business-date-not-set', false, [
            { kind: 'setting', setting: 'configuration.timezone' },
          ]);
        }
        if (reset.userId === request.userId) return refusal('refused', 'access.own-credential-reset', false);
        if ((await findUser(context, reset.userId)) === undefined) {
          return refusal('not-found', 'access.user-not-found', false);
        }
        const code = await checkFreshCode(context, this.dependencies.keys, request.userId, reset.totpCode);
        if (code.kind === 'not-enrolled') return refusal('refused', 'access.enrolment-not-started', false);
        if (code.kind === 'refused') return refusal('not-authorised', 'access.authenticator-code-refused', true);
        const password = reset.reset === 'authenticator' ? undefined : reset.temporaryPassword;
        if (reset.reset !== 'authenticator') {
          // The schema refuses a password reset without a temporary password; the command refuses it too.
          if (password === undefined) return refusal('refused', 'access.password-refused', true);
          const rules = await readSetting(context, 'access.password-rules');
          if (rules.kind === 'not-set') {
            return refusal('unavailable', 'access.password-rules-not-set', false, [
              { kind: 'setting', setting: 'access.password-rules' },
            ]);
          }
          if (!meetsPasswordRules(rules.value, password)) return refusal('refused', 'access.password-refused', true);
        }
        if (!(await code.take())) return refusal('not-authorised', 'access.authenticator-code-refused', true);

        const { changes, credentialIds } = await replaceCredentials(context, reset.userId, {
          passwordHash: password === undefined ? undefined : await hashPassword(password),
          authenticator: reset.reset !== 'password',
        });
        await this.dependencies.audit.record(context, {
          actor: { kind: 'user', id: request.userId },
          roleAssignmentId: authorisation.roleAssignmentId,
          record: { module: 'access', type: 'user_credential', id: reset.userId },
          operation: 'reset-credential',
          changes,
          source: { kind: 'screen' },
        });
        for (const kind of [
          ...(password === undefined ? [] : ['password-reset' as const]),
          ...(reset.reset === 'password' ? [] : ['second-factor-reset' as const]),
        ]) {
          await this.dependencies.audit.recordAccess(context, {
            kind,
            outcome: 'succeeded',
            userId: reset.userId,
            networkAddress: request.networkAddress,
          });
        }
        const revokedSessionIds =
          (await revokeSessions(
            context,
            this.dependencies.audit,
            {
              actor: { kind: 'user', id: request.userId },
              roleAssignmentId: authorisation.roleAssignmentId,
              networkAddress: request.networkAddress,
            },
            { userId: reset.userId },
            'reset-credential',
          )) ?? [];
        return {
          kind: 'success',
          answer: { reset: reset.reset, revokedSessionIds },
          shows: 'nothing',
          ...(credentialIds.length === 0 ? {} : { credentialIds }),
        };
      },
    });
  }
}

/**
 * Replaces a user's credentials as a reset does (access-and-approvals 3.2): the current password, which then keeps no
 * hash, by a temporary one, and the confirmed authenticator by none (Reset), so the user replaces the password or
 * enrols again at the next sign-in. Joins the caller's transaction; the reset of another user's credential and the
 * operator's recovery command (DEC-116) both use it. Returns the audit changes, which name no secret, and the new
 * credential's identifier.
 */
export async function replaceCredentials(
  context: TransactionContext,
  userId: string,
  replace: { readonly passwordHash: string | undefined; readonly authenticator: boolean },
): Promise<{ changes: AuditChange[]; credentialIds: string[] }> {
  const changes: AuditChange[] = [];
  const credentialIds: string[] = [];
  if (replace.passwordHash !== undefined) {
    await context.tx
      .update(passwordCredential)
      .set({ replacedAt: context.startedAt, passwordHash: null })
      .where(and(eq(passwordCredential.appUserId, userId), isNull(passwordCredential.replacedAt)));
    const id = uuidv7();
    const version = await userInForce(context, userId);
    await context.tx.insert(passwordCredential).values({
      id,
      appUserId: userId,
      passwordHash: replace.passwordHash,
      temporary: true,
      enteredWithVersionId: version?.versionId ?? null,
      replacedAt: null,
    });
    credentialIds.push(id);
    changes.push({ kind: 'secret', field: 'password' });
  }
  if (replace.authenticator) {
    await context.tx
      .update(secondFactor)
      .set({ state: 'Reset' })
      .where(and(eq(secondFactor.appUserId, userId), eq(secondFactor.state, 'Confirmed')));
    await context.tx
      .update(secondFactor)
      .set({ state: 'Replaced' })
      .where(and(eq(secondFactor.appUserId, userId), eq(secondFactor.state, 'Setting up')));
    changes.push({ kind: 'value', field: 'secondFactorState', before: 'Confirmed', after: 'Reset' });
  }
  return { changes, credentialIds };
}
