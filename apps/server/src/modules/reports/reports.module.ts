import { Module } from '@nestjs/common';
import { CommandRunnerModule } from '../../kernel/index.js';
import { AccessModule } from '../access/index.js';
import { AuditModule } from '../audit/index.js';
import { StockSearchController } from './http/stock-search.controller.js';

/**
 * `reports` (module-map section 5; goods-in 9): tier 6. In its first piece stock search (goods-in 9.2, 9.4;
 * S2-F11-T01). It reads the records of other modules only through the kernel's read-model gateway, each read model
 * named by the declaration its owner exports (module-map section 3, rule 5); it asks `access` what each reader may see
 * and `audit` to record the access an export of cost is. The gateway and the idempotency helper reach it through the
 * composition root.
 */
@Module({
  imports: [CommandRunnerModule, AccessModule, AuditModule],
  controllers: [StockSearchController],
})
export class ReportsModule {}
