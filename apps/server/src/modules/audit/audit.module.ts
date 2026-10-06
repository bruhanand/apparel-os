import { Module } from '@nestjs/common';
import { LOGGER, LoggingModule, type PinoLoggerService } from '../../kernel/index.js';
import { Audit } from './audit.js';

/** The token of the audit module's interface (AuditInterface). Inject it with @Inject(AUDIT). */
export const AUDIT = 'audit.Audit';

/** The audit module (module-map 4.5): tier 1, uses only `kernel`. */
@Module({
  imports: [LoggingModule],
  providers: [{ provide: AUDIT, useFactory: (logger: PinoLoggerService) => new Audit(logger), inject: [LOGGER] }],
  exports: [AUDIT],
})
export class AuditModule {}
