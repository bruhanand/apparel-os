import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { CommandRunnerModule } from '../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { CONFIGURATION, type ConfigurationInterface } from '../configuration/index.js';
import { FILES_IMPORTS, FilesImportsModule, type FilesImportsInterface } from '../files-imports/index.js';
import { CATALOGUE, CatalogueModule, type CatalogueInterface } from '../merchandise/catalogue/index.js';
import { Booking } from './booking.js';
import { BOOKING_OPERATIONS } from './domain/gate.js';
import { BookingController } from './http/booking.controller.js';
import { BOOKING } from './tokens.js';

/**
 * `booking` (module-map section 5; goods-in 10.1): tier 4, uses `access`, `audit`, `configuration`, `files-imports`,
 * `merchandise` · catalogue and parties, `organisation`, `numbering` and `kernel`. The open-to-buy budgets (goods-in
 * 3.3; S2-F01-T02) and the bookings (3.1 to 3.4; S2-F01-T03). Its approval rules and decision effects reach `access`
 * through the composition root (bookingApprovals; access-and-approvals 9.8b), with the booking number kind and
 * `numbering` built with every declared kind. A budget is no value of policy 5: its own check and approval are its
 * control (DEC-142); a booking's approval reaches the policy gate under policies 5 and 1 at start (goods-in 10.5). It
 * reads the masters of `organisation` and `merchandise` · parties through their read functions.
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule, CatalogueModule, FilesImportsModule],
  controllers: [BookingController],
  providers: [
    {
      provide: BOOKING,
      useFactory: (
        audit: AuditInterface,
        access: AccessInterface,
        catalogue: CatalogueInterface,
        origins: ConfigurationInterface,
        files: FilesImportsInterface,
      ) => new Booking({ audit, access, catalogue, origins, files }),
      inject: [AUDIT, ACCESS, CATALOGUE, CONFIGURATION, FILES_IMPORTS],
    },
  ],
  exports: [BOOKING],
})
export class BookingModule implements OnModuleInit {
  constructor(@Inject(CONFIGURATION) private readonly configuration: ConfigurationInterface) {}

  /** A booking's approval under policies 5 and 1, for the policy gate (module-map 4.4; goods-in 10.5). */
  onModuleInit(): void {
    for (const operation of BOOKING_OPERATIONS) this.configuration.registerOperation(operation);
  }
}
