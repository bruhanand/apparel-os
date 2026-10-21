import { Module } from '@nestjs/common';
import { CommandRunnerModule } from '../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { CONFIGURATION, type ConfigurationInterface } from '../configuration/index.js';
import { CATALOGUE, CatalogueModule, type CatalogueInterface } from '../merchandise/catalogue/index.js';
import { Booking } from './booking.js';
import { BookingController } from './http/booking.controller.js';
import { BOOKING } from './tokens.js';

/**
 * `booking` (module-map section 5; goods-in 10.1): tier 4, uses `access`, `audit`, `configuration`, `merchandise` ·
 * catalogue and `kernel`. In its first piece, the open-to-buy budgets (goods-in 3.3; S2-F01-T02). Its approval rules
 * and decision effects reach `access` through the composition root (bookingApprovals; access-and-approvals 9.8b). A
 * budget is no value of policy 5: its own check and approval are its control (DEC-142; goods-in 10.5).
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule, CatalogueModule],
  controllers: [BookingController],
  providers: [
    {
      provide: BOOKING,
      useFactory: (
        audit: AuditInterface,
        access: AccessInterface,
        catalogue: CatalogueInterface,
        origins: ConfigurationInterface,
      ) => new Booking({ audit, access, catalogue, origins }),
      inject: [AUDIT, ACCESS, CATALOGUE, CONFIGURATION],
    },
  ],
  exports: [BOOKING],
})
export class BookingModule {}
