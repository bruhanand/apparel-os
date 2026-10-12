import { routes, type CommandRoute, type PermissionAction } from '@apparel-os/schemas';
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
import {
  ACCESS,
  SignedIn,
  type AccessInterface,
  type HeldNeed,
  type RecordFacts,
  type SignedInUser,
} from '../../access/index.js';
import type { Actor, Outcome } from '../commands/devices.js';
import type { PosInterface } from '../pos.js';
import { POS } from '../tokens.js';

/** Finds the facts of the record a route acts on, on the date, in its transaction; undefined when it does not exist. */
type FactsOf = (context: TransactionContext, date: string) => Promise<RecordFacts | undefined>;

const BUSINESS_DATE_NOT_SET: CommandRefusal = {
  kind: 'unavailable',
  code: 'access.business-date-not-set',
  missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
};

/** A billing device that does not exist is not found, named by its identifier. */
function deviceNotFound(deviceId: string): CommandRefusal {
  return {
    kind: 'not-found',
    code: 'access.device-not-found',
    missing: [{ kind: 'record', recordType: 'pos.billing_device', recordId: deviceId }],
  };
}

/**
 * Setup › Devices, tills and bill series and the counter's enrolment (offline-counter 3.2, 12.1; module-map 4.17;
 * code-house-rules 12.1; S1-F12-T01). A billing device carries its Store's place, so the guard Authenticates only and
 * each route authorises in its transaction with the Store's facts (access-and-approvals 5.3, 7.1 step 3; RR-296); each
 * command runs under its idempotency key and holds its authority at step 0 (8.2). None is policy-gated: registering
 * and enrolling a device are setup, not selling (DEC-116). No rule lives here.
 */
@Controller()
export class DevicesController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(POS) private readonly pos: PosInterface,
  ) {}

  @ApiRoute(routes.listBillingDevices)
  async listBillingDevices(@SignedIn() user: SignedInUser) {
    const answer = await this.runner.read(
      {
        commandName: 'pos.list-billing-devices',
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      async (context) => {
        const date = await context.businessDate();
        if (date.kind === 'not-set') return { refused: BUSINESS_DATE_NOT_SET };
        let refusal: CommandRefusal | undefined;
        const devices = await this.pos.billingDevices(context, date.date, async (facts) => {
          const checked = await this.access.authoriseEach(
            context,
            { actorId: user.userId, action: 'view', recordType: routes.listBillingDevices.access.recordType },
            facts,
          );
          if (checked.kind === 'refused') {
            refusal = checked.refusal;
            return undefined;
          }
          return checked.each.map((each) => each.kind === 'allowed');
        });
        if (devices === undefined) return { refused: refusal ?? BUSINESS_DATE_NOT_SET };
        return { asOf: context.startedAt.toISOString(), devices };
      },
    );
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    return answer;
  }

  @ApiRoute(routes.registerBillingDevice)
  registerBillingDevice(
    @RouteInput() input: RouteInputOf<typeof routes.registerBillingDevice>,
    @SignedIn() user: SignedInUser,
  ) {
    const { storeId } = input.body;
    return this.command(
      routes.registerBillingDevice,
      'pos.register-billing-device',
      user,
      input,
      (c, date) => this.pos.storeFacts(c, storeId, date),
      {
        kind: 'not-found',
        code: 'pos.store-not-found',
        missing: [{ kind: 'record', recordType: 'organisation.store', recordId: storeId }],
      },
      (c, actor, facts, date) => this.pos.registerBillingDevice(c, actor, facts, input.body, date),
    );
  }

  @ApiRoute(routes.enrolBillingDevice)
  enrolBillingDevice(
    @RouteInput() input: RouteInputOf<typeof routes.enrolBillingDevice>,
    @SignedIn() user: SignedInUser,
  ) {
    const { deviceId } = input.params;
    return this.command(
      routes.enrolBillingDevice,
      'pos.enrol-billing-device',
      user,
      input,
      (c, date) => this.pos.deviceFacts(c, deviceId, date),
      {
        kind: 'not-found',
        code: 'access.device-not-found',
        missing: [{ kind: 'record', recordType: 'pos.billing_device', recordId: deviceId }],
      },
      (c, actor, facts, date) => this.pos.enrolBillingDevice(c, actor, facts, deviceId, input.body, date),
    );
  }

  @ApiRoute(routes.revokeBillingDevice)
  revokeBillingDevice(
    @RouteInput() input: RouteInputOf<typeof routes.revokeBillingDevice>,
    @SignedIn() user: SignedInUser,
  ) {
    const { deviceId } = input.params;
    return this.command(
      routes.revokeBillingDevice,
      'pos.revoke-billing-device',
      user,
      input,
      (c, date) => this.pos.deviceFacts(c, deviceId, date),
      deviceNotFound(deviceId),
      (c, actor, facts) => this.pos.endBillingDevice(c, actor, facts, deviceId, 'revoke'),
    );
  }

  @ApiRoute(routes.retireBillingDevice)
  retireBillingDevice(
    @RouteInput() input: RouteInputOf<typeof routes.retireBillingDevice>,
    @SignedIn() user: SignedInUser,
  ) {
    const { deviceId } = input.params;
    return this.command(
      routes.retireBillingDevice,
      'pos.retire-billing-device',
      user,
      input,
      (c, date) => this.pos.deviceFacts(c, deviceId, date),
      deviceNotFound(deviceId),
      (c, actor, facts) => this.pos.endBillingDevice(c, actor, facts, deviceId, 'retire'),
    );
  }

  /**
   * A replacement registers a device, so the route authorises create; it also ends the old one, so the person must hold
   * edit on it too, with the same Store's facts (offline-counter 3.5). Both are authorised before any lock and both
   * assignments held at step 0 (code-house-rules 8.2 "Authority first"; access-and-approvals 7.1 steps 3 and 4).
   */
  @ApiRoute(routes.replaceBillingDevice)
  replaceBillingDevice(
    @RouteInput() input: RouteInputOf<typeof routes.replaceBillingDevice>,
    @SignedIn() user: SignedInUser,
  ) {
    const { deviceId } = input.params;
    return this.command(
      routes.replaceBillingDevice,
      'pos.replace-billing-device',
      user,
      input,
      (c, date) => this.pos.deviceFacts(c, deviceId, date),
      deviceNotFound(deviceId),
      (c, actor, facts, date) => this.pos.replaceBillingDevice(c, actor, facts, deviceId, input.body, date),
      ['edit'],
    );
  }

  @ApiRoute(routes.changeBillingDeviceUnits)
  changeBillingDeviceUnits(
    @RouteInput() input: RouteInputOf<typeof routes.changeBillingDeviceUnits>,
    @SignedIn() user: SignedInUser,
  ) {
    const { deviceId } = input.params;
    return this.command(
      routes.changeBillingDeviceUnits,
      'pos.change-billing-device-units',
      user,
      input,
      (c, date) => this.pos.deviceFacts(c, deviceId, date),
      deviceNotFound(deviceId),
      (c, actor, facts, date) => this.pos.changeBillingDeviceUnits(c, actor, facts, deviceId, input.body, date),
    );
  }

  /**
   * Authorise in the transaction with the record's facts (5.3): the route's action and each further action the command
   * needs on the same record type, all before any lock (7.1 step 3); a record that does not exist is not found.
   */
  private async authoriseIn(
    context: TransactionContext,
    user: SignedInUser,
    route: CommandRoute & { access: { kind: 'action' } },
    factsOf: FactsOf,
    notFound: CommandRefusal,
    further: readonly PermissionAction[],
  ): Promise<
    | {
        readonly kind: 'allowed';
        readonly roleAssignmentId: string;
        readonly facts: RecordFacts;
        readonly date: string;
        readonly further: readonly HeldNeed[];
      }
    | { readonly kind: 'refused'; readonly refusal: CommandRefusal }
  > {
    const date = await context.businessDate();
    if (date.kind === 'not-set') return { kind: 'refused', refusal: BUSINESS_DATE_NOT_SET };
    const facts = await factsOf(context, date.date);
    if (facts === undefined) return { kind: 'refused', refusal: notFound };
    const { action, recordType } = route.access;
    const authorised = await this.access.authorise(context, { actorId: user.userId, action, recordType, facts });
    if (authorised.kind === 'refused') return authorised;
    const held: HeldNeed[] = [];
    for (const each of further) {
      const also = await this.access.authorise(context, { actorId: user.userId, action: each, recordType, facts });
      if (also.kind === 'refused') return also;
      held.push({ roleAssignmentId: also.roleAssignmentId, need: { action: each, recordType, facts } });
    }
    return { kind: 'allowed', roleAssignmentId: authorised.roleAssignmentId, facts, date: date.date, further: held };
  }

  private async command<R extends CommandRoute & { access: { kind: 'action' } }>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    factsOf: FactsOf,
    notFound: CommandRefusal,
    work: (
      context: TransactionContext,
      actor: Actor,
      facts: RecordFacts,
      date: string,
    ) => Promise<Outcome<JsonValue> & { readonly causedBySecret?: boolean }>,
    /** Further actions the command needs on the same record, besides the route's (offline-counter 3.5). */
    further: readonly PermissionAction[] = [],
  ) {
    const authoriseReplay: ReplayAuthorisation = async (context) => {
      const authorised = await this.authoriseIn(context, user, route, factsOf, notFound, further);
      if (authorised.kind === 'allowed') return { kind: 'allowed' };
      return {
        kind: 'refused',
        refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
      };
    };
    const answer = await this.helper.run(
      {
        commandName,
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      {
        key: input.idempotencyKey,
        content: requestContentOf(route, input),
        authoriseReplay,
        work: async (context): Promise<CommandOutcome<JsonValue>> => {
          // Authorise with the Store's facts, before any lock (7.1 step 3).
          const authorised = await this.authoriseIn(context, user, route, factsOf, notFound, further);
          if (authorised.kind === 'refused') {
            return { kind: 'refusal', refusal: authorised.refusal, causedBySecret: false };
          }
          // Step 0: the actor and every assignment relied on, rechecked under the locks with the same facts (8.2; 7.1
          // step 4).
          const { action, recordType } = route.access;
          const held = await this.access.holdAuthority(
            context,
            { kind: 'user', id: user.userId },
            authorised.roleAssignmentId,
            { action, recordType, facts: authorised.facts },
            [],
            authorised.further,
          );
          if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
          const outcome = await work(
            context,
            { userId: user.userId, roleAssignmentId: authorised.roleAssignmentId, networkAddress: user.networkAddress },
            authorised.facts,
            authorised.date,
          );
          if (outcome.kind === 'success') return { kind: 'success', answer: outcome.answer, shows: 'nothing' };
          return { kind: 'refusal', refusal: outcome.refusal, causedBySecret: outcome.causedBySecret ?? false };
        },
      },
    );
    return commandAnswer(answer);
  }
}
