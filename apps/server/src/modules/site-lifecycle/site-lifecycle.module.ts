import { Module } from '@nestjs/common';
import { CommandRunnerModule } from '../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { CONFIGURATION, type ConfigurationInterface } from '../configuration/index.js';
import { LOCATION_IN_USE, type LocationInUse } from '../organisation/index.js';
import { ReadinessController } from './http/readiness.controller.js';
import { SiteLifecycle } from './site-lifecycle.js';
import { SITE_LIFECYCLE } from './tokens.js';

/**
 * The stage 1 part of `site-lifecycle` (module-map 4.16; S1-F04-T02): tier 5, uses the lower tiers. Readiness checks
 * and records of a Site and of a unit, the zero-stock declaration and the approval requests; its approval rules and
 * decision effects reach `access` through the composition root (siteLifecycleApprovals; access-and-approvals 9.8b),
 * and the unit's effect writes the activity grant into `configuration`.
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule],
  controllers: [ReadinessController],
  providers: [
    {
      provide: SITE_LIFECYCLE,
      useFactory: (
        audit: AuditInterface,
        access: AccessInterface,
        configuration: ConfigurationInterface,
        locationInUse: LocationInUse,
      ) => new SiteLifecycle({ audit, access, configuration, locationInUse }),
      // The location-in-use contract `stock` implements, from the composition root (structure-and-masters 3.5).
      inject: [AUDIT, ACCESS, CONFIGURATION, LOCATION_IN_USE],
    },
  ],
  exports: [SITE_LIFECYCLE],
})
export class SiteLifecycleModule {}
