import {
  IMPORT_BATCH_APPROVAL,
  IMPORT_BATCH_TYPE,
  PRODUCT_PROPOSAL_TYPE,
  productProposalDraftSchema,
  skuPurposeSchema,
  stockUnitSchema,
  type DocumentPreview,
  type ProductProposalDraft,
  type SkuVersionDraft,
  type ValueSuggestion,
} from '@apparel-os/schemas';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { lockTable, type CommandRefusal, type LockTarget, type TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import {
  closeSuggestions,
  knownValue,
  optionSuggestions,
  type HandlerDocument,
  type HandlerRow,
  type ImportHandler,
} from '../../../files-imports/index.js';
import { brand, brandVersion, category, categoryVersion, sku, skuVersion, style } from '../db/schema.js';
import type { StoredProposal } from '../domain/products.js';
import { today } from './common.js';
import type { CataloguePreparation } from './maintain.js';
import { proposalRefusal } from './product-rules.js';
import { proposeProduct } from './products.js';

// The `merchandise` create handler for products (imports-and-opening-data 13.2; structure-and-masters 4.2, 7;
// module-map 4.7 "Register an import handler", section 3 rules 6 and 8; PRD-IMP-010, PRD-IMP-012, PRD-MER-013;
// S1-F06-T01). A document is one style with its SKUs, one staged row for each SKU; it arrives as a product proposal
// through the catalogue's own Propose a product, so the same checks and the same confirmation by a different person
// apply (DM-5). Identity is never filled from a guess (PRD-IMP-009): the brand and category are found by their exact
// codes, and every value comes from the file, a confirmed mapping rule or a person's entry. As built with S1-F06-T03:
// the review is the preparer's submission, since each proposal is confirmed by a different person; suggestions for the
// brand and category codes come from the catalogue's own brands and categories, exact by code or close by trigram over
// their codes and names (PRD Stack: Search), and for the stock unit and purpose from the values the catalogue accepts;
// a mapping rule may target a brand or category code that exists, or a stock unit or purpose the catalogue accepts.
// The handler has no attribute value field yet, so no vocabulary word is searched or mapped (structure-and-masters 4.1).
// With S1-F06-T04 it takes the update kind too: a document of an update batch is a style's SKUs, each SKU's next version
// with the row's stock unit and purpose, starting today, through Prepare a SKU version; and a governed revision of the
// document that published the style (imports-and-opening-data 4.1, 7.1, 7.3), reviewed by an independent approval of
// the batch version before Publish, since a SKU version takes effect when recorded (product owner, 11 Oct 2026). Its
// source identity is the style record type and the style's code.

/** The fields of the handler's staged row. Size is optional: absent, it is Unknown (4.1). */
/** The record types an update versions, and a product's source identity names (imports-and-opening-data 7.1). */
const STYLE_TYPE = 'merchandise.style';
const SKU_TYPE = 'merchandise.sku';

const FIELDS = [
  { name: 'styleCode', required: true },
  { name: 'skuCode', required: true },
  { name: 'brandCode', required: true },
  { name: 'categoryCode', required: true },
  { name: 'size', required: false },
  { name: 'stockUnit', required: true },
  { name: 'purpose', required: true },
] as const;

type Issue = Extract<DocumentPreview, { kind: 'issues' }>['issues'][number];

function valueOf(row: HandlerRow, field: string): string | undefined {
  return knownValue(row.values[field]);
}

/**
 * The trigram similarity below which a code or name is no close match (PRD Stack: Search). Technical tuning of a
 * suggestion a person still accepts, never a business value: imports-and-opening-data 13.2, a design choice accepted
 * as a builder value by the product owner, 10 Oct 2026. The most offered is `MOST_SUGGESTIONS`, shared by handlers.
 */
const CLOSE = 0.3;

/** The refusal of a value the catalogue does not accept. */
const NOT_ACCEPTED = 'merchandise.import-value-not-accepted';

/**
 * A row's stock unit and purpose, each a value the catalogue accepts (4.1), with an issue for each that is not.
 */
function unitAndPurpose(row: HandlerRow, issues: Issue[]) {
  const stockUnit = stockUnitSchema.safeParse(valueOf(row, 'stockUnit'));
  const purpose = skuPurposeSchema.safeParse(valueOf(row, 'purpose'));
  if (!stockUnit.success) issues.push({ code: NOT_ACCEPTED, field: 'stockUnit', rowNumber: row.rowNumber });
  if (!purpose.success) issues.push({ code: NOT_ACCEPTED, field: 'purpose', rowNumber: row.rowNumber });
  return stockUnit.success && purpose.success ? { stockUnit: stockUnit.data, purpose: purpose.data } : undefined;
}

/** The handler's refusal of a document, from the first of its issues (PRD-UXP-003). */
function refusedFor(issues: readonly Issue[]) {
  return {
    kind: 'refused' as const,
    refusal: { kind: 'refused' as const, code: issues[0]?.code ?? NOT_ACCEPTED, missing: [] },
  };
}

/**
 * Exact or close matches for a brand or category code (section 5; PRD-IMP-009): the record whose code is the value;
 * else those whose code or approved name is most like it by trigram similarity.
 */
async function codeSuggestions(
  context: TransactionContext,
  kind: 'brand' | 'category',
  value: string | undefined,
): Promise<ValueSuggestion[]> {
  if (value === undefined || value === '') return [];
  const identity = kind === 'brand' ? brand : category;
  const version = kind === 'brand' ? brandVersion : categoryVersion;
  const owner = kind === 'brand' ? brandVersion.brandId : categoryVersion.categoryId;
  const exact = await context.tx.select({ code: identity.code }).from(identity).where(eq(identity.code, value));
  if (exact.length > 0) return exact.map((row) => ({ kind: 'exact', value: row.code }));
  const score = sql<number>`greatest(public.similarity(${identity.code}, ${value}), public.similarity(${version.name}, ${value}))`;
  const rows = await context.tx
    .select({ code: identity.code, name: version.name, score })
    .from(identity)
    .innerJoin(version, and(eq(owner, identity.id), eq(version.decision, 'Approved')))
    .where(sql`${score} >= ${CLOSE}`)
    .orderBy(desc(score), identity.code);
  return closeSuggestions(rows.map((row) => ({ value: row.code, label: row.name })));
}

/** Whether a code names a brand or category of the catalogue. */
async function codeExists(context: TransactionContext, kind: 'brand' | 'category', code: string): Promise<boolean> {
  return (await idOfCode(context, kind === 'brand' ? brand : category, code)) !== undefined;
}

async function idOfCode(
  context: TransactionContext,
  table: typeof brand | typeof category,
  code: string,
): Promise<string | undefined> {
  const [row] = await context.tx.select({ id: table.id }).from(table).where(eq(table.code, code));
  return row?.id;
}

/**
 * The product proposal a document stands for, or the issues that stop it: each row's values must be accepted, every
 * row must name the document's style, brand and category, and the brand and category must exist by their codes.
 */
async function draftOf(
  context: TransactionContext,
  document: HandlerDocument,
): Promise<{ readonly draft: ProductProposalDraft } | { readonly issues: Issue[] }> {
  const issues: Issue[] = [];
  const [first] = document.rows;
  if (first === undefined) return { issues: [{ code: 'merchandise.import-document-empty' }] };
  const brandCode = valueOf(first, 'brandCode') ?? '';
  const categoryCode = valueOf(first, 'categoryCode') ?? '';
  const skus: ProductProposalDraft['skus'][number][] = [];
  for (const row of document.rows) {
    for (const [field, expected] of [
      ['styleCode', document.reference],
      ['brandCode', brandCode],
      ['categoryCode', categoryCode],
    ] as const) {
      if (valueOf(row, field) !== expected) {
        issues.push({ code: 'merchandise.import-style-differs', field, rowNumber: row.rowNumber });
      }
    }
    const accepted = unitAndPurpose(row, issues);
    const size = valueOf(row, 'size');
    if (accepted !== undefined) {
      skus.push({
        code: valueOf(row, 'skuCode') ?? '',
        ...(size === undefined ? {} : { size }),
        identity: [],
        ...accepted,
      });
    }
  }
  const brandId = await idOfCode(context, brand, brandCode);
  if (brandId === undefined) {
    issues.push({ code: 'merchandise.record-not-found', field: 'brandCode', rowNumber: first.rowNumber });
  }
  const categoryId = await idOfCode(context, category, categoryCode);
  if (categoryId === undefined) {
    issues.push({ code: 'merchandise.record-not-found', field: 'categoryCode', rowNumber: first.rowNumber });
  }
  if (issues.length > 0 || brandId === undefined || categoryId === undefined) return { issues };
  const draft = productProposalDraftSchema.safeParse({
    style: { code: document.reference, brandId, categoryId, attributes: [] },
    skus,
  });
  if (!draft.success) return { issues: [{ code: NOT_ACCEPTED }] };
  return { draft: draft.data };
}

/** An update document's SKUs and their next versions, starting today (4.1, 4.4; structure-and-masters 2.2). */
interface SkuUpdates {
  readonly skus: readonly { readonly skuId: string; readonly draft: SkuVersionDraft }[];
}

/**
 * The next versions an update document stands for (imports-and-opening-data 4.1, 7.3; S1-F06-T04), or the issues that
 * stop it. The style must exist by the document's code, every row must name its brand and category, and each row is a
 * SKU of that style by its code, of the same size: a style's brand and category and a SKU's size are fixed at its
 * creation, so a file that differs is refused, never applied. Each SKU's next version takes the row's stock unit and
 * purpose and starts today; a new SKU arrives only through a product proposal (4.2).
 */
async function updatesOf(
  context: TransactionContext,
  document: HandlerDocument,
): Promise<{ readonly updates: SkuUpdates } | { readonly issues: Issue[] }> {
  const [first] = document.rows;
  if (first === undefined) return { issues: [{ code: 'merchandise.import-document-empty' }] };
  const date = await today(context);
  if (typeof date !== 'string') return { issues: [{ code: date.code }] };
  const [owner] = await context.tx
    .select({ id: style.id, brandId: style.brandId, categoryId: style.categoryId })
    .from(style)
    .where(eq(style.code, document.reference));
  if (owner === undefined) {
    return { issues: [{ code: 'merchandise.record-not-found', field: 'styleCode', rowNumber: first.rowNumber }] };
  }
  const issues: Issue[] = [];
  const brandId = await idOfCode(context, brand, valueOf(first, 'brandCode') ?? '');
  const categoryId = await idOfCode(context, category, valueOf(first, 'categoryCode') ?? '');
  if (brandId !== owner.brandId) {
    issues.push({ code: 'merchandise.import-identity-differs', field: 'brandCode', rowNumber: first.rowNumber });
  }
  if (categoryId !== owner.categoryId) {
    issues.push({ code: 'merchandise.import-identity-differs', field: 'categoryCode', rowNumber: first.rowNumber });
  }
  // The style's SKUs the rows name, then their newest versions, in two reads; the version token is the newest
  // version's, read in the transaction that prepares it (code-house-rules 12.7).
  const codes = document.rows.map((row) => valueOf(row, 'skuCode') ?? '');
  const named = await context.tx
    .select({ id: sku.id, code: sku.code, size: sku.size })
    .from(sku)
    .where(and(eq(sku.styleId, owner.id), inArray(sku.code, codes)));
  const newest = new Map(
    named.length === 0
      ? []
      : (
          await context.tx
            .select({ skuId: skuVersion.skuId, id: sql<string>`max(${skuVersion.id}::text)` })
            .from(skuVersion)
            .where(
              inArray(
                skuVersion.skuId,
                named.map((each) => each.id),
              ),
            )
            .groupBy(skuVersion.skuId)
        ).map((each) => [each.skuId, each.id]),
  );
  const found = new Map(named.map((each) => [each.code, { ...each, newest: newest.get(each.id) ?? null }]));
  const skus: { skuId: string; draft: SkuVersionDraft }[] = [];
  for (const row of document.rows) {
    if (valueOf(row, 'styleCode') !== document.reference) {
      issues.push({ code: 'merchandise.import-style-differs', field: 'styleCode', rowNumber: row.rowNumber });
    }
    const each = found.get(valueOf(row, 'skuCode') ?? '');
    if (each === undefined) {
      issues.push({ code: 'merchandise.record-not-found', field: 'skuCode', rowNumber: row.rowNumber });
      continue;
    }
    if ((valueOf(row, 'size') ?? null) !== each.size) {
      issues.push({ code: 'merchandise.import-identity-differs', field: 'size', rowNumber: row.rowNumber });
    }
    const accepted = unitAndPurpose(row, issues);
    if (accepted === undefined) continue;
    skus.push({
      skuId: each.id,
      draft: { ...accepted, validFrom: date, ...(each.newest === null ? {} : { versionToken: each.newest }) },
    });
  }
  if (issues.length > 0) return { issues };
  return { updates: { skus } };
}

export interface ProductImportDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
  /** The catalogue's own Maintain operations, for an update's SKU versions (structure-and-masters 7). */
  readonly catalogue: Pick<CataloguePreparation, 'prepareSkuVersion'>;
}

/** The handler `merchandise` · catalogue registers with files-imports at start. */
export function productImportHandler(dependencies: ProductImportDependencies): ImportHandler {
  return {
    target: 'merchandise',
    recordType: PRODUCT_PROPOSAL_TYPE,
    // A correction of a product is its SKUs' next versions, through an update batch (imports-and-opening-data 4.1, 7.3).
    kinds: ['create', 'update'],
    effects: 'master-records',
    fields: FIELDS,
    measures: [],
    // A product's source identity is the style record type and the style's code (imports-and-opening-data 7.1).
    sourceScope: () => STYLE_TYPE,
    revisions: 'new-version',
    // Products and SKUs belong to no place, so a document's need carries no scope facts (structure-and-masters 6.1).
    publishNeeds: (_context, document) =>
      Promise.resolve(
        document.kind === 'update'
          ? { action: 'edit', recordType: SKU_TYPE }
          : { action: 'create', recordType: PRODUCT_PROPOSAL_TYPE },
      ),
    // An update locks the SKUs it versions with the batch at step 1, as Prepare a SKU version would lock them (8.2).
    async lockTargets(context, document): Promise<LockTarget[]> {
      if (document.kind !== 'update') return [];
      const updated = await updatesOf(context, document);
      if ('issues' in updated) return [];
      return updated.updates.skus.map((each) => ({
        table: lockTable('merchandise', 'sku'),
        id: each.skuId,
        mode: 'exclusive' as const,
      }));
    },
    // The review (3.1 step 8, 13.2): a create batch's products arrive as proposals each confirmed by a different person,
    // so the preparer's submission is the review. An update batch is a governed revision whose SKU versions take effect
    // when it publishes, so it needs an independent approval of the batch version in `access` before Publish
    // (PRD-ACS-006, PRD-ACS-007; product owner, 11 Oct 2026).
    review: (kind) =>
      kind === 'update'
        ? { kind: 'approval', actionType: IMPORT_BATCH_APPROVAL, recordType: IMPORT_BATCH_TYPE }
        : { kind: 'submission' },
    async suggestions(context, field, value) {
      switch (field) {
        case 'brandCode':
          return codeSuggestions(context, 'brand', value);
        case 'categoryCode':
          return codeSuggestions(context, 'category', value);
        case 'stockUnit':
          return optionSuggestions(stockUnitSchema.options, value);
        case 'purpose':
          return optionSuggestions(skuPurposeSchema.options, value);
        default:
          return [];
      }
    },
    async checkRuleTarget(context, field, target): Promise<CommandRefusal | undefined> {
      const missing = [{ kind: 'rule-target', field, target }];
      switch (field) {
        case 'brandCode':
        case 'categoryCode':
          return (await codeExists(context, field === 'brandCode' ? 'brand' : 'category', target))
            ? undefined
            : { kind: 'refused', code: 'merchandise.record-not-found', missing };
        case 'stockUnit':
          return stockUnitSchema.safeParse(target).success
            ? undefined
            : { kind: 'refused', code: NOT_ACCEPTED, missing };
        case 'purpose':
          return skuPurposeSchema.safeParse(target).success
            ? undefined
            : { kind: 'refused', code: NOT_ACCEPTED, missing };
        default:
          return {
            kind: 'refused',
            code: 'files-imports.rule-attribute-unknown',
            missing: [{ kind: 'rule-attribute', field }],
          };
      }
    },
    async preview(context, document) {
      if (document.kind === 'update') {
        const updated = await updatesOf(context, document);
        if ('issues' in updated) return { kind: 'issues', issues: updated.issues };
        return {
          kind: 'would-create',
          records: [{ recordType: SKU_TYPE, codes: document.rows.map((row) => valueOf(row, 'skuCode') ?? '') }],
        };
      }
      const drafted = await draftOf(context, document);
      if ('issues' in drafted) return { kind: 'issues', issues: drafted.issues };
      const date = await today(context);
      if (typeof date !== 'string') return { kind: 'issues', issues: [{ code: date.code }] };
      // Propose a product's own checks, run without writing (4.1, 4.2).
      const { style } = drafted.draft;
      const stored: StoredProposal = {
        shape: 'product-proposal/1',
        ...(style === undefined ? {} : { style }),
        skus: drafted.draft.skus,
      };
      const checked = await proposalRefusal(context, stored, date);
      if ('refusal' in checked) {
        return { kind: 'issues', issues: [{ code: checked.refusal.code, missing: [...checked.refusal.missing] }] };
      }
      return {
        kind: 'would-create',
        records: [
          {
            recordType: PRODUCT_PROPOSAL_TYPE,
            codes: [document.reference, ...drafted.draft.skus.map((sku) => sku.code)],
          },
        ],
      };
    },
    async publish(context, publisher, document, source) {
      if (document.kind === 'update') {
        const updated = await updatesOf(context, document);
        if ('issues' in updated) return refusedFor(updated.issues);
        // Prepare a SKU version, the catalogue's own Maintain operation, for each SKU (module-map section 3, rule 8). A
        // SKU version takes effect when it is recorded (structure-and-masters 2.3), so the batch's own independent
        // approval, verified under the lock before this runs, is what a different person decided (product owner,
        // 11 Oct 2026).
        for (const each of updated.updates.skus) {
          const prepared = await dependencies.catalogue.prepareSkuVersion(context, publisher, each.skuId, each.draft);
          if (prepared.kind !== 'success') return { kind: 'refused', refusal: prepared.refusal };
        }
        return {
          kind: 'published',
          records: updated.updates.skus.map((each) => ({ recordType: SKU_TYPE, recordId: each.skuId })),
        };
      }
      const drafted = await draftOf(context, document);
      if ('issues' in drafted) return refusedFor(drafted.issues);
      const proposed = await proposeProduct(context, dependencies, publisher, drafted.draft, source);
      if (proposed.kind !== 'success') return { kind: 'refused', refusal: proposed.refusal };
      return {
        kind: 'published',
        records: [{ recordType: PRODUCT_PROPOSAL_TYPE, recordId: proposed.answer.proposalId }],
      };
    },
  };
}
