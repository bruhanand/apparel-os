import { Module } from '@nestjs/common';
import { CommandRunnerModule } from '../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { CONFIGURATION, type ConfigurationInterface } from '../configuration/index.js';
import { NUMBERING, NumberingModule, type NumberingInterface } from '../numbering/index.js';
import { ORGANISATION, OrganisationModule, type OrganisationInterface } from '../organisation/index.js';
import { DevicesController } from './http/devices.controller.js';
import { NumberingSettingsController } from './http/numbering.controller.js';
import { Pos } from './pos.js';
import { POS } from './tokens.js';

/**
 * The stage 1 part of `pos` (module-map 4.17; offline-counter 3, 4, 12; S1-F12-T01): tier 4, uses `access`, `audit`,
 * `configuration`, `numbering`, `organisation` and `kernel`, all downward (module-map section 3). Billing devices, their
 * Store and units, their enrolment and their bill series; and the changes that define the financial years and set the
 * bill-number format, whose decision effects reach `access` from the composition root (posApprovals; S1-F12-T03). Its
 * numbered kind, the bill, reaches `numbering` through the composition root (BILL_KIND; module-map section 3, rule 6).
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule, NumberingModule, OrganisationModule],
  controllers: [DevicesController, NumberingSettingsController],
  providers: [
    {
      provide: POS,
      useFactory: (
        audit: AuditInterface,
        access: AccessInterface,
        organisation: OrganisationInterface,
        numbering: NumberingInterface,
        origins: ConfigurationInterface,
      ) => new Pos({ audit, access, organisation, numbering, origins }),
      inject: [AUDIT, ACCESS, ORGANISATION, NUMBERING, CONFIGURATION],
    },
  ],
  exports: [POS],
})
export class PosModule {}
