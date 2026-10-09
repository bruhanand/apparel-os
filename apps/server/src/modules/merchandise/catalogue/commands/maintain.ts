import { uuidv7 } from '@apparel-os/domain';
import {
  BRAND_COVERAGE_CHANGE,
  type AttributeValue,
  type CategoryTrackingProfileVersionDraft,
  type PackDraft,
  type PackVersionDraft,
  type SkuVersionDraft,
  type StyleVersionDraft,
  type TrackingProfileDraft,
  type TrackingProfileVersionDraft,
  type AttributeDraft,
  type BrandDraft,
  type BrandVersionDraft,
  type BusinessUnitBrandVersionDraft,
  type CatalogueChanged,
  type CatalogueKind,
  type CatalogueNameVersionDraft,
  type CategoryDraft,
  type CategoryVersionDraft,
  type SizeSetDraft,
  type SizeSetVersionDraft,
} from '@apparel-os/schemas';
import { eq, sql } from 'drizzle-orm';
import {
  LOCK_STEP,
  lockTable,
  sqlStateOf,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { AuditChange, AuditInterface } from '../../../audit/index.js';
import { businessUnitHeads, type Preparer } from '../../../organisation/index.js';
import {
  attribute,
  attributeVersion,
  brand,
  brandAlias,
  brandVersion,
  businessUnitBrand,
  businessUnitBrandMember,
  businessUnitCoverage,
  category,
  categoryIdentityAttribute,
  categoryVersion,
  sizeSet,
  sizeSetMember,
  sizeSetVersion,
  vocabularyValueVersion,
  categoryTrackingProfile,
  pack,
  packContent,
  packVersion,
  skuVersion,
  styleAttributeValue,
  styleVersion,
  trackingProfile,
  trackingProfileVersion,
} from '../db/schema.js';
import { catalogueTables } from '../db/tables.js';
import { approved, operationName, recordTypeOf } from '../domain/kinds.js';
import type { StockPresence } from '../contracts/stock-presence.js';
import { trackingProfileChanged } from '../events.js';
import { isPieceTrackingChange, linkOn, piecesAskedOn } from '../queries/tracking.js';
import { attributeValuesRefusal, skusOfProfile, stockRecordedRefusal } from './product-rules.js';
import {
  ancestorsOf,
  approvedOn,
  exists,
  newestVersion,
  recordItem,
  referencesInForce,
  refused,
  takeEffect,
  today,
  type Outcome,
  type Reference,
} from './common.js';
import { coverageRules } from './rules.js';

// Maintain masters (structure-and-masters 2.2, 2.3, 4.7; module-map 4.12; S1-F03-T01): a new record with its first
// version, or a new version, under the record's lock. A brand coverage version waits for a different authorised
// person's approval (3.3; GC2-2, DEC-105), decided through `access` (effects.ts); every other version takes effect
// when it is recorded, as no rule names an approval for it (2.3). Each change writes its audit record in the same
// transaction (2.5). Module-map section 8 names no catalogue event yet, so none is emitted (2.5).

interface CommonColumns {
  readonly id: string;
  readonly validDuring: string;
  readonly decision: 'Awaiting approval';
  readonly preparedByUserId: string;
}

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
type Json = ValueChange['after'];
const value = (field: string, after: Json): ValueChange => ({ kind: 'value', field, before: null, after });

interface Change {
  readonly kind: CatalogueKind;
  readonly validFrom: string;
  readonly versionToken?: string | undefined;
  /** Records the version names: they must exist when recorded and be in force on its start when it takes effect. */
  readonly references: readonly Reference[];
  readonly changes: readonly AuditChange[];
  readonly writeVersion: (context: TransactionContext, common: CommonColumns, recordId: string) => Promise<void>;
  /** The rows the version holds, written with it (6.2). */
  readonly children?: (context: TransactionContext, versionId: string) => Promise<void>;
  /** The kind's own rules, checked under the record's lock before anything is written (4.1, 3.3). */
  readonly check?: (context: TransactionContext, recordId: string | undefined) => Promise<CommandRefusal | undefined>;
  /** The parent the version names, for the nesting rule and its locks (4.1). */
  readonly parent?: { readonly kind: 'brand' | 'category'; readonly id: string | undefined };
  /** What the change does once its version is written, such as the event module-map section 8 names (2.5). */
  readonly after?: (context: TransactionContext, recordId: string, versionId: string) => Promise<void>;
}

interface NewRecord {
  readonly code: string;
  readonly writeIdentity: (context: TransactionContext, id: string) => Promise<void>;
  readonly changes: readonly AuditChange[];
  /** Whether the code is taken in its scope, where that is not the whole Organisation, as a pack's SKU (4.1). */
  readonly taken?: (context: TransactionContext) => Promise<boolean>;
}

const UNIQUE_VIOLATION = '23505';
const from = (start: string) => `[${start},)`;

/** Preparing new records and versions of the catalogue (structure-and-masters 4.7, "Maintain masters"). */
export class CataloguePreparation {
  constructor(
    protected readonly audit: AuditInterface,
    protected readonly access: Pick<AccessInterface, 'requestApproval'>,
    /** The stock-presence contract `stock` implements (4.4, 4.6); none answers when left out. */
    protected readonly presence?: StockPresence,
  ) {}

  private async change(
    context: TransactionContext,
    preparer: Preparer,
    change: Change,
    target: { readonly kind: 'new'; readonly fixed: NewRecord } | { readonly kind: 'existing'; readonly id: string },
  ): Promise<Outcome<CatalogueChanged>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    // GC2-7, DEC-105: no version ever starts on a past date (structure-and-masters 2.2).
    if (change.validFrom < date) return refused('refused', 'merchandise.starts-in-past');
    const tables = catalogueTables[change.kind];
    const recordId = target.kind === 'new' ? uuidv7() : target.id;
    if (target.kind === 'existing') {
      if (change.kind === 'business_unit_brand') {
        // A unit's coverage has the unit's identity, recorded with its first coverage version (3.3).
        const units = await businessUnitHeads(context, [recordId]);
        if (!units.has(recordId)) {
          return refused('not-found', 'merchandise.record-not-found', [
            { kind: 'record', recordType: 'organisation.business_unit', recordId },
          ]);
        }
        await context.tx.insert(businessUnitCoverage).values({ id: recordId }).onConflictDoNothing();
      }
    }
    // The record's own row, exclusively, and the parents it would nest under, shared, so two changes that would
    // together close a loop never pass each other (code-house-rules 8.2).
    const parents =
      change.parent?.id === undefined ? [] : await ancestorsOf(context, change.parent.kind, change.parent.id);
    const targets: LockTarget[] = [
      ...(target.kind === 'existing'
        ? [{ table: lockTable('merchandise', tables.identityTable), id: recordId, mode: 'exclusive' as const }]
        : []),
      ...parents.map((id): LockTarget => ({ table: lockTable('merchandise', change.kind), id, mode: 'shared' })),
    ];
    if (targets.length > 0) {
      const locked = await context.lock(LOCK_STEP.document, targets);
      if (target.kind === 'existing' && locked.missing.some((each) => each.id === recordId)) {
        return refused('not-found', 'merchandise.record-not-found', [recordItem(change.kind, recordId)]);
      }
    }
    if (target.kind === 'existing') {
      // The version token (code-house-rules 12.7): a change made on a stale screen is refused, naming the newest.
      const newest = await newestVersion(context, change.kind, recordId);
      if (newest !== undefined && newest !== change.versionToken) {
        return refused('conflict', 'kernel.stale-version', [
          { kind: 'version', recordType: recordTypeOf(change.kind), recordId, versionId: newest },
        ]);
      }
    }
    for (const reference of change.references) {
      if (!(await exists(context, reference.kind, reference.id))) {
        return refused('not-found', 'merchandise.record-not-found', [recordItem(reference.kind, reference.id)]);
      }
    }
    if (change.parent?.id !== undefined && target.kind === 'existing' && parents.includes(recordId)) {
      return refused('refused', 'merchandise.parent-cycle', [recordItem(change.kind, change.parent.id)]);
    }
    const broken = await change.check?.(context, target.kind === 'existing' ? recordId : undefined);
    if (broken !== undefined) return { kind: 'refusal', refusal: broken };
    const direct = approved(change.kind);
    if (direct) {
      const notInForce = await referencesInForce(context, change.references, change.validFrom);
      if (notInForce !== undefined) return { kind: 'refusal', refusal: notInForce };
      if (target.kind === 'existing') {
        const overlap = await approvedOn(context, change.kind, recordId, change.validFrom);
        if (overlap !== undefined) return { kind: 'refusal', refusal: overlap };
      }
    }
    if (target.kind === 'new' && !(await this.writeNew(context, change.kind, target.fixed, recordId))) {
      return refused('refused', 'merchandise.code-taken');
    }
    const versionId = uuidv7();
    await change.writeVersion(
      context,
      {
        id: versionId,
        validDuring: from(change.validFrom),
        decision: 'Awaiting approval',
        preparedByUserId: preparer.userId,
      },
      recordId,
    );
    await change.children?.(context, versionId);
    if (direct) await takeEffect(context, change.kind, recordId, versionId, change.validFrom);
    await change.after?.(context, recordId, versionId);
    const name = operationName(change.kind);
    await this.audit.record(context, {
      actor: { kind: 'user', id: preparer.userId },
      roleAssignmentId: preparer.roleAssignmentId,
      record: { module: 'merchandise', type: change.kind, id: recordId, versionId },
      operation: direct
        ? target.kind === 'new'
          ? `record-${name}`
          : `record-${name}-version`
        : `prepare-${name}-version`,
      changes: [
        ...(target.kind === 'new' ? target.fixed.changes : []),
        ...change.changes,
        value('validFrom', change.validFrom),
      ],
      source: { kind: 'screen' },
    });
    if (direct) return { kind: 'success', answer: { recordId, versionId } };
    // A different authorised person decides it (GC2-2, DEC-105); a request still open on an earlier version of the
    // record is Superseded (access-and-approvals 9.6).
    const requestId = await this.access.requestApproval(context, {
      actionType: BRAND_COVERAGE_CHANGE,
      document: { module: 'merchandise', recordType: recordTypeOf(change.kind), recordId, versionId },
      value: { kind: 'none' },
      preparers: [preparer.userId],
      requestedBy: preparer,
    });
    return { kind: 'success', answer: { recordId, versionId, requestId } };
  }

  /** A new record's identity row, unless its code is taken (2.1): a race meets the unique constraint, refused. */
  private async writeNew(
    context: TransactionContext,
    kind: CatalogueKind,
    fixed: NewRecord,
    recordId: string,
  ): Promise<boolean> {
    const tables = catalogueTables[kind];
    if (fixed.taken !== undefined) {
      if (await fixed.taken(context)) return false;
    } else {
      const taken = await context.tx.execute(sql`select 1 from ${tables.identity} where code = ${fixed.code} limit 1`);
      if (taken.rows.length > 0) return false;
    }
    await context.tx.execute(sql`savepoint merchandise_new_record`);
    try {
      await fixed.writeIdentity(context, recordId);
      await context.tx.execute(sql`release savepoint merchandise_new_record`);
      return true;
    } catch (error) {
      if (sqlStateOf(error) !== UNIQUE_VIOLATION) throw error;
      await context.tx.execute(sql`rollback to savepoint merchandise_new_record`);
      return false;
    }
  }

  // Brands (4.1; PRD-MER-001, PRD-MER-020).

  private brandChange(draft: BrandDraft | BrandVersionDraft, retired: boolean): Change {
    const parentBrandId = draft.parentBrandId;
    return {
      kind: 'brand',
      validFrom: draft.validFrom,
      versionToken: 'versionToken' in draft ? draft.versionToken : undefined,
      references: parentBrandId === undefined ? [] : [{ kind: 'brand', id: parentBrandId }],
      parent: { kind: 'brand', id: parentBrandId },
      changes: [
        value('name', draft.name),
        value('parentBrandId', parentBrandId ?? null),
        value('aliases', [...draft.aliases]),
        value('retired', retired),
      ],
      writeVersion: async (context, common, recordId) => {
        await context.tx
          .insert(brandVersion)
          .values({ ...common, brandId: recordId, name: draft.name, parentBrandId: parentBrandId ?? null, retired });
      },
      children: async (context, versionId) => {
        if (draft.aliases.length === 0) return;
        await context.tx
          .insert(brandAlias)
          .values(draft.aliases.map((alias) => ({ id: uuidv7(), brandVersionId: versionId, alias })));
      },
    };
  }

  prepareBrand(context: TransactionContext, preparer: Preparer, draft: BrandDraft) {
    return this.change(context, preparer, this.brandChange(draft, false), {
      kind: 'new',
      fixed: {
        code: draft.code,
        writeIdentity: async (c, id) => {
          await c.tx.insert(brand).values({ id, code: draft.code });
        },
        changes: [value('code', draft.code)],
      },
    });
  }

  prepareBrandVersion(context: TransactionContext, preparer: Preparer, recordId: string, draft: BrandVersionDraft) {
    return this.change(context, preparer, this.brandChange(draft, draft.retired), { kind: 'existing', id: recordId });
  }

  // A business unit's brand coverage (3.3; PRD-ORG-006).

  prepareBusinessUnitBrandVersion(
    context: TransactionContext,
    preparer: Preparer,
    unitId: string,
    draft: BusinessUnitBrandVersionDraft,
  ) {
    return this.change(
      context,
      preparer,
      {
        kind: 'business_unit_brand',
        validFrom: draft.validFrom,
        versionToken: draft.versionToken,
        references: draft.brandIds.map((id) => ({ kind: 'brand' as const, id })),
        changes: [value('brandIds', [...draft.brandIds])],
        check: (c) => coverageRules(c, unitId, draft.brandIds.length),
        writeVersion: async (c, common) => {
          await c.tx.insert(businessUnitBrand).values({ ...common, businessUnitId: unitId });
        },
        children: async (c, versionId) => {
          if (draft.brandIds.length === 0) return;
          await c.tx
            .insert(businessUnitBrandMember)
            .values(draft.brandIds.map((brandId) => ({ id: uuidv7(), businessUnitBrandId: versionId, brandId })));
        },
      },
      { kind: 'existing', id: unitId },
    );
  }

  // Categories and size sets (4.1; PRD-MER-002, PRD-ORG-011, POL-04.01).

  private categoryChange(draft: CategoryDraft | CategoryVersionDraft): Change {
    const parentCategoryId = draft.parentCategoryId;
    const sizeSetId = draft.sizeSetId;
    return {
      kind: 'category',
      validFrom: draft.validFrom,
      versionToken: 'versionToken' in draft ? draft.versionToken : undefined,
      references: [
        ...(parentCategoryId === undefined ? [] : [{ kind: 'category' as const, id: parentCategoryId }]),
        ...(sizeSetId === undefined ? [] : [{ kind: 'size_set' as const, id: sizeSetId }]),
        ...draft.identityAttributeIds.map((id) => ({ kind: 'attribute' as const, id })),
      ],
      parent: { kind: 'category', id: parentCategoryId },
      changes: [
        value('name', draft.name),
        value('parentCategoryId', parentCategoryId ?? null),
        value('sizeSetId', sizeSetId ?? null),
        value('identityAttributeIds', [...draft.identityAttributeIds]),
      ],
      // A size set is fixed to one category: a category names only its own (4.1).
      check: async (c, recordId) => {
        if (sizeSetId === undefined) return undefined;
        const [row] = await c.tx
          .select({ categoryId: sizeSet.categoryId })
          .from(sizeSet)
          .where(eq(sizeSet.id, sizeSetId));
        return row === undefined || row.categoryId === recordId
          ? undefined
          : {
              kind: 'refused',
              code: 'merchandise.size-set-of-another-category',
              missing: [recordItem('size_set', sizeSetId)],
            };
      },
      writeVersion: async (c, common, recordId) => {
        await c.tx.insert(categoryVersion).values({
          ...common,
          categoryId: recordId,
          name: draft.name,
          parentCategoryId: parentCategoryId ?? null,
          sizeSetId: sizeSetId ?? null,
        });
      },
      children: async (c, versionId) => {
        if (draft.identityAttributeIds.length === 0) return;
        await c.tx.insert(categoryIdentityAttribute).values(
          draft.identityAttributeIds.map((attributeId) => ({
            id: uuidv7(),
            categoryVersionId: versionId,
            attributeId,
          })),
        );
      },
    };
  }

  prepareCategory(context: TransactionContext, preparer: Preparer, draft: CategoryDraft) {
    return this.change(context, preparer, this.categoryChange(draft), {
      kind: 'new',
      fixed: {
        code: draft.code,
        writeIdentity: async (c, id) => {
          await c.tx.insert(category).values({ id, code: draft.code });
        },
        changes: [value('code', draft.code)],
      },
    });
  }

  prepareCategoryVersion(
    context: TransactionContext,
    preparer: Preparer,
    recordId: string,
    draft: CategoryVersionDraft,
  ) {
    return this.change(context, preparer, this.categoryChange(draft), { kind: 'existing', id: recordId });
  }

  private sizeSetChange(draft: SizeSetDraft | SizeSetVersionDraft, categoryId?: string): Change {
    return {
      kind: 'size_set',
      validFrom: draft.validFrom,
      versionToken: 'versionToken' in draft ? draft.versionToken : undefined,
      references: categoryId === undefined ? [] : [{ kind: 'category', id: categoryId }],
      changes: [value('name', draft.name), value('sizes', [...draft.sizes])],
      writeVersion: async (c, common, recordId) => {
        await c.tx.insert(sizeSetVersion).values({ ...common, sizeSetId: recordId, name: draft.name });
      },
      children: async (c, versionId) => {
        await c.tx
          .insert(sizeSetMember)
          .values(draft.sizes.map((size, position) => ({ id: uuidv7(), sizeSetVersionId: versionId, position, size })));
      },
    };
  }

  prepareSizeSet(context: TransactionContext, preparer: Preparer, draft: SizeSetDraft) {
    return this.change(context, preparer, this.sizeSetChange(draft, draft.categoryId), {
      kind: 'new',
      fixed: {
        code: draft.code,
        writeIdentity: async (c, id) => {
          await c.tx.insert(sizeSet).values({ id, code: draft.code, categoryId: draft.categoryId });
        },
        changes: [value('code', draft.code), value('categoryId', draft.categoryId)],
      },
    });
  }

  prepareSizeSetVersion(context: TransactionContext, preparer: Preparer, recordId: string, draft: SizeSetVersionDraft) {
    return this.change(context, preparer, this.sizeSetChange(draft), { kind: 'existing', id: recordId });
  }

  // Attributes and vocabulary values (4.2; GC2-9).

  private nameChange(
    kind: 'attribute' | 'vocabulary_value',
    draft: { name: string; validFrom: string; versionToken?: string | undefined },
  ): Change {
    return {
      kind,
      validFrom: draft.validFrom,
      versionToken: draft.versionToken,
      references: [],
      changes: [value('name', draft.name)],
      writeVersion: async (c, common, recordId) => {
        if (kind === 'attribute') {
          await c.tx.insert(attributeVersion).values({ ...common, attributeId: recordId, name: draft.name });
        } else {
          await c.tx
            .insert(vocabularyValueVersion)
            .values({ ...common, vocabularyValueId: recordId, name: draft.name });
        }
      },
    };
  }

  prepareAttribute(context: TransactionContext, preparer: Preparer, draft: AttributeDraft) {
    return this.change(context, preparer, this.nameChange('attribute', draft), {
      kind: 'new',
      fixed: {
        code: draft.code,
        writeIdentity: async (c, id) => {
          await c.tx.insert(attribute).values({ id, code: draft.code, valueKind: draft.valueKind });
        },
        changes: [value('code', draft.code), value('valueKind', draft.valueKind)],
      },
    });
  }

  /** A new version of an attribute's or a vocabulary value's name. */
  prepareNameVersion(
    context: TransactionContext,
    preparer: Preparer,
    kind: 'attribute' | 'vocabulary_value',
    recordId: string,
    draft: CatalogueNameVersionDraft,
  ) {
    return this.change(context, preparer, this.nameChange(kind, draft), { kind: 'existing', id: recordId });
  }

  // Tracking profiles and each category's link to one (4.5, 4.6; PRD-MER-010, PRD-MER-014, PRD-MER-018, POL-04.01,
  // POL-04.05; S1-F03-T02).

  private trackingProfileChange(draft: TrackingProfileDraft | TrackingProfileVersionDraft): Change {
    return {
      kind: 'tracking_profile',
      validFrom: draft.validFrom,
      versionToken: 'versionToken' in draft ? draft.versionToken : undefined,
      references: [],
      changes: [
        value('name', draft.name),
        value('pieceTracked', draft.pieceTracked),
        value('batchExpiryRequired', draft.batchExpiryRequired),
        value('requiredIdentifiers', [...draft.requiredIdentifiers]),
        value('receivingShelfLifeDays', draft.receivingShelfLifeDays ?? null),
        value('sellingShelfLifeDays', draft.sellingShelfLifeDays ?? null),
      ],
      // PRD-MER-018, DEC-054: a change to piece-tracked is refused while stock of the profile's goods is recorded at a
      // Site with no labelling count planned there. Labelling counts are stage 2's, so none is planned yet: any Site
      // holding such stock refuses it (4.6).
      check: async (c, recordId) => {
        if (recordId === undefined || !draft.pieceTracked) return undefined;
        if (!(await isPieceTrackingChange(c, recordId, draft.validFrom))) return undefined;
        const skus = await skusOfProfile(c, recordId, draft.validFrom);
        return stockRecordedRefusal(c, this.presence, skus, 'merchandise.labelling-count-not-planned');
      },
      writeVersion: async (c, common, recordId) => {
        await c.tx.insert(trackingProfileVersion).values({
          ...common,
          trackingProfileId: recordId,
          name: draft.name,
          pieceTracked: draft.pieceTracked,
          batchExpiryRequired: draft.batchExpiryRequired,
          requiredIdentifiers: [...draft.requiredIdentifiers],
          receivingShelfLifeDays: draft.receivingShelfLifeDays ?? null,
          sellingShelfLifeDays: draft.sellingShelfLifeDays ?? null,
        });
      },
      after: async (c, recordId, versionId) => {
        await c.publish(trackingProfileChanged, {
          subject: { module: 'merchandise', recordType: recordTypeOf('tracking_profile'), recordId, versionId },
          payload: { change: 'profile', recordId, versionId },
        });
      },
    };
  }

  prepareTrackingProfile(context: TransactionContext, preparer: Preparer, draft: TrackingProfileDraft) {
    return this.change(context, preparer, this.trackingProfileChange(draft), {
      kind: 'new',
      fixed: {
        code: draft.code,
        writeIdentity: async (c, id) => {
          await c.tx.insert(trackingProfile).values({ id, code: draft.code });
        },
        changes: [value('code', draft.code)],
      },
    });
  }

  prepareTrackingProfileVersion(
    context: TransactionContext,
    preparer: Preparer,
    recordId: string,
    draft: TrackingProfileVersionDraft,
  ) {
    return this.change(context, preparer, this.trackingProfileChange(draft), { kind: 'existing', id: recordId });
  }

  /**
   * A category's tracking profile from a date (4.6; POL-04.01). A category moves from quantity to piece tracking only
   * through its profile's own version, which the labelling count puts in force Site by Site (PRD-MER-018), so a link
   * keeps the tracking of the link it ends on its start (`merchandise.tracking-change-through-profile`). A category's
   * first link may name any profile: no stock of its goods can be held before it has one. **Design choice.**
   */
  prepareCategoryTrackingProfileVersion(
    context: TransactionContext,
    preparer: Preparer,
    categoryId: string,
    draft: CategoryTrackingProfileVersionDraft,
  ) {
    return this.change(
      context,
      preparer,
      {
        kind: 'category_tracking_profile',
        validFrom: draft.validFrom,
        versionToken: draft.versionToken,
        references: [{ kind: 'tracking_profile', id: draft.trackingProfileId }],
        changes: [value('trackingProfileId', draft.trackingProfileId)],
        check: async (c) => {
          const previous = await linkOn(c, categoryId, draft.validFrom);
          if (previous === undefined || previous.trackingProfileId === draft.trackingProfileId) return undefined;
          const before = await piecesAskedOn(c, previous.trackingProfileId, draft.validFrom);
          const after = await piecesAskedOn(c, draft.trackingProfileId, draft.validFrom);
          return before === after
            ? undefined
            : {
                kind: 'refused',
                code: 'merchandise.tracking-change-through-profile',
                missing: [recordItem('tracking_profile', draft.trackingProfileId)],
              };
        },
        writeVersion: async (c, common) => {
          await c.tx
            .insert(categoryTrackingProfile)
            .values({ ...common, categoryId, trackingProfileId: draft.trackingProfileId });
        },
        after: async (c, recordId, versionId) => {
          await c.publish(trackingProfileChanged, {
            subject: {
              module: 'merchandise',
              recordType: recordTypeOf('category_tracking_profile'),
              recordId,
              versionId,
            },
            payload: { change: 'category-link', recordId, versionId },
          });
        },
      },
      { kind: 'existing', id: categoryId },
    );
  }

  // Styles and SKUs: their later versions (4.1, 4.4; PRD-MER-004, POL-04.03, POL-04.04, PRD-MER-019). A new style or
  // SKU is made only by confirming its product proposal (4.2).

  prepareStyleVersion(context: TransactionContext, preparer: Preparer, styleId: string, draft: StyleVersionDraft) {
    return this.change(
      context,
      preparer,
      {
        kind: 'style',
        validFrom: draft.validFrom,
        versionToken: draft.versionToken,
        references: [],
        changes: [
          value('brandArticleNumber', draft.brandArticleNumber ?? null),
          value('launchDate', draft.launchDate ?? null),
          value('hsn', draft.hsn ?? null),
          value(
            'attributes',
            draft.attributes.map((each) => ({
              attributeId: each.attributeId,
              value: each.valueId ?? each.text ?? null,
            })),
          ),
        ],
        // GC2-9: a list-type attribute takes only an approved value of its vocabulary in force on the start (4.2).
        check: (c) => attributeValuesRefusal(c, draft.attributes, draft.validFrom),
        writeVersion: async (c, common) => {
          await c.tx.insert(styleVersion).values({
            ...common,
            styleId,
            brandArticleNumber: draft.brandArticleNumber ?? null,
            launchDate: draft.launchDate ?? null,
            hsn: draft.hsn ?? null,
          });
        },
        children: (c, versionId) => writeStyleAttributes(c, versionId, draft.attributes),
      },
      { kind: 'existing', id: styleId },
    );
  }

  /**
   * A SKU's later version (4.4; GC2-5): a new stock unit is refused while stock of the SKU is recorded, asked of the
   * stock ledger through the stock-presence contract; its purpose may change (PRD-MER-019).
   */
  prepareSkuVersion(context: TransactionContext, preparer: Preparer, skuId: string, draft: SkuVersionDraft) {
    return this.change(
      context,
      preparer,
      {
        kind: 'sku',
        validFrom: draft.validFrom,
        versionToken: draft.versionToken,
        references: [],
        changes: [value('stockUnit', draft.stockUnit), value('purpose', draft.purpose)],
        check: async (c) => {
          const current = await c.tx.execute<{ stock_unit: string }>(sql`
            select stock_unit from merchandise.sku_version
            where sku_id = ${skuId}::uuid and decision = 'Approved'
              and lower(valid_during) <= ${draft.validFrom}::date
            order by lower(valid_during) desc limit 1`);
          const unit = current.rows[0]?.stock_unit;
          if (unit === undefined || unit === draft.stockUnit) return undefined;
          return stockRecordedRefusal(c, this.presence, [skuId], 'merchandise.stock-recorded');
        },
        writeVersion: async (c, common) => {
          await c.tx
            .insert(skuVersion)
            .values({ ...common, skuId, stockUnit: draft.stockUnit, purpose: draft.purpose });
        },
      },
      { kind: 'existing', id: skuId },
    );
  }

  // Packs (4.4; POL-04.03, POL-04.04, PRD-MER-012): each version keeps its conversion, so past quantities keep theirs.

  private packChange(draft: PackDraft | PackVersionDraft, skuId?: string): Change {
    return {
      kind: 'pack',
      validFrom: draft.validFrom,
      versionToken: 'versionToken' in draft ? draft.versionToken : undefined,
      references: [
        ...(skuId === undefined ? [] : [{ kind: 'sku' as const, id: skuId }]),
        ...draft.contents.map((content) => ({ kind: 'sku' as const, id: content.skuId })),
      ],
      changes: [
        value('units', draft.units ?? null),
        value('mixed', draft.mixed),
        value('forPurchasing', draft.forPurchasing),
        value('forSelling', draft.forSelling),
        value(
          'contents',
          draft.contents.map((content) => ({ skuId: content.skuId, quantity: content.quantity })),
        ),
      ],
      writeVersion: async (c, common, recordId) => {
        await c.tx.insert(packVersion).values({
          ...common,
          packId: recordId,
          units: draft.units ?? null,
          mixed: draft.mixed,
          forPurchasing: draft.forPurchasing,
          forSelling: draft.forSelling,
        });
      },
      children: async (c, versionId) => {
        if (draft.contents.length === 0) return;
        await c.tx.insert(packContent).values(
          draft.contents.map((content) => ({
            id: uuidv7(),
            packVersionId: versionId,
            skuId: content.skuId,
            quantity: content.quantity,
          })),
        );
      },
    };
  }

  preparePack(context: TransactionContext, preparer: Preparer, draft: PackDraft) {
    return this.change(context, preparer, this.packChange(draft, draft.skuId), {
      kind: 'new',
      fixed: {
        code: draft.code,
        // A pack's code is unique in its SKU (4.1).
        taken: async (c) =>
          (
            await c.tx.execute(
              sql`select 1 from merchandise.pack where sku_id = ${draft.skuId}::uuid and code = ${draft.code}`,
            )
          ).rows.length > 0,
        writeIdentity: async (c, id) => {
          await c.tx.insert(pack).values({ id, code: draft.code, skuId: draft.skuId });
        },
        changes: [value('code', draft.code), value('skuId', draft.skuId)],
      },
    });
  }

  preparePackVersion(context: TransactionContext, preparer: Preparer, packId: string, draft: PackVersionDraft) {
    return this.change(context, preparer, this.packChange(draft), { kind: 'existing', id: packId });
  }
}

/** A style version's attribute values, frozen with it (4.1, 4.2). */
export async function writeStyleAttributes(
  context: TransactionContext,
  versionId: string,
  attributes: readonly AttributeValue[],
): Promise<void> {
  if (attributes.length === 0) return;
  await context.tx.insert(styleAttributeValue).values(
    attributes.map((each) => ({
      id: uuidv7(),
      styleVersionId: versionId,
      attributeId: each.attributeId,
      vocabularyValueId: each.valueId ?? null,
      textValue: each.text ?? null,
    })),
  );
}
