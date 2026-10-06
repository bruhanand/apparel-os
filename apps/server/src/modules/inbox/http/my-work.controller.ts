import { routes } from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import { ApiRoute, COMMAND_RUNNER, type CommandRunner } from '../../../kernel/index.js';
import { ACCESS, SignedIn, type AccessInterface, type SignedInUser } from '../../access/index.js';
import { listMyWork } from '../queries/my-work.js';

/**
 * My work (access-and-approvals 11.2; module-map 4.8; code-house-rules 12.1): every signed-in user's own list,
 * needing no permission. It refreshes by refetch until the live-update stream (S1-F08); nothing polls (RR-301).
 */
@Controller()
export class MyWorkController {
  constructor(
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
  ) {}

  @ApiRoute(routes.listMyWork)
  async listMyWork(@SignedIn() user: SignedInUser) {
    return this.runner.read(
      {
        commandName: 'inbox.list-my-work',
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      (context) => listMyWork(context, this.access, user.userId),
    );
  }
}
