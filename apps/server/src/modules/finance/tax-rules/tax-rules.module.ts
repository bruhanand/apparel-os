import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { CommandRunnerModule } from '../../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../../audit/index.js';
import { CONFIGURATION, type ConfigurationInterface } from '../../configuration/index.js';
import { FILES_IMPORTS, FilesImportsModule, type FilesImportsInterface } from '../../files-imports/index.js';
import { TaxRulesController } from './http/tax-rules.controller.js';
import { taxRulesCheck } from './queries/validity.js';
import { TaxRules } from './tax-rules.js';
import { TAX_RULES } from './tokens.js';

/**
 * finance · tax rules (module-map 4.14; shared-calculations 10): tier 2, uses `access`, `audit`, `configuration`,
 * `files-imports`, `kernel` and `organisation`'s interface for tax registrations. Its approval rules and decision
 * effects reach `access` through the composition root (taxRulesApprovals; access-and-approvals 9.8b), and its records
 * reach the policy gate as policy 10's values (taxRulesCheck; module-map 4.4; RR-558).
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule, FilesImportsModule],
  controllers: [TaxRulesController],
  providers: [
    {
      provide: TAX_RULES,
      useFactory: (
        audit: AuditInterface,
        access: AccessInterface,
        files: FilesImportsInterface,
        origins: ConfigurationInterface,
      ) => new TaxRules({ audit, access, files, origins }),
      inject: [AUDIT, ACCESS, FILES_IMPORTS, CONFIGURATION],
    },
  ],
  exports: [TAX_RULES],
})
export class TaxRulesModule implements OnModuleInit {
  constructor(@Inject(CONFIGURATION) private readonly configuration: ConfigurationInterface) {}

  /** The tax-rule records as policy 10's values, for the policy gate (module-map 4.4; goods-in 10.5; RR-558). */
  onModuleInit(): void {
    this.configuration.registerCheck(taxRulesCheck);
  }
}
