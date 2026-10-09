import { Module } from '@nestjs/common';
import { CommandRunnerModule } from '../../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../../audit/index.js';
import { Catalogue } from './catalogue.js';
import { CatalogueController } from './http/catalogue.controller.js';
import { CATALOGUE } from './tokens.js';

/**
 * merchandise · catalogue (module-map 4.12; structure-and-masters 4): tier 2, uses `access`, `audit`, `organisation`
 * and `kernel`. Brands, brand coverage, categories, size sets, attributes, vocabularies and vocabulary proposals
 * (S1-F03-T01). Its approval rules and decision effects reach `access` through the composition root
 * (catalogueApprovals; access-and-approvals 9.8b), and so does its side of the scope contract, for brands
 * (catalogueScopeMembers; module-map section 3, rule 6). It reads business units through `organisation`'s interface.
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule],
  controllers: [CatalogueController],
  providers: [
    {
      provide: CATALOGUE,
      useFactory: (audit: AuditInterface, access: AccessInterface) => new Catalogue({ audit, access }),
      inject: [AUDIT, ACCESS],
    },
  ],
  exports: [CATALOGUE],
})
export class CatalogueModule {}
