import {
  PRODUCT_PROPOSAL_TYPE,
  productProposalDraftSchema,
  skuPurposeSchema,
  stockUnitSchema,
  type DocumentPreview,
  type ProductProposalDraft,
} from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type { HandlerDocument, HandlerRow, ImportHandler } from '../../../files-imports/index.js';
import { brand, category } from '../db/schema.js';
import type { StoredProposal } from '../domain/products.js';
import { today } from './common.js';
import { proposalRefusal } from './product-rules.js';
import { proposeProduct } from './products.js';

// The `merchandise` create handler for products (imports-and-opening-data 13.2; structure-and-masters 4.2, 7;
// module-map 4.7 "Register an import handler", section 3 rules 6 and 8; PRD-IMP-010, PRD-IMP-012, PRD-MER-013;
// S1-F06-T01). A document is one style with its SKUs, one staged row for each SKU; it arrives as a product proposal
// through the catalogue's own Propose a product, so the same checks and the same confirmation by a different person
// apply (DM-5). Identity is never filled from a guess (PRD-IMP-009): the brand and category are found by their exact
// codes, and every value comes from the file. As built for the tracer: no attribute values, suggestions or mapping-rule
// checks, which are S1-F06-T03's.

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
  const value = row.values[field];
  return value?.kind === 'supplied' ? value.value : undefined;
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
