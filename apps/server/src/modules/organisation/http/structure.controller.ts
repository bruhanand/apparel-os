import { routes, type CommandRoute, type MasterLists } from '@apparel-os/schemas';
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
  type CommandRunner,
  type IdempotencyHelper,
  type JsonValue,
  type ReplayAuthorisation,
  type RequestContent,
  type RouteInputOf,
  type TransactionContext,
} from '../../../kernel/index.js';
import { ACCESS, SignedIn, type AccessInterface, type SignedInUser } from '../../access/index.js';
import type { Prepared, PreparedVersion, Preparer } from '../commands/changes.js';
import { masterKinds, recordTypeOf, type MasterKind } from '../domain/kinds.js';
import type { MasterList, OrganisationInterface } from '../organisation.js';
import { ORGANISATION } from '../tokens.js';

/**
 * The routes of the organisation structure (structure-and-masters 2.3, 3.8, 8; module-map 4.11; code-house-rules
 * 12.1): each master's list with its version history, preparing a new master or a new version, and the master lists
 * read model. Authenticate and Authorise ran in the guard on the route's action and type, which carries no scope fact
 * (access-and-approvals 5.3, 7.1); each command runs under its idempotency key, holds its preparer's authority at step
 * 0, and a replay is answered only while the same Authorise still passes (12.4, CH-14). No rule of its own.
 */
@Controller()
export class StructureController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(ORGANISATION) private readonly organisation: OrganisationInterface,
  ) {}

  // The lists (structure-and-masters 8).

  @ApiRoute(routes.listCountries)
  listCountries(@SignedIn() user: SignedInUser) {
    return this.list(user, 'country');
  }

  @ApiRoute(routes.listStates)
  listStates(@SignedIn() user: SignedInUser) {
    return this.list(user, 'state');
  }

  @ApiRoute(routes.listCities)
  listCities(@SignedIn() user: SignedInUser) {
    return this.list(user, 'city');
  }

  @ApiRoute(routes.listAreas)
  listAreas(@SignedIn() user: SignedInUser) {
    return this.list(user, 'area');
  }

  @ApiRoute(routes.listLegalEntities)
  listLegalEntities(@SignedIn() user: SignedInUser) {
    return this.list(user, 'legal_entity');
  }

  @ApiRoute(routes.listTaxRegistrations)
  listTaxRegistrations(@SignedIn() user: SignedInUser) {
    return this.list(user, 'tax_registration');
  }

  @ApiRoute(routes.listAccountingBooks)
  listAccountingBooks(@SignedIn() user: SignedInUser) {
    return this.list(user, 'accounting_book');
  }

  @ApiRoute(routes.listSites)
  listSites(@SignedIn() user: SignedInUser) {
    return this.list(user, 'site');
  }

  @ApiRoute(routes.listStores)
  listStores(@SignedIn() user: SignedInUser) {
    return this.list(user, 'store');
  }

  @ApiRoute(routes.listGroupings)
  listGroupings(@SignedIn() user: SignedInUser) {
    return this.list(user, 'grouping');
  }

  // New masters (structure-and-masters 2.3, 3.1).

  @ApiRoute(routes.prepareCountry)
  prepareCountry(@RouteInput() input: RouteInputOf<typeof routes.prepareCountry>, @SignedIn() user: SignedInUser) {
    return this.prepare(routes.prepareCountry, 'organisation.prepare-country', user, input, (c, p) =>
      this.organisation.prepareCountry(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareState)
  prepareState(@RouteInput() input: RouteInputOf<typeof routes.prepareState>, @SignedIn() user: SignedInUser) {
    return this.prepare(routes.prepareState, 'organisation.prepare-state', user, input, (c, p) =>
      this.organisation.prepareState(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareCity)
  prepareCity(@RouteInput() input: RouteInputOf<typeof routes.prepareCity>, @SignedIn() user: SignedInUser) {
    return this.prepare(routes.prepareCity, 'organisation.prepare-city', user, input, (c, p) =>
      this.organisation.prepareCity(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareArea)
  prepareArea(@RouteInput() input: RouteInputOf<typeof routes.prepareArea>, @SignedIn() user: SignedInUser) {
    return this.prepare(routes.prepareArea, 'organisation.prepare-area', user, input, (c, p) =>
      this.organisation.prepareArea(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareLegalEntity)
  prepareLegalEntity(
    @RouteInput() input: RouteInputOf<typeof routes.prepareLegalEntity>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareLegalEntity, 'organisation.prepare-legal-entity', user, input, (c, p) =>
      this.organisation.prepareLegalEntity(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareTaxRegistration)
  prepareTaxRegistration(
    @RouteInput() input: RouteInputOf<typeof routes.prepareTaxRegistration>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareTaxRegistration, 'organisation.prepare-tax-registration', user, input, (c, p) =>
      this.organisation.prepareTaxRegistration(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareAccountingBook)
  prepareAccountingBook(
    @RouteInput() input: RouteInputOf<typeof routes.prepareAccountingBook>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareAccountingBook, 'organisation.prepare-accounting-book', user, input, (c, p) =>
      this.organisation.prepareAccountingBook(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareSite)
  prepareSite(@RouteInput() input: RouteInputOf<typeof routes.prepareSite>, @SignedIn() user: SignedInUser) {
    return this.prepare(routes.prepareSite, 'organisation.prepare-site', user, input, (c, p) =>
      this.organisation.prepareSite(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareStore)
  prepareStore(@RouteInput() input: RouteInputOf<typeof routes.prepareStore>, @SignedIn() user: SignedInUser) {
    return this.prepare(routes.prepareStore, 'organisation.prepare-store', user, input, (c, p) =>
      this.organisation.prepareStore(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareGrouping)
  prepareGrouping(@RouteInput() input: RouteInputOf<typeof routes.prepareGrouping>, @SignedIn() user: SignedInUser) {
    return this.prepare(routes.prepareGrouping, 'organisation.prepare-grouping', user, input, (c, p) =>
      this.organisation.prepareGrouping(c, p, input.body),
    );
  }

  // New versions (structure-and-masters 2.2).

  @ApiRoute(routes.prepareCountryVersion)
  prepareCountryVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareCountryVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareCountryVersion, 'organisation.prepare-country-version', user, input, (c, p) =>
      this.organisation.prepareNameVersion(c, p, 'country', input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareStateVersion)
  prepareStateVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareStateVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareStateVersion, 'organisation.prepare-state-version', user, input, (c, p) =>
      this.organisation.prepareNameVersion(c, p, 'state', input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareCityVersion)
  prepareCityVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareCityVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareCityVersion, 'organisation.prepare-city-version', user, input, (c, p) =>
      this.organisation.prepareNameVersion(c, p, 'city', input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareAreaVersion)
  prepareAreaVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareAreaVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareAreaVersion, 'organisation.prepare-area-version', user, input, (c, p) =>
      this.organisation.prepareNameVersion(c, p, 'area', input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareLegalEntityVersion)
  prepareLegalEntityVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareLegalEntityVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareLegalEntityVersion,
      'organisation.prepare-legal-entity-version',
      user,
      input,
      (c, p) => this.organisation.prepareLegalEntityVersion(c, p, input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareTaxRegistrationVersion)
  prepareTaxRegistrationVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareTaxRegistrationVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareTaxRegistrationVersion,
      'organisation.prepare-tax-registration-version',
      user,
      input,
      (c, p) => this.organisation.prepareTaxRegistrationVersion(c, p, input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareAccountingBookVersion)
  prepareAccountingBookVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareAccountingBookVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareAccountingBookVersion,
      'organisation.prepare-accounting-book-version',
      user,
      input,
      (c, p) => this.organisation.prepareNameVersion(c, p, 'accounting_book', input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareSiteVersion)
  prepareSiteVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareSiteVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareSiteVersion, 'organisation.prepare-site-version', user, input, (c, p) =>
      this.organisation.prepareSiteVersion(c, p, input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareStoreVersion)
  prepareStoreVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareStoreVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareStoreVersion, 'organisation.prepare-store-version', user, input, (c, p) =>
      this.organisation.prepareStoreVersion(c, p, input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareGroupingVersion)
  prepareGroupingVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareGroupingVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareGroupingVersion, 'organisation.prepare-grouping-version', user, input, (c, p) =>
      this.organisation.prepareGroupingVersion(c, p, input.params.recordId, input.body),
    );
  }

  /**
   * The master lists (module-map 4.11; phases.md stage 1 reports): each master's version in force on the date, read
   * under the reader's own authorisation (module-map section 3, rule 5): a list whose type the reader may not view is
   * left out and named (PRD-UXP-003).
   */
  @ApiRoute(routes.readMasterLists)
  async readMasterLists(
    @RouteInput() input: RouteInputOf<typeof routes.readMasterLists>,
    @SignedIn() user: SignedInUser,
  ): Promise<MasterLists> {
    const date = input.query.date;
    return this.read(user, 'organisation.read-master-lists', async (context, today) => {
      const structure = await this.organisation.structureOn(context, today, date);
      const notShown: string[] = [];
      for (const kind of masterKinds) {
        const authorised = await this.access.authorise(context, {
          actorId: user.userId,
          action: 'view',
          recordType: recordTypeOf(kind),
        });
        if (authorised.kind !== 'allowed') notShown.push(recordTypeOf(kind));
      }
      const shown = <T>(kind: MasterKind, list: T[]): T[] => (notShown.includes(recordTypeOf(kind)) ? [] : list);
      return {
        date,
        asOf: context.startedAt.toISOString(),
        notShown,
        countries: shown('country', structure.countries),
        states: shown('state', structure.states),
        cities: shown('city', structure.cities),
        areas: shown('area', structure.areas),
        legalEntities: shown('legal_entity', structure.legalEntities),
        taxRegistrations: shown('tax_registration', structure.taxRegistrations),
        accountingBooks: shown('accounting_book', structure.accountingBooks),
        sites: shown('site', structure.sites),
        stores: shown('store', structure.stores),
        groupings: shown('grouping', structure.groupings),
      };
    });
  }

  private list<K extends MasterKind>(user: SignedInUser, kind: K) {
    return this.read(user, `organisation.list-${kind.replaceAll('_', '-')}`, async (context, today) => ({
      asOf: context.startedAt.toISOString(),
      ...(await this.organisation.list(context, kind, today)),
    })) as Promise<MasterList<K> & { asOf: string }>;
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

  private async prepare<R extends CommandRoute & { access: { kind: 'action' } }>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    work: (context: TransactionContext, preparer: Preparer) => Promise<Prepared<PreparedVersion>>,
  ) {
    if (user.roleAssignmentId === undefined) {
      throw new CommandDefect(`Route ${route.path} prepares a structure change without Authorise`);
    }
    const key: string = input.idempotencyKey;
    const content: RequestContent = requestContentOf(route, input);
    const need = { actorId: user.userId, action: route.access.action, recordType: route.access.recordType };
    const preparer: Preparer = { userId: user.userId, roleAssignmentId: user.roleAssignmentId };
    const authoriseReplay: ReplayAuthorisation = async (context) => {
      const authorised = await this.access.authorise(context, need);
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
        key,
        content,
        authoriseReplay,
        work: async (context): Promise<CommandOutcome<JsonValue>> => {
          // Step 0: the preparer and the assignment the guard's Authorise found, rechecked under the locks
          // (code-house-rules 8.2 "Authority first"; access-and-approvals 7.1 step 4).
          const held = await this.access.holdAuthority(
            context,
            { kind: 'user', id: user.userId },
            preparer.roleAssignmentId,
            { action: need.action, recordType: need.recordType },
          );
          if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
          const outcome = await work(context, preparer);
          if (outcome.kind === 'success') return { kind: 'success', answer: { ...outcome.answer }, shows: 'nothing' };
          return { kind: 'refusal', refusal: outcome.refusal, causedBySecret: false };
        },
      },
    );
    return commandAnswer(answer);
  }
}
