import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  COMMAND_RUNNER,
  CommandRunnerModule,
  IDEMPOTENCY_HELPER,
  JOB_IDENTITIES,
  OrganisationRoutingModule,
  REPLAY_SECRET_CHECK,
  RESTRICTED_VALUE_CIPHER,
  type CommandRunner,
  type IdempotencyHelper,
  type JobIdentities,
} from '../../kernel/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { Access } from './access.js';
import { OwnCredentials } from './commands/own-credentials.js';
import { SignIn } from './commands/sign-in.js';
import { OrganisationKeyCipher, PasswordReplayCheck } from './contracts/credential-contracts.js';
import { OrganisationKeys } from './domain/organisation-keys.js';
import { AccessChangesController } from './http/access-changes.controller.js';
import { HISTORY, HistoryController } from './http/history.controller.js';
import { History } from './queries/history.js';
import { jobIdentities } from './queries/job-identities.js';
import { ACCESS } from './tokens.js';
import { unknowableHash } from './domain/password-hash.js';
import { AuthenticateGuard } from './http/authenticate.guard.js';
import { OWN_CREDENTIALS, SIGN_IN, SignInController, UNKNOWABLE_HASH } from './http/sign-in.controller.js';

export { ACCESS } from './tokens.js';
/** The token of the Organisation keys (access-and-approvals 6). */
export const ORGANISATION_KEYS = 'access.OrganisationKeys';
/** The variables the Organisation keys are read from: the process's, unless a test gives others. */
export const ACCESS_ENVIRONMENT = 'access.Environment';

/**
 * The keys per Organisation and the two contracts the idempotency helper defines and `access` implements: the replay
 * secret check and the restricted-value cipher (code-house-rules 12.4, 12.5; module-map section 3, rule 6; RR-248).
 * Apart from AccessModule so the helper can be built with them while AccessModule uses the helper. The keys are read
 * at start; the application refuses to start without them (code-house-rules 12.14).
 */
@Module({
  providers: [
    { provide: ACCESS_ENVIRONMENT, useValue: process.env },
    {
      provide: ORGANISATION_KEYS,
      useFactory: (env: Readonly<Record<string, string | undefined>>) => OrganisationKeys.fromEnvironment(env),
      inject: [ACCESS_ENVIRONMENT],
    },
    { provide: REPLAY_SECRET_CHECK, useClass: PasswordReplayCheck },
    {
      provide: RESTRICTED_VALUE_CIPHER,
      useFactory: (keys: OrganisationKeys) => new OrganisationKeyCipher(keys),
      inject: [ORGANISATION_KEYS],
    },
  ],
  exports: [ORGANISATION_KEYS, REPLAY_SECRET_CHECK, RESTRICTED_VALUE_CIPHER],
})
export class AccessContractsModule {}

/**
 * The JobIdentities contract the worker needs from `access` (access-and-approvals 2.3, 7.1 steps 1 and 3;
 * PRD-SEC-018; module-map section 3, rule 6): Authenticate for the internal service identity a job runs as, and
 * Authorise for the action its step declares (RR-273). Apart from the other contracts, so the worker starts without
 * the Organisation keys, which no job step uses.
 */
@Module({
  providers: [
    {
      provide: JOB_IDENTITIES,
      useFactory: (): JobIdentities => jobIdentities(),
    },
  ],
  exports: [JOB_IDENTITIES],
})
export class AccessJobIdentitiesModule {}

/**
 * The access module (module-map 4.3): tier 1, uses `audit` and `kernel`. Sign-in, enrolment and the own password
 * change (access-and-approvals 3), Authenticate on every route that needs it and Authorise on every `action` route
 * (7.1 steps 1 and 3), service identities (2.3), and preparing roles, role assignments and withdrawals (4, 5, 9.11). Needs the global idempotency module built with AccessContractsModule (idempotencyModuleWith).
 */
@Module({
  imports: [CommandRunnerModule, OrganisationRoutingModule, AuditModule, AccessContractsModule],
  controllers: [SignInController, AccessChangesController, HistoryController],
  providers: [
    { provide: APP_GUARD, useClass: AuthenticateGuard },
    { provide: ACCESS, useFactory: (audit: AuditInterface) => new Access({ audit }), inject: [AUDIT] },
    {
      // The history reads (numbering-and-audit 4.5): rows through `audit`, Authorise and masking through `access`.
      provide: HISTORY,
      useFactory: (audit: AuditInterface, access: Access) => new History(audit, access),
      inject: [AUDIT, ACCESS],
    },
    {
      // One hash no one knows, made once per process and verified wherever no credential can be (DEC-116).
      provide: UNKNOWABLE_HASH,
      useFactory: () => {
        let made: Promise<string> | undefined;
        return () => (made ??= unknowableHash());
      },
    },
    {
      provide: SIGN_IN,
      useFactory: (runner: CommandRunner, audit: AuditInterface, keys: OrganisationKeys, hash: () => Promise<string>) =>
        new SignIn({ runner, audit, keys, unknowableHash: hash }),
      inject: [COMMAND_RUNNER, AUDIT, ORGANISATION_KEYS, UNKNOWABLE_HASH],
    },
    {
      provide: OWN_CREDENTIALS,
      useFactory: (runner: CommandRunner, helper: IdempotencyHelper, audit: AuditInterface, keys: OrganisationKeys) =>
        new OwnCredentials({ runner, helper, audit, keys }),
      inject: [COMMAND_RUNNER, IDEMPOTENCY_HELPER, AUDIT, ORGANISATION_KEYS],
    },
  ],
  exports: [ACCESS],
})
export class AccessModule {}
