import { Module } from '@nestjs/common';
import { CommandRunnerModule } from '../../kernel/index.js';
import { AccessModule } from '../access/index.js';
import { MyWorkController } from './http/my-work.controller.js';

/**
 * The inbox module (module-map 4.8): tier 1, uses `access` and `kernel`. My work, one list per person; its items are
 * published, updated and closed by the owners, `access` through the outbox (access-and-approvals 11.1). The inbox is
 * a sink: acting on an item runs the owner's operation, such as Decide in `access`.
 */
@Module({
  imports: [CommandRunnerModule, AccessModule],
  controllers: [MyWorkController],
})
export class InboxModule {}
