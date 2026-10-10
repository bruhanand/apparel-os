import { uuidv7 } from '@apparel-os/domain';
import {
  PRODUCT_CONFIRMATION,
  PRODUCT_PROPOSAL_TYPE,
  type ProductProposalDraft,
  type ProductProposed,
} from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import {
  CommandDefect,
  lockTable,
  UNIQUE_VIOLATION,
  withSavepoint,
  type LockTarget,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { AccessInterface, DocumentEffect, EffectOutcome } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type { Preparer } from '../../../organisation/index.js';
import { productProposal, sku, skuIdentityValue, skuVersion, style, styleVersion } from '../db/schema.js';
import type { StoredProposal } from '../domain/products.js';
import { productConfirmed } from '../events.js';
import { refused, today, type Outcome } from './common.js';
import { writeStyleAttributes } from './maintain.js';
import { proposalRefusal } from './product-rules.js';

// Product proposals (structure-and-masters 4.2, 4.7; PRD-MER-013, PRD-IMP-009; DM-5, DEC-105; S1-F03-T02): a new
// style with its SKUs, or new SKUs of a style, kept apart from the catalogue with the original source words until a
// different person from the proposer confirms it through `access`'s Decide; confirming makes the style and SKUs, each
// with its first version in force from that day, and publishes `merchandise.product-confirmed`.

/** The unique constraints a confirmation can meet when another committed first, and the refusal each is (4.1). */
const CONFLICTS: Readonly<Record<string, string>> = {
  style_code_key: 'merchandise.code-taken',
  sku_code_key: 'merchandise.code-taken',
  sku_identity_once: 'merchandise.sku-exists',
};

export async function proposeProduct(
  context: TransactionContext,
  dependencies: { readonly audit: AuditInterface; readonly access: Pick<AccessInterface, 'requestApproval'> },
  proposer: Preparer,
  draft: ProductProposalDraft,
): Promise<Outcome<ProductProposed>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const stored: StoredProposal = {
    shape: 'product-proposal/1',
    ...(draft.style === undefined ? {} : { style: draft.style }),
    ...(draft.styleId === undefined ? {} : { styleId: draft.styleId }),
    skus: draft.skus,
  };
  const checked = await proposalRefusal(context, stored, date);
  if ('refusal' in checked) return { kind: 'refusal', refusal: checked.refusal };
  const proposalId = uuidv7();
  await context.tx.insert(productProposal).values({
    id: proposalId,
    styleId: draft.styleId ?? null,
    proposal: stored,
    sourceWords: draft.sourceWords ?? null,
    proposedByUserId: proposer.userId,
    state: 'Proposed',
  });
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: proposer.userId },
    roleAssignmentId: proposer.roleAssignmentId,
    record: { module: 'merchandise', type: 'product_proposal', id: proposalId },
    operation: 'propose-product',
    changes: [
      { kind: 'value', field: 'styleCode', before: null, after: draft.style?.code ?? null },
      { kind: 'value', field: 'styleId', before: null, after: draft.styleId ?? null },
      { kind: 'value', field: 'skuCodes', before: null, after: draft.skus.map((each) => each.code) },
      { kind: 'value', field: 'sourceWords', before: null, after: draft.sourceWords ?? null },
    ],
    source: { kind: 'screen' },
  });
  // The proposer is its one preparer; a different person confirms it (DM-5, DEC-105; access-and-approvals 9.3).
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: PRODUCT_CONFIRMATION,
    document: { module: 'merchandise', recordType: PRODUCT_PROPOSAL_TYPE, recordId: proposalId, versionId: proposalId },
    value: { kind: 'none' },
    preparers: [proposer.userId],
    requestedBy: proposer,
  });
  return { kind: 'success', answer: { proposalId, requestId } };
}

async function proposalOf(context: TransactionContext, proposalId: string) {
  const [row] = await context.tx.select().from(productProposal).where(eq(productProposal.id, proposalId));
  return row;
}

/**
 * The effect of a decision on a product proposal (4.2; DM-5, DEC-105): confirming it checks it again under its lock
 * and makes the style and SKUs; rejecting it makes nothing. Its proposer never decides it: `access` refuses a preparer
 * first, and the table refuses it behind.
 */
export function productProposalEffect(audit: AuditInterface): DocumentEffect {
  return {
    async targets(context, proposalId): Promise<LockTarget[]> {
      const proposal = await proposalOf(context, proposalId);
      return [
        { table: lockTable('merchandise', 'product_proposal'), id: proposalId, mode: 'exclusive' },
        // New SKUs of an existing style: the style's row, so two confirmations for one style never pass each other.
        ...(proposal?.styleId == null
          ? []
          : [{ table: lockTable('merchandise', 'style'), id: proposal.styleId, mode: 'exclusive' as const }]),
      ];
    },
    async approve(context, decider, proposalId): Promise<EffectOutcome> {
      const proposal = await proposalOf(context, proposalId);
      if (proposal === undefined) return refused('not-found', 'merchandise.proposal-not-found');
      if (proposal.state !== 'Proposed') return refused('refused', 'merchandise.proposal-not-open');
      const date = await today(context);
      if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
      const stored = proposal.proposal;
      const checked = await proposalRefusal(context, stored, date);
      if ('refusal' in checked) return { kind: 'refusal', refusal: checked.refusal };
      const validDuring = `[${date},)`;
      const common = { validDuring, decision: 'Approved' as const, preparedByUserId: proposal.proposedByUserId };
      const written = await withSavepoint(context, 'merchandise_confirm_product', [UNIQUE_VIOLATION], async () => {
        let styleId: string;
        const skuIds: string[] = [];
        if (stored.style !== undefined) {
          styleId = uuidv7();
          await context.tx.insert(style).values({
            id: styleId,
            code: stored.style.code,
            brandId: stored.style.brandId,
            categoryId: stored.style.categoryId,
            proposalId,
          });
          const versionId = uuidv7();
          await context.tx.insert(styleVersion).values({
            ...common,
            id: versionId,
            styleId,
            brandArticleNumber: stored.style.brandArticleNumber ?? null,
            launchDate: stored.style.launchDate ?? null,
            hsn: stored.style.hsn ?? null,
          });
          await writeStyleAttributes(context, versionId, stored.style.attributes);
        } else if (stored.styleId !== undefined) {
          styleId = stored.styleId;
        } else {
          throw new CommandDefect('A stored product proposal names no style');
        }
        for (const [index, proposed] of stored.skus.entries()) {
          const skuId = uuidv7();
          const identity = checked.checked.identities[index];
          if (identity === undefined) throw new CommandDefect('A proposed SKU was not checked');
          await context.tx.insert(sku).values({
            id: skuId,
            code: proposed.code,
            styleId,
            size: proposed.size ?? null,
            identityKey: identity.key,
            proposalId,
          });
          // Every identity attribute of the category has its row, Unknown included (4.1 as built).
          if (identity.values.length > 0) {
            await context.tx.insert(skuIdentityValue).values(
              identity.values.map((each) => ({
                id: uuidv7(),
                skuId,
                attributeId: each.attributeId,
                vocabularyValueId: each.valueId ?? null,
                textValue: each.text ?? null,
              })),
            );
          }
          await context.tx.insert(skuVersion).values({
            ...common,
            id: uuidv7(),
            skuId,
            stockUnit: proposed.stockUnit,
            purpose: proposed.purpose,
          });
          skuIds.push(skuId);
        }
        return { styleId, skuIds };
      });
      if (written.kind === 'caught') {
        // A code or an identity made by another confirmation that committed first (4.1), told apart by the constraint.
        const code = CONFLICTS[written.violation.constraint ?? ''];
        if (code === undefined) {
          throw new CommandDefect(`Unexpected unique violation on ${written.violation.constraint ?? 'no constraint'}`);
        }
        return refused('refused', code);
      }
      const { styleId, skuIds } = written.value;
      await context.tx
        .update(productProposal)
        .set({ state: 'Confirmed', decidedByUserId: decider.actor.id, decidedAt: context.startedAt })
        .where(eq(productProposal.id, proposalId));
      await audit.record(context, {
        actor: decider.actor,
        ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
        ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
        ...(decider.reason === undefined ? {} : { reason: decider.reason }),
        record: { module: 'merchandise', type: 'product_proposal', id: proposalId },
        operation: 'confirm-product',
        changes: [
          { kind: 'value', field: 'state', before: 'Proposed', after: 'Confirmed' },
          { kind: 'value', field: 'styleId', before: null, after: styleId },
          { kind: 'value', field: 'skuIds', before: null, after: skuIds },
        ],
        source: { kind: 'screen' },
      });
      await context.publish(productConfirmed, {
        subject: { module: 'merchandise', recordType: PRODUCT_PROPOSAL_TYPE, recordId: proposalId },
        payload: { proposalId, styleId, skuIds },
      });
      return { kind: 'success', answer: { recordId: styleId } };
    },
    async reject(context, decider, proposalId): Promise<EffectOutcome> {
      const proposal = await proposalOf(context, proposalId);
      if (proposal === undefined) return refused('not-found', 'merchandise.proposal-not-found');
      if (proposal.state !== 'Proposed') return refused('refused', 'merchandise.proposal-not-open');
      await context.tx
        .update(productProposal)
        .set({ state: 'Rejected', decidedByUserId: decider.actor.id, decidedAt: context.startedAt })
        .where(eq(productProposal.id, proposalId));
      await audit.record(context, {
        actor: decider.actor,
        ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
        ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
        ...(decider.reason === undefined ? {} : { reason: decider.reason }),
        record: { module: 'merchandise', type: 'product_proposal', id: proposalId },
        operation: 'reject-product',
        changes: [{ kind: 'value', field: 'state', before: 'Proposed', after: 'Rejected' }],
        source: { kind: 'screen' },
      });
      return { kind: 'success', answer: { recordId: proposalId } };
    },
  };
}
