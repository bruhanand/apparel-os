import { randomBytes } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import { Secret } from '@apparel-os/schemas';
import { and, eq, isNull } from 'drizzle-orm';
import {
  CommandDefect,
  type CommandOutcome,
  type CommandRequest,
  type CommandRunner,
  type IdempotencyHelper,
  type IdempotentAnswer,
  type JsonValue,
  type RequestContent,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { passwordCredential, secondFactor } from '../db/schema.js';
import { openFactorSecret, sealFactorSecret } from '../domain/factor-secret.js';
import type { OrganisationKeys } from '../domain/organisation-keys.js';
import { hashPassword } from '../domain/password-hash.js';
import { meetsPasswordRules } from '../domain/sign-in-rules.js';
import { matchingStep, otpauthUri, TOTP_SECRET_BYTES, base32 } from '../domain/totp.js';
import { readSetting } from '../queries/settings.js';
import { credentialState, factorBeingSetUp, findUser } from '../queries/users.js';
import { takeStep } from './take-step.js';

/** Who asks, as Authenticate found them (access-and-approvals 7.1 step 1). */
export interface OwnRequest {
  readonly request: CommandRequest;
  readonly userId: string;
  readonly networkAddress: string;
  readonly key: string;
  readonly content: RequestContent;
}

/** The label authenticator apps show beside the Organisation and the login: the product's name. */
const AUTHENTICATOR_ISSUER = 'Apparel OS';

export interface OwnCredentialsDependencies {
  readonly runner: CommandRunner;
  readonly helper: IdempotencyHelper;
  readonly audit: AuditInterface;
  readonly keys: OrganisationKeys;
}

/** The secret enrolment shows once, kept beside the command's answer, never in it (code-house-rules 12.6). */
export interface ShownOnce {
  readonly secret: Secret;
  readonly otpauthUri: Secret;
}

/**
 * A user's own credentials (access-and-approvals 3.2, 3.3; PRD-SEC-001): enrolling an authenticator app and changing
 * one's own password after a fresh code. They are part of authentication, not access to a record, so they need no
 * role assignment and act only on the signed-in user's own credentials (3.2; `own` routes). Each runs under its
 * idempotency key (code-house-rules 12.4 to 12.6); an `own` route's replay needs Authenticate only, which has passed.
 *
 * A wrong or used code, and a password the rules refuse, are caused by a secret, so they are never kept under the key
 * (12.5): the person corrects and sends again. Each attempt with a code writes an access record, a refused one in a
 * transaction of its own since the command's rolls back (numbering-and-audit 5.1; PRD-SEC-007).
 */
export class OwnCredentials {
  constructor(private readonly dependencies: OwnCredentialsDependencies) {}

  /**
   * Starts enrolment: a new secret, encrypted under the Organisation's key, replacing any not yet confirmed. The
   * secret and its otpauth address are shown once and never kept in the idempotency result; a replay is refused with
   * `kernel.answer-not-repeatable` (code-house-rules 12.6; DEC-113).
   */
  async startEnrolment(
    own: OwnRequest,
  ): Promise<{ readonly answer: IdempotentAnswer<{ enrolment: 'started' }>; readonly shown: ShownOnce | undefined }> {
    let shown: ShownOnce | undefined;
    const answer = await this.dependencies.helper.run(own.request, {
      key: own.key,
      content: own.content,
      authoriseReplay: allowed,
      work: async (context): Promise<CommandOutcome<{ enrolment: 'started' }>> => {
        const credentials = await credentialState(context, own.userId);
        if (credentials.confirmedFactor !== undefined) {
          return refusal('refused', 'access.already-enrolled', false);
        }
        const user = await findUser(context, own.userId);
        if (user === undefined) throw new CommandDefect('An authenticated user has no user row');
        // Starting again replaces the secret not yet confirmed, so no unconfirmed secret stays usable (12.6).
        await context.tx
          .update(secondFactor)
          .set({ state: 'Replaced' })
          .where(and(eq(secondFactor.appUserId, own.userId), eq(secondFactor.state, 'Setting up')));
        const id = uuidv7();
        const secret = randomBytes(TOTP_SECRET_BYTES);
        const organisationCode = own.request.organisation.organisationCode;
        const sealed = sealFactorSecret(this.dependencies.keys, organisationCode, id, secret);
        await context.tx.insert(secondFactor).values({
          id,
          appUserId: own.userId,
          secretScheme: sealed.scheme,
          secretCiphertext: sealed.ciphertext,
          state: 'Setting up',
          lastUsedStep: null,
          confirmedAt: null,
        });
        shown = {
          secret: new Secret(base32(secret)),
          otpauthUri: new Secret(
            otpauthUri({ issuer: AUTHENTICATOR_ISSUER, organisationCode, login: user.login, secret }),
          ),
        };
        return { kind: 'success', answer: { enrolment: 'started' }, shows: 'secret' };
      },
    });
    return { answer, shown: answer.kind === 'success' && !answer.replayed ? shown : undefined };
  }

  /** Confirms enrolment with a code from the new app; the access record says when and from where (3.2). */
  async confirmEnrolment(
    own: OwnRequest,
    totpCode: string,
  ): Promise<IdempotentAnswer<{ secondFactorId: string; state: 'Confirmed' }>> {
    const answer = await this.dependencies.helper.run(own.request, {
      key: own.key,
      content: own.content,
      authoriseReplay: allowed,
      work: async (context): Promise<CommandOutcome<{ secondFactorId: string; state: 'Confirmed' }>> => {
        const factor = await factorBeingSetUp(context, own.userId);
        if (factor === undefined) return refusal('refused', 'access.enrolment-not-started', false);
        const secret = openFactorSecret(this.dependencies.keys, own.request.organisation.organisationCode, factor);
        const step = matchingStep(secret, totpCode, context.startedAt, undefined);
        if (step === undefined) return codeRefused();
        const confirmed = await context.tx
          .update(secondFactor)
          .set({ state: 'Confirmed', confirmedAt: context.startedAt, lastUsedStep: step })
          .where(and(eq(secondFactor.id, factor.id), eq(secondFactor.state, 'Setting up')))
          .returning({ id: secondFactor.id });
        if (confirmed.length !== 1) return refusal('refused', 'access.enrolment-not-started', false);
        await this.dependencies.audit.recordAccess(context, {
          kind: 'second-factor-enrolled',
          outcome: 'succeeded',
          userId: own.userId,
          networkAddress: own.networkAddress,
        });
        return { kind: 'success', answer: { secondFactorId: factor.id, state: 'Confirmed' }, shows: 'nothing' };
      },
    });
    await this.recordRefusedCode(own, answer, 'second-factor-enrolled');
    return answer;
  }

  /**
   * Changes the user's own password after a fresh authenticator code (access-and-approvals 3.2, 3.3). With no
   * freshness setting, the code is asked for on each change (GC3-6). The new password is checked against the password
   * rules in force, and with none in force no password can be set (GC3-5; code-house-rules 12.14). The current
   * credential is replaced and keeps no hash; the new one's identifier goes to the idempotency result, never the
   * answer, so a replay is compared with it while it is current (12.5).
   */
  async changePassword(
    own: OwnRequest,
    body: { readonly newPassword: Secret; readonly totpCode: string },
  ): Promise<IdempotentAnswer<{ outcome: 'password-changed' }>> {
    const answer = await this.dependencies.helper.run(own.request, {
      key: own.key,
      content: own.content,
      authoriseReplay: allowed,
      work: async (context): Promise<CommandOutcome<{ outcome: 'password-changed' }>> => {
        const today = await context.businessDate();
        const rules = today.kind === 'set' ? await readSetting(context, 'access.password-rules') : undefined;
        if (rules?.kind !== 'set') {
          return {
            kind: 'refusal',
            refusal: {
              kind: 'unavailable',
              code: 'access.password-rules-not-set',
              missing: [{ kind: 'setting', setting: 'access.password-rules' }],
            },
            causedBySecret: false,
          };
        }
        const credentials = await credentialState(context, own.userId);
        const factor = credentials.confirmedFactor;
        if (factor === undefined) return refusal('refused', 'access.enrolment-not-started', false);
        const secret = openFactorSecret(this.dependencies.keys, own.request.organisation.organisationCode, factor);
        const step = matchingStep(secret, body.totpCode, context.startedAt, factor.lastUsedStep);
        if (step === undefined) return codeRefused();
        if (!meetsPasswordRules(rules.value, body.newPassword)) {
          return refusal('refused', 'access.password-refused', true);
        }
        if (!(await takeStep(context, factor.id, step))) return codeRefused();
        const hash = await hashPassword(body.newPassword);
        await context.tx
          .update(passwordCredential)
          .set({ replacedAt: context.startedAt, passwordHash: null })
          .where(and(eq(passwordCredential.appUserId, own.userId), isNull(passwordCredential.replacedAt)));
        const id = uuidv7();
        await context.tx.insert(passwordCredential).values({
          id,
          appUserId: own.userId,
          passwordHash: hash,
          temporary: false,
          enteredWithVersionId: null,
          replacedAt: null,
        });
        await this.dependencies.audit.recordAccess(context, {
          kind: 'password-changed',
          outcome: 'succeeded',
          userId: own.userId,
          networkAddress: own.networkAddress,
        });
        return { kind: 'success', answer: { outcome: 'password-changed' }, shows: 'nothing', credentialIds: [id] };
      },
    });
    await this.recordRefusedCode(own, answer, 'password-changed');
    return answer;
  }

  /**
   * A refused code rolled the command back, access record and all; the attempt is still recorded, in a transaction of
   * its own (numbering-and-audit 5.1; PRD-SEC-007), never with the code.
   */
  private async recordRefusedCode(
    own: OwnRequest,
    answer: IdempotentAnswer<JsonValue>,
    kind: 'second-factor-enrolled' | 'password-changed',
  ): Promise<void> {
    if (answer.kind !== 'refusal' || answer.kept || answer.refusal.code !== 'access.authenticator-code-refused') return;
    await this.dependencies.runner.run(own.request, (context: TransactionContext) =>
      this.dependencies.audit.recordAccess(context, {
        kind,
        outcome: 'refused',
        userId: own.userId,
        networkAddress: own.networkAddress,
      }),
    );
  }
}

/** An `own` route's replay needs Authenticate only, which passed for this request (code-house-rules 12.4, CH-14). */
const allowed = (): Promise<{ readonly kind: 'allowed' }> => Promise.resolve({ kind: 'allowed' });

function refusal(
  kind: 'refused' | 'not-authorised',
  code: string,
  causedBySecret: boolean,
): { kind: 'refusal'; refusal: { kind: typeof kind; code: string; missing: [] }; causedBySecret: boolean } {
  return { kind: 'refusal', refusal: { kind, code, missing: [] }, causedBySecret };
}

/** A wrong or used code: `not-authorised`, never kept under the key (code-house-rules 12.3, 12.5). */
function codeRefused(): ReturnType<typeof refusal> {
  return refusal('not-authorised', 'access.authenticator-code-refused', true);
}
