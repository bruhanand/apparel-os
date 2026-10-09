import { paise } from '@apparel-os/domain';
import {
  routes,
  type CommandRoute,
  type ExceptionParty,
  type ExceptionView,
  type OpenExceptions,
  type RoutingList,
} from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRefusal,
  ApiRoute,
  COMMAND_RUNNER,
  commandAnswer,
  IDEMPOTENCY_HELPER,
  requestContentOf,
  RouteInput,
  type CommandOutcome,
  type CommandRefusal,
  type CommandRunner,
  type IdempotencyHelper,
  type JsonValue,
  type ReplayAuthorisation,
  type RouteInputOf,
  type TransactionContext,
} from '../../../kernel/index.js';
import { ACCESS, SignedIn, type AccessInterface, type RecordFacts, type SignedInUser } from '../../access/index.js';
import type { Outcome } from '../commands/common.js';
import { ROUTING_ACTION_TYPE } from '../commands/routing.js';
import type { Acting, Changed } from '../commands/lifecycle.js';
import type { EvidenceAdded } from '../commands/evidence.js';
import { summarise } from '../domain/summary.js';
import { EXCEPTION_RECORD_TYPE } from '../domain/types.js';
import type { ExceptionsInterface } from '../exceptions.js';
import { isOwner } from '../queries/admission.js';
import type { ExceptionRecord } from '../queries/read.js';
import { EXCEPTIONS } from '../tokens.js';

/**
 * How a reader is admitted to an exception (module-map 4.13; access-and-approvals 12.2, 12.4 "As built"): as its owner
 * (the named user, or a holder of the owning role whose assignment covers its facts) or as an escalation recipient
 * since it was raised or last reopened; otherwise through Authorise on `exceptions.exception` with its facts.
 */
type Admission =
  | { readonly kind: 'owner' }
  | { readonly kind: 'authorised'; readonly roleAssignmentId: string; readonly facts: RecordFacts }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal };

function factsOfRecord(record: ExceptionRecord): RecordFacts {
  return {
    siteId: record.row.siteId ?? undefined,
    storeId: record.row.storeId ?? undefined,
    businessUnitId: record.row.businessUnitId ?? undefined,
    brandId: record.row.brandId ?? undefined,
  };
}

const notFound = (): CommandRefusal => ({ kind: 'not-found', code: 'exceptions.exception-not-found', missing: [] });

/**
 * The routes of exceptions (access-and-approvals 12, 14; module-map 4.13; code-house-rules 12.1; S1-F08-T02): Setup ›
 * Exception rules, raising one, the exception record and its lifecycle, and the read model. Each command runs under its
 * idempotency key; a person admitted through Authorise holds that authority at step 0 (code-house-rules 8.2), and a
 * replay is answered only while the same admission still holds (12.4, CH-14).
 */
@Controller()
export class ExceptionsController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(EXCEPTIONS) private readonly exceptions: ExceptionsInterface,
  ) {}

  @ApiRoute(routes.listExceptionRouting)
  async listExceptionRouting(@SignedIn() user: SignedInUser): Promise<RoutingList> {
    return this.runner.read(this.request(user, 'exceptions.list-routing'), async (context) => ({
      asOf: context.startedAt.toISOString(),
      ...(await this.exceptions.listRouting(
        context,
        (parties) => this.names(context, parties),
        (versionIds) => this.access.approvalRequestsOf(context, versionIds),
      )),
    }));
  }

  @ApiRoute(routes.prepareExceptionRouting)
  async prepareExceptionRouting(
    @SignedIn() user: SignedInUser,
    @RouteInput() input: RouteInputOf<typeof routes.prepareExceptionRouting>,
  ) {
    const route = routes.prepareExceptionRouting;
    const roleAssignmentId = user.roleAssignmentId ?? '';
    const need = { action: route.access.action, recordType: route.access.recordType };
    return this.command(route, 'exceptions.prepare-routing', user, input, {
      authoriseReplay: async (context) =>
        this.replayOf(await this.access.authorise(context, { actorId: user.userId, ...need })),
      work: async (context) => {
        const held = await this.access.holdAuthority(
          context,
          { kind: 'user', id: user.userId },
          roleAssignmentId,
          need,
        );
        if (held !== undefined) return refusedOutcome(held);
        const draft = input.body;
        const named = await this.names(context, [draft.owner, draft.escalation]);
        const unknown = [draft.owner, draft.escalation].filter((_party, index) => named[index] === null);
        if (unknown.length > 0) {
          return refusedOutcome({
            kind: 'refused',
            code: 'exceptions.party-not-found',
            missing: unknown.map((party) =>
              party.kind === 'user' ? { kind: 'user', userId: party.userId } : { kind: 'role', roleId: party.roleId },
            ),
          });
        }
        const preparer = { userId: user.userId, roleAssignmentId };
        const prepared = await this.exceptions.prepareRouting(context, preparer, draft);
        if (prepared.kind === 'refused') return refusedOutcome(prepared.refusal);
        // A different authorised person approves it (access-and-approvals 12.4 "As built"; POL-02.11): the preparer is
        // the one person who recorded the version, frozen as prepared (9.1).
        const requestId = await this.access.requestApproval(context, {
          actionType: ROUTING_ACTION_TYPE,
          document: {
            module: 'exceptions',
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
  }

  @ApiRoute(routes.raiseException)
  async raiseException(
    @SignedIn() user: SignedInUser,
    @RouteInput() input: RouteInputOf<typeof routes.raiseException>,
  ) {
    const route = routes.raiseException;
    const body = input.body;
    const facts: RecordFacts = {
      siteId: body.siteId ?? undefined,
      storeId: body.storeId ?? undefined,
      businessUnitId: body.businessUnitId ?? undefined,
      brandId: body.brandId ?? undefined,
    };
    const need = { action: route.access.action, recordType: route.access.recordType, facts };
    return this.command(route, 'exceptions.raise', user, input, {
      authoriseReplay: async (context) =>
        this.replayOf(await this.access.authorise(context, { actorId: user.userId, ...need })),
      work: async (context) => {
        const authorised = await this.access.authorise(context, { actorId: user.userId, ...need });
        if (authorised.kind === 'refused') return refusedOutcome(authorised.refusal);
        const held = await this.access.holdAuthority(
          context,
          { kind: 'user', id: user.userId },
          authorised.roleAssignmentId,
          need,
        );
        if (held !== undefined) return refusedOutcome(held);
        const raised = await this.exceptions.raiseInOwnCommand(context, {
          // A person's raise is keyed by their request, so a resent request raises nothing twice (PRD-INT-008).
          raisingEvent: `exceptions.raise:${user.userId}:${input.idempotencyKey}`,
          typeCode: body.typeCode,
          facts: {
            siteId: body.siteId,
            storeId: body.storeId,
            businessUnitId: body.businessUnitId,
            brandId: body.brandId,
          },
          links: body.links,
          exposure: body.exposure,
          raisedBy: { kind: 'user', id: user.userId },
          roleAssignmentId: authorised.roleAssignmentId,
          ...(body.comment === null ? {} : { comment: body.comment }),
        });
        if (raised.kind === 'refused') return refusedOutcome(raised.refusal);
        return {
          kind: 'success',
          answer: { exceptionId: raised.value.exceptionId, code: raised.value.code },
          shows: 'nothing',
        };
      },
    });
  }

  @ApiRoute(routes.readException)
  async readException(
    @SignedIn() user: SignedInUser,
    @RouteInput() input: RouteInputOf<typeof routes.readException>,
  ): Promise<ExceptionView> {
    const answer = await this.runner.read(this.request(user, 'exceptions.read-exception'), async (context) => {
      const record = await this.exceptions.readException(context, input.params.exceptionId);
      if (record === undefined) return { kind: 'refused', refusal: notFound() } as const;
      const viewing = await this.admit(context, user.userId, record, 'view');
      if (viewing.kind === 'refused') return viewing;
      const acting = await this.admit(context, user.userId, record, 'edit');
      return { kind: 'done', view: await this.view(context, user.userId, record, acting.kind !== 'refused') } as const;
    });
    if (answer.kind === 'refused') throw new ApiRefusal({ ...answer.refusal, missing: [...answer.refusal.missing] });
    return answer.view;
  }

  @ApiRoute(routes.commentOnException)
  async commentOnException(
    @SignedIn() user: SignedInUser,
    @RouteInput() input: RouteInputOf<typeof routes.commentOnException>,
  ) {
    return this.lifecycle(routes.commentOnException, 'exceptions.comment', user, input, (context, acting) =>
      this.exceptions.comment(context, acting, input.params.exceptionId, input.body.comment),
    );
  }

  /**
   * Evidence (12.3; POL-03.05; S1-F08-T03): admitted as a comment is, and, since the file is attached under the
   * exception's own type and served only through a grant on it (imports-and-opening-data 11), the person also needs
   * view on `exceptions.exception` covering it, which an owner admitted as owner may lack. Checked in the command, so a
   * refusal names it and the attachment's row-level security never refuses a write.
   */
  @ApiRoute(routes.addExceptionEvidence)
  async addExceptionEvidence(
    @SignedIn() user: SignedInUser,
    @RouteInput() input: RouteInputOf<typeof routes.addExceptionEvidence>,
  ) {
    return this.lifecycle(
      routes.addExceptionEvidence,
      'exceptions.add-evidence',
      user,
      input,
      async (context, acting) => {
        const record = await this.exceptions.readException(context, input.params.exceptionId);
        if (record === undefined) return { kind: 'refused', refusal: notFound() };
        const viewing = await this.access.authorise(context, {
          actorId: user.userId,
          action: 'view',
          recordType: EXCEPTION_RECORD_TYPE,
          facts: factsOfRecord(record),
        });
        if (viewing.kind === 'refused') return { kind: 'refused', refusal: viewing.refusal };
        return this.exceptions.addEvidence(context, acting, input.params.exceptionId, input.body.evidence);
      },
    );
  }

  @ApiRoute(routes.reassignException)
  async reassignException(
    @SignedIn() user: SignedInUser,
    @RouteInput() input: RouteInputOf<typeof routes.reassignException>,
  ) {
    return this.lifecycle(routes.reassignException, 'exceptions.reassign', user, input, async (context, acting) => {
      const [name] = await this.names(context, [input.body.to]);
      if (name === null) {
        const to = input.body.to;
        return {
          kind: 'refused',
          refusal: {
            kind: 'refused',
            code: 'exceptions.party-not-found',
            missing: [to.kind === 'user' ? { kind: 'user', userId: to.userId } : { kind: 'role', roleId: to.roleId }],
          },
        };
      }
      return this.exceptions.reassign(context, acting, input.params.exceptionId, input.body.to);
    });
  }

  @ApiRoute(routes.takeException)
  async takeException(@SignedIn() user: SignedInUser, @RouteInput() input: RouteInputOf<typeof routes.takeException>) {
    return this.lifecycle(
      routes.takeException,
      'exceptions.take',
      user,
      input,
      (context, acting) =>
        this.exceptions.reassign(context, acting, input.params.exceptionId, { kind: 'user', userId: user.userId }),
      { takeOnly: true },
    );
  }

  @ApiRoute(routes.closeException)
  async closeException(
    @SignedIn() user: SignedInUser,
    @RouteInput() input: RouteInputOf<typeof routes.closeException>,
  ) {
    return this.lifecycle(routes.closeException, 'exceptions.close', user, input, (context, acting) =>
      this.exceptions.close(context, acting, input.params.exceptionId),
    );
  }

  @ApiRoute(routes.reopenException)
  async reopenException(
    @SignedIn() user: SignedInUser,
    @RouteInput() input: RouteInputOf<typeof routes.reopenException>,
  ) {
    return this.lifecycle(routes.reopenException, 'exceptions.reopen', user, input, (context, acting) =>
      this.exceptions.reopen(context, acting, input.params.exceptionId, input.body.comment),
    );
  }

  @ApiRoute(routes.listOpenExceptions)
  async listOpenExceptions(@SignedIn() user: SignedInUser): Promise<OpenExceptions> {
    const answer = await this.runner.read(this.request(user, 'exceptions.list-open'), async (context) => {
      const open = await this.exceptions.openExceptions(context);
      const checked = await this.access.authoriseEach(
        context,
        { actorId: user.userId, action: 'view', recordType: EXCEPTION_RECORD_TYPE },
        open.map(({ row }) => ({
          siteId: row.siteId ?? undefined,
          storeId: row.storeId ?? undefined,
          businessUnitId: row.businessUnitId ?? undefined,
          brandId: row.brandId ?? undefined,
        })),
      );
      if (checked.kind === 'refused') return checked;
      const visible = open.filter((_row, index) => checked.each[index]?.kind === 'allowed');
      return {
        kind: 'done',
        summary: {
          asOf: context.startedAt.toISOString(),
          rows: summarise(
            visible.map(({ row, typeCode }) => ({
              storeId: row.storeId,
              brandId: row.brandId,
              typeCode,
              exposure:
                row.exposureKind === 'known' && row.exposureAmount !== null
                  ? { kind: 'known', amount: paise(row.exposureAmount) }
                  : { kind: 'unknown' },
              repeat: row.earlierExceptionId !== null,
            })),
          ).map((summary) => ({
            ...summary,
            knownExposure: summary.knownExposure === null ? null : paise(summary.knownExposure),
          })),
        },
      } as const;
    });
    if (answer.kind === 'refused') throw new ApiRefusal({ ...answer.refusal, missing: [...answer.refusal.missing] });
    return answer.summary;
  }

  /** A lifecycle command: admitted as owner or through Authorise for edit, held at step 0, then the operation. */
  private async lifecycle<R extends CommandRoute & { params: object }>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R> & { params: { exceptionId: string } },
    operation: (context: TransactionContext, acting: Acting) => Promise<Outcome<Changed | EvidenceAdded>>,
    options: { readonly takeOnly?: boolean } = {},
  ) {
    const exceptionId = input.params.exceptionId;
    const admitted = async (context: TransactionContext): Promise<Admission> => {
      const record = await this.exceptions.readException(context, exceptionId);
      if (record === undefined) return { kind: 'refused', refusal: notFound() };
      if (options.takeOnly === true) {
        return (await this.mayTake(context, user.userId, record))
          ? { kind: 'owner' }
          : {
              kind: 'refused',
              refusal: {
                kind: 'not-authorised',
                code: 'access.not-authorised',
                missing: [{ kind: 'role-holder', exceptionId }],
              },
            };
      }
      return this.admit(context, user.userId, record, 'edit');
    };
    return this.command(route, commandName, user, input, {
      authoriseReplay: async (context) => {
        const admission = await admitted(context);
        return admission.kind === 'refused'
          ? {
              kind: 'refused',
              refusal: { kind: 'not-authorised', code: admission.refusal.code, missing: admission.refusal.missing },
            }
          : { kind: 'allowed' };
      },
      work: async (context) => {
        const admission = await admitted(context);
        if (admission.kind === 'refused') return refusedOutcome(admission.refusal);
        if (admission.kind === 'authorised') {
          const held = await this.access.holdAuthority(
            context,
            { kind: 'user', id: user.userId },
            admission.roleAssignmentId,
            { action: 'edit', recordType: EXCEPTION_RECORD_TYPE, facts: admission.facts },
          );
          if (held !== undefined) return refusedOutcome(held);
        }
        const acting: Acting = {
          actor: { kind: 'user', id: user.userId },
          ...(admission.kind === 'authorised' ? { roleAssignmentId: admission.roleAssignmentId } : {}),
        };
        return outcomeOf(await operation(context, acting));
      },
    });
  }

  private async command<R extends CommandRoute>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    run: {
      readonly authoriseReplay: ReplayAuthorisation;
      readonly work: (context: TransactionContext) => Promise<CommandOutcome<JsonValue>>;
    },
  ) {
    const answer = await this.helper.run(this.request(user, commandName), {
      key: input.idempotencyKey as unknown as string,
      content: requestContentOf(route, input as RouteInputOf<CommandRoute>),
      authoriseReplay: run.authoriseReplay,
      work: run.work,
    });
    return commandAnswer(answer);
  }

  private request(user: SignedInUser, commandName: string) {
    return {
      commandName,
      organisation: user.organisation,
      correlationId: user.correlationId,
      actor: { kind: 'actor', actorId: user.userId } as const,
    };
  }

  private replayOf(authorised: Awaited<ReturnType<AccessInterface['authorise']>>) {
    return authorised.kind === 'allowed'
      ? ({ kind: 'allowed' } as const)
      : ({
          kind: 'refused',
          refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
        } as const);
  }

  /** Whether the reader is the owner, a holder of the owning role, or an escalation recipient (12.2, 11.3). */
  private async ownerOf(context: TransactionContext, userId: string, record: ExceptionRecord): Promise<boolean> {
    return isOwner(context, this.access, userId, record);
  }

  /** Whether the reader holds the owning role, or a role escalated to, within the exception's scope (12.2). */
  private async mayTake(context: TransactionContext, userId: string, record: ExceptionRecord): Promise<boolean> {
    if (record.row.ownerUserId === userId) return false;
    const parties = [
      ...(record.row.ownerRoleId === null ? [] : [{ kind: 'role', roleId: record.row.ownerRoleId } as const]),
      ...record.escalatedTo,
    ];
    return (await this.heldRoles(context, userId, record, parties)).some(Boolean);
  }

  private async heldRoles(
    context: TransactionContext,
    userId: string,
    record: ExceptionRecord,
    parties: readonly ExceptionParty[],
  ): Promise<boolean[]> {
    const roles = parties.flatMap((party) => (party.kind === 'role' ? [party.roleId] : []));
    return this.access.rolesHeld(
      context,
      userId,
      roles.map((roleId) => ({ roleId, recordType: EXCEPTION_RECORD_TYPE, facts: factsOfRecord(record) })),
    );
  }

  private async admit(
    context: TransactionContext,
    userId: string,
    record: ExceptionRecord,
    action: 'view' | 'edit',
  ): Promise<Admission> {
    if (await this.ownerOf(context, userId, record)) return { kind: 'owner' };
    const facts = factsOfRecord(record);
    const authorised = await this.access.authorise(context, {
      actorId: userId,
      action,
      recordType: EXCEPTION_RECORD_TYPE,
      facts,
    });
    if (authorised.kind === 'allowed')
      return { kind: 'authorised', roleAssignmentId: authorised.roleAssignmentId, facts };
    // A reader who may not view it learns nothing of it: the same answer as for none (PRD-SEC-005).
    return action === 'view' ? { kind: 'refused', refusal: notFound() } : authorised;
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

  private async view(
    context: TransactionContext,
    userId: string,
    record: ExceptionRecord,
    mayAct: boolean,
  ): Promise<ExceptionView> {
    const { row } = record;
    const owner: ExceptionParty =
      row.ownerUserId !== null
        ? { kind: 'user', userId: row.ownerUserId }
        : { kind: 'role', roleId: row.ownerRoleId ?? '' };
    const eventParties = record.events.map((event) => event.to);
    const actors = record.events.map((event) => event.actorId);
    const named = await this.names(context, [owner, ...eventParties.filter((party) => party !== null)]);
    const actorNames = await this.access.partyNames(
      context,
      actors.filter((actor) => actor !== null),
      [],
    );
    let cursor = 1;
    return {
      asOf: context.startedAt.toISOString(),
      id: row.id,
      code: row.code,
      type: record.type as ExceptionView['type'],
      state: row.state as ExceptionView['state'],
      overdue: row.state !== 'Closed' && row.dueAt < context.startedAt,
      owner: { party: owner, name: named[0] ?? null },
      dueAt: row.dueAt.toISOString(),
      exposure:
        row.exposureKind === 'known' && row.exposureAmount !== null
          ? { kind: 'known', amount: paise(row.exposureAmount) }
          : { kind: 'unknown' },
      siteId: row.siteId,
      storeId: row.storeId,
      businessUnitId: row.businessUnitId,
      brandId: row.brandId,
      links: [...record.links],
      earlierExceptionCode: record.earlierCode,
      events: record.events.map((event) => ({
        id: event.id,
        kind: event.kind as ExceptionView['events'][number]['kind'],
        at: event.occurredAt.toISOString(),
        byName: event.actorId === null ? null : (actorNames.users.get(event.actorId) ?? null),
        to: event.to === null ? null : { party: event.to, name: named[cursor++] ?? null },
        comment: event.comment,
        attachmentId: event.attachmentId,
      })),
      mayAct,
      mayTake: row.state !== 'Closed' && (await this.mayTake(context, userId, record)),
    };
  }
}

function refusedOutcome(refusal: CommandRefusal): CommandOutcome<JsonValue> {
  return { kind: 'refusal', refusal: { ...refusal, missing: [...refusal.missing] }, causedBySecret: false };
}

function outcomeOf<Value extends object>(outcome: Outcome<Value>): CommandOutcome<JsonValue> {
  if (outcome.kind === 'refused') return refusedOutcome(outcome.refusal);
  return { kind: 'success', answer: { ...outcome.value } as JsonValue, shows: 'nothing' };
}
