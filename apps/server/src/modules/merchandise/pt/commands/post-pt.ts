import { paise, uuidv7 } from '@apparel-os/domain';
import { textKey } from '@apparel-os/calculations/booking';
import { GRN_TYPE, PT_APPROVAL, PT_TYPE, type MissingItem } from '@apparel-os/schemas';
import {
  CommandDefect,
  insertInParts,
  LOCK_STEP,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { AuditActor, AuditInterface, AuditSource } from '../../../audit/index.js';
import { OPEN_POLICY_READINESS, type ConfigurationInterface } from '../../../configuration/index.js';
import {
  checkPtProducts,
  confirmPtProducts,
  mapPtBarcodes,
  SKU_CODE_KIND,
  SKU_CODE_SCOPE_KEY,
  type CheckedPtProducts,
  type PtConfirmer,
  type PtProductRequest,
} from '../../catalogue/index.js';
import type { NumberingInterface } from '../../../numbering/index.js';
import type { PtBasis, ReceivingInterface } from '../../../receiving/index.js';
import type { LedgerActor, LedgerItem, StockLedgerInterface } from '../../../stock/ledger/index.js';
import { ptApproval, ptHoldRelease, ptOrigin, ptProduct } from '../db/schema.js';
import { PT_OPERATIONS } from '../domain/gate.js';
import { ptIdentityParts, type PtIdentityPart } from '../domain/identity.js';
import { PT_KIND, PT_MODULE, PT_REVISION_TYPE, PT_SCOPE_KEY, PT_STOCK_SOURCE_TYPE } from '../domain/kinds.js';
import { BUSINESS_DATE_NOT_SET, grnNotFound, recordItem, revisionNotFound, type Outcome } from '../domain/refusals.js';
import { ptApproved } from '../events.js';
import { revisionContent, revisionStanding, type ApprovalRow, type RevisionStanding } from '../queries/approval.js';
import { heldLinesOpen } from '../queries/plan.js';
import { scopeColumnsOf } from './scope-columns.js';

// Posting a PT revision's approval (goods-in 6.3, 6.6, 10.3; module-map 6.2 flow C; stock-ledger 10.2 to 10.4, 13.1,
// 13.14; access-and-approvals 9.7; PRD-REC-015, PRD-REC-017, PRD-REC-018, PRD-MER-013, PRD-PTW-010, PRD-INT-004;
// DEC-097, DEC-135, DEC-140; S2-F06-T01). One transaction, in the stock ledger's lock order, with the PT's, the GRN's
// and the catalogue's rows already held at step 1 by its caller: the decision's effect, for a PT posted with its
// decision, or the posting job of a large one (flow E). Under those locks it rechecks the revision, the policy gate and
// the GRN: nothing waiting for a decision, and the GRN's good pieces still those the PT covers, which a recount, a held
// line or a damage report decided since would change; checks the PT's new products against the catalogue; works out the
// identity step, which gives every covered piece a new receipt origin of one SKU at one P RATE (domain/identity.ts);
// then posts, as one ledger request: the end of the excess holds and quarantines of goods Booking took in, by the PT
// route (goods-in 4.6), the identity step, the coverage of each new origin, and its cost at P RATE, which `finance` ·
// books posts under the posting map of `stock.cost-established` for owned goods and records only for goods the brand
// or supplier still owns (stock-ledger 7.2, 13.4; DEC-141). The decision is verified and used under the ledger's locks
// on the PT's cost then (access-and-approvals 9.7). Then the new products confirmed with their SKU codes, the barcodes
// recorded, the PT numbered, its records, the audit record and `merchandise.pt-approved`. The goods stay at their
// receiving location, not accepted and not sellable until the scan-in (goods-in 6.3; stock-ledger 6.3).

export interface PostingServices {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'verifyUnderLock' | 'recordUse'>;
  readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'>;
  readonly ledger: StockLedgerInterface;
  readonly numbering: Pick<NumberingInterface, 'liveSeries' | 'seriesLockTarget' | 'allocate'>;
  readonly receiving: Pick<ReceivingInterface, 'ptBasis' | 'grnForPt'>;
}

/** Who posts: the approver in the decision's transaction, or a posting job's service identity on their behalf. */
export type Poster =
  | { readonly kind: 'user'; readonly userId: string; readonly roleAssignmentId: string }
  | {
      readonly kind: 'service-identity';
      readonly serviceIdentityId: string;
      readonly roleAssignmentId: string;
      readonly onBehalfOfUserId: string;
    };

export interface PostingRequest {
  readonly revisionId: string;
  /** The approval decision and its approver (access-and-approvals 9.5). */
  readonly decisionId: string;
  readonly approverUserId: string;
  readonly poster: Poster;
  /** The request to post a large PT, when its job posts it (stock-ledger 10.6). */
  readonly postRequestId?: string;
  /** The words of the decision's reason, for the audit record (numbering-and-audit 4.2). */
  readonly reason?: string;
}

const refused = (kind: CommandRefusal['kind'], code: string, missing: MissingItem[]): Outcome<never> => ({
  kind: 'refusal',
  refusal: { kind, code, missing },
});

const auditActorOf = (poster: Poster): AuditActor =>
  poster.kind === 'user'
    ? { kind: 'user', id: poster.userId }
    : { kind: 'service-identity', id: poster.serviceIdentityId, onBehalfOfUserId: poster.onBehalfOfUserId };

const ledgerActorOf = (poster: Poster): LedgerActor =>
  poster.kind === 'user'
    ? { kind: 'user', userId: poster.userId, roleAssignmentId: poster.roleAssignmentId }
    : {
        kind: 'service-identity',
        serviceIdentityId: poster.serviceIdentityId,
        onBehalfOfUserId: poster.onBehalfOfUserId,
        roleAssignmentId: poster.roleAssignmentId,
      };

/** A style and size named in a refusal, by its codes only (code-house-rules 12.3; goods-in 5.8). */
const styleSize = (styleCode: string, size: string | null): MissingItem => ({
  kind: 'pt-style-size',
  styleCode,
  ...(size === null ? {} : { size }),
});

const keyOf = (styleCode: string, size: string | null) => `${textKey(styleCode)}|${size === null ? '' : textKey(size)}`;

/** The revision a decision is still about: the PT's newest, not withdrawn, rejected or posted (goods-in 5.7, 6.3). */
export function draftRefusal(standing: RevisionStanding | undefined, revisionId: string): CommandRefusal | undefined {
  if (standing === undefined) return revisionNotFound(revisionId);
  if (!standing.newest || standing.withdrawn || standing.rejected || standing.approval !== undefined) {
    return { kind: 'refused', code: 'merchandise.pt-not-a-draft', missing: [recordItem(PT_REVISION_TYPE, revisionId)] };
  }
  return undefined;
}

/** Whether the PT's approval is available at the GRN's place (goods-in 10.5): every operation's missing things, once. */
export async function ptGateRefusal(
  context: TransactionContext,
  configuration: PostingServices['configuration'],
  place: { readonly siteId: string; readonly businessUnitId: string },
): Promise<CommandRefusal | undefined> {
  const missing: MissingItem[] = [];
  const seen = new Set<string>();
  for (const operation of PT_OPERATIONS) {
    const answer = await configuration.checkAvailability(context, operation.code, place);
    if (answer === undefined) throw new CommandDefect(`${operation.code} is not declared`);
    for (const item of answer.missing) {
      const key = JSON.stringify(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
      if (seen.has(key)) continue;
      seen.add(key);
      missing.push(item);
    }
  }
  return missing.length === 0
    ? undefined
    : { kind: 'unavailable', code: 'configuration.operation-unavailable', missing, next: OPEN_POLICY_READINESS };
}

/**
 * The GRN's good pieces still those the PT covers, per style and size (goods-in 5.4, 6.3): each coverage of the revision
 * the same quantity as the GRN's good pieces of its style and size, and the GRN no other. Undefined when they are.
 */
function changedRefusal(
  basis: PtBasis,
  coverage: readonly { styleCode: string; sizeCode: string | null; quantity: number }[],
) {
  const goods = new Map(basis.goods.map((each) => [keyOf(each.styleCode, each.size), each]));
  for (const each of coverage) {
    const now = goods.get(keyOf(each.styleCode, each.sizeCode));
    if (now?.quantity !== each.quantity) {
      return {
        kind: 'refused' as const,
        code: 'merchandise.pt-grn-changed',
        missing: [styleSize(each.styleCode, each.sizeCode)],
      };
    }
    goods.delete(keyOf(each.styleCode, each.sizeCode));
  }
  const [extra] = goods.values();
  return extra === undefined
    ? undefined
    : {
        kind: 'refused' as const,
        code: 'merchandise.pt-grn-changed',
        missing: [styleSize(extra.styleCode, extra.size)],
      };
}

/** The new products of the revision as the catalogue checks them: each from the first row proposing it (6.6). */
function productRequests(content: Awaited<ReturnType<typeof revisionContent>>, brandId: string): PtProductRequest[] {
  return content.proposals.map((proposal) => {
    const rows = content.rows.filter((row) => row.ptProposedSkuId === proposal.id);
    const [first] = rows;
    if (first === undefined) throw new CommandDefect(`A PT proposal ${proposal.id} has no row`);
    return {
      key: proposal.id,
      rowNumber: first.rowNumber,
      stagedRowIds: rows.map((row) => row.stagedRowId),
      styleCode: proposal.styleCode,
      existingStyleId: proposal.existingStyleId,
      brandId,
      categoryId: first.categoryId,
      hsn: first.hsn,
      styleValueIds: [first.seasonValueId, first.genderValueId, first.typeValueId, first.itemValueId, first.fitValueId],
      colourValueId: proposal.colourValueId,
      size: first.sizeCode,
    };
  });
}

/** A live Open series of a kind, as a lock target, or the refusal naming the series missing or paused (10.4). */
async function openSeries(
  context: TransactionContext,
  numbering: PostingServices['numbering'],
  kind: string,
  scopeKey: string,
  codes: { readonly missing: string; readonly paused: string },
): Promise<{ readonly seriesId: string } | { readonly refusal: CommandRefusal }> {
  const series = await numbering.liveSeries(context, { kind, scopeKey });
  const missing: MissingItem[] = [{ kind: 'number-series', numberedKind: kind }];
  if (series === undefined) return { refusal: { kind: 'unavailable', code: codes.missing, missing } };
  if (series.state !== 'Open') return { refusal: { kind: 'unavailable', code: codes.paused, missing } };
  return { seriesId: series.seriesId };
}

/** One new origin of the identity step, with what it covers (pt_origin). */
interface PlannedOrigin {
  readonly id: string;
  readonly coverageId: string;
  readonly grnLineId: string;
  readonly part: PtIdentityPart;
}

export async function postApproval(
  context: TransactionContext,
  services: PostingServices,
  request: PostingRequest,
): Promise<Outcome<{ readonly ptApprovalId: string; readonly number: string }>> {
  const { revisionId, poster } = request;
  const standing = await revisionStanding(context, revisionId);
  const notDraft = draftRefusal(standing, revisionId);
  if (notDraft !== undefined || standing === undefined)
    return { kind: 'refusal', refusal: notDraft ?? revisionNotFound(revisionId) };
  const { revision } = standing;
  const date = await context.businessDate();
  if (date.kind === 'not-set') return { kind: 'refusal', refusal: BUSINESS_DATE_NOT_SET };
  const grn = await services.receiving.grnForPt(context, standing.grnId);
  if (grn === undefined) return { kind: 'refusal', refusal: grnNotFound(standing.grnId) };
  const place = { siteId: grn.facts.siteId, businessUnitId: grn.facts.businessUnitId };
  // The policy gate, under the locks (goods-in 10.5; PRD-SEC-017).
  const gate = await ptGateRefusal(context, services.configuration, place);
  if (gate !== undefined) return { kind: 'refusal', refusal: gate };
  // The GRN as it stands under its lock (goods-in 6.3: refused when it changed after the upload).
  const basis = await services.receiving.ptBasis(context, standing.grnId);
  if (basis === undefined) return { kind: 'refusal', refusal: grnNotFound(standing.grnId) };
  const open = heldLinesOpen(basis);
  if (open !== undefined) return { kind: 'refusal', refusal: open };
  const content = await revisionContent(context, revisionId);
  const changed = changedRefusal(basis, content.coverage);
  if (changed !== undefined) return { kind: 'refusal', refusal: changed };
  // The series it draws from (goods-in 10.4; RR-585): the PT's, and the SKU codes' while it proposes new products.
  const ptSeries = await openSeries(context, services.numbering, PT_KIND.kind, PT_SCOPE_KEY, {
    missing: 'merchandise.no-pt-series',
    paused: 'merchandise.pt-series-paused',
  });
  if ('refusal' in ptSeries) return { kind: 'refusal', refusal: ptSeries.refusal };
  let skuSeries: { readonly seriesId: string } | undefined;
  if (content.proposals.length > 0) {
    const found = await openSeries(context, services.numbering, SKU_CODE_KIND.kind, SKU_CODE_SCOPE_KEY, {
      missing: 'merchandise.no-sku-code-series',
      paused: 'merchandise.sku-code-series-paused',
    });
    if ('refusal' in found) return { kind: 'refusal', refusal: found.refusal };
    skuSeries = found;
  }
  // The new products, checked by the catalogue under the locks (goods-in 6.3 step 2; RR-585).
  const checked = await checkPtProducts(context, {
    products: productRequests(content, revision.brandId),
    siteId: place.siteId,
    date: date.date,
  });
  if (checked.kind === 'refused') return { kind: 'refusal', refusal: checked.refusal };
  const products: CheckedPtProducts = checked.checked;
  const skuOfProposal = new Map(products.products.map((each) => [each.key, each.skuId]));
  const skuOfRow = (row: ApprovalRow): string => {
    const skuId = row.skuId ?? (row.ptProposedSkuId === null ? undefined : skuOfProposal.get(row.ptProposedSkuId));
    if (skuId === undefined) throw new CommandDefect(`PT row ${row.id} has no product`);
    return skuId;
  };

  // The identity step, per style and size the PT covers (goods-in 6.3 steps 4 and 5; domain/identity.ts).
  const ptApprovalId = uuidv7();
  const planned: PlannedOrigin[] = [];
  const releases: { id: string; grnLineId: string; holdId: string; event: 'pt-route' | 'approved-decision' }[] = [];
  const goods = new Map(basis.goods.map((each) => [keyOf(each.styleCode, each.size), each]));
  for (const each of content.coverage) {
    const group = goods.get(keyOf(each.styleCode, each.sizeCode));
    if (group === undefined) throw new CommandDefect('A PT coverage lost its GRN goods after the check');
    const sources = [];
    const lineOfOrigin = new Map<string, string>();
    for (const part of group.parts) {
      // An origin the approver may not see: the ledger's rows are hidden from them (stock-ledger 14.3).
      if (part.receiptOriginId === null) {
        return refused('not-authorised', 'access.not-authorised', [
          { kind: 'permission', recordType: 'stock.receipt_origin', action: 'view' },
        ]);
      }
      sources.push({ receiptOriginId: part.receiptOriginId, skuId: part.skuId, units: part.quantity });
      lineOfOrigin.set(part.receiptOriginId, part.grnLineId);
      for (const release of part.releases) releases.push({ id: uuidv7(), grnLineId: part.grnLineId, ...release });
    }
    const rows = content.rows
      .filter((row) => row.ptCoverageId === each.id)
      .map((row) => ({ skuId: skuOfRow(row), pRatePaise: row.pRatePaise, quantity: row.quantity }));
    const split = ptIdentityParts(sources, rows, uuidv7);
    if (split.kind === 'mismatch') {
      return refused('refused', 'merchandise.pt-grn-changed', [styleSize(each.styleCode, each.sizeCode)]);
    }
    for (const part of split.parts) {
      planned.push({
        id: uuidv7(),
        coverageId: each.id,
        grnLineId: lineOfOrigin.get(part.receiptOriginId) ?? '',
        part,
      });
    }
  }
  const items: LedgerItem[] = [
    ...releases.map((release) => ({
      kind: 'release-hold' as const,
      lineId: release.id,
      holdId: release.holdId,
      event: release.event,
    })),
    {
      kind: 'identity-resolved',
      lineId: ptApprovalId,
      at: place,
      parts: planned.map(({ part }) => ({
        receiptOriginId: part.receiptOriginId,
        skuId: part.skuId,
        quantity: part.quantity,
        newReceiptOriginId: part.newReceiptOriginId,
      })),
    },
    ...planned.map((origin) => ({
      kind: 'record-coverage' as const,
      lineId: origin.id,
      ptRevisionId: revisionId,
      receiptOriginId: origin.part.newReceiptOriginId,
      quantity: origin.part.quantity,
    })),
    ...planned.map((origin) => ({
      kind: 'cost-established' as const,
      lineId: origin.id,
      receiptOriginId: origin.part.newReceiptOriginId,
      ptRevisionId: revisionId,
      pRatePaise: paise(origin.part.pRatePaise),
    })),
  ];

  // The ledger request (stock-ledger 13.1 "The caller's command"): Plan; Lock, steps 2 to 6; the periods at step 7;
  // the journal series with the PT's and the SKU codes' series at step 8 in one call; Recheck and value.
  const useId = uuidv7();
  const planning = await services.ledger.plan(context, {
    source: {
      module: PT_MODULE,
      recordType: PT_STOCK_SOURCE_TYPE,
      recordId: revisionId,
      versionId: revisionId,
      importKind: 'none',
    },
    actor: ledgerActorOf(poster),
    approval: { decisionId: request.decisionId, useId },
    madeSkus: products.products.map((each) => each.facts),
    items,
  });
  if (planning.kind === 'refused') return { kind: 'refusal', refusal: planning.refusal };
  const locked = await services.ledger.lock(context, planning.value);
  const periods = await services.ledger.holdPeriods(context, planning.value);
  if (periods.kind === 'refused') return { kind: 'refusal', refusal: periods.refusal };
  const series: LockTarget[] = [
    ...periods.value,
    services.numbering.seriesLockTarget(ptSeries.seriesId),
    ...(skuSeries === undefined ? [] : [services.numbering.seriesLockTarget(skuSeries.seriesId)]),
  ];
  await context.lock(LOCK_STEP.numberSeries, series);
  const recheck = await services.ledger.recheck(context, locked);
  if (recheck.kind === 'refused') return { kind: 'refusal', refusal: recheck.refusal };
  // The approval is on the PT's cost (goods-in 6.1; PRD-ACS-015): its cost established, P RATE times the pieces, under
  // the locks now; Unknown when any piece's is (PRD-ACS-016).
  let cost = 0;
  let unknown = false;
  for (const [index, value] of recheck.value.itemValues.entries()) {
    if (items[index]?.kind !== 'cost-established') continue;
    if (value.kind === 'known') cost += value.amountPaise;
    else unknown = true;
  }
  const check = {
    decisionId: request.decisionId,
    actionType: PT_APPROVAL,
    document: { module: PT_MODULE, recordType: PT_TYPE, recordId: revision.ptId, versionId: revisionId },
    preparers: revision.preparerUserIds,
    value: unknown ? { kind: 'unknown' as const } : { kind: 'known' as const, amountPaise: paise(cost) },
  };
  const verified = await services.access.verifyUnderLock(context, check);
  if (verified !== undefined) return { kind: 'refusal', refusal: verified };
  const used = await services.access.recordUse(context, {
    ...check,
    useId,
    actor:
      poster.kind === 'user'
        ? { kind: 'user', id: poster.userId }
        : { kind: 'service-identity', id: poster.serviceIdentityId, onBehalfOfUserId: poster.onBehalfOfUserId },
  });
  if (used !== undefined) return { kind: 'refusal', refusal: used };

  // Writes, every lock held (code-house-rules 8.2): the ledger's, then the products, the barcodes and the PT's own.
  // Posted from the approval panel, or by the posting job (numbering-and-audit 4.1).
  const source: AuditSource = poster.kind === 'user' ? { kind: 'screen' } : { kind: 'job' };
  const written = await services.ledger.write(context, recheck.value, source);
  if (written.kind === 'refused') return { kind: 'refusal', refusal: written.refusal };
  const confirmer: PtConfirmer = {
    userId: request.approverUserId,
    approvalDecisionId: request.decisionId,
    actor: auditActorOf(poster),
    roleAssignmentId: poster.roleAssignmentId,
  };
  const codes = new Map<string, string>();
  if (skuSeries !== undefined) {
    for (const product of products.products) {
      const allocated = await services.numbering.allocate(context, {
        seriesId: skuSeries.seriesId,
        documentType: 'merchandise.sku',
        documentId: product.skuId,
      });
      if (allocated.kind === 'refused') {
        return refused('unavailable', 'merchandise.sku-code-series-paused', [
          { kind: 'number-series', numberedKind: SKU_CODE_KIND.kind },
        ]);
      }
      codes.set(product.key, allocated.value.formattedText);
    }
  }
  const confirmed = await confirmPtProducts(context, services.audit, {
    checked: products,
    codes,
    proposedBy: revision.uploadedByUserId,
    confirmer,
    importedFrom: { batchId: revision.importBatchId, documentId: revision.importDocumentId },
    source,
    date: date.date,
  });
  if (confirmed.kind === 'refused') return { kind: 'refusal', refusal: confirmed.refusal };
  const mapped = await mapPtBarcodes(context, services.audit, {
    brandId: revision.brandId,
    date: date.date,
    mappings: content.rows
      .filter((row) => !row.barcodeMapped)
      .map((row) => ({ code: row.barcode, skuId: skuOfRow(row), rowNumber: row.rowNumber })),
    preparedBy: confirmer,
    source,
  });
  if (mapped.kind === 'refused') return { kind: 'refusal', refusal: mapped.refusal };
  const number = await services.numbering.allocate(context, {
    seriesId: ptSeries.seriesId,
    documentType: PT_REVISION_TYPE,
    documentId: revisionId,
  });
  if (number.kind === 'refused') {
    return refused('unavailable', 'merchandise.pt-series-paused', [
      { kind: 'number-series', numberedKind: PT_KIND.kind },
    ]);
  }
  const scope = scopeColumnsOf(revision);
  await context.tx.insert(ptApproval).values({
    id: ptApprovalId,
    ptRevisionId: revisionId,
    ...scope,
    number: number.value.formattedText,
    numberAllocationId: number.value.allocationId,
    approvalDecisionId: request.decisionId,
    approvalUseId: useId,
    approvedByUserId: request.approverUserId,
    ptPostRequestId: request.postRequestId ?? null,
    postedByServiceIdentityId: poster.kind === 'service-identity' ? poster.serviceIdentityId : null,
    postedAt: context.startedAt,
    businessDate: date.date,
  });
  if (products.products.length > 0) {
    await insertInParts(
      context,
      ptProduct,
      products.products.map((each) => ({
        id: uuidv7(),
        ptApprovalId,
        ptProposedSkuId: each.key,
        skuId: each.skuId,
        ...scope,
      })),
    );
  }
  await insertInParts(
    context,
    ptOrigin,
    planned.map((origin) => ({
      id: origin.id,
      ptApprovalId,
      ptCoverageId: origin.coverageId,
      ...scope,
      grnLineId: origin.grnLineId,
      parentReceiptOriginId: origin.part.receiptOriginId,
      receiptOriginId: origin.part.newReceiptOriginId,
      skuId: origin.part.skuId,
      quantity: origin.part.quantity,
      pRatePaise: origin.part.pRatePaise,
    })),
  );
  if (releases.length > 0) {
    await insertInParts(
      context,
      ptHoldRelease,
      releases.map((release) => ({ ...release, ptApprovalId, ...scope })),
    );
  }
  await services.audit.record(context, {
    actor: auditActorOf(poster),
    roleAssignmentId: poster.roleAssignmentId,
    approval: { decisionId: request.decisionId },
    ...(request.reason === undefined ? {} : { reason: request.reason }),
    scope: grn.facts,
    record: { module: PT_MODULE, type: PT_TYPE, id: revision.ptId, versionId: revisionId },
    operation: 'approve-pt',
    changes: [
      { kind: 'value', field: 'state', before: 'Awaiting approval', after: 'Official' },
      { kind: 'value', field: 'number', before: null, after: number.value.formattedText },
      { kind: 'value', field: 'movements', before: null, after: [...written.value.movementIds] },
      { kind: 'value', field: 'newProducts', before: null, after: products.products.map((each) => each.skuId) },
      { kind: 'value', field: 'holdsReleased', before: null, after: releases.map((each) => each.holdId) },
      { kind: 'value', field: 'grn', before: null, after: grn.grnId },
    ],
    source,
  });
  await context.publish(ptApproved, {
    subject: { module: PT_MODULE, recordType: PT_TYPE, recordId: revision.ptId, versionId: revisionId },
    scope: grn.facts,
    payload: { ptId: revision.ptId, revisionId, ptApprovalId },
  });
  return { kind: 'success', answer: { ptApprovalId, number: number.value.formattedText } };
}

/** The GRN a revision is for, as a missing item (goods-in 5.7). */
export const grnItem = (grnId: string): MissingItem => recordItem(GRN_TYPE, grnId);
