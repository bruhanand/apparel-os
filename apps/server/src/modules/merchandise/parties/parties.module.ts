import { Module } from '@nestjs/common';
import { CommandRunnerModule } from '../../../kernel/index.js';
import {
  ACCESS,
  AccessContractsModule,
  AccessModule,
  ORGANISATION_KEYS,
  type AccessInterface,
  type OrganisationKeys,
} from '../../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../../audit/index.js';
import { FILES_IMPORTS, FilesImportsModule, type FilesImportsInterface } from '../../files-imports/index.js';
import { PartiesController } from './http/parties.controller.js';
import { Parties } from './parties.js';
import { PARTIES } from './tokens.js';

/**
 * merchandise · parties (module-map 4.12; structure-and-masters 5): tier 2, uses `access`, `audit`, `files-imports`,
 * `kernel` and the catalogue's interface for brands. Parties with their roles, bank details kept encrypted under the
 * Organisation's key, brand–supplier links and agreements (S1-F03-T03). Its approval rules and decision effects reach
 * `access` through the composition root (partiesApprovals; access-and-approvals 9.8b).
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule, AccessContractsModule, FilesImportsModule],
  controllers: [PartiesController],
  providers: [
    {
      provide: PARTIES,
      useFactory: (
        audit: AuditInterface,
        access: AccessInterface,
        files: FilesImportsInterface,
        keys: OrganisationKeys,
      ) => new Parties({ audit, access, files, keys }),
      inject: [AUDIT, ACCESS, FILES_IMPORTS, ORGANISATION_KEYS],
    },
  ],
  exports: [PARTIES],
})
export class PartiesModule {}
