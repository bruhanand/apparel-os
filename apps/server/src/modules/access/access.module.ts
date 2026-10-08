import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  COMMAND_RUNNER,
  CommandRunnerModule,
  IDEMPOTENCY_HELPER,
  JOB_IDENTITIES,
  OrganisationRoutingModule,
  ORGANISATION_ROUTER,
  REPLAY_SECRET_CHECK,
  RESTRICTED_VALUE_CIPHER,
  SESSION_PROBE,
  type CommandRunner,
  type IdempotencyHelper,
  type JobIdentities,
  type OrganisationRouter,
  type SessionProbe,
} from '../../kernel/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { Access } from './access.js';
import { CredentialResets } from './commands/credential-reset.js';
import { OwnCredentials } from './commands/own-credentials.js';
import { Sessions } from './commands/sessions.js';
import { SignIn } from './commands/sign-in.js';
import { OrganisationKeyCipher, PasswordReplayCheck } from './contracts/credential-contracts.js';
import { demoSignInFromEnvironment, type DemoSignInSettings } from './domain/demo-sign-in.js';
import { OrganisationKeys } from './domain/organisation-keys.js';
import { AccessChangesController } from './http/access-changes.controller.js';
import { AccessRecordsController } from './http/access-records.controller.js';
import { ApprovalsController } from './http/approvals.controller.js';
import { HISTORY, HistoryController } from './http/history.controller.js';
import { History } from './queries/history.js';
import { jobIdentities } from './commands/job-identities.js';
import { ACCESS, DEMO_SIGN_IN, MODULE_APPROVALS } from './tokens.js';
import type { ModuleApprovals } from './domain/approval-rules.js';
import { unknowableHash } from './domain/password-hash.js';
import { sessionProbe } from './commands/probe-session.js';
import { AuthenticateGuard } from './http/authenticate.guard.js';
import { CREDENTIAL_RESETS, SESSIONS, SessionsController } from './http/sessions.controller.js';
import { OWN_CREDENTIALS, SIGN_IN, SignInController, UNKNOWABLE_HASH } from './http/sign-in.controller.js';

export { ACCESS, MODULE_APPROVALS } from './tokens.js';
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
    {
      provide: DEMO_SIGN_IN,
      useFactory: (env: Readonly<Record<string, string | undefined>>) => demoSignInFromEnvironment(env),
      inject: [ACCESS_ENVIRONMENT],
    },
    { provide: REPLAY_SECRET_CHECK, useClass: PasswordReplayCheck },
    {
      provide: RESTRICTED_VALUE_CIPHER,
      useFactory: (keys: OrganisationKeys) => new OrganisationKeyCipher(keys),
      inject: [ORGANISATION_KEYS],
    },
  ],
  exports: [ORGANISATION_KEYS, DEMO_SIGN_IN, REPLAY_SECRET_CHECK, RESTRICTED_VALUE_CIPHER],
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
 * change (access-and-approvals 3), sessions, their limits, the unlock, revocation and credential resets (3.2, 3.3), Authenticate on every route that needs it and Authorise on every `action` route
 * (7.1 steps 1 and 3), service identities (2.3), and preparing roles, role assignments and withdrawals (4, 5, 9.11). Needs the global idempotency module built with AccessContractsModule (idempotencyModuleWith).
 */
@Module({
  imports: [CommandRunnerModule, OrganisationRoutingModule, AuditModule, AccessContractsModule],
  controllers: [
    SignInController,
    AccessChangesController,
    AccessRecordsController,
    ApprovalsController,
    SessionsController,
    HistoryController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthenticateGuard },
    {
      provide: SESSION_PROBE,
      useFactory: (router: OrganisationRouter, runner: CommandRunner): SessionProbe => sessionProbe(router, runner),
      inject: [ORGANISATION_ROUTER, COMMAND_RUNNER],
    },
    {
      // With the approval rules and decision effects other modules declare, which the composition root provides
      // (access-and-approvals 8, 9.8b). Required: a composition without them fails at start, never at a request.
      provide: ACCESS,
      useFactory: (audit: AuditInterface, keys: OrganisationKeys, modules: ModuleApprovals) =>
        new Access({ audit, keys, approvalRules: modules.rules, documentEffects: modules.effects }),
      inject: [AUDIT, ORGANISATION_KEYS, MODULE_APPROVALS],
    },
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
      useFactory: (
        runner: CommandRunner,
        audit: AuditInterface,
        keys: OrganisationKeys,
        hash: () => Promise<string>,
        demoSignIn: DemoSignInSettings,
      ) => new SignIn({ runner, audit, keys, unknowableHash: hash, demoSignIn }),
      inject: [COMMAND_RUNNER, AUDIT, ORGANISATION_KEYS, UNKNOWABLE_HASH, DEMO_SIGN_IN],
    },
    {
      provide: OWN_CREDENTIALS,
      useFactory: (runner: CommandRunner, helper: IdempotencyHelper, audit: AuditInterface, keys: OrganisationKeys) =>
        new OwnCredentials({ runner, helper, audit, keys }),
      inject: [COMMAND_RUNNER, IDEMPOTENCY_HELPER, AUDIT, ORGANISATION_KEYS],
    },
    {
      provide: SESSIONS,
      useFactory: (runner: CommandRunner, helper: IdempotencyHelper, audit: AuditInterface, keys: OrganisationKeys) =>
        new Sessions({ runner, helper, audit, keys }),
      inject: [COMMAND_RUNNER, IDEMPOTENCY_HELPER, AUDIT, ORGANISATION_KEYS],
    },
    {
      provide: CREDENTIAL_RESETS,
      useFactory: (helper: IdempotencyHelper, audit: AuditInterface, keys: OrganisationKeys) =>
        new CredentialResets({ helper, audit, keys }),
      inject: [IDEMPOTENCY_HELPER, AUDIT, ORGANISATION_KEYS],
    },
  ],
  exports: [ACCESS],
})
export class AccessModule {}
