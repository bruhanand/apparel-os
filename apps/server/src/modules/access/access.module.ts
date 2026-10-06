import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  COMMAND_RUNNER,
  CommandRunnerModule,
  IDEMPOTENCY_HELPER,
  OrganisationRoutingModule,
  REPLAY_SECRET_CHECK,
  RESTRICTED_VALUE_CIPHER,
  type CommandRunner,
  type IdempotencyHelper,
} from '../../kernel/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { Access } from './access.js';
import { OwnCredentials } from './commands/own-credentials.js';
import { SignIn } from './commands/sign-in.js';
import { OrganisationKeyCipher, PasswordReplayCheck } from './contracts/credential-contracts.js';
import { OrganisationKeys } from './domain/organisation-keys.js';
import { unknowableHash } from './domain/password-hash.js';
import { AuthenticateGuard } from './http/authenticate.guard.js';
import { OWN_CREDENTIALS, SIGN_IN, SignInController, UNKNOWABLE_HASH } from './http/sign-in.controller.js';

/** The token of the access module's interface (AccessInterface). Inject it with @Inject(ACCESS). */
export const ACCESS = 'access.Access';
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
 * The access module (module-map 4.3): tier 1, uses `audit` and `kernel`. Sign-in, enrolment and the own password
 * change (access-and-approvals 3), Authenticate on every route that needs it (7.1 step 1), and service identities
 * (2.3). Needs the global idempotency module built with AccessContractsModule (idempotencyModuleWith).
 */
@Module({
  imports: [CommandRunnerModule, OrganisationRoutingModule, AuditModule, AccessContractsModule],
  controllers: [SignInController],
  providers: [
    { provide: APP_GUARD, useClass: AuthenticateGuard },
    { provide: ACCESS, useClass: Access },
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
