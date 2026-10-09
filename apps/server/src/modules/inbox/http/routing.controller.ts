import { routes, type ExceptionParty, type WorkItemRoutingList } from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRoute,
  COMMAND_RUNNER,
  CommandDefect,
  commandAnswer,
  IDEMPOTENCY_HELPER,
  requestContentOf,
  RouteInput,
  type CommandOutcome,
  type CommandRefusal,
  type CommandRunner,
  type IdempotencyHelper,
  type JsonValue,
  type RouteInputOf,
  type TransactionContext,
} from '../../../kernel/index.js';
import {
  ACCESS,
  SCOPE_MEMBERS,
  SignedIn,
  type AccessInterface,
  type ScopeMembers,
  type SignedInUser,
} from '../../access/index.js';
import { AUDIT, type AuditInterface } from '../../audit/index.js';
import { listRouting, prepareRouting, WORK_ITEM_ROUTING_ACTION_TYPE } from '../commands/routing.js';

/**
 * Task and approval routing (access-and-approvals 9.4, 11.3, 14; module-map 4.8 "Maintain task and approval routing";
 * code-house-rules 12.1; GC3-8, DEC-105; S1-F05-T02): Setup › Exception rules' tab for approvals and tasks. A version is
 * prepared under edit on `inbox.work_item_routing`, held at step 0, and approved by a different authorised person from
 * My work (9.8b). A replay is answered only while the same Authorise still passes (12.4, CH-14).
 */
@Controller()
export class RoutingController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(AUDIT) private readonly audit: AuditInterface,
    @Inject(SCOPE_MEMBERS) private readonly scopeMembers: readonly ScopeMembers[],
  ) {}

  @ApiRoute(routes.listWorkItemRouting)
  async listWorkItemRouting(@SignedIn() user: SignedInUser): Promise<WorkItemRoutingList> {
    return this.runner.read(this.request(user, 'inbox.list-routing'), async (context) => ({
      asOf: context.startedAt.toISOString(),
      ...(await listRouting(
        context,
        this.access.approvalActionTypes(),
        (parties) => this.names(context, parties),
        (versionIds) => this.access.approvalRequestsOf(context, versionIds),
      )),
    }));
  }

  @ApiRoute(routes.prepareWorkItemRouting)
  async prepareWorkItemRouting(
    @SignedIn() user: SignedInUser,
    @RouteInput() input: RouteInputOf<typeof routes.prepareWorkItemRouting>,
  ) {
    const route = routes.prepareWorkItemRouting;
    const roleAssignmentId = user.roleAssignmentId ?? '';
    const need = { action: route.access.action, recordType: route.access.recordType };
    const answer = await this.helper.run(this.request(user, 'inbox.prepare-routing'), {
      key: input.idempotencyKey,
      content: requestContentOf(route, input),
      authoriseReplay: async (context) => {
        const authorised = await this.access.authorise(context, { actorId: user.userId, ...need });
        return authorised.kind === 'allowed'
          ? { kind: 'allowed' }
          : {
              kind: 'refused',
              refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
            };
      },
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        const held = await this.access.holdAuthority(
          context,
          { kind: 'user', id: user.userId },
          roleAssignmentId,
          need,
        );
        if (held !== undefined) return refusedOutcome(held);
        const draft = input.body;
        if ((await this.names(context, [draft.escalation]))[0] === null) {
          const party = draft.escalation;
          return refusedOutcome({
            kind: 'refused',
            code: 'inbox.party-not-found',
            missing: [
              party.kind === 'user' ? { kind: 'user', userId: party.userId } : { kind: 'role', roleId: party.roleId },
            ],
          });
        }
        const site = await this.siteNotFound(context, draft.siteId, draft.validFrom);
        if (site !== undefined) return refusedOutcome(site);
        const preparer = { userId: user.userId, roleAssignmentId };
        const routable = new Set(this.access.approvalActionTypes().map((each) => each.actionType));
        const prepared = await prepareRouting(context, this.audit, routable, preparer, draft);
        if (prepared.kind === 'refused') return refusedOutcome(prepared.refusal);
        // A different authorised person approves it (access-and-approvals 9.4; GC3-8): the preparer is the one person
        // who recorded the version, frozen as prepared (9.1).
        const requestId = await this.access.requestApproval(context, {
          actionType: WORK_ITEM_ROUTING_ACTION_TYPE,
          document: {
            module: 'inbox',
            recordType: route.access.recordType,
            recordId: prepared.value.routingId,
            versionId: prepared.value.versionId,
          },
          value: { kind: 'none' },
          preparers: [user.userId],
          requestedBy: preparer,
        });
        return { kind: 'success', answer: { ...prepared.value, requestId }, shows: 'nothing' };
      },
    });
    return commandAnswer(answer);
  }

  /** A routing's Site must exist in `organisation`, asked through the scope contract (as exceptions' routing; RR-451). */
  private async siteNotFound(
    context: TransactionContext,
    siteId: string | null,
    validFrom: string,
  ): Promise<CommandRefusal | undefined> {
    if (siteId === null) return undefined;
    const member = { type: 'site' as const, id: siteId };
    const answering = this.scopeMembers.filter((each) => each.answers.includes('site'));
    if (answering.length === 0) throw new CommandDefect('No scope implementation answers Sites');
    for (const implementation of answering) {
      if ((await implementation.notFound(context, [member], { validFrom })).length > 0) {
        return {
          kind: 'refused',
          code: 'inbox.site-not-found',
          missing: [{ kind: 'scope-member', dimension: 'place', memberType: 'site', memberId: siteId }],
        };
      }
    }
    return undefined;
  }

  /** The names of parties: a user's display name, a role's code; null for one that does not exist. */
  private async names(context: TransactionContext, parties: readonly ExceptionParty[]): Promise<(string | null)[]> {
    const named = await this.access.partyNames(
      context,
      parties.flatMap((party) => (party.kind === 'user' ? [party.userId] : [])),
      parties.flatMap((party) => (party.kind === 'role' ? [party.roleId] : [])),
    );
    return parties.map((party) =>
      party.kind === 'user' ? (named.users.get(party.userId) ?? null) : (named.roles.get(party.roleId) ?? null),
    );
  }

  private request(user: SignedInUser, commandName: string) {
    return {
      commandName,
      organisation: user.organisation,
      correlationId: user.correlationId,
      actor: { kind: 'actor', actorId: user.userId } as const,
    };
  }
}

function refusedOutcome(refusal: CommandRefusal): CommandOutcome<JsonValue> {
  return { kind: 'refusal', refusal: { ...refusal, missing: [...refusal.missing] }, causedBySecret: false };
}
