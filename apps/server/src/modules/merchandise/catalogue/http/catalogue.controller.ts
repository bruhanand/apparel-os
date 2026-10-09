import {
  routes,
  type CatalogueChanged,
  type CatalogueKind,
  type CodeMapped,
  type ProductProposed,
  type CommandRoute,
  type VocabularyProposed,
  type MasterPageQuery,
  type MissingItem,
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
import { ACCESS, SignedIn, type AccessInterface, type SignedInUser } from '../../../access/index.js';
import type { Preparer } from '../../../organisation/index.js';
import type { CatalogueInterface } from '../catalogue.js';
import { recordTypeOf } from '../domain/kinds.js';
import { CATALOGUE } from '../tokens.js';

type Outcome =
  | { readonly kind: 'success'; readonly answer: CatalogueChanged | VocabularyProposed | ProductProposed | CodeMapped }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

/**
 * The routes of the merchandise catalogue (structure-and-masters 4.7, 8; module-map 4.12; code-house-rules 12.1;
 * S1-F03-T01): each master's records with their version history, a page at a time or one record; a new record or a
 * new version; and vocabulary proposals, proposed here and confirmed or rejected through the approval panel
 * (decideApproval). Authenticate and Authorise ran in the guard, on the route's action and type: the catalogue's
 * types carry no scope fact (access-and-approvals 5.3). Each command runs under its idempotency key, holds its
 * preparer's authority at step 0, and a replay is answered only while the same Authorise still passes (12.4, CH-14).
 */
@Controller()
export class CatalogueController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(CATALOGUE) private readonly catalogue: CatalogueInterface,
  ) {}

  // Brands (4.1).
  @ApiRoute(routes.listBrands)
  listBrands(@RouteInput() input: RouteInputOf<typeof routes.listBrands>, @SignedIn() user: SignedInUser) {
    return this.list(user, 'brand', input.query);
  }

  @ApiRoute(routes.readBrand)
  readBrand(@RouteInput() input: RouteInputOf<typeof routes.readBrand>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'brand', input.params.recordId);
  }

  @ApiRoute(routes.prepareBrand)
  prepareBrand(@RouteInput() input: RouteInputOf<typeof routes.prepareBrand>, @SignedIn() user: SignedInUser) {
    return this.command(routes.prepareBrand, 'merchandise.record-brand', user, input, (c, p) =>
      this.catalogue.prepareBrand(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareBrandVersion)
  prepareBrandVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareBrandVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.prepareBrandVersion, 'merchandise.record-brand-version', user, input, (c, p) =>
      this.catalogue.prepareBrandVersion(c, p, input.params.recordId, input.body),
    );
  }

  // A business unit's brand coverage (3.3).
  @ApiRoute(routes.listBusinessUnitBrands)
  listBusinessUnitBrands(
    @RouteInput() input: RouteInputOf<typeof routes.listBusinessUnitBrands>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.list(user, 'business_unit_brand', input.query);
  }

  @ApiRoute(routes.readBusinessUnitBrand)
  readBusinessUnitBrand(
    @RouteInput() input: RouteInputOf<typeof routes.readBusinessUnitBrand>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.one(user, 'business_unit_brand', input.params.recordId);
  }

  @ApiRoute(routes.prepareBusinessUnitBrandVersion)
  prepareBusinessUnitBrandVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareBusinessUnitBrandVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(
      routes.prepareBusinessUnitBrandVersion,
      'merchandise.prepare-business-unit-brand-version',
      user,
      input,
      (c, p) => this.catalogue.prepareBusinessUnitBrandVersion(c, p, input.params.recordId, input.body),
    );
  }

  // Categories and size sets (4.1).
  @ApiRoute(routes.listCategories)
  listCategories(@RouteInput() input: RouteInputOf<typeof routes.listCategories>, @SignedIn() user: SignedInUser) {
    return this.list(user, 'category', input.query);
  }

  @ApiRoute(routes.readCategory)
  readCategory(@RouteInput() input: RouteInputOf<typeof routes.readCategory>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'category', input.params.recordId);
  }

  @ApiRoute(routes.prepareCategory)
  prepareCategory(@RouteInput() input: RouteInputOf<typeof routes.prepareCategory>, @SignedIn() user: SignedInUser) {
    return this.command(routes.prepareCategory, 'merchandise.record-category', user, input, (c, p) =>
      this.catalogue.prepareCategory(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareCategoryVersion)
  prepareCategoryVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareCategoryVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.prepareCategoryVersion, 'merchandise.record-category-version', user, input, (c, p) =>
      this.catalogue.prepareCategoryVersion(c, p, input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.listSizeSets)
  listSizeSets(@RouteInput() input: RouteInputOf<typeof routes.listSizeSets>, @SignedIn() user: SignedInUser) {
    return this.list(user, 'size_set', input.query);
  }

  @ApiRoute(routes.readSizeSet)
  readSizeSet(@RouteInput() input: RouteInputOf<typeof routes.readSizeSet>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'size_set', input.params.recordId);
  }

  @ApiRoute(routes.prepareSizeSet)
  prepareSizeSet(@RouteInput() input: RouteInputOf<typeof routes.prepareSizeSet>, @SignedIn() user: SignedInUser) {
    return this.command(routes.prepareSizeSet, 'merchandise.record-size-set', user, input, (c, p) =>
      this.catalogue.prepareSizeSet(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareSizeSetVersion)
  prepareSizeSetVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareSizeSetVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.prepareSizeSetVersion, 'merchandise.record-size-set-version', user, input, (c, p) =>
      this.catalogue.prepareSizeSetVersion(c, p, input.params.recordId, input.body),
    );
  }

  // Attributes and vocabularies (4.2).
  @ApiRoute(routes.listAttributes)
  listAttributes(@RouteInput() input: RouteInputOf<typeof routes.listAttributes>, @SignedIn() user: SignedInUser) {
    return this.list(user, 'attribute', input.query);
  }

  @ApiRoute(routes.readAttribute)
  readAttribute(@RouteInput() input: RouteInputOf<typeof routes.readAttribute>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'attribute', input.params.recordId);
  }

  @ApiRoute(routes.prepareAttribute)
  prepareAttribute(@RouteInput() input: RouteInputOf<typeof routes.prepareAttribute>, @SignedIn() user: SignedInUser) {
    return this.command(routes.prepareAttribute, 'merchandise.record-attribute', user, input, (c, p) =>
      this.catalogue.prepareAttribute(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareAttributeVersion)
  prepareAttributeVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareAttributeVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.prepareAttributeVersion, 'merchandise.record-attribute-version', user, input, (c, p) =>
      this.catalogue.prepareNameVersion(c, p, 'attribute', input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.listVocabularyValues)
  listVocabularyValues(
    @RouteInput() input: RouteInputOf<typeof routes.listVocabularyValues>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.list(user, 'vocabulary_value', input.query);
  }

  @ApiRoute(routes.readVocabularyValue)
  readVocabularyValue(
    @RouteInput() input: RouteInputOf<typeof routes.readVocabularyValue>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.one(user, 'vocabulary_value', input.params.recordId);
  }

  @ApiRoute(routes.prepareVocabularyValueVersion)
  prepareVocabularyValueVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareVocabularyValueVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(
      routes.prepareVocabularyValueVersion,
      'merchandise.record-vocabulary-value-version',
      user,
      input,
      (c, p) => this.catalogue.prepareNameVersion(c, p, 'vocabulary_value', input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.listVocabularyProposals)
  listVocabularyProposals(
    @RouteInput() input: RouteInputOf<typeof routes.listVocabularyProposals>,
    @SignedIn() user: SignedInUser,
  ) {
    const page = {
      after: input.query.after,
      limit: input.query.limit === undefined ? undefined : Number(input.query.limit),
    };
    return this.read(user, 'merchandise.list-vocabulary-proposals', async (context) => {
      const found = await this.catalogue.listProposals(context, page);
      return { asOf: context.startedAt.toISOString(), records: found.records, next: found.next };
    });
  }

  @ApiRoute(routes.readVocabularyProposal)
  async readVocabularyProposal(
    @RouteInput() input: RouteInputOf<typeof routes.readVocabularyProposal>,
    @SignedIn() user: SignedInUser,
  ) {
    const proposalId = input.params.proposalId;
    const answer = await this.read(user, 'merchandise.read-vocabulary-proposal', async (context) => ({
      asOf: context.startedAt.toISOString(),
      proposal: await this.catalogue.proposal(context, proposalId),
    }));
    if (answer.proposal === undefined) {
      throw new ApiRefusal({
        kind: 'not-found',
        code: 'merchandise.proposal-not-found',
        missing: [{ kind: 'record', recordType: 'merchandise.vocabulary_proposal', recordId: proposalId }],
      });
    }
    return { asOf: answer.asOf, proposal: answer.proposal };
  }

  @ApiRoute(routes.proposeVocabularyValue)
  proposeVocabularyValue(
    @RouteInput() input: RouteInputOf<typeof routes.proposeVocabularyValue>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.proposeVocabularyValue, 'merchandise.propose-vocabulary-value', user, input, (c, p) =>
      this.catalogue.proposeVocabularyValue(c, p, input.body),
    );
  }

  // Tracking profiles and each category's link (4.5, 4.6; S1-F03-T02).
  @ApiRoute(routes.listTrackingProfiles)
  listTrackingProfiles(
    @RouteInput() input: RouteInputOf<typeof routes.listTrackingProfiles>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.list(user, 'tracking_profile', input.query);
  }

  @ApiRoute(routes.readTrackingProfile)
  readTrackingProfile(
    @RouteInput() input: RouteInputOf<typeof routes.readTrackingProfile>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.one(user, 'tracking_profile', input.params.recordId);
  }

  @ApiRoute(routes.prepareTrackingProfile)
  prepareTrackingProfile(
    @RouteInput() input: RouteInputOf<typeof routes.prepareTrackingProfile>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.prepareTrackingProfile, 'merchandise.record-tracking-profile', user, input, (c, p) =>
      this.catalogue.prepareTrackingProfile(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareTrackingProfileVersion)
  prepareTrackingProfileVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareTrackingProfileVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(
      routes.prepareTrackingProfileVersion,
      'merchandise.record-tracking-profile-version',
      user,
      input,
      (c, p) => this.catalogue.prepareTrackingProfileVersion(c, p, input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.listCategoryTrackingProfiles)
  listCategoryTrackingProfiles(
    @RouteInput() input: RouteInputOf<typeof routes.listCategoryTrackingProfiles>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.list(user, 'category_tracking_profile', input.query);
  }

  @ApiRoute(routes.readCategoryTrackingProfile)
  readCategoryTrackingProfile(
    @RouteInput() input: RouteInputOf<typeof routes.readCategoryTrackingProfile>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.one(user, 'category_tracking_profile', input.params.recordId);
  }

  @ApiRoute(routes.prepareCategoryTrackingProfileVersion)
  prepareCategoryTrackingProfileVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareCategoryTrackingProfileVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(
      routes.prepareCategoryTrackingProfileVersion,
      'merchandise.record-category-tracking-profile-version',
      user,
      input,
      (c, p) => this.catalogue.prepareCategoryTrackingProfileVersion(c, p, input.params.recordId, input.body),
    );
  }

  // Styles, SKUs and packs (4.1, 4.4; S1-F03-T02).
  @ApiRoute(routes.listStyles)
  listStyles(@RouteInput() input: RouteInputOf<typeof routes.listStyles>, @SignedIn() user: SignedInUser) {
    return this.list(user, 'style', input.query);
  }

  @ApiRoute(routes.readStyle)
  readStyle(@RouteInput() input: RouteInputOf<typeof routes.readStyle>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'style', input.params.recordId);
  }

  @ApiRoute(routes.prepareStyleVersion)
  prepareStyleVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareStyleVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.prepareStyleVersion, 'merchandise.record-style-version', user, input, (c, p) =>
      this.catalogue.prepareStyleVersion(c, p, input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.listSkus)
  listSkus(@RouteInput() input: RouteInputOf<typeof routes.listSkus>, @SignedIn() user: SignedInUser) {
    return this.list(user, 'sku', input.query);
  }

  @ApiRoute(routes.readSku)
  readSku(@RouteInput() input: RouteInputOf<typeof routes.readSku>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'sku', input.params.recordId);
  }

  /** Read a SKU as of a date at a Site (4.7), or not found, naming it (PRD-UXP-003). */
  @ApiRoute(routes.readSkuAsOf)
  async readSkuAsOf(@RouteInput() input: RouteInputOf<typeof routes.readSkuAsOf>, @SignedIn() user: SignedInUser) {
    const answer = await this.read(user, 'merchandise.read-sku-as-of', async (context) => ({
      asOf: context.startedAt.toISOString(),
      found: await this.catalogue.skuOn(context, input.params.recordId, input.query.siteId, input.query.date),
    }));
    if ('refusal' in answer.found) throw new ApiRefusal(answer.found.refusal);
    return { asOf: answer.asOf, sku: answer.found.sku };
  }

  @ApiRoute(routes.prepareSkuVersion)
  prepareSkuVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareSkuVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.prepareSkuVersion, 'merchandise.record-sku-version', user, input, (c, p) =>
      this.catalogue.prepareSkuVersion(c, p, input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.listPacks)
  listPacks(@RouteInput() input: RouteInputOf<typeof routes.listPacks>, @SignedIn() user: SignedInUser) {
    return this.list(user, 'pack', input.query);
  }

  @ApiRoute(routes.readPack)
  readPack(@RouteInput() input: RouteInputOf<typeof routes.readPack>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'pack', input.params.recordId);
  }

  @ApiRoute(routes.preparePack)
  preparePack(@RouteInput() input: RouteInputOf<typeof routes.preparePack>, @SignedIn() user: SignedInUser) {
    return this.command(routes.preparePack, 'merchandise.record-pack', user, input, (c, p) =>
      this.catalogue.preparePack(c, p, input.body),
    );
  }

  @ApiRoute(routes.preparePackVersion)
  preparePackVersion(
    @RouteInput() input: RouteInputOf<typeof routes.preparePackVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.preparePackVersion, 'merchandise.record-pack-version', user, input, (c, p) =>
      this.catalogue.preparePackVersion(c, p, input.params.recordId, input.body),
    );
  }

  // Product proposals (4.2; S1-F03-T02): proposed here, confirmed or rejected through the approval panel.
  @ApiRoute(routes.listProductProposals)
  listProductProposals(
    @RouteInput() input: RouteInputOf<typeof routes.listProductProposals>,
    @SignedIn() user: SignedInUser,
  ) {
    const page = {
      after: input.query.after,
      limit: input.query.limit === undefined ? undefined : Number(input.query.limit),
    };
    return this.read(user, 'merchandise.list-product-proposals', async (context) => {
      const found = await this.catalogue.listProductProposals(context, page);
      return { asOf: context.startedAt.toISOString(), records: found.records, next: found.next };
    });
  }

  @ApiRoute(routes.readProductProposal)
  async readProductProposal(
    @RouteInput() input: RouteInputOf<typeof routes.readProductProposal>,
    @SignedIn() user: SignedInUser,
  ) {
    const proposalId = input.params.proposalId;
    const answer = await this.read(user, 'merchandise.read-product-proposal', async (context) => ({
      asOf: context.startedAt.toISOString(),
      proposal: await this.catalogue.productProposal(context, proposalId),
    }));
    if (answer.proposal === undefined) {
      throw new ApiRefusal({
        kind: 'not-found',
        code: 'merchandise.proposal-not-found',
        missing: [{ kind: 'record', recordType: 'merchandise.product_proposal', recordId: proposalId }],
      });
    }
    return { asOf: answer.asOf, proposal: answer.proposal };
  }

  @ApiRoute(routes.proposeProduct)
  proposeProduct(@RouteInput() input: RouteInputOf<typeof routes.proposeProduct>, @SignedIn() user: SignedInUser) {
    return this.command(routes.proposeProduct, 'merchandise.propose-product', user, input, (c, p) =>
      this.catalogue.proposeProduct(c, p, input.body),
    );
  }

  // External codes (4.3, 4.7; S1-F03-T02).
  @ApiRoute(routes.listCodeMappings)
  listCodeMappings(@RouteInput() input: RouteInputOf<typeof routes.listCodeMappings>, @SignedIn() user: SignedInUser) {
    const query = {
      skuId: input.query.skuId,
      after: input.query.after,
      limit: input.query.limit === undefined ? undefined : Number(input.query.limit),
    };
    return this.read(user, 'merchandise.list-code-mappings', async (context) => {
      const found = await this.catalogue.listCodeMappings(context, query);
      return { asOf: context.startedAt.toISOString(), records: found.records, next: found.next };
    });
  }

  @ApiRoute(routes.mapCode)
  mapCode(@RouteInput() input: RouteInputOf<typeof routes.mapCode>, @SignedIn() user: SignedInUser) {
    return this.command(routes.mapCode, 'merchandise.map-code', user, input, (c, p) =>
      this.catalogue.mapCode(c, p, input.body),
    );
  }

  @ApiRoute(routes.endCodeMapping)
  endCodeMapping(@RouteInput() input: RouteInputOf<typeof routes.endCodeMapping>, @SignedIn() user: SignedInUser) {
    return this.command(routes.endCodeMapping, 'merchandise.end-code-mapping', user, input, (c, p) =>
      this.catalogue.endCodeMapping(c, p, input.params.mappingId, input.body),
    );
  }

  @ApiRoute(routes.resolveCode)
  async resolveCode(@RouteInput() input: RouteInputOf<typeof routes.resolveCode>, @SignedIn() user: SignedInUser) {
    const answer = await this.read(user, 'merchandise.resolve-code', async (context) => ({
      asOf: context.startedAt.toISOString(),
      found: await this.catalogue.resolveCode(context, input.query),
    }));
    if ('refusal' in answer.found) throw new ApiRefusal(answer.found.refusal);
    return { asOf: answer.asOf, resolved: answer.found.resolved };
  }

  /** A page of a master's records, in code order (code-house-rules 12.1). */
  private list<K extends CatalogueKind>(user: SignedInUser, kind: K, query: MasterPageQuery) {
    const page = { after: query.after, limit: query.limit === undefined ? undefined : Number(query.limit) };
    return this.read(user, `merchandise.list-${kind.replaceAll('_', '-')}`, async (context, today) => {
      const found = await this.catalogue.list(context, kind, today, page);
      return { asOf: context.startedAt.toISOString(), records: found.records, next: found.next };
    });
  }

  /** One record, or not found, naming it (PRD-UXP-003). */
  private async one<K extends CatalogueKind>(user: SignedInUser, kind: K, recordId: string) {
    const answer = await this.read(user, `merchandise.read-${kind.replaceAll('_', '-')}`, async (context, today) => ({
      asOf: context.startedAt.toISOString(),
      record: await this.catalogue.record(context, kind, recordId, today),
    }));
    if (answer.record === undefined) {
      const missing: MissingItem[] = [{ kind: 'record', recordType: recordTypeOf(kind), recordId }];
      throw new ApiRefusal({ kind: 'not-found', code: 'merchandise.record-not-found', missing });
    }
    return { asOf: answer.asOf, record: answer.record };
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
    work: (context: TransactionContext, preparer: Preparer) => Promise<Outcome>,
  ) {
    const roleAssignmentId = user.roleAssignmentId;
    if (roleAssignmentId === undefined) {
      throw new CommandDefect(`Route ${route.path} records a catalogue change without Authorise`);
    }
    const need = { actorId: user.userId, action: route.access.action, recordType: route.access.recordType };
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
        key: input.idempotencyKey,
        content: requestContentOf(route, input),
        authoriseReplay,
        work: async (context): Promise<CommandOutcome<JsonValue>> => {
          // Step 0: the preparer and the assignment Authorise found, rechecked under the locks (code-house-rules 8.2).
          const held = await this.access.holdAuthority(context, { kind: 'user', id: user.userId }, roleAssignmentId, {
            action: need.action,
            recordType: need.recordType,
          });
          if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
          const outcome = await work(context, { userId: user.userId, roleAssignmentId });
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
