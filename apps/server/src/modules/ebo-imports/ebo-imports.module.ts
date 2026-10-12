import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { FilesImportsModule, IMPORT_HANDLERS, type ImportHandlers } from '../files-imports/index.js';
import { CATALOGUE, CatalogueModule, type CatalogueInterface } from '../merchandise/catalogue/index.js';
import { historicalReferenceHandler } from './commands/historical-reference.js';

/**
 * `ebo-imports` (module-map section 5, 11.1; imports-and-opening-data 4.1, 12; DEC-116; S1-F13-T01): tier 4. In stage 1
 * a minimal module holding only the historical-reference handler, for the earlier POS's stock on hand and daily
 * sales, which keeps them as reference records for checking and reports and never moves stock (PRD-LIF-014); stage 2
 * (S2-F12) extends it. Uses `files-imports`, whose handler contract it implements and registers with at start,
 * `merchandise` · catalogue's Resolve a code, `audit` and `kernel`. It calls neither `stock` nor `finance`.
 */
@Module({
  imports: [AuditModule, FilesImportsModule, CatalogueModule],
})
export class EboImportsModule implements OnModuleInit {
  constructor(
    @Inject(AUDIT) private readonly audit: AuditInterface,
    @Inject(CATALOGUE) private readonly catalogue: CatalogueInterface,
    @Inject(IMPORT_HANDLERS) private readonly handlers: ImportHandlers,
  ) {}

  onModuleInit(): void {
    const dependencies = { audit: this.audit, catalogue: this.catalogue };
    this.handlers.register(historicalReferenceHandler('stock-on-hand', dependencies));
    this.handlers.register(historicalReferenceHandler('daily-sales', dependencies));
  }
}
