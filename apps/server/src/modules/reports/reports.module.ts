import { Module } from '@nestjs/common';
import { CommandRunnerModule } from '../../kernel/index.js';
import { AccessModule } from '../access/index.js';
import { AuditModule } from '../audit/index.js';
import { ReportsController } from './http/reports.controller.js';
import { StockSearchController } from './http/stock-search.controller.js';

/**
 * `reports` (module-map section 5; goods-in 9): tier 6. Stock search (goods-in 9.2, 9.4; S2-F11-T01) and the stage 2
 * reports (goods-in 9.3, 9.5; S2-F11-T02). It reads the records of other modules only through the kernel's read-model
 * gateway, each read model named by the declaration its owner exports (module-map section 3, rule 5); it asks `access`
 * what each reader may see and the names of the people a report shows, and `audit` to record the access an export of
 * cost is. The gateway and the idempotency helper reach it through the composition root.
 */
@Module({
  imports: [CommandRunnerModule, AccessModule, AuditModule],
  controllers: [StockSearchController, ReportsController],
})
export class ReportsModule {}
