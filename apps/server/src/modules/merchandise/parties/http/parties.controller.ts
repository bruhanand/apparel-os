import {
  AGREEMENT_TYPE,
  BANK_DETAILS_TYPE,
  routes,
  type CommandRoute,
  type FieldClass,
  type MasterPageQuery,
  type MissingItem,
  type PartyChanged,
  type PermissionAction,
} from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRefusal,
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
  type ReplayAuthorisation,
  type RouteInputOf,
  type TransactionContext,
} from '../../../../kernel/index.js';
import {
  ACCESS,
  SignedIn,
  takeFreshCode,
  type AccessInterface,
  type Preparer,
  type SignedInUser,
} from '../../../access/index.js';
import { AUDIT, type AuditInterface } from '../../../audit/index.js';
import type { Outcome } from '../commands/lines.js';
import type { PartiesInterface } from '../parties.js';
import { PARTIES } from '../tokens.js';

type Use = 'view' | 'edit';

interface CommandOptions {
  /** The restricted field classes the command reads or writes: the one assignment must grant them too (6). */
  readonly fieldClasses?: readonly { readonly fieldClass: FieldClass; readonly use: Use }[];
  /** The fresh authenticator code of a protected action (access-and-approvals 3.3; PRD-SEC-001). */
  readonly totpCode?: string;
}

/**
 * The routes of the parties part (structure-and-masters 5.5, 8; module-map 4.12; code-house-rules 12.1; S1-F03-T03).
 * Authenticate and Authorise ran in the guard, on the route's action and type: the parties' types carry no scope fact
 * (access-and-approvals 5.3). A command that reads or writes a restricted field class authorises again in its
 * command, so one assignment grants both the action and the class (6; PRD-ACS-004). Each command runs under its
 * idempotency key, holds its authority at step 0, and a replay is answered only while the same Authorise still passes
 * (12.4, CH-14). Showing bank details is a protected action with a fresh code and an access record, and its answer is
 * never repeated (3.3; numbering-and-audit 5.1; DEC-114).
 */
@Controller()
export class PartiesController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(AUDIT) private readonly audit: AuditInterface,
    @Inject(PARTIES) private readonly parties: PartiesInterface,
  ) {}

  // Parties (5.1).
  @ApiRoute(routes.listParties)
  listParties(@RouteInput() input: RouteInputOf<typeof routes.listParties>, @SignedIn() user: SignedInUser) {
    const page = pageOf(input.query);
    return this.read(user, 'merchandise.list-parties', async (context, today) => {
      const found = await this.parties.listParties(context, today, page);
      return { asOf: context.startedAt.toISOString(), records: found.records, next: found.next };
    });
  }

  @ApiRoute(routes.readParty)
  async readParty(@RouteInput() input: RouteInputOf<typeof routes.readParty>, @SignedIn() user: SignedInUser) {
    const partyId = input.params.partyId;
    const answer = await this.read(user, 'merchandise.read-party', async (context, today) => ({
      asOf: context.startedAt.toISOString(),
      record: await this.parties.readParty(context, partyId, today),
    }));
    if (answer.record === undefined) throw notFound('merchandise.party', partyId);
    return { asOf: answer.asOf, record: answer.record };
  }

  @ApiRoute(routes.prepareParty)
  prepareParty(@RouteInput() input: RouteInputOf<typeof routes.prepareParty>, @SignedIn() user: SignedInUser) {
    return this.command(routes.prepareParty, 'merchandise.record-party', user, input, (c, p) =>
      this.parties.prepareParty(c, p, input.body),
    );
  }

  @ApiRoute(routes.preparePartyVersion)
  preparePartyVersion(
    @RouteInput() input: RouteInputOf<typeof routes.preparePartyVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.preparePartyVersion, 'merchandise.record-party-version', user, input, (c, p) =>
      this.parties.preparePartyVersion(c, p, input.params.partyId, input.body),
    );
  }

  @ApiRoute(routes.preparePartyRoleVersion)
  preparePartyRoleVersion(
    @RouteInput() input: RouteInputOf<typeof routes.preparePartyRoleVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.preparePartyRoleVersion, 'merchandise.record-party-role-version', user, input, (c, p) =>
      this.parties.preparePartyRoleVersion(c, p, input.params.partyId, input.body),
    );
  }

  /** Change bank details (5.1): a protected action that writes the class bank-details (3.3, 6; PRD-ACS-008). */
  @ApiRoute(routes.prepareBankDetails)
  prepareBankDetails(
    @RouteInput() input: RouteInputOf<typeof routes.prepareBankDetails>,
    @SignedIn() user: SignedInUser,
  ) {
    const { totpCode, ...draft } = input.body;
    return this.command(
      routes.prepareBankDetails,
      'merchandise.prepare-party-bank-details-version',
      user,
      input,
      (c, p) => this.parties.prepareBankDetails(c, p, input.params.partyId, draft),
      { fieldClasses: [{ fieldClass: 'bank-details', use: 'edit' }], totpCode },
    );
  }

  /**
   * Show one bank-detail version unmasked (5.5; access-and-approvals 3.3, 6): only through an assignment granting view
   * and the class bank-details, after a fresh code, with a sensitive-access record written in the same transaction
   * (numbering-and-audit 5.1; PRD-SEC-007). The answer is never kept, and its identical replay is refused (DEC-114).
   */
  @ApiRoute(routes.showBankDetails)
  async showBankDetails(
    @RouteInput() input: RouteInputOf<typeof routes.showBankDetails>,
    @SignedIn() user: SignedInUser,
  ) {
    const { partyId, versionId } = input.params;
    const need = {
      actorId: user.userId,
      action: 'view' as const,
      recordType: BANK_DETAILS_TYPE,
      fieldClasses: [{ fieldClass: 'bank-details' as const, use: 'view' as const }],
    };
    const authoriseReplay: ReplayAuthorisation = async (context) =>
      replayAnswer(await this.access.authorise(context, need));
    const answer = await this.helper.run(
      {
        commandName: 'merchandise.show-party-bank-details',
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      {
        key: input.idempotencyKey,
        content: requestContentOf(routes.showBankDetails, input),
        authoriseReplay,
        work: async (context): Promise<CommandOutcome<JsonValue>> => {
          const held = await this.authority(context, user, need.action, need.recordType, need.fieldClasses);
          if ('refusal' in held) return { kind: 'refusal', refusal: held.refusal, causedBySecret: false };
          const code = await takeFreshCode(await this.access.checkFreshCode(context, user.userId, input.body.totpCode));
          if (code !== undefined) return { kind: 'refusal', ...code };
          const values = await this.parties.openBankDetails(context, partyId, versionId);
          if (values === undefined) {
            return {
              kind: 'refusal',
              refusal: {
                kind: 'not-found',
                code: 'merchandise.bank-details-not-found',
                missing: [{ kind: 'version', recordType: BANK_DETAILS_TYPE, recordId: partyId, versionId }],
              },
              causedBySecret: false,
            };
          }
          await this.audit.recordAccess(context, {
            kind: 'sensitive-access',
            outcome: 'succeeded',
            userId: user.userId,
            networkAddress: user.networkAddress,
            scope: {},
            record: { module: 'merchandise', type: 'party_bank_details', id: partyId, versionId },
            fieldClass: 'bank-details',
            exposure: 'shown',
          });
          return { kind: 'success', answer: { partyId, versionId, ...values }, shows: 'restricted-value' };
        },
      },
    );
    return commandAnswer(answer);
  }

  // Brand–supplier links (5.1; PRD-MER-021).
  @ApiRoute(routes.listBrandSupplierLinks)
  listBrandSupplierLinks(
    @RouteInput() input: RouteInputOf<typeof routes.listBrandSupplierLinks>,
    @SignedIn() user: SignedInUser,
  ) {
    const page = pageOf(input.query);
    return this.read(user, 'merchandise.list-brand-supplier-links', async (context, today) => {
      const found = await this.parties.listBrandSupplierLinks(context, today, page);
      return { asOf: context.startedAt.toISOString(), records: found.records, next: found.next };
    });
  }

  @ApiRoute(routes.prepareBrandSupplierLink)
  prepareBrandSupplierLink(
    @RouteInput() input: RouteInputOf<typeof routes.prepareBrandSupplierLink>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(
      routes.prepareBrandSupplierLink,
      'merchandise.record-brand-supplier-link-version',
      user,
      input,
      (c, p) => this.parties.prepareBrandSupplierLink(c, p, input.body),
    );
  }

  // Agreements (5.2).
  @ApiRoute(routes.listAgreements)
  listAgreements(@RouteInput() input: RouteInputOf<typeof routes.listAgreements>, @SignedIn() user: SignedInUser) {
    const page = pageOf(input.query);
    return this.read(user, 'merchandise.list-agreements', async (context, today) => {
      const found = await this.parties.listAgreements(context, today, await this.marginsShown(context, user), page);
      return { asOf: context.startedAt.toISOString(), records: found.records, next: found.next };
    });
  }

  @ApiRoute(routes.readAgreement)
  async readAgreement(@RouteInput() input: RouteInputOf<typeof routes.readAgreement>, @SignedIn() user: SignedInUser) {
    const agreementId = input.params.agreementId;
    const answer = await this.read(user, 'merchandise.read-agreement', async (context, today) => ({
      asOf: context.startedAt.toISOString(),
      record: await this.parties.readAgreement(context, agreementId, today, await this.marginsShown(context, user)),
    }));
    if (answer.record === undefined) throw notFound(AGREEMENT_TYPE, agreementId);
    return { asOf: answer.asOf, record: answer.record };
  }

  @ApiRoute(routes.readTermsInForce)
  async readTermsInForce(
    @RouteInput() input: RouteInputOf<typeof routes.readTermsInForce>,
    @SignedIn() user: SignedInUser,
  ) {
    const { brandId, partyId, date } = input.query;
    const answer = await this.read(user, 'merchandise.read-terms-in-force', async (context) => ({
      asOf: context.startedAt.toISOString(),
      terms: await this.parties.termsInForce(
        context,
        { brandId, partyId },
        date,
        await this.marginsShown(context, user),
      ),
    }));
    if (answer.terms === undefined) {
      const missing: MissingItem[] = [
        brandId === undefined
          ? { kind: 'record', recordType: 'merchandise.party', recordId: partyId ?? '' }
          : { kind: 'record', recordType: 'merchandise.brand', recordId: brandId },
      ];
      throw new ApiRefusal({ kind: 'not-found', code: 'merchandise.no-terms-in-force', missing });
    }
    return { asOf: answer.asOf, ...answer.terms };
  }

  @ApiRoute(routes.prepareAgreement)
  prepareAgreement(@RouteInput() input: RouteInputOf<typeof routes.prepareAgreement>, @SignedIn() user: SignedInUser) {
    return this.command(
      routes.prepareAgreement,
      'merchandise.prepare-agreement',
      user,
      input,
      (c, p) => this.parties.prepareAgreement(c, p, input.body),
      input.body.margins === null ? {} : { fieldClasses: [{ fieldClass: 'margin', use: 'edit' }] },
    );
  }

  @ApiRoute(routes.prepareAgreementVersion)
  prepareAgreementVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareAgreementVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(
      routes.prepareAgreementVersion,
      'merchandise.prepare-agreement-version',
      user,
      input,
      (c, p) => this.parties.prepareAgreementVersion(c, p, input.params.agreementId, input.body),
      input.body.margins === null ? {} : { fieldClasses: [{ fieldClass: 'margin', use: 'edit' }] },
    );
  }

  /** Whether the reader's one assignment granting view on agreements grants margin too (6; PRD-ACS-004, PRD-ACS-008). */
  private async marginsShown(context: TransactionContext, user: SignedInUser): Promise<boolean> {
    const authorised = await this.access.authorise(context, {
      actorId: user.userId,
      action: 'view',
      recordType: AGREEMENT_TYPE,
      fieldClasses: [{ fieldClass: 'margin', use: 'view' }],
    });
    return authorised.kind === 'allowed';
  }

  /**
   * Step 0 (code-house-rules 8.2): Authorise again with the field classes, so one assignment grants the action and
   * every class (access-and-approvals 6), then hold that assignment, rechecked under the locks.
   */
  private async authority(
    context: TransactionContext,
    user: SignedInUser,
    action: PermissionAction,
    recordType: string,
    fieldClasses: CommandOptions['fieldClasses'],
  ): Promise<{ readonly roleAssignmentId: string } | { readonly refusal: CommandRefusal }> {
    let roleAssignmentId = user.roleAssignmentId;
    if (fieldClasses !== undefined && fieldClasses.length > 0) {
      const authorised = await this.access.authorise(context, {
        actorId: user.userId,
        action,
        recordType,
        fieldClasses,
      });
      if (authorised.kind === 'refused') return { refusal: authorised.refusal };
      roleAssignmentId = authorised.roleAssignmentId;
    }
    if (roleAssignmentId === undefined) throw new CommandDefect('A parties command ran without Authorise');
    const held = await this.access.holdAuthority(context, { kind: 'user', id: user.userId }, roleAssignmentId, {
      action,
      recordType,
      ...(fieldClasses === undefined ? {} : { fieldClasses }),
    });
    return held === undefined ? { roleAssignmentId } : { refusal: held };
  }

  private async read<Answer>(
    user: SignedInUser,
    commandName: string,
    work: (context: TransactionContext, today: string) => Promise<Answer>,
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
        return date.kind === 'not-set' ? undefined : { read: await work(context, date.date) };
      },
    );
    if (answer === undefined) {
      throw new ApiRefusal({
        kind: 'unavailable',
        code: 'access.business-date-not-set',
        missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
      });
    }
    return answer.read;
  }

  private async command<R extends CommandRoute & { access: { kind: 'action' } }>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    work: (context: TransactionContext, preparer: Preparer) => Promise<Outcome<PartyChanged>>,
    options: CommandOptions = {},
  ) {
    const { action, recordType } = route.access;
    const need = {
      actorId: user.userId,
      action,
      recordType,
      ...(options.fieldClasses === undefined ? {} : { fieldClasses: options.fieldClasses }),
    };
    const authoriseReplay: ReplayAuthorisation = async (context) =>
      replayAnswer(await this.access.authorise(context, need));
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
          const held = await this.authority(context, user, action, recordType, options.fieldClasses);
          if ('refusal' in held) return { kind: 'refusal', refusal: held.refusal, causedBySecret: false };
          if (options.totpCode !== undefined) {
            // A protected action: the code is checked and taken here, never kept (3.3; code-house-rules 12.5).
            const code = await takeFreshCode(await this.access.checkFreshCode(context, user.userId, options.totpCode));
            if (code !== undefined) return { kind: 'refusal', ...code };
          }
          const outcome = await work(context, { userId: user.userId, roleAssignmentId: held.roleAssignmentId });
          if (outcome.kind === 'success') {
            return { kind: 'success', answer: { ...outcome.answer } as Record<string, JsonValue>, shows: 'nothing' };
          }
          return { kind: 'refusal', refusal: outcome.refusal, causedBySecret: false };
        },
      },
    );
    return commandAnswer(answer);
  }
}

function pageOf(query: MasterPageQuery) {
  return { after: query.after, limit: query.limit === undefined ? undefined : Number(query.limit) };
}

function notFound(recordType: string, recordId: string): ApiRefusal {
  return new ApiRefusal({
    kind: 'not-found',
    code: 'merchandise.record-not-found',
    missing: [{ kind: 'record', recordType, recordId }],
  });
}

function replayAnswer(
  authorised: Awaited<ReturnType<AccessInterface['authorise']>>,
): Awaited<ReturnType<ReplayAuthorisation>> {
  if (authorised.kind === 'allowed') return { kind: 'allowed' };
  return {
    kind: 'refused',
    refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
  };
}
