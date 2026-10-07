import { randomBytes } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import type { MissingItem, Secret, SignInOutcome } from '@apparel-os/schemas';
import type { CommandRequest, CommandRunner, RoutedOrganisation, TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { session, signInFailure } from '../db/schema.js';
import { openFactorSecret } from '../domain/factor-secret.js';
import type { OrganisationKeys } from '../domain/organisation-keys.js';
import { verifyPassword } from '../domain/password-hash.js';
import { matchingStep } from '../domain/totp.js';
import { sessionIdentifierHash } from './authenticate-session.js';
import { readSetting } from '../queries/settings.js';
import { attemptSlowed } from '../queries/throttling.js';
import { takeStep } from './take-step.js';
import { credentialState, findUserByLogin, pendingSteps, userInForce, type CredentialState } from '../queries/users.js';

/** One sign-in attempt, as the controller gives it (access-and-approvals 3.1). */
export interface SignInAttempt {
  readonly organisation: RoutedOrganisation;
  readonly correlationId: string;
  /** The source address, through the proxies trusted; kept in the access record, counted by throttling. */
  readonly networkAddress: string;
  readonly login: string;
  readonly password: Secret;
  readonly totpCode: string | undefined;
}

/**
 * What an attempt comes to. `signed-in` carries the new session's random identifier, for the cookie only: the
 * database keeps its SHA-256 hash, and it is never logged (access-and-approvals 3.3; PRD-SEC-014).
 */
export type SignInResult =
  | { readonly kind: 'signed-in'; readonly outcome: SignInOutcome; readonly sessionIdentifier: string }
  | { readonly kind: 'refused' }
  | { readonly kind: 'slowed' }
  | { readonly kind: 'unavailable'; readonly missing: readonly MissingItem[] };

export interface SignInDependencies {
  readonly runner: CommandRunner;
  readonly audit: AuditInterface;
  readonly keys: OrganisationKeys;
  /** An Argon2id hash of a value no one knows, verified when no credential can be (equal timing, DEC-116). */
  readonly unknowableHash: () => Promise<string>;
}

/** What the read step found: enough to decide without a second read. */
type Looked =
  | { readonly kind: 'unavailable'; readonly missing: readonly MissingItem[] }
  | {
      readonly kind: 'looked';
      readonly slowed: boolean;
      readonly loginDigest: string;
      /** The user the login matched, if any; kept in the access record only then (numbering-and-audit 5.2). */
      readonly userId: string | undefined;
      /** Set only when the user may sign in: Active on the date, with a current password. */
      readonly signable: CredentialState | undefined;
    };

const COMMAND = 'access.sign-in';
/** 256 bits from a cryptographically secure generator (access-and-approvals 3.3). */
const SESSION_IDENTIFIER_BYTES = 32;

/**
 * Sign-in (access-and-approvals 3.1, 3.2; PRD-SEC-001, PRD-SEC-007, PRD-SEC-014, POL-02.17; DEC-116). It runs on the
 * path with no actor (code-house-rules 6.3), in two transactions with the Argon2 check between them, so no
 * connection is held while a hash is computed:
 *
 * 1. Read: the date under the Organisation's timezone; the throttling setting in force; the failed sign-ins of the
 *    typed login, by its keyed digest, and of the source address in the window; the user, its state in force, its
 *    current password and confirmed second factor. A setting not set makes sign-in unavailable, naming it
 *    (code-house-rules 12.14).
 * 2. Check, unless slowed: the password against its Argon2id hash, or against a hash no one knows when the login
 *    matched no user who may sign in, so every attempt costs the same; and the authenticator code, where a second
 *    factor is confirmed, for a step not used before.
 * 3. Write: on success the session, the code's step and the access record; otherwise the failure throttling counts
 *    and the access record. A slowed attempt writes only its access record. Every attempt in a known Organisation is
 *    recorded (PRD-SEC-007), never with the password, the code or a login that matched no user (PRD-SEC-014).
 *
 * Every wrong part gets the same refusal, and a login that exists and one that does not get the same refusal and the
 * same slowing (access-and-approvals 3.1; DEC-116).
 */
export class SignIn {
  constructor(private readonly dependencies: SignInDependencies) {}

  async run(attempt: SignInAttempt): Promise<SignInResult> {
    const request: CommandRequest = {
      commandName: COMMAND,
      organisation: attempt.organisation,
      correlationId: attempt.correlationId,
      actor: { kind: 'no-actor', path: 'sign-in' },
    };
    const looked = await this.dependencies.runner.read(request, (context) => this.look(context, attempt));
    if (looked.kind === 'unavailable') return looked;
    if (looked.slowed) {
      await this.dependencies.runner.run(request, (context) => this.recordAccess(context, attempt, looked, false));
      return { kind: 'slowed' };
    }

    const signable = looked.signable;
    const passwordHash = signable?.password?.hash ?? (await this.dependencies.unknowableHash());
    const passwordVerifies = await verifyPassword(passwordHash, attempt.password);
    const factor = signable?.confirmedFactor;

    return this.dependencies.runner.run(request, async (context): Promise<SignInResult> => {
      let step: number | undefined;
      if (factor !== undefined) {
        const secret = openFactorSecret(this.dependencies.keys, attempt.organisation.organisationCode, factor);
        step = matchingStep(secret, attempt.totpCode ?? '', context.startedAt, factor.lastUsedStep);
      }
      let passed = signable !== undefined && passwordVerifies && (factor === undefined || step !== undefined);
      if (passed && factor !== undefined && step !== undefined) {
        // The step is taken once: a code is never accepted twice, even by two attempts at once (PRD-SEC-001).
        passed = await takeStep(context, factor.id, step);
      }
      if (!passed || signable === undefined || looked.userId === undefined) {
        await context.tx.insert(signInFailure).values({
          id: uuidv7(),
          loginDigest: looked.loginDigest,
          networkAddress: attempt.networkAddress,
          failedAt: context.startedAt,
        });
        await this.recordAccess(context, attempt, looked, false);
        return { kind: 'refused' };
      }
      const identifier = randomBytes(SESSION_IDENTIFIER_BYTES).toString('base64url');
      await context.tx.insert(session).values({
        id: uuidv7(),
        appUserId: looked.userId,
        identifierHash: sessionIdentifierHash(identifier),
        kind: 'office',
        deviceId: null,
        state: 'In force',
        startedAt: context.startedAt,
        lastActivityAt: context.startedAt,
      });
      await this.recordAccess(context, attempt, looked, true);
      const [next] = pendingSteps(signable);
      const outcome: SignInOutcome =
        next === 'enrolment'
          ? { outcome: 'enrolment-required' }
          : next === 'password-change'
            ? { outcome: 'password-change-required' }
            : { outcome: 'signed-in' };
      return { kind: 'signed-in', outcome, sessionIdentifier: identifier };
    });
  }

  private async look(context: TransactionContext, attempt: SignInAttempt): Promise<Looked> {
    const today = await context.businessDate();
    if (today.kind === 'not-set') {
      return { kind: 'unavailable', missing: [{ kind: 'setting', setting: 'configuration.timezone' }] };
    }
    const throttling = await readSetting(context, 'access.sign-in-throttling', today.date);
    if (throttling.kind === 'not-set') {
      return { kind: 'unavailable', missing: [{ kind: 'setting', setting: 'access.sign-in-throttling' }] };
    }
    // A session needs its limits: with none set, no session can be kept, so none starts (3.3; code-house-rules 12.14).
    const limits = await readSetting(context, 'access.office-session-limits', today.date);
    if (limits.kind === 'not-set') {
      return { kind: 'unavailable', missing: [{ kind: 'setting', setting: 'access.office-session-limits' }] };
    }
    const loginDigest = this.dependencies.keys.digest(
      attempt.organisation.organisationCode,
      'sign-in-throttling',
      attempt.login.toLowerCase(),
    );
    const slowed = await attemptSlowed(context, throttling.value, {
      loginDigest,
      networkAddress: attempt.networkAddress,
    });

    const user = await findUserByLogin(context, attempt.login);
    if (user === undefined) return { kind: 'looked', slowed, loginDigest, userId: undefined, signable: undefined };
    const inForce = await userInForce(context, user.id);
    const credentials = await credentialState(context, user.id);
    const signable = inForce?.state === 'Active' && credentials.password !== undefined ? credentials : undefined;
    return { kind: 'looked', slowed, loginDigest, userId: user.id, signable };
  }

  private recordAccess(
    context: TransactionContext,
    attempt: SignInAttempt,
    looked: Extract<Looked, { kind: 'looked' }>,
    succeeded: boolean,
  ): Promise<void> {
    return this.dependencies.audit.recordAccess(context, {
      kind: 'sign-in',
      outcome: succeeded ? 'succeeded' : 'refused',
      // Only a login that matched a user names one; a typed login is never kept (numbering-and-audit 5.2).
      ...(looked.userId === undefined ? {} : { userId: looked.userId }),
      networkAddress: attempt.networkAddress,
    });
  }
}
