import { Module } from '@nestjs/common';
import { CommandRunnerModule } from '../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { CONFIGURATION, type ConfigurationInterface } from '../configuration/index.js';
import { ReadinessController } from './http/readiness.controller.js';
import { SiteLifecycle } from './site-lifecycle.js';
import { SITE_LIFECYCLE } from './tokens.js';

/**
 * The stage 1 part of `site-lifecycle` (module-map 4.16; S1-F04-T02): tier 5, uses the lower tiers. Readiness checks
 * and records, the zero-stock declaration and the activation request; its approval rule and decision effect reach
 * `access` through the composition root (siteLifecycleApprovals; access-and-approvals 9.8b), and the effect writes the
 * activity grant into `configuration`.
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule],
  controllers: [ReadinessController],
  providers: [
    {
      provide: SITE_LIFECYCLE,
      useFactory: (audit: AuditInterface, access: AccessInterface, configuration: ConfigurationInterface) =>
        new SiteLifecycle({ audit, access, configuration }),
      inject: [AUDIT, ACCESS, CONFIGURATION],
    },
  ],
  exports: [SITE_LIFECYCLE],
})
export class SiteLifecycleModule {}
