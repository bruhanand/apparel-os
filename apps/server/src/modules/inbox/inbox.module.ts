import { Inject, Module, Optional, type OnModuleInit } from '@nestjs/common';
import { CommandRunnerModule, LIVE_UPDATES, type LiveUpdates } from '../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../access/index.js';
import { WORK_ITEM_RECORD_TYPE } from './events.js';
import { mayActOn } from './queries/my-work.js';
import { MyWorkController } from './http/my-work.controller.js';
import { RoutingController } from './http/routing.controller.js';
import { AuditModule } from '../audit/index.js';
import { Inbox, INBOX } from './inbox.js';

/**
 * The inbox module (module-map 4.8): tier 1, uses `access` and `kernel`. My work, one list per person; its items are
 * published, updated and closed by the owners, `access` through the outbox (access-and-approvals 11.1). The inbox is
 * a sink: acting on an item runs the owner's operation, such as Decide in `access`. `exceptions` and higher modules
 * publish through its interface, INBOX, in their own transaction (11.1).
 */
@Module({
  // Audit for the routing's changes (S1-F05-T02).
  imports: [CommandRunnerModule, AccessModule, AuditModule],
  controllers: [MyWorkController, RoutingController],
  providers: [{ provide: INBOX, useValue: new Inbox() }],
  exports: [INBOX],
})
export class InboxModule implements OnModuleInit {
  constructor(
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Optional() @Inject(LIVE_UPDATES) private readonly live: LiveUpdates | null,
  ) {}

  /** A work item's live updates go only to those who may act on it (access-and-approvals 11.1; 12.12). */
  onModuleInit(): void {
    this.live?.registerAudience([WORK_ITEM_RECORD_TYPE], (context, actorId, event) =>
      mayActOn(context, this.access, actorId, event.subject.recordId),
    );
  }
}
