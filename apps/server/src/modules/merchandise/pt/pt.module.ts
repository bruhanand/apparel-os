import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { CommandRunnerModule } from '../../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../../audit/index.js';
import {
  FILES_IMPORTS,
  FilesImportsModule,
  IMPORT_HANDLERS,
  type FilesImportsInterface,
  type ImportHandlers,
} from '../../files-imports/index.js';
import { RECEIVING, ReceivingModule, type ReceivingInterface } from '../../receiving/index.js';
import { PtController } from './http/pt.controller.js';
import { Pt } from './pt.js';
import { PT } from './tokens.js';

/**
 * `merchandise` · PT (module-map section 5; goods-in 5, 10.1): tier 4, uses `receiving` (goods-in 10.2: the GRN's good
 * pieces, its held lines and its "PT attached" mark), `merchandise` · catalogue (the lists, products and barcodes, read
 * through its read functions), `files-imports` (the import pipeline and its handler contract), `access`, `audit` and
 * `kernel`. In the first version a PT is made only by uploading a PT file for a GRN (DEC-134; S2-F04-T02). At start it
 * registers its import handler with `files-imports` (imports-and-opening-data 13.2); its approval rule reaches `access`
 * through the composition root (ptApprovals; access-and-approvals 8, 9.8b).
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule, FilesImportsModule, ReceivingModule],
  controllers: [PtController],
  providers: [
    {
      provide: PT,
      useFactory: (
        audit: AuditInterface,
        access: AccessInterface,
        receiving: ReceivingInterface,
        files: FilesImportsInterface,
      ) => new Pt({ audit, access, receiving, files }),
      inject: [AUDIT, ACCESS, RECEIVING, FILES_IMPORTS],
    },
  ],
  exports: [PT],
})
export class PtModule implements OnModuleInit {
  constructor(
    @Inject(IMPORT_HANDLERS) private readonly handlers: ImportHandlers,
    @Inject(PT) private readonly pt: Pt,
  ) {}

  /** Publishing a PT file reaches `merchandise` · PT's own submit (module-map section 3, rule 8). */
  onModuleInit(): void {
    this.handlers.register(this.pt.importHandler());
  }
}
