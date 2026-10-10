import { uuidv7 } from '@apparel-os/domain';
import { permissionRegistry, type AssignmentScope, type RecordTypeDeclaration } from '@apparel-os/schemas';
import {
  CommandRunner,
  LOCK_STEP,
  newCorrelationId,
  OrganisationRouter,
  type CommandRefusal,
  type RoutedOrganisation,
  type TransactionContext,
} from '../../src/kernel/index.js';
import { Access, type ApprovalRule } from '../../src/modules/access/index.js';
// The access module's own key reader, so the fresh-code check opens the synthetic factor secrets (11.2).
import { OrganisationKeys } from '../../src/modules/access/domain/organisation-keys.js';
import { Audit } from '../../src/modules/audit/index.js';
import {
  StockLedger,
  type CallerRegistration,
  type LedgerItem,
  type LedgerPlaces,
  type LedgerRequest,
  type LedgerSkus,
  type SkuFacts,
  type UnitFacts,
  type Written,
} from '../../src/modules/stock/ledger/index.js';
import {
  codeFor,
  syntheticKeysEnvironment,
  syntheticTimezone,
  writeSyntheticReason,
  writeSyntheticUser,
  type SyntheticUser,
} from './access.js';
import {
  APPROVE_DOCUMENT,
  APPROVE_ON_COST,
  SYNTHETIC_DOCUMENT_TYPE,
  SYNTHETIC_MODULE,
  SYNTHETIC_RECORD_TYPE,
} from '../fixtures/stock-ledger.js';
import { TEST_COMPOSITION } from './composition.js';
import { grantSynthetic } from './grants.js';
import { capturingLogger } from './jobs.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './organisations.js';
import { databaseUrl } from './postgres.js';
import { localOrigins } from './origins.js';

// S1-F10-T02: the test composition of the stock ledger (stock-ledger 13.2, 15.3; DEC-112, H2 and H4). A synthetic
// caller playing a document's owning module, synthetic approval rules, and stand-ins of the `organisation` and
// `merchandise` reads built to the shape the ledger declares (ports.ts; product owner, 6 Oct 2026). Every place, SKU,
// brand, book and document here is SYNTHETIC: identifiers made for the test, never a KDPS value.

export {
  APPROVE_DOCUMENT,
  APPROVE_ON_COST,
  SYNTHETIC_DOCUMENT_TYPE,
  SYNTHETIC_MODULE,
  SYNTHETIC_RECORD_TYPE,
} from '../fixtures/stock-ledger.js';

export const syntheticDocumentType: RecordTypeDeclaration = {
  code: SYNTHETIC_DOCUMENT_TYPE,
  actions: ['view', 'create', 'approve'],
  scopeFacts: { legalEntity: false, place: false, brand: false },
  subject: false,
  fieldClasses: [],
  serviceOnly: false,
};
export const testRegistry: readonly RecordTypeDeclaration[] = [...permissionRegistry, syntheticDocumentType];

/** Synthetic approval rules (15.3): independent, one with no value basis, one with cost as its basis. */
export const syntheticRules: readonly ApprovalRule[] = [
  {
    actionType: APPROVE_DOCUMENT,
    module: SYNTHETIC_MODULE,
    recordType: SYNTHETIC_DOCUMENT_TYPE,
    independent: true,
    value: 'none',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: true,
  },
  {
    actionType: APPROVE_ON_COST,
    module: SYNTHETIC_MODULE,
    recordType: SYNTHETIC_DOCUMENT_TYPE,
    independent: true,
    value: 'cost',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: true,
  },
];

export const syntheticCaller: CallerRegistration = {
  module: SYNTHETIC_MODULE,
  synthetic: true,
  recordTypes: [
    {
      recordType: SYNTHETIC_RECORD_TYPE,
      itemKinds: [
        'receipt-count',
        'location-move',
        'condition-change',
        'record-coverage',
        'remove-coverage',
        'record-acceptance',
        'place-hold',
        'release-hold',
        'start-count-freeze',
        'end-count-freeze',
        'reserve',
        'end-reservation',
      ],
      importKinds: ['none'],
    },
  ],
};

/** The synthetic places: a warehouse Site with one unit of no Store; a Store Site with two units of one book and one of another. */
export const PLACES = (() => {
  const legalEntity = uuidv7();
  const book = uuidv7();
  const otherBook = uuidv7();
  const registration = uuidv7();
  const warehouseSite = uuidv7();
  const storeSite = uuidv7();
  const store = uuidv7();
  const unit = (siteId: string, storeId: string | null, bookId = book): UnitFacts => ({
    siteId,
    storeId,
    businessUnitId: uuidv7(),
    legalEntityId: legalEntity,
    bookId,
    taxRegistrationId: registration,
    mappingVersionId: uuidv7(),
  });
  const warehouse = unit(warehouseSite, null);
  const storeUnit = unit(storeSite, store);
  const storeUnit2 = unit(storeSite, store);
  const otherBookUnit = unit(storeSite, store, otherBook);
  const locations = {
    rack: { siteId: warehouseSite, businessUnitId: warehouse.businessUnitId, id: uuidv7() },
    bin: { siteId: warehouseSite, businessUnitId: warehouse.businessUnitId, id: uuidv7() },
    floor: { siteId: storeSite, businessUnitId: storeUnit.businessUnitId, id: uuidv7() },
    back: { siteId: storeSite, businessUnitId: storeUnit.businessUnitId, id: uuidv7() },
    floor2: { siteId: storeSite, businessUnitId: storeUnit2.businessUnitId, id: uuidv7() },
    otherBookFloor: { siteId: storeSite, businessUnitId: otherBookUnit.businessUnitId, id: uuidv7() },
  };
  return {
    legalEntity,
    book,
    warehouseSite,
    storeSite,
    store,
    warehouse,
    storeUnit,
    storeUnit2,
    otherBookUnit,
    locations,
  };
})();

export const BRAND_A = uuidv7();
export const BRAND_B = uuidv7();
function sku(brandId: string, pieceTracked: boolean, batchTracked = false): SkuFacts {
  return { skuId: uuidv7(), versionId: uuidv7(), brandId, stockUnit: 'piece', pieceTracked, batchTracked };
}
export const SKUS = {
  quantityA: sku(BRAND_A, false),
  quantityA2: sku(BRAND_A, false),
  pieceA: sku(BRAND_A, true),
  quantityB: sku(BRAND_B, false),
  pieceB: sku(BRAND_B, true),
  batchA: sku(BRAND_A, false, true),
};

/** Stand-ins of the declared reads (ports.ts), answering only the synthetic places and SKUs. */
export const syntheticPlaces: LedgerPlaces = {
  unitAt: (_context, place) =>
    Promise.resolve(
      [PLACES.warehouse, PLACES.storeUnit, PLACES.storeUnit2, PLACES.otherBookUnit].find(
        (unit) => unit.siteId === place.siteId && unit.businessUnitId === place.businessUnitId,
      ),
    ),
  locationOf: (_context, locationId) => {
    const found = Object.values(PLACES.locations).find((location) => location.id === locationId);
    return Promise.resolve(
      found === undefined ? undefined : { siteId: found.siteId, businessUnitId: found.businessUnitId },
    );
  },
};
const moreSkus: SkuFacts[] = [];

/** A further SYNTHETIC quantity-tracked SKU, of brand A unless another is given, for tests that need many. */
export function addSyntheticSku(brandId = BRAND_A): SkuFacts {
  const made = sku(brandId, false);
  moreSkus.push(made);
  return made;
}

export const syntheticSkus: LedgerSkus = {
  skuAt: (_context, skuId) =>
    Promise.resolve([...Object.values(SKUS), ...moreSkus].find((each) => each.skuId === skuId)),
};

/** A place by location name. */
export function at(location: keyof typeof PLACES.locations) {
  const found = PLACES.locations[location];
  return { siteId: found.siteId, businessUnitId: found.businessUnitId, locationId: found.id };
}

const ALL_STOCK_VIEW = permissionRegistry
  .filter((declaration) => declaration.code.startsWith('stock.'))
  .map((declaration) => ({ recordType: declaration.code, action: 'view' as const }));

export interface Actor {
  readonly user: SyntheticUser;
  readonly roleAssignmentId: string;
}

export class StockWorld {
  readonly log = capturingLogger();
  world!: SyntheticWorld;
  database!: string;
  router!: OrganisationRouter;
  routed!: RoutedOrganisation;
  access!: Access;
  ledger!: StockLedger;
  poster!: Actor;
  brandLimited!: Actor;
  approver!: Actor;
  reasonId!: string;
  private offsetMs = 0;
  private keysEnvironment!: Record<string, string>;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  async start(label: string): Promise<void> {
    this.world = await createSyntheticOrganisations(label);
    this.database = this.world.organisations[0].database;
    this.router = new OrganisationRouter(
      { directoryConnectionString: databaseUrl(this.world.directory, 'runtime'), poolMax: 16 },
      this.log.logger,
    );
    const found = await this.router.resolveForSignIn(this.world.organisations[0].code);
    if (!found.routed) throw new Error('not routed');
    this.routed = found.organisation;
    this.keysEnvironment = syntheticKeysEnvironment(this.world);
    const audit = new Audit(this.log.logger);
    this.access = new Access({
      origins: localOrigins,
      audit,
      keys: OrganisationKeys.fromEnvironment(this.keysEnvironment),
      registry: testRegistry,
      approvalRules: syntheticRules,
      composition: TEST_COMPOSITION,
    });
    this.ledger = new StockLedger({
      audit,
      places: syntheticPlaces,
      skus: syntheticSkus,
      registrations: [syntheticCaller],
      composition: TEST_COMPOSITION,
    });
    this.poster = await this.actor('POSTER');
    this.brandLimited = await this.actor('BRAND-A', {
      kind: 'dimensions',
      legalEntity: { kind: 'all' },
      place: { kind: 'all' },
      brand: { kind: 'selected', members: [BRAND_A] },
    });
    const approver = await writeSyntheticUser(this.database, this.routed.organisationCode, this.keysEnvironment, {
      label: 'APPROVER',
      enrolled: true,
    });
    const granted = await grantSynthetic(
      this.database,
      { kind: 'user', id: approver.id },
      [{ recordType: SYNTHETIC_DOCUMENT_TYPE, action: 'approve' }],
      { registry: testRegistry },
    );
    this.approver = { user: approver, roleAssignmentId: granted.assignmentId };
    this.reasonId = await writeSyntheticReason(this.database, 'approve');
  }

  async actor(label: string, scope?: AssignmentScope): Promise<Actor> {
    const user = await writeSyntheticUser(this.database, this.routed.organisationCode, this.keysEnvironment, { label });
    const granted = await grantSynthetic(
      this.database,
      { kind: 'user', id: user.id },
      [...ALL_STOCK_VIEW, { recordType: SYNTHETIC_DOCUMENT_TYPE, action: 'create' }],
      { registry: testRegistry, ...(scope === undefined ? {} : { scope }) },
    );
    return { user, roleAssignmentId: granted.assignmentId };
  }

  async stop(): Promise<void> {
    await (this.router as OrganisationRouter | undefined)?.close();
    await (this.world as SyntheticWorld | undefined)?.reset();
  }

  /** Runs work as the actor in one command (code-house-rules 8.1). */
  run<T>(
    actorId: string,
    work: (context: TransactionContext) => Promise<T>,
    commandName = `${SYNTHETIC_MODULE}.post`,
  ): Promise<T> {
    const runner = new CommandRunner({
      clock: { now: () => this.now() },
      timezones: syntheticTimezone,
      logger: this.log.logger,
    });
    return runner.run(
      { commandName, organisation: this.routed, correlationId: newCorrelationId(), actor: { kind: 'actor', actorId } },
      work,
    );
  }

  /** A synthetic document's source (13.2): a new record unless one is given, a new version each time. */
  source(recordId: string = uuidv7(), versionId: string = uuidv7()) {
    return {
      module: SYNTHETIC_MODULE,
      recordType: SYNTHETIC_RECORD_TYPE,
      recordId,
      versionId,
      importKind: 'none' as const,
    };
  }

  /**
   * One posting command in the order of stock-ledger 13.1 (module-map 6.1): step 0 the authority rows; step 1 the
   * decision's request, where the action needed approval; Plan, Lock, Recheck and value; Verify under lock; Record use;
   * Write. A refusal rolls the command back, so nothing it did stays, not even an empty anchor row.
   */
  async post(
    actor: Actor,
    items: readonly LedgerItem[],
    options: {
      readonly source?: LedgerRequest['source'];
      readonly approval?: {
        readonly decisionId: string;
        readonly actionType: string;
        readonly preparers?: readonly string[];
      };
      readonly hold?: (context: TransactionContext) => Promise<void>;
    } = {},
  ): Promise<{ kind: 'written'; written: Written } | { kind: 'refused'; refusal: CommandRefusal }> {
    const source = options.source ?? this.source();
    try {
      const written = await this.run(actor.user.id, async (context) => {
        const held = await this.access.holdAuthority(
          context,
          { kind: 'user', id: actor.user.id },
          actor.roleAssignmentId,
          { action: 'create', recordType: SYNTHETIC_DOCUMENT_TYPE },
        );
        if (held !== undefined) throw new Refused(held);
        const useId = uuidv7();
        if (options.approval !== undefined) {
          await context.lock(
            LOCK_STEP.document,
            await this.access.approvalLockTargets(context, options.approval.decisionId),
          );
        }
        const request: LedgerRequest = {
          source,
          actor: { kind: 'user', userId: actor.user.id, roleAssignmentId: actor.roleAssignmentId },
          items,
          ...(options.approval === undefined ? {} : { approval: { decisionId: options.approval.decisionId, useId } }),
        };
        const planned = await this.ledger.plan(context, request);
        if (planned.kind === 'refused') throw new Refused(planned.refusal);
        const locked = await this.ledger.lock(context, planned.value);
        const checked = await this.ledger.recheck(context, locked);
        if (checked.kind === 'refused') throw new Refused(checked.refusal);
        await options.hold?.(context);
        if (options.approval !== undefined) {
          const document = {
            module: SYNTHETIC_MODULE,
            recordType: SYNTHETIC_DOCUMENT_TYPE,
            recordId: source.recordId,
            versionId: source.versionId,
          };
          const check = {
            decisionId: options.approval.decisionId,
            actionType: options.approval.actionType,
            document,
            preparers: options.approval.preparers ?? [actor.user.id],
            // The value on the rule's basis: none for a rule without one; the ledger's cost value otherwise (13.1).
            value:
              options.approval.actionType === APPROVE_DOCUMENT || checked.value.value.kind === 'none'
                ? ({ kind: 'none' } as const)
                : ({ kind: 'unknown' } as const),
          };
          const verified = await this.access.verifyUnderLock(context, check);
          if (verified !== undefined) throw new Refused(verified);
          const used = await this.access.recordUse(context, {
            ...check,
            useId,
            actor: { kind: 'user', id: actor.user.id },
          });
          if (used !== undefined) throw new Refused(used);
        }
        return this.ledger.write(context, checked.value);
      });
      return { kind: 'written', written };
    } catch (error) {
      if (error instanceof Refused) return { kind: 'refused', refusal: error.refusal };
      throw error;
    }
  }

  /** A code of a step later than any used before: the clock moves on 30 seconds (access-and-approvals 3.3). */
  nextCode(user: SyntheticUser): string {
    this.offsetMs += 30_000;
    if (user.factorSecret === undefined) throw new Error('not enrolled');
    return codeFor(user.factorSecret, 0, this.now());
  }

  /** Requests approval of a synthetic document version and has the approver decide it (access-and-approvals 9.1, 9.5). */
  async approve(
    preparer: Actor,
    document: { readonly recordId: string; readonly versionId: string },
    actionType = APPROVE_DOCUMENT,
  ): Promise<{ requestId: string; decision: Awaited<ReturnType<Access['decide']>> }> {
    const requestId = await this.run(preparer.user.id, (context) =>
      this.access.requestApproval(context, {
        actionType,
        document: { module: SYNTHETIC_MODULE, recordType: SYNTHETIC_DOCUMENT_TYPE, ...document },
        value: actionType === APPROVE_DOCUMENT ? { kind: 'none' } : { kind: 'unknown' },
        preparers: [preparer.user.id],
        requestedBy: { userId: preparer.user.id, roleAssignmentId: preparer.roleAssignmentId },
      }),
    );
    const decision = await this.run(this.approver.user.id, (context) =>
      this.access.decide(
        context,
        { kind: 'user', id: this.approver.user.id },
        {
          requestId,
          versionId: document.versionId,
          outcome: 'approve',
          reason: { kind: 'listed', reasonId: this.reasonId },
          totpCode: this.nextCode(this.approver.user),
        },
      ),
    );
    return { requestId, decision };
  }
}

class Refused extends Error {
  constructor(readonly refusal: CommandRefusal) {
    super(refusal.code);
  }
}

/** Writes the result of a posting that must succeed. */
export function written(result: Awaited<ReturnType<StockWorld['post']>>): Written {
  if (result.kind !== 'written')
    throw new Error(`refused: ${result.refusal.code} ${JSON.stringify(result.refusal.missing)}`);
  return result.written;
}
