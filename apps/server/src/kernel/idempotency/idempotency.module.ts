import { Module } from '@nestjs/common';
import type { CommandRunner } from '../command-runner/command-runner.js';
import { COMMAND_RUNNER, CommandRunnerModule } from '../command-runner/command-runner.module.js';
import { LOGGER, LoggingModule } from '../logging/logging.module.js';
import type { PinoLoggerService } from '../logging/pino-logger.service.js';
import {
  restrictedValueCipherNotConfigured,
  secretCheckNotImplemented,
  type ReplaySecretCheck,
  type RestrictedValueCipher,
} from './contracts.js';
import { IdempotencyHelper } from './idempotency-helper.js';

/** The token of the IdempotencyHelper. Inject it with @Inject(IDEMPOTENCY_HELPER). */
export const IDEMPOTENCY_HELPER = 'kernel.IdempotencyHelper';
/**
 * The token of the replay secret check (code-house-rules 12.5). Until `access` implements it (`S1-F01-T08`), it is
 * secretCheckNotImplemented: no new secret can be compared, so such a replay is refused, the fail-safe answer.
 */
export const REPLAY_SECRET_CHECK = 'kernel.ReplaySecretCheck';
/**
 * The token of the cipher for restricted values kept in a refused request (code-house-rules 12.4). Until the
 * per-Organisation key exists (`S1-F01-T08`), it is restrictedValueCipherNotConfigured, which refuses rather than
 * keep a restricted value in plain.
 */
export const RESTRICTED_VALUE_CIPHER = 'kernel.RestrictedValueCipher';

/** The idempotency helper for the application (code-house-rules 12.4; module-map 4.1). */
@Module({
  imports: [CommandRunnerModule, LoggingModule],
  providers: [
    { provide: REPLAY_SECRET_CHECK, useValue: secretCheckNotImplemented },
    { provide: RESTRICTED_VALUE_CIPHER, useValue: restrictedValueCipherNotConfigured },
    {
      provide: IDEMPOTENCY_HELPER,
      useFactory: (
        runner: CommandRunner,
        logger: PinoLoggerService,
        secretCheck: ReplaySecretCheck,
        cipher: RestrictedValueCipher,
      ) => new IdempotencyHelper({ runner, logger, secretCheck, cipher }),
      inject: [COMMAND_RUNNER, LOGGER, REPLAY_SECRET_CHECK, RESTRICTED_VALUE_CIPHER],
    },
  ],
  exports: [IDEMPOTENCY_HELPER],
})
export class IdempotencyModule {}
