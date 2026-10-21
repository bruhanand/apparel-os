import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { CommandRunnerModule } from '../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { CONFIGURATION, type ConfigurationInterface } from '../configuration/index.js';
import { CATALOGUE, CatalogueModule, type CatalogueInterface } from '../merchandise/catalogue/index.js';
import { Booking } from './booking.js';
import { BookingController } from './http/booking.controller.js';
import { openToBuyBudgetsCheck } from './queries/validity.js';
import { BOOKING } from './tokens.js';

/**
 * `booking` (module-map section 5; goods-in 10.1): tier 4, uses `access`, `audit`, `configuration`, `merchandise` ·
 * catalogue and `kernel`. In its first piece, the open-to-buy budgets (goods-in 3.3; S2-F01-T02). Its approval rules
 * and decision effects reach `access` through the composition root (bookingApprovals; access-and-approvals 9.8b), and
 * its budgets reach the policy gate as policy 5's values (openToBuyBudgetsCheck; module-map 4.4, section 3 rule 6).
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
export class BookingModule implements OnModuleInit {
  constructor(@Inject(CONFIGURATION) private readonly configuration: ConfigurationInterface) {}

  /** The budgets as policy 5's values, for the policy gate (module-map 4.4; goods-in 10.5). */
  onModuleInit(): void {
    this.configuration.registerCheck(openToBuyBudgetsCheck);
  }
}
