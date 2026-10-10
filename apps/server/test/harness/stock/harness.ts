import { join } from 'node:path';
import { paise, uuidv7, type Paise } from '@apparel-os/domain';
import {
  permissionRegistry,
  type CatalogueChanged,
  type CostFormula,
  type CostPoolMode,
  type PlaceMember,
  type RecordTypeDeclaration,
} from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import {
  CommandRunner,
  IdempotencyHelper,
  LOCK_STEP,
  newCorrelationId,
  readMigrationSet,
  type CommandRefusal,
  type IdempotentAnswer,
  type LockTarget,
  type TransactionContext,
} from '../../../src/kernel/index.js';
import type { ApprovalRule } from '../../../src/modules/access/index.js';
import type { ExceptionTypeRegistration } from '../../../src/modules/exceptions/index.js';
import {
  catalogueSkus,
  organisationPlaces,
  type CallerRegistration,
  type ImportKind,
  type LedgerItem,
  type Written,
} from '../../../src/modules/stock/ledger/index.js';
import {
  HARNESS_ACTIONS,
  HARNESS_DOCUMENT_TYPE,
  HARNESS_MODULE,
  HARNESS_RECORD_TYPE,
  HARNESS_REJECT_DAMAGE,
  SYNTHETIC_COST_LIMIT_PAISE,
} from '../../fixtures/stock-harness.js';
import { syntheticCode, syntheticName } from '../../fixtures/synthetic.js';
import { syntheticTimezone, writeSyntheticUser, type SyntheticUser } from '../../support/access.js';
import { grantSynthetic } from '../../support/grants.js';
import { recorded } from '../../support/books.js';
import { approved, decided } from '../../support/organisation.js';
import { allowVerifier, connect } from '../../support/postgres.js';
import {
  PostingRefused,
  syntheticCaller,
  syntheticRules,
  testRegistry,
  type Actor,
} from '../../support/stock-ledger.js';
import { ValuedWorld, type At, type SyntheticCombination } from '../../support/stock-valued.js';

// S1-F10-T04: the synthetic document driver of the stock harness (stock-ledger 15; S1-F10 spec 3.1 to 3.3; DEC-112,
// H1 to H6). It plays the owning module of each document of the story of stock-ledger 11.1: its documents live in the
// test-only schema `test_stock_harness` (15.2), made by the test-only migration set `apps/server/test/migrations/`
// applied here, to this test file's database copy only (code-house-rules 11.4). Each command is one kernel command
// under the idempotency helper, in the order of module-map 6.1: the key; Authorise; the document row and the decision's
// request locked at step 1 and rechecked; the ledger's Plan, Lock, Recheck and value; Verify under lock and Record use
// for an approved step; Write, which hands the valued movements to `finance` Post; the document's new state; commit
// (stock-ledger 13.1; PRD-INT-002, PRD-INT-004). Approvals are the real `access` operations on synthetic action types
// with cost as their basis (15.3), decided by a different person within a SYNTHETIC limit (S1-F05). The ledger reads
// the real `organisation` and `merchandise` records (RR-436). Application code never imports this (code-house-rules
// 11.2). Every value is SYNTHETIC.

/** The test-only migration set (code-house-rules 11.4). */
export const HARNESS_MIGRATIONS = join(import.meta.dirname, '..', '..', 'migrations');

const DOCUMENT_TABLE = { schema: 'test_stock_harness', table: 'document' } as const;

/** The driver's caller registration (13.2; H2): the item kinds of its commands. */
export const harnessCaller: CallerRegistration = {
  module: HARNESS_MODULE,
  synthetic: true,
  recordTypes: [
    {
      recordType: HARNESS_RECORD_TYPE,
      itemKinds: [
        'receipt-count',
        'record-coverage',
        'record-acceptance',
        'cost-established',
        'reserve',
        'dispatch',
        'arrival-count',
        'sale-issue',
        'customer-return',
        'cost-adjustment',
        'supplier-return-departure',
        'supplier-handover',
        // S1-F10-T06: rejection returns, damage, transfer cancellation, disposal, counts and corrections.
        'supplier-rejection-return',
        'place-hold',
        'release-hold',
        'condition-change',
        'end-reservation',
        'disposal',
        'start-count-freeze',
        'end-count-freeze',
        'count-difference',
        'reversal',
        'piece-correction',
      ],
      importKinds: ['none'],
    },
  ],
};

/** The driver's document in the permission registry (15.2): it carries no scope fact. */
export const harnessDocumentType: RecordTypeDeclaration = {
  code: HARNESS_DOCUMENT_TYPE,
  actions: ['view', 'create', 'approve'],
  scopeFacts: { legalEntity: false, place: false, brand: false },
  subject: false,
  fieldClasses: [],
  serviceOnly: false,
};

/** The driver's approval rules (15.3; H4): independent, cost as the value basis, labelled synthetic. */
export const harnessRules: readonly ApprovalRule[] = [
  ...Object.values(HARNESS_ACTIONS).map((actionType) => ({ actionType, value: 'cost' as const })),
  { actionType: HARNESS_REJECT_DAMAGE, value: 'none' as const },
].map(({ actionType, value }) => ({
  actionType,
  module: HARNESS_MODULE,
  recordType: HARNESS_DOCUMENT_TYPE,
  independent: true,
  value,
  freeTextReason: false,
  decisionEvidenceClasses: [],
  synthetic: true,
}));

/** The exception the driver raises after a posting refused rolled its command back (SL-23 Outcome A; DEC-105). */
export const HARNESS_POSTING_REFUSED: ExceptionTypeRegistration = {
  code: `${HARNESS_MODULE}.posting-refused`,
  category: 'unfinished-operation',
  module: HARNESS_MODULE,
  linksTo: [HARNESS_DOCUMENT_TYPE],
  evidenceClasses: [],
  resolutionCheck: () => Promise.resolve({ kind: 'verified' }),
};

export type DocumentKind =
  | 'receipt'
  | 'pt-approval'
  | 'transfer'
  | 'sale'
  | 'customer-return'
  | 'cost-change'
  | 'supplier-return'
  | 'damage'
  | 'disposal'
  | 'count'
  | 'reversal'
  | 'earlier-pos-report';

/** One line of a driver document (15.2 `document_line`). */
export interface DocumentLine {
  readonly lineId: string;
  readonly skuId: string;
  readonly quantity: number;
  readonly locationId?: string;
  readonly toLocationId?: string;
  readonly receiptOriginId?: string;
  readonly movementId?: string;
  /** An amount in paise, or none when the line names no amount (value Unknown is not a line's). */
  readonly amountPaise?: number;
  readonly pieceCodes?: readonly string[];
}

/** A driver document as its current version reads (15.2). */
export interface HarnessDocument {
  readonly id: string;
  readonly kind: DocumentKind;
  versionId: string;
  versionNo: number;
  state: string;
  readonly from: At;
  readonly to?: At;
  readonly lines: readonly DocumentLine[];
}

/** One step's outcome: the ledger's answer, and a replay of the same request under the same key (PRD-INT-002). */
export interface StepOutcome {
  readonly written: Written;
  readonly key: string;
  readonly replay: () => Promise<IdempotentAnswer<StepAnswer>>;
}

/** A step sent once: written, or refused with the whole command rolled back (13.1; SL-23 Outcome A). */
export type StepSent =
  | ({ readonly kind: 'written' } & StepOutcome)
  | {
      readonly kind: 'refused';
      readonly refusal: CommandRefusal;
      readonly key: string;
      readonly replay: () => Promise<IdempotentAnswer<StepAnswer>>;
    }
  | {
      /** The key had already been used with the same content: the first answer, with no second effect (PRD-INT-002). */
      readonly kind: 'replayed';
      readonly answer: StepAnswer;
      readonly key: string;
    };

/** What a step keeps under its key: identifiers only (code-house-rules 12.4 "Storage"). */
export interface StepAnswer {
  readonly [key: string]: readonly string[];
  readonly movementIds: readonly string[];
  readonly receiptOriginIds: readonly string[];
  readonly reservationIds: readonly string[];
}

/** The fixtures of one combination (S1-F10 spec 3.3): book BK-SYN with W1 and S1, and SKU X. */
export interface HarnessFixtures extends SyntheticCombination {
  readonly sku: { readonly skuId: string; readonly brandId: string };
  /** A second location of S1's unit, such as its backroom (S1-F10-T06: counts across two locations). */
  readonly s1b: At;
  /** A second Store S2 in the same book, where asked for (S1-F10-T07: sales at two Stores under one pool). */
  readonly s2?: At;
}

type Outcome<A> = { kind: 'success'; answer: A } | { kind: 'refusal'; refusal: { code: string } };
function ok<A>(outcome: Outcome<A>): A {
  if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
  return outcome.answer;
}

const ALL_MEMBERS = {
  kind: 'dimensions' as const,
  legalEntity: { kind: 'all' as const },
  place: { kind: 'all' as const },
  brand: { kind: 'all' as const },
};

/**
 * Applies the test-only migration set to one test database copy, as the migration role, after the Organisation set,
 * and gives the read-only test role CONNECT on it (code-house-rules 11.4; stock-ledger 15.2, 15.4). The set is not
 * recorded in `kernel.migration`, which is the pre-deploy runner's; the copy is dropped at the end of the file.
 */
export async function applyHarnessMigrations(database: string): Promise<void> {
  const owner = await connect(database, 'migration');
  try {
    for (const file of readMigrationSet(HARNESS_MIGRATIONS)) {
      await owner.query('begin');
      try {
        await owner.query(file.sql);
        await owner.query('commit');
      } catch (error) {
        await owner.query('rollback');
        throw error;
      }
    }
  } finally {
    await owner.end();
  }
  await allowVerifier(database);
}

export class StockHarness extends ValuedWorld {
  protected override readonly registrations: readonly CallerRegistration[] = [syntheticCaller, harnessCaller];
  protected override readonly approvalRules: readonly ApprovalRule[] = [...syntheticRules, ...harnessRules];
  protected override readonly registry: readonly RecordTypeDeclaration[] = [...testRegistry, harnessDocumentType];
  /** The person who prepares the driver's documents and posts their steps. */
  preparer!: Actor;
  /** A different person, who decides the driver's approvals within a SYNTHETIC limit (PRD-ACS-006). */
  checker!: Actor;
  private helper!: IdempotencyHelper;

  protected override async compose(): Promise<void> {
    await super.compose();
    await applyHarnessMigrations(this.database);
    // The real reads (RR-436): Read a unit's mapping and a location's place; Read a SKU as of a date.
    this.places = organisationPlaces;
    this.skus = catalogueSkus;
  }

  override async start(label: string): Promise<void> {
    await super.start(label);
    const runner = new CommandRunner({
      clock: { now: () => this.now() },
      timezones: syntheticTimezone,
      logger: this.log.logger,
    });
    this.helper = new IdempotencyHelper({
      runner,
      logger: this.log.logger,
      secretCheck: { compare: () => Promise.resolve('not-comparable') },
      cipher: { encrypt: () => Promise.reject(new Error('The driver keeps no restricted value')) },
    });
    const stockView = permissionRegistry
      .filter((declaration) => declaration.code.startsWith('stock.'))
      .map((declaration) => ({ recordType: declaration.code, action: 'view' as const }));
    const preparer = await this.enrolled('HARNESS-PREPARER');
    const preparing = await grantSynthetic(
      this.database,
      { kind: 'user', id: preparer.id },
      [
        ...stockView,
        { recordType: HARNESS_DOCUMENT_TYPE, action: 'view' },
        { recordType: HARNESS_DOCUMENT_TYPE, action: 'create' },
      ],
      { registry: this.registry },
    );
    this.preparer = { user: preparer, roleAssignmentId: preparing.assignmentId };
    const checker = await this.enrolled('HARNESS-CHECKER');
    const checking = await grantSynthetic(
      this.database,
      { kind: 'user', id: checker.id },
      [
        { recordType: HARNESS_DOCUMENT_TYPE, action: 'view' },
        { recordType: HARNESS_DOCUMENT_TYPE, action: 'approve' },
      ],
      { registry: this.registry },
    );
    this.checker = { user: checker, roleAssignmentId: checking.assignmentId };
    await this.limits(checking.roleId);
  }

  /**
   * A person who posts the driver's steps within a place scope only, such as a seller of one Store (S1-F10-T07):
   * create and view on the driver's document, and view on every stock record type, over the places given.
   */
  async scopedPoster(label: string, members: readonly PlaceMember[]): Promise<Actor> {
    const user = await this.enrolled(label);
    const granted = await grantSynthetic(
      this.database,
      { kind: 'user', id: user.id },
      [
        ...permissionRegistry
          .filter((declaration) => declaration.code.startsWith('stock.'))
          .map((declaration) => ({ recordType: declaration.code, action: 'view' as const })),
        { recordType: HARNESS_DOCUMENT_TYPE, action: 'view' },
        { recordType: HARNESS_DOCUMENT_TYPE, action: 'create' },
      ],
      {
        registry: this.registry,
        scope: {
          kind: 'dimensions',
          legalEntity: { kind: 'all' },
          place: { kind: 'selected', members: [...members] },
          brand: { kind: 'all' },
        },
      },
    );
    return { user, roleAssignmentId: granted.assignmentId };
  }

  /** The Store a unit belongs to, as `organisation` maps it today, or none. */
  async storeOf(businessUnitId: string): Promise<string | null> {
    const unit = await this.setup.run(this.setup.preparer.id, (c) =>
      this.setup.organisation.mappingOn(c, businessUnitId, this.setup.today()),
    );
    if (unit.kind !== 'success') throw new Error(`no mapping: ${unit.refusal.code}`);
    return unit.answer.storeId;
  }

  private enrolled(label: string): Promise<SyntheticUser> {
    return writeSyntheticUser(this.database, this.routed.organisationCode, this.keysEnvironment, {
      label,
      enrolled: true,
    });
  }

  private today(): string {
    return this.now().toISOString().slice(0, 10);
  }

  /**
   * The checker's role holds a SYNTHETIC limit on cost for each driver action type, covering Unknown, set through
   * the real limit interface by an Admin and approved by a different person (access-and-approvals 9.2; POL-02.07,
   * POL-02.09; S1-F05-T01).
   */
  private async limits(roleId: string): Promise<void> {
    const admin = await this.enrolled('HARNESS-LIMIT-ADMIN');
    const adminGrant = await grantSynthetic(
      this.database,
      { kind: 'user', id: admin.id },
      [
        { recordType: 'access.approval_limit', action: 'view' },
        { recordType: 'access.approval_limit', action: 'create' },
      ],
      { registry: this.registry },
    );
    const limitApprover = await this.enrolled('HARNESS-LIMIT-APPROVER');
    await grantSynthetic(this.database, { kind: 'user', id: limitApprover.id }, [
      { recordType: 'access.approval_limit', action: 'approve' },
    ]);
    for (const actionType of Object.values(HARNESS_ACTIONS)) {
      const prepared = await this.run(admin.id, (context) =>
        this.access.prepareApprovalLimit(
          context,
          { userId: admin.id, roleAssignmentId: adminGrant.assignmentId },
          {
            actionType,
            holder: { kind: 'role', roleId, scope: ALL_MEMBERS },
            limit: { kind: 'amount', amount: paise(SYNTHETIC_COST_LIMIT_PAISE) },
            coversUnknown: true,
            origin: 'synthetic',
            validFrom: this.today(),
          },
        ),
      );
      const answer = ok(prepared);
      const decision = await this.decideAs(limitApprover, answer.requestId, answer.limitId);
      if (decision.kind !== 'success') throw new Error(`limit not approved: ${decision.refusal.code}`);
    }
  }

  private decideAs(user: SyntheticUser, requestId: string, versionId: string) {
    const totpCode = this.nextCode(user);
    return this.run(user.id, (context) =>
      this.access.decide(
        context,
        { kind: 'user', id: user.id },
        { requestId, versionId, outcome: 'approve', reason: { kind: 'listed', reasonId: this.reasonId }, totpCode },
      ),
    );
  }

  // --- fixtures (S1-F10 spec 3.3) --------------------------------------------------------------------------------

  /** A real location of the unit, through `organisation`'s Prepare and a different person's approval (3.5). */
  protected override async location(siteId: string, businessUnitId: string): Promise<string> {
    const made = await approved(this.setup, (c, p) =>
      this.setup.organisation.prepareLocation(c, p, {
        code: syntheticCode(this.next('LOC')),
        siteId,
        businessUnitId,
        name: syntheticName('Stock location'),
        kind: 'floor',
        validFrom: this.setup.today(),
      }),
    );
    return made.recordId;
  }

  /**
   * SKU X through `merchandise` · catalogue (structure-and-masters 4.1 to 4.6): a brand, a colour attribute with one
   * confirmed value, a category whose tracking profile is piece-tracked or not from today, and one confirmed product.
   */
  async catalogueSku(pieceTracked: boolean, batchExpiryRequired = false): Promise<{ skuId: string; brandId: string }> {
    const today = this.setup.today();
    const recorded = (outcome: Outcome<CatalogueChanged>) => ok(outcome);
    const brandId = recorded(
      await this.setup.asPreparerDo((c, p) =>
        this.setup.catalogue.prepareBrand(c, p, {
          code: syntheticCode(this.next('BRAND')),
          name: syntheticName('Brand X'),
          aliases: [],
          validFrom: today,
        }),
      ),
    ).recordId;
    const colourId = recorded(
      await this.setup.asPreparerDo((c, p) =>
        this.setup.catalogue.prepareAttribute(c, p, {
          code: syntheticCode(this.next('COLOUR')),
          valueKind: 'list',
          name: syntheticName('Colour'),
          validFrom: today,
        }),
      ),
    ).recordId;
    const value = ok(
      await this.setup.asPreparerDo((c, p) =>
        this.setup.catalogue.proposeVocabularyValue(c, p, {
          attributeId: colourId,
          code: syntheticCode(this.next('RED')),
          name: syntheticName('Red'),
        }),
      ),
    );
    decided(await this.setup.decide(value.requestId, value.proposalId));
    const confirmed = await this.setup.run(this.setup.preparer.id, (c) =>
      this.setup.catalogue.proposal(c, value.proposalId),
    );
    const redId = confirmed?.valueId ?? '';
    const categoryId = recorded(
      await this.setup.asPreparerDo((c, p) =>
        this.setup.catalogue.prepareCategory(c, p, {
          code: syntheticCode(this.next('CAT')),
          name: syntheticName('Category X'),
          identityAttributeIds: [colourId],
          validFrom: today,
        }),
      ),
    ).recordId;
    const profileId = recorded(
      await this.setup.asPreparerDo((c, p) =>
        this.setup.catalogue.prepareTrackingProfile(c, p, {
          code: syntheticCode(this.next('PROFILE')),
          name: syntheticName(pieceTracked ? 'Piece profile' : 'Quantity profile'),
          pieceTracked,
          batchExpiryRequired,
          requiredIdentifiers: [],
          validFrom: today,
        }),
      ),
    ).recordId;
    const link = await this.setup.run(this.setup.preparer.id, (c) =>
      this.setup.catalogue.record(c, 'category_tracking_profile', categoryId, today),
    );
    recorded(
      await this.setup.asPreparerDo((c, p) =>
        this.setup.catalogue.prepareCategoryTrackingProfileVersion(c, p, categoryId, {
          trackingProfileId: profileId,
          validFrom: today,
          versionToken: link?.versionToken,
        }),
      ),
    );
    const proposed = ok(
      await this.setup.asPreparerDo((c, p) =>
        this.setup.catalogue.proposeProduct(c, p, {
          style: { code: syntheticCode(this.next('STYLE')), brandId, categoryId, attributes: [] },
          skus: [
            {
              code: syntheticCode(this.next('SKU-X')),
              identity: [{ attributeId: colourId, valueId: redId }],
              stockUnit: 'piece',
              purpose: 'merchandise',
            },
          ],
          sourceWords: 'SYNTHETIC source words',
        }),
      ),
    );
    decided(await this.setup.decide(proposed.requestId, proposed.proposalId));
    const product = await this.setup.run(this.setup.preparer.id, (c) =>
      this.setup.catalogue.productProposal(c, proposed.proposalId),
    );
    const skuId = product?.skuIds[0];
    if (skuId === undefined) throw new Error('SKU X was not made');
    return { skuId, brandId };
  }

  /** The fixtures of one combination: BK-SYN with W1 and S1 under the formula and pool mode, and SKU X (11.1). */
  async fixtures(
    formula: CostFormula,
    poolMode: CostPoolMode,
    options: {
      readonly pieceTracked?: boolean;
      readonly batch?: boolean;
      readonly maps?: readonly string[];
      readonly secondStore?: boolean;
    } = {},
  ): Promise<HarnessFixtures> {
    const combination = await this.book(formula, poolMode, options.maps === undefined ? {} : { maps: options.maps });
    const sku = await this.catalogueSku(options.pieceTracked ?? true, options.batch ?? false);
    const s1b = {
      siteId: combination.s1.siteId,
      businessUnitId: combination.s1.businessUnitId,
      locationId: await this.location(combination.s1.siteId, combination.s1.businessUnitId),
    };
    await this.routePostingRefused(combination.w1.siteId, HARNESS_POSTING_REFUSED.code);
    await this.routePostingRefused(combination.s1.siteId, HARNESS_POSTING_REFUSED.code);
    if (options.secondStore !== true) return { ...combination, sku, s1b };
    const site = await this.site('retail-site');
    const s2 = await this.unit(combination, site, 'whole-store', await this.store(site));
    await this.routePostingRefused(site, HARNESS_POSTING_REFUSED.code);
    return { ...combination, sku, s1b, s2 };
  }

  protected override exceptionTypes(): ExceptionTypeRegistration[] {
    return [...super.exceptionTypes(), HARNESS_POSTING_REFUSED];
  }

  /**
   * The driver's exception after a refused step rolled its command back (books-and-posting 10 step 3; SL-23 Outcome
   * A; DEC-105): raised in a command of its own, keyed by the step's idempotency key, so a replay raises none, linking
   * the document as it stayed.
   */
  raiseRefused(key: string, document: HarnessDocument, refusal: CommandRefusal) {
    return this.run(this.preparer.user.id, (context) =>
      this.exceptions.raiseInOwnCommand(context, {
        raisingEvent: key,
        typeCode: HARNESS_POSTING_REFUSED.code,
        facts: { siteId: document.from.siteId, storeId: null, businessUnitId: null, brandId: null },
        links: [
          {
            module: HARNESS_MODULE,
            recordType: HARNESS_DOCUMENT_TYPE,
            recordId: document.id,
            versionId: document.versionId,
          },
        ],
        exposure: { kind: 'unknown' },
        raisedBy: { kind: 'user', id: this.preparer.user.id },
        comment: `${refusal.code} ${JSON.stringify(refusal.missing)}`,
      }),
    );
  }

  /** A SYNTHETIC supplier and agreement version owning consignment goods until their sale (7.2; G6). */
  readonly syntheticSupplier = uuidv7();
  readonly syntheticAgreement = uuidv7();

  /** The excess hold on a count surplus's units, as the read-only role reads it (H6). */
  async excessHoldOf(originId: string): Promise<string> {
    return this.verified(
      `select distinct h.id from stock.hold h join stock.hold_claim c on c.hold_id = h.id
       left join stock.balance b on b.id = c.balance_id left join stock.piece p on p.id = c.piece_id
       where h.kind = 'excess' and coalesce(b.receipt_origin_id, p.receipt_origin_id) = $1`,
      originId,
    );
  }

  /** The receipt count movement that made an origin, as the read-only role reads it (H6). */
  async receiptMovementOf(originId: string): Promise<string> {
    return this.verified(
      `select m.id from stock.movement m join stock.movement_leg l on l.movement_id = m.id
       where m.kind = 'receipt-count' and l.receipt_origin_id = $1`,
      originId,
    );
  }

  private async verified(query: string, parameter: string): Promise<string> {
    const client = await connect(this.database, 'verify');
    try {
      const [row] = (await client.query<{ id: string }>(query, [parameter])).rows;
      if (row === undefined) throw new Error(`Nothing found for ${parameter}`);
      return row.id;
    } finally {
      await client.end();
    }
  }

  /** Locks the book's period, as Accounts (books-and-posting 4.2; PRD-LED-009). */
  async lockPeriod(periodId: string): Promise<void> {
    recorded(await this.setup.asPreparerDo((c, p) => this.setup.books.lockPeriod(c, p, periodId)));
  }

  /**
   * A reopening of the period naming a driver document as its one correction, requested by Accounts and approved by
   * a different person (books-and-posting 4.3; PRD-LED-019, PRD-LED-020).
   */
  async reopenPeriod(periodId: string, document: HarnessDocument): Promise<void> {
    const asked = recorded(
      await this.setup.asPreparerDo((c, p) =>
        this.setup.books.requestReopening(c, p, periodId, {
          reason: 'SYNTHETIC correction of a bill refused in a locked period',
          corrections: [{ module: HARNESS_MODULE, recordType: HARNESS_DOCUMENT_TYPE, recordId: document.id }],
        }),
      ),
    );
    decided(await this.setup.decide(asked.requestId, asked.reopeningId));
  }

  /** The book's periods' states, as Period close shows them (books-and-posting 4.1). */
  async periodStates(bookId: string): Promise<string[]> {
    const periods = await this.setup.run(this.setup.preparer.id, (c) => this.setup.books.listPeriods(c, bookId));
    return periods.map((each) => each.state);
  }

  // --- documents (15.2) ------------------------------------------------------------------------------------------

  /** Prepares a document's first version in one command: the document, its lines and pieces, and who recorded it. */
  async prepare(kind: DocumentKind, from: At, lines: readonly DocumentLine[], to?: At): Promise<HarnessDocument> {
    const document: HarnessDocument = {
      id: uuidv7(),
      kind,
      versionId: uuidv7(),
      versionNo: 1,
      state: 'prepared',
      from,
      ...(to === undefined ? {} : { to }),
      lines,
    };
    const unit = await this.setup.run(this.setup.preparer.id, (c) =>
      this.setup.organisation.mappingOn(c, from.businessUnitId, this.setup.today()),
    );
    if (unit.kind !== 'success') throw new Error(`no mapping: ${unit.refusal.code}`);
    const toUnit =
      to === undefined
        ? undefined
        : await this.setup.run(this.setup.preparer.id, (c) =>
            this.setup.organisation.mappingOn(c, to.businessUnitId, this.setup.today()),
          );
    await this.run(this.preparer.user.id, async (context) => {
      await context.tx.execute(sql`
        insert into test_stock_harness.document (id, kind, version_id, version_no, state, site_id, store_id,
          business_unit_id, legal_entity_id, book_id, to_site_id, to_store_id, to_business_unit_id, occurred_at)
        values (${document.id}, ${kind}, ${document.versionId}, 1, 'prepared', ${from.siteId},
          ${unit.answer.storeId}, ${from.businessUnitId}, ${unit.answer.legalEntityId}, ${unit.answer.accountingBookId},
          ${to?.siteId ?? null}, ${toUnit?.kind === 'success' ? toUnit.answer.storeId : null},
          ${to?.businessUnitId ?? null}, ${context.startedAt.toISOString()})`);
      for (const line of lines) {
        const id = uuidv7();
        await context.tx.execute(sql`
          insert into test_stock_harness.document_line (id, document_id, version_id, line_id, sku_id, quantity,
            location_id, to_location_id, receipt_origin_id, movement_id, amount_paise, value_known)
          values (${id}, ${document.id}, ${document.versionId}, ${line.lineId}, ${line.skuId}, ${line.quantity},
            ${line.locationId ?? null}, ${line.toLocationId ?? null}, ${line.receiptOriginId ?? null},
            ${line.movementId ?? null}, ${line.amountPaise ?? null}, ${line.amountPaise !== undefined})`);
        for (const code of line.pieceCodes ?? []) {
          await context.tx.execute(sql`
            insert into test_stock_harness.document_line_piece (id, document_line_id, piece_code)
            values (${uuidv7()}, ${id}, ${code})`);
        }
      }
      await context.tx.execute(sql`
        insert into test_stock_harness.document_change (id, document_id, version_id, recorded_by_user_id)
        values (${uuidv7()}, ${document.id}, ${document.versionId}, ${this.preparer.user.id})`);
    });
    return document;
  }

  /**
   * Changes a document after it was prepared (15.2): a new version, with its lines as they were, recorded by the
   * preparer, under the document's lock at step 1, so any approval of the earlier version no longer covers it
   * (access-and-approvals 9.6; PRD-ACS-007).
   */
  async change(document: HarnessDocument): Promise<void> {
    const versionId = uuidv7();
    await this.run(this.preparer.user.id, async (context) => {
      await context.lock(LOCK_STEP.document, [{ table: DOCUMENT_TABLE, id: document.id, mode: 'exclusive' }]);
      await context.tx.execute(sql`
        update test_stock_harness.document set version_id = ${versionId}, version_no = version_no + 1
        where id = ${document.id}`);
      for (const line of document.lines) {
        await context.tx.execute(sql`
          insert into test_stock_harness.document_line (id, document_id, version_id, line_id, sku_id, quantity,
            location_id, to_location_id, receipt_origin_id, movement_id, amount_paise, value_known)
          values (${uuidv7()}, ${document.id}, ${versionId}, ${line.lineId}, ${line.skuId}, ${line.quantity},
            ${line.locationId ?? null}, ${line.toLocationId ?? null}, ${line.receiptOriginId ?? null},
            ${line.movementId ?? null}, ${line.amountPaise ?? null}, ${line.amountPaise !== undefined})`);
      }
      await context.tx.execute(sql`
        insert into test_stock_harness.document_change (id, document_id, version_id, recorded_by_user_id)
        values (${uuidv7()}, ${document.id}, ${versionId}, ${this.preparer.user.id})`);
    });
    document.versionId = versionId;
    document.versionNo += 1;
  }

  /**
   * Requests approval of the document's current version, on its value at cost, and has the checker decide it
   * (access-and-approvals 9.1, 9.5; PRD-ACS-006, PRD-ACS-015, PRD-ACS-016). Answers the decision.
   */
  async approveDocument(
    document: HarnessDocument,
    actionType: string,
    value:
      | { readonly kind: 'known'; readonly amountPaise: Paise }
      | { readonly kind: 'unknown' }
      | { readonly kind: 'none' },
  ): Promise<string> {
    const requestId = await this.requestApprovalOf(document, actionType, value);
    const decision = await this.decideAs(this.checker.user, requestId, document.versionId);
    if (decision.kind !== 'success') throw new Error(`approval refused: ${decision.refusal.code}`);
    return decision.answer.decisionId;
  }

  /** The record types `access` is composed with, the driver's document included (15.2). */
  registryOf(): readonly RecordTypeDeclaration[] {
    return this.registry;
  }

  /** Requests approval of the document's current version, on its value, by the preparer (9.1); answers the request. */
  requestApprovalOf(
    document: HarnessDocument,
    actionType: string,
    value:
      | { readonly kind: 'known'; readonly amountPaise: Paise }
      | { readonly kind: 'unknown' }
      | { readonly kind: 'none' },
  ): Promise<string> {
    return this.run(this.preparer.user.id, (context) =>
      this.access.requestApproval(context, {
        actionType,
        document: {
          module: HARNESS_MODULE,
          recordType: HARNESS_DOCUMENT_TYPE,
          recordId: document.id,
          versionId: document.versionId,
        },
        value,
        preparers: [this.preparer.user.id],
        requestedBy: { userId: this.preparer.user.id, roleAssignmentId: this.preparer.roleAssignmentId },
      }),
    );
  }

  /**
   * One step of a document (S1-F10 spec 3.2): one kernel command under an idempotency key, which locks the document
   * row with the decision's request at step 1, refuses a version other than the one posted or a state other than the
   * one expected, posts the items, and moves the document to its next state (stock-ledger 10.3, 10.4, 15.2).
   */
  async step(
    document: HarnessDocument,
    name: string,
    transition: { readonly from: string; readonly to: string },
    items: readonly LedgerItem[],
    approval?: { readonly decisionId: string; readonly actionType: string },
  ): Promise<StepOutcome> {
    const sent = await this.send(document, name, transition, items, approval);
    if (sent.kind !== 'written') throw new StepRefused(sent.kind === 'refused' ? sent.refusal : undefined);
    return sent;
  }

  /**
   * One step sent once under a new idempotency key, which answers whether it was written or refused (13.1); a
   * refusal rolled the whole command back, so the document stays as it was (SL-23 Outcome A). `importKind` names the
   * import the source carries, none by default (13.2); `as` the person who sends it, the preparer by default; `key`
   * the idempotency key, a new one by default; `hold` runs under every lock, after the rechecks and before any write,
   * so a concurrency test can keep the command there (code-house-rules 10.3).
   */
  async send(
    document: HarnessDocument,
    name: string,
    transition: { readonly from: string; readonly to: string },
    items: readonly LedgerItem[],
    approval?: { readonly decisionId: string; readonly actionType: string },
    options: SendOptions = {},
  ): Promise<StepSent> {
    const importKind = options.importKind ?? 'none';
    const as = options.as ?? this.preparer;
    const key = options.key ?? uuidv7();
    const source = {
      module: HARNESS_MODULE,
      recordType: HARNESS_RECORD_TYPE,
      recordId: document.id,
      versionId: document.versionId,
      importKind,
    };
    const content = {
      pathParameters: { documentId: document.id, step: name },
      body: { versionId: document.versionId, items: JSON.parse(JSON.stringify(items)) as string[] },
      secretFields: [],
      restrictedFields: [],
    };
    let written: Written | undefined;
    const send = () =>
      this.helper.run<StepAnswer>(
        {
          commandName: `${HARNESS_MODULE}.${document.kind}.${name}`,
          organisation: this.routed,
          correlationId: newCorrelationId(),
          actor: { kind: 'actor', actorId: as.user.id },
        },
        {
          key,
          content,
          authoriseReplay: () => Promise.resolve({ kind: 'allowed' as const }),
          work: async (context) => {
            try {
              written = await this.postIn(context, as, items, {
                source,
                documentType: HARNESS_DOCUMENT_TYPE,
                ...(approval === undefined ? {} : { approval }),
                ...(options.hold === undefined ? {} : { hold: options.hold }),
                ...(options.afterPlan === undefined ? {} : { afterPlan: options.afterPlan }),
                document: {
                  targets: [{ table: DOCUMENT_TABLE, id: document.id, mode: 'exclusive' } satisfies LockTarget],
                  recheck: (c) => this.recheckDocument(c, document, transition.from),
                  after: async (c) => {
                    await c.tx.execute(sql`
                      update test_stock_harness.document set state = ${transition.to} where id = ${document.id}`);
                  },
                },
              });
              return {
                kind: 'success' as const,
                answer: {
                  movementIds: written.movementIds,
                  receiptOriginIds: written.receiptOriginIds,
                  reservationIds: written.reservationIds,
                  holdIds: written.holdIds,
                },
                shows: 'nothing' as const,
              };
            } catch (error) {
              if (error instanceof PostingRefused) {
                return { kind: 'refusal' as const, refusal: error.refusal, causedBySecret: false };
              }
              throw error;
            }
          },
        },
      );
    const first = await send();
    if (first.kind === 'refusal')
      return { kind: 'refused', refusal: first.refusal as CommandRefusal, key, replay: send };
    if (first.replayed) return { kind: 'replayed', answer: first.answer, key };
    if (written === undefined) throw new StepRefused(undefined);
    document.state = transition.to;
    return { kind: 'written', written, key, replay: send };
  }

  /** Under the step 1 lock: the version posted is the current one, in the state the step expects (10.4; 15.2). */
  private async recheckDocument(
    context: TransactionContext,
    document: HarnessDocument,
    state: string,
  ): Promise<CommandRefusal | undefined> {
    const rows = await context.tx.execute<{ version_id: string; state: string }>(sql`
      select version_id, state from test_stock_harness.document where id = ${document.id}`);
    const [row] = rows.rows;
    const named = [{ kind: 'record', recordType: HARNESS_DOCUMENT_TYPE, recordId: document.id }];
    if (row === undefined) return { kind: 'not-found', code: `${HARNESS_MODULE}.document-not-found`, missing: named };
    if (row.version_id !== document.versionId)
      return { kind: 'conflict', code: 'kernel.stale-version', missing: named };
    if (row.state !== state) return { kind: 'refused', code: `${HARNESS_MODULE}.document-state`, missing: named };
    return undefined;
  }
}

/** How a step is sent (`send`). */
export interface SendOptions {
  readonly importKind?: ImportKind;
  readonly as?: Actor;
  readonly key?: string;
  readonly hold?: (context: TransactionContext) => Promise<void>;
  readonly afterPlan?: (context: TransactionContext) => Promise<void>;
}

/** A step that had to post and was refused. */
export class StepRefused extends Error {
  constructor(readonly refusal: CommandRefusal | { readonly code: string } | undefined) {
    super(`refused: ${refusal?.code ?? 'unknown'} ${JSON.stringify(refusal)}`);
  }
}
