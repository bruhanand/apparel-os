import { routes } from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRefusal,
  ApiRoute,
  COMMAND_RUNNER,
  type CommandRunner,
  type TransactionContext,
} from '../../../kernel/index.js';
import { listAssignments, listReasons, listRoles, listUsers } from '../queries/access-records.js';
import { SignedIn, type SignedInUser } from './authenticate.guard.js';

/**
 * The lists of the access setup screens (access-and-approvals 2.1, 4, 5, 9.5, 14; S1-F01-T16; RR-326). The guard has
 * run Authorise for view on the route's type; each read runs in a read-only transaction with the reader as actor and
 * needs today under the Organisation's timezone for each version's state (PRD-MOD-009). No rule of its own.
 */
@Controller()
export class AccessRecordsController {
  constructor(@Inject(COMMAND_RUNNER) private readonly runner: CommandRunner) {}

  @ApiRoute(routes.listUsers)
  listUsers(@SignedIn() user: SignedInUser) {
    return this.read(user, 'access.list-users', listUsers);
  }

  @ApiRoute(routes.listRoles)
  listRoles(@SignedIn() user: SignedInUser) {
    return this.read(user, 'access.list-roles', listRoles);
  }

  @ApiRoute(routes.listRoleAssignments)
  listRoleAssignments(@SignedIn() user: SignedInUser) {
    return this.read(user, 'access.list-role-assignments', listAssignments);
  }

  @ApiRoute(routes.listApprovalReasonRecords)
  listApprovalReasonRecords(@SignedIn() user: SignedInUser) {
    return this.read(user, 'access.list-approval-reasons', listReasons);
  }

  private async read<Answer>(
    user: SignedInUser,
    commandName: string,
    list: (context: TransactionContext, today: string) => Promise<Answer>,
  ): Promise<Answer> {
    const answer = await this.runner.read(
      {
        commandName,
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      async (context) => {
        const date = await context.businessDate();
        return date.kind === 'not-set' ? undefined : { listed: await list(context, date.date) };
      },
    );
    if (answer === undefined) {
      throw new ApiRefusal({
        kind: 'unavailable',
        code: 'access.business-date-not-set',
        missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
      });
    }
    return answer.listed;
  }
}
