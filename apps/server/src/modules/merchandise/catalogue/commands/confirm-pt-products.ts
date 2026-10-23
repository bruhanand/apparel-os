import { uuidv7 } from '@apparel-os/domain';
import { PRODUCT_PROPOSAL_TYPE, type ProposedSku } from '@apparel-os/schemas';
import {
  CommandDefect,
  UNIQUE_VIOLATION,
  withSavepoint,
  type CommandRefusal,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { AuditInterface, AuditSource } from '../../../audit/index.js';
import { productProposal, sku, skuIdentityValue, skuVersion, style, styleVersion } from '../db/schema.js';
import type { StoredProposal } from '../domain/products.js';
import {
  PT_PURPOSE,
  PT_STOCK_UNIT,
  ptProductRefusal as refusal,
  type CheckedPtProduct,
  type CheckedPtProducts,
  type PtConfirmer,
} from '../domain/pt-products.js';
import { productConfirmed } from '../events.js';
import { writeStyleAttributes } from './maintain.js';

// The confirmation of a PT's new products with its approval (goods-in 6.3 step 2, 6.6; structure-and-masters 4.2 "As
// built with S2-F06-T01"; PRD-MER-013; RR-585; S2-F06-T01), under every lock of the approval, as the catalogue checked
// them (queries/pt-products.ts).

/** The unique constraints a confirmation can meet when another committed first, and the refusal each is (4.1). */
const CONFLICTS: Readonly<Record<string, string>> = {
  style_code_key: 'merchandise.code-taken',
  sku_code_key: 'merchandise.code-taken',
  sku_identity_once: 'merchandise.sku-exists',
};

/**
 * Confirms the checked products under every lock of the PT approval (4.2; PRD-MER-013): one product proposal per new
 * style, with its SKUs, and one per existing style given new SKUs, each Confirmed by the approver with the uploader its
 * proposer and kept with the PT file's batch and staged rows; the styles, the SKUs with their identity and their first
 * versions in force from the date, each SKU's code drawn by the caller from the SKU code series (RR-585); the audit
 * record and `merchandise.product-confirmed` of each.
 */
export async function confirmPtProducts(
  context: TransactionContext,
  audit: AuditInterface,
  request: {
    readonly checked: CheckedPtProducts;
    readonly codes: ReadonlyMap<string, string>;
    readonly proposedBy: string;
    readonly confirmer: PtConfirmer;
    /** The PT file's batch and document the products came from (imports-and-opening-data 5). */
    readonly importedFrom: { readonly batchId: string; readonly documentId: string };
    readonly source: AuditSource;
    readonly date: string;
  },
): Promise<{ readonly kind: 'done' } | { readonly kind: 'refused'; readonly refusal: CommandRefusal }> {
  const { checked, date, confirmer } = request;
  if (checked.products.length === 0) return { kind: 'done' };
  const validDuring = `[${date},)`;
  const common = { validDuring, decision: 'Approved' as const, preparedByUserId: request.proposedBy };
  const codeOf = (key: string) => {
    const code = request.codes.get(key);
    if (code === undefined) throw new CommandDefect(`A PT product ${key} was given no SKU code`);
    return code;
  };
  // One proposal per style: a new style with its SKUs, or an existing style with the new SKUs it is given.
  const groups = new Map<string, CheckedPtProduct[]>();
  for (const product of checked.products)
    groups.set(product.styleId, [...(groups.get(product.styleId) ?? []), product]);
  const proposals = [...groups].map(([styleId, products]) => ({
    id: uuidv7(),
    styleId,
    newStyle: checked.styles.find((each) => each.styleId === styleId),
    products,
  }));
  const written = await withSavepoint(context, 'merchandise_confirm_pt_products', [UNIQUE_VIOLATION], async () => {
    for (const proposal of proposals) {
      const skus: ProposedSku[] = proposal.products.map((product) => ({
        code: codeOf(product.key),
        size: product.size,
        identity: product.identity.map((each) => ({
          attributeId: each.attributeId,
          ...(each.valueId === undefined ? {} : { valueId: each.valueId }),
          ...(each.text === undefined ? {} : { text: each.text }),
        })),
        stockUnit: PT_STOCK_UNIT,
        purpose: PT_PURPOSE,
      }));
      const { newStyle } = proposal;
      const stored: StoredProposal = {
        shape: 'product-proposal/1',
        ...(newStyle === undefined
          ? { styleId: proposal.styleId }
          : {
              style: {
                code: newStyle.code,
                brandId: newStyle.brandId,
                categoryId: newStyle.categoryId,
                hsn: newStyle.hsn,
                attributes: [...newStyle.attributes],
              },
            }),
        skus,
      };
      // Proposed by the PT's uploader and confirmed with the PT by its approver, never the same person (DM-5): the
      // table's check holds it behind `access`'s refusal of a preparer (access-and-approvals 9.3).
      await context.tx.insert(productProposal).values({
        id: proposal.id,
        styleId: newStyle === undefined ? proposal.styleId : null,
        proposal: stored,
        sourceWords: null,
        proposedByUserId: request.proposedBy,
        state: 'Confirmed',
        decidedByUserId: confirmer.userId,
        decidedAt: context.startedAt,
        importBatchId: request.importedFrom.batchId,
        importDocumentId: request.importedFrom.documentId,
        importStagedRowIds: [...new Set(proposal.products.flatMap((product) => product.stagedRowIds))],
      });
      if (newStyle !== undefined) {
        await context.tx.insert(style).values({
          id: newStyle.styleId,
          code: newStyle.code,
          brandId: newStyle.brandId,
          categoryId: newStyle.categoryId,
          proposalId: proposal.id,
        });
        await context.tx.insert(styleVersion).values({
          ...common,
          id: newStyle.versionId,
          styleId: newStyle.styleId,
          brandArticleNumber: null,
          launchDate: null,
          hsn: newStyle.hsn,
        });
        await writeStyleAttributes(context, newStyle.versionId, newStyle.attributes);
      }
      for (const [index, product] of proposal.products.entries()) {
        await context.tx.insert(sku).values({
          id: product.skuId,
          code: skus[index]?.code ?? codeOf(product.key),
          styleId: proposal.styleId,
          size: product.size,
          identityKey: product.identityKey,
          proposalId: proposal.id,
        });
        // Every identity attribute of the category has its row, Unknown included (4.1 as built).
        if (product.identity.length > 0) {
          await context.tx.insert(skuIdentityValue).values(
            product.identity.map((each) => ({
              id: uuidv7(),
              skuId: product.skuId,
              attributeId: each.attributeId,
              vocabularyValueId: each.valueId ?? null,
              textValue: each.text ?? null,
            })),
          );
        }
        await context.tx.insert(skuVersion).values({
          ...common,
          id: product.skuVersionId,
          skuId: product.skuId,
          stockUnit: PT_STOCK_UNIT,
          purpose: PT_PURPOSE,
        });
      }
    }
  });
  if (written.kind === 'caught') {
    // A code or an identity made by another confirmation that committed first (4.1), told apart by the constraint.
    const code = CONFLICTS[written.violation.constraint ?? ''];
    if (code === undefined) {
      throw new CommandDefect(`Unexpected unique violation on ${written.violation.constraint ?? 'no constraint'}`);
    }
    return { kind: 'refused', refusal: refusal(code, []) };
  }
  for (const proposal of proposals) {
    const skuIds = proposal.products.map((product) => product.skuId);
    await audit.record(context, {
      actor: confirmer.actor,
      roleAssignmentId: confirmer.roleAssignmentId,
      approval: { decisionId: confirmer.approvalDecisionId },
      record: { module: 'merchandise', type: 'product_proposal', id: proposal.id },
      operation: 'confirm-pt-product',
      changes: [
        { kind: 'value', field: 'state', before: null, after: 'Confirmed' },
        { kind: 'value', field: 'styleId', before: null, after: proposal.styleId },
        { kind: 'value', field: 'skuIds', before: null, after: skuIds },
        { kind: 'value', field: 'skuCodes', before: null, after: proposal.products.map((each) => codeOf(each.key)) },
      ],
      source: request.source,
    });
    await context.publish(productConfirmed, {
      subject: { module: 'merchandise', recordType: PRODUCT_PROPOSAL_TYPE, recordId: proposal.id },
      payload: { proposalId: proposal.id, styleId: proposal.styleId, skuIds },
    });
  }
  return { kind: 'done' };
}
