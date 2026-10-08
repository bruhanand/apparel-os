import { Module } from '@nestjs/common';
import { CommandRunnerModule } from '../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { FILES_IMPORTS, FilesImportsModule, type FilesImportsInterface } from '../files-imports/index.js';
import { LOCATION_IN_USE, type LocationInUse } from './contracts/location-in-use.js';
import { StructureController } from './http/structure.controller.js';
import { Organisation } from './organisation.js';
import { ORGANISATION } from './tokens.js';

/**
 * The organisation module (module-map 4.11; structure-and-masters 3): tier 2, uses `access`, `audit`, `files-imports`
 * and `kernel`. Geography, legal entities, tax registrations, accounting books, Sites, Stores and groupings
 * (S1-F02-T01); business units with their verified mappings, locations and default warehouses (S1-F02-T02); each change
 * approved by a different authorised person. Its approval rules and decision effects reach `access` through the
 * composition root (organisationApprovals; access-and-approvals 9.8b), and the location-in-use contract `stock`
 * implements reaches it there too, under LOCATION_IN_USE (module-map section 3, rule 6): while none is provided,
 * retiring a location is refused.
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule, FilesImportsModule],
  controllers: [StructureController],
  providers: [
    {
      provide: ORGANISATION,
      useFactory: (
        audit: AuditInterface,
        access: AccessInterface,
        files: FilesImportsInterface,
        locationInUse: LocationInUse | undefined,
      ) => new Organisation({ audit, access, files, locationInUse }),
      inject: [AUDIT, ACCESS, FILES_IMPORTS, { token: LOCATION_IN_USE, optional: true }],
    },
  ],
  exports: [ORGANISATION],
})
export class OrganisationModule {}
