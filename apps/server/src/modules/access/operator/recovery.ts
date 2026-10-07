import type { CredentialResetKind, Secret } from '@apparel-os/schemas';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import {
  CommandRunner,
  connectionToDatabase,
  createDb,
  findDatabaseName,
  newCorrelationId,
  systemClock,
  type Clock,
  type StructuredLogger,
  type TransactionContext,
} from '../../../kernel/index.js';
import { Audit, type AuditInterface } from '../../audit/index.js';
import { configurationTimezoneSource } from '../../configuration/index.js';
import { replaceCredentials } from '../commands/credential-reset.js';
import { revokeSessions } from '../commands/sessions.js';
import { appUser, setupRecord } from '../db/schema.js';
import { SETUP_IDENTITY } from '../domain/first-roles.js';
import { hashPassword } from '../domain/password-hash.js';
import { meetsPasswordRules } from '../domain/sign-in-rules.js';
import { assignmentsInForce } from '../queries/assignments.js';
import { authenticateInternalIdentity } from '../queries/service-identities.js';
import { readSetting } from '../queries/settings.js';
import { findUserByLogin } from '../queries/users.js';

/** What the recovery command needs (access-and-approvals 3.2; GC3-13, DEC-116, RR-206). */
export interface RecoveryOptions {
  /** The directory database as the runtime role (AOS_RUNTIME_DATABASE_URL), pointed at the Organisation's database. */
  readonly runtimeConnectionString: string;
  readonly organisationCode: string;
  /** The login of the first Admin or the first approver whose credential is lost. */
  readonly login: string;
  readonly reset: CredentialResetKind;
  /** The new temporary password, typed at the command's prompt, for a reset of the password or of both. */
  readonly temporaryPassword: Secret | undefined;
  /** How the operator verified the person's identity, in words; kept on the access record (numbering-and-audit 5.1). */
  readonly identityVerification: string;
  readonly logger: StructuredLogger;
  readonly clock?: Clock;
}

/** Why a recovery is refused. Nothing is written for any of them; none names a value supplied. */
export type RecoveryRefusal =
  | 'organisation-not-found'
  | 'organisation-not-ready'
  | 'not-a-first-user'
  | 'reset-permission-held'
  | 'password-rules-not-set'
  | 'password-refused'
  | 'identity-verification-missing';

export type RecoveryOutcome =
  | {
      readonly outcome: 'recovered';
      readonly reset: CredentialResetKind;
      readonly userId: string;
      readonly revokedSessionIds: readonly string[];
    }
  | { readonly outcome: 'refused'; readonly reason: RecoveryRefusal };

class Refused extends Error {
  constructor(readonly reason: RecoveryRefusal) {
    super(reason);
  }
}

const CONTEXT = 'Recovery';

/**
 * The operator's recovery command for the first two users (access-and-approvals 3.2; GC3-13; product owner, 6 Oct
 * 2026, DEC-116): an operator command like the setup step, never an API route. It restores a lost password, a lost
 * authenticator, or both, of the first Admin or the first approver the setup record names, only while no user of the
 * Organisation holds the permission to reset another user's credential (edit on `access.user_credential`) through an
 * assignment in force today; once one does, resets follow 3.2 and this is refused.
 *
 * It runs under the `setup` service identity, the platform operator's own (9.11), in one transaction: it replaces
 * the credentials as a reset does (a new temporary password checked against the password rules, kept only as an
 * Argon2id hash; the authenticator Reset), revokes every session of the user (PRD-SEC-008), and writes an audit
 * record naming the service identity and an `operator-recovery` access record with how the identity was verified
 * (PRD-SEC-007; numbering-and-audit 5.1). It grants no role or permission. The user completes the reset at the next
 * sign-in, as after any other reset. Nothing is sent (DEC-099): the operator hands the temporary password over in
 * person.
 */
export async function runRecovery(options: RecoveryOptions): Promise<RecoveryOutcome> {
  try {
    const outcome = await recover(options);
    options.logger.structured(
      'info',
      { organisationCode: options.organisationCode, reset: outcome.reset, userId: outcome.userId },
      'The recovery command restored a first user credential',
      CONTEXT,
    );
    return outcome;
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    options.logger.structured(
      'warn',
      { organisationCode: options.organisationCode, reason: error.reason },
      'The recovery command was refused; nothing was written',
      CONTEXT,
    );
    return { outcome: 'refused', reason: error.reason };
  }
}

async function recover(options: RecoveryOptions): Promise<Extract<RecoveryOutcome, { outcome: 'recovered' }>> {
  if (options.identityVerification.trim() === '') throw new Refused('identity-verification-missing');
  const resetsPassword = options.reset !== 'authenticator';
  if (resetsPassword && options.temporaryPassword === undefined) throw new Refused('password-refused');
  const connectionTo = connectionToDatabase(options.runtimeConnectionString);
  if (connectionTo === undefined) {
    throw new Error('The connection string must have the form postgres://<user>:<password>@<host>:<port>/<database>');
  }
  const directory = new Client({ connectionString: options.runtimeConnectionString });
  await directory.connect();
  let databaseName: string | undefined;
  try {
    databaseName = await findDatabaseName(drizzle({ client: directory }), options.organisationCode);
  } finally {
    await directory.end();
  }
  if (databaseName === undefined) throw new Refused('organisation-not-found');

  // Slow work before the transaction (code-house-rules 8.1).
  const passwordHash =
    resetsPassword && options.temporaryPassword !== undefined
      ? await hashPassword(options.temporaryPassword)
      : undefined;
  const handle = createDb(connectionTo(databaseName), { max: 1 });
  try {
    const runner = new CommandRunner({
      clock: options.clock ?? systemClock,
      timezones: configurationTimezoneSource,
      logger: options.logger,
    });
    const organisation = { organisationCode: options.organisationCode, databaseName, db: handle.db };
    // Authenticate the `setup` identity first, on the no-actor path of the setup step (code-house-rules 6.3).
    const identity = await runner.read(
      {
        commandName: 'access.authenticate-setup-identity',
        organisation,
        correlationId: newCorrelationId(),
        actor: { kind: 'no-actor', path: 'setup' },
      },
      (context) => authenticateInternalIdentity(context, SETUP_IDENTITY),
    );
    if (identity === undefined) throw new Refused('organisation-not-ready');
    return await runner.run(
      {
        commandName: 'access.recover-first-user',
        organisation,
        correlationId: newCorrelationId(),
        actor: { kind: 'actor', actorId: identity.serviceIdentityId },
      },
      (context) => recoverIn(context, new Audit(options.logger), identity.serviceIdentityId, options, passwordHash),
    );
  } finally {
    await handle.close();
  }
}

async function recoverIn(
  context: TransactionContext,
  audit: AuditInterface,
  setupIdentityId: string,
  options: RecoveryOptions,
  passwordHash: string | undefined,
): Promise<Extract<RecoveryOutcome, { outcome: 'recovered' }>> {
  const today = await context.businessDate();
  if (today.kind === 'not-set') throw new Refused('organisation-not-ready');
  if ((await authenticateInternalIdentity(context, SETUP_IDENTITY)) === undefined) {
    throw new Refused('organisation-not-ready');
  }
  const [record] = await context.tx.select().from(setupRecord);
  if (record === undefined) throw new Refused('organisation-not-ready');
  const user = await findUserByLogin(context, options.login);
  if (user === undefined || (user.id !== record.firstAdminUserId && user.id !== record.firstApproverUserId)) {
    throw new Refused('not-a-first-user');
  }
  if (await aUserHoldsTheResetPermission(context, today.date)) throw new Refused('reset-permission-held');
  if (options.temporaryPassword !== undefined && passwordHash !== undefined) {
    const rules = await readSetting(context, 'access.password-rules', today.date);
    if (rules.kind === 'not-set') throw new Refused('password-rules-not-set');
    if (!meetsPasswordRules(rules.value, options.temporaryPassword)) throw new Refused('password-refused');
  }

  const { changes } = await replaceCredentials(context, user.id, {
    passwordHash,
    authenticator: options.reset !== 'password',
  });
  const actor = { kind: 'service-identity' as const, id: setupIdentityId };
  await audit.record(context, {
    actor,
    record: { module: 'access', type: 'user_credential', id: user.id },
    operation: 'recover-first-user',
    changes,
    source: { kind: 'operator-command' },
  });
  await audit.recordAccess(context, {
    kind: 'operator-recovery',
    outcome: 'succeeded',
    userId: user.id,
    identityVerification: options.identityVerification,
  });
  const revokedSessionIds =
    (await revokeSessions(context, audit, { actor }, { userId: user.id }, 'recover-first-user')) ?? [];
  return { outcome: 'recovered', reset: options.reset, userId: user.id, revokedSessionIds };
}

/**
 * Whether any user holds edit on `access.user_credential` through an assignment in force today, whatever the user's
 * state: the condition that ends the recovery command (access-and-approvals 3.2; DEC-116). A service identity's
 * assignment does not count: it resets no one's credential.
 */
async function aUserHoldsTheResetPermission(context: TransactionContext, businessDate: string): Promise<boolean> {
  const holders = (await assignmentsInForce(context, businessDate))
    .filter((assignment) =>
      assignment.permissions.some(
        (permission) =>
          permission.kind === 'action' &&
          permission.recordType === 'access.user_credential' &&
          permission.action === 'edit',
      ),
    )
    .map((assignment) => assignment.actorId);
  if (holders.length === 0) return false;
  const users = await context.tx.select({ id: appUser.id }).from(appUser);
  return users.some((each) => holders.includes(each.id));
}
