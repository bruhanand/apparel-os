import {
  PRODUCT_PROPOSAL_TYPE,
  productProposalDraftSchema,
  skuPurposeSchema,
  stockUnitSchema,
  type DocumentPreview,
  type ProductProposalDraft,
  type ValueSuggestion,
} from '@apparel-os/schemas';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import { knownValue, type HandlerDocument, type HandlerRow, type ImportHandler } from '../../../files-imports/index.js';
import { brand, brandVersion, category, categoryVersion } from '../db/schema.js';
import type { StoredProposal } from '../domain/products.js';
import { today } from './common.js';
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

/** The fields of the handler's staged row. Size is optional: absent, it is Unknown (4.1). */
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

/** The trigram similarity below which a code or name is no close match (PRD Stack: Search). A builder's choice. */
const CLOSE = 0.3;
const MOST = 5;

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
  const seen = new Set<string>();
  const suggestions: ValueSuggestion[] = [];
  for (const row of rows) {
    if (seen.has(row.code) || suggestions.length === MOST) continue;
    seen.add(row.code);
    suggestions.push({ kind: 'close', value: row.code, label: row.name });
  }
  return suggestions;
}

/** Exact or close matches among the values the catalogue accepts, such as the stock units (section 5). */
function optionSuggestions(options: readonly string[], value: string | undefined): ValueSuggestion[] {
  if (value === undefined || value === '') return [];
  const said = value.toLowerCase();
  const exact = options.filter((option) => option.toLowerCase() === said);
  if (exact.length > 0) return exact.map((option) => ({ kind: 'exact', value: option }));
  return options
    .filter((option) => option.includes(said) || said.includes(option) || option.startsWith(said.slice(0, 3)))
    .slice(0, MOST)
    .map((option) => ({ kind: 'close', value: option }));
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
    const stockUnit = stockUnitSchema.safeParse(valueOf(row, 'stockUnit'));
    if (!stockUnit.success) {
      issues.push({ code: 'merchandise.import-value-not-accepted', field: 'stockUnit', rowNumber: row.rowNumber });
    }
    const purpose = skuPurposeSchema.safeParse(valueOf(row, 'purpose'));
    if (!purpose.success) {
      issues.push({ code: 'merchandise.import-value-not-accepted', field: 'purpose', rowNumber: row.rowNumber });
    }
    const size = valueOf(row, 'size');
    if (stockUnit.success && purpose.success) {
      skus.push({
        code: valueOf(row, 'skuCode') ?? '',
        ...(size === undefined ? {} : { size }),
        identity: [],
        stockUnit: stockUnit.data,
        purpose: purpose.data,
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
  if (!draft.success) return { issues: [{ code: 'merchandise.import-value-not-accepted' }] };
  return { draft: draft.data };
}

export interface ProductImportDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
}

/** The handler `merchandise` · catalogue registers with files-imports at start. */
export function productImportHandler(dependencies: ProductImportDependencies): ImportHandler {
  return {
    target: 'merchandise',
    recordType: PRODUCT_PROPOSAL_TYPE,
    kinds: ['create'],
    effects: 'master-records',
    fields: FIELDS,
    publishNeeds: { action: 'create', recordType: PRODUCT_PROPOSAL_TYPE },
    // Each proposal is confirmed by a different person, so the preparer's submission is the review (13.2).
    review: { kind: 'submission' },
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
            : { kind: 'refused', code: 'merchandise.import-value-not-accepted', missing };
        case 'purpose':
          return skuPurposeSchema.safeParse(target).success
            ? undefined
            : { kind: 'refused', code: 'merchandise.import-value-not-accepted', missing };
        default:
          return {
            kind: 'refused',
            code: 'files-imports.rule-attribute-unknown',
            missing: [{ kind: 'rule-attribute', field }],
          };
      }
    },
    async preview(context, document) {
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
      const drafted = await draftOf(context, document);
      if ('issues' in drafted) {
        const [issue] = drafted.issues;
        return {
          kind: 'refused',
          refusal: { kind: 'refused', code: issue?.code ?? 'merchandise.import-value-not-accepted', missing: [] },
        };
      }
      const proposed = await proposeProduct(context, dependencies, publisher, drafted.draft, source);
      if (proposed.kind !== 'success') return { kind: 'refused', refusal: proposed.refusal };
      return {
        kind: 'published',
        records: [{ recordType: PRODUCT_PROPOSAL_TYPE, recordId: proposed.answer.proposalId }],
      };
    },
  };
}
