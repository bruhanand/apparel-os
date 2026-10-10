import { Global, Module } from '@nestjs/common';
import { CONFIGURED_TIMEZONE_SOURCE, deploymentEnvironmentFromEnvironment } from '../../kernel/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { Configuration } from './configuration.js';
import { POLICY_EVIDENCE, type PolicyEvidence } from './contracts/policy-evidence.js';
import { configurationTimezoneSource } from './queries/timezone.js';
import { CONFIGURATION, CONFIGURATION_ENVIRONMENT } from './tokens.js';

/**
 * configuration's implementation of the kernel's timezone contract, provided globally so the one command runner reads
 * the Organisation's timezone from configuration (module-map section 3, rule 6; code-house-rules 9; RR-231, RR-250).
 * The app and the worker import it; kernel never imports configuration.
 */
@Global()
@Module({
  providers: [{ provide: CONFIGURED_TIMEZONE_SOURCE, useValue: configurationTimezoneSource }],
  exports: [CONFIGURED_TIMEZONE_SOURCE],
})
export class ConfigurationTimezoneModule {}

/**
 * The policy gate (module-map 4.4; S1-F04-T01): tier 1, uses `audit` and `kernel`. Global, so every module that asks
 * Available or registers its operations and validity checks reaches it. The environment's name is read at start
 * (code-house-rules 12.14): unset or unknown, the application does not start (S1-F04 review H1). The evidence contract
 * `files-imports` implements comes from the composition root.
 */
@Global()
@Module({
  imports: [AuditModule],
  providers: [
    { provide: CONFIGURATION_ENVIRONMENT, useValue: process.env },
    {
      provide: CONFIGURATION,
      useFactory: (
        audit: AuditInterface,
        env: Readonly<Record<string, string | undefined>>,
        evidence: PolicyEvidence | undefined,
      ) => new Configuration({ audit, environment: deploymentEnvironmentFromEnvironment(env), evidence }),
      inject: [AUDIT, CONFIGURATION_ENVIRONMENT, { token: POLICY_EVIDENCE, optional: true }],
    },
  ],
  exports: [CONFIGURATION],
})
export class ConfigurationModule {}
