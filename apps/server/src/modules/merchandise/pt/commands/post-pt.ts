import { paise, uuidv7 } from '@apparel-os/domain';
import { textKey } from '@apparel-os/calculations/booking';
import { GRN_TYPE, PT_APPROVAL, PT_TYPE, STOCK_RECEIPT_ORIGIN_TYPE, type MissingItem } from '@apparel-os/schemas';
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
import type { GrnForPt, PtBasis, ReceivingInterface } from '../../../receiving/index.js';
import type { CheckedRequest, LedgerActor, LedgerItem, StockLedgerInterface } from '../../../stock/ledger/index.js';
import { ptApproval, ptHoldRelease, ptOrigin, ptProduct } from '../db/schema.js';
import { PT_OPERATIONS } from '../domain/gate.js';
import { ptIdentityParts, type PtIdentityPart } from '../domain/identity.js';
import { PT_KIND, PT_MODULE, PT_REVISION_TYPE, PT_SCOPE_KEY, PT_STOCK_SOURCE_TYPE } from '../domain/kinds.js';
import {
  BUSINESS_DATE_NOT_SET,
  grnNotFound,
  notADraft,
  recordItem,
  refusalOutcome,
  refused,
  revisionNotFound,
  type Outcome,
} from '../domain/refusals.js';
import { ptApproved } from '../events.js';
import {
  revisionContent,
  revisionStanding,
  type ApprovalRow,
  type RevisionRow,
  type RevisionStanding,
} from '../queries/approval.js';
import { heldLinesOpen } from '../queries/plan.js';
import { reversedOriginsOf } from '../queries/reversal.js';
import { goodsAfterReversals } from '../domain/reversed.js';
import { auditScopeOf, scopeColumnsOf } from './scope-columns.js';

// Posting a PT revision's approval (goods-in 6.3, 6.6, 10.3; module-map 6.2 flow C; stock-ledger 10.2 to 10.4, 13.1,
// 13.14; access-and-approvals 9.7; PRD-REC-015, PRD-REC-017, PRD-REC-018, PRD-MER-013, PRD-PTW-010, PRD-INT-004;
// DEC-097, DEC-135, DEC-140; S2-F06-T01). One transaction, in the stock ledger's lock order, with the PT's, the GRN's
// and the catalogue's rows already held at step 1 by its caller: the decision's effect, for a PT posted with its
// decision, or the posting job of a large one (flow E). It runs goods-in 6.3's steps, each a function below:
//
// - **Under the locks** (recheckUnderLocks): the revision still the PT's newest draft; the policy gate; nothing of the
//   GRN waiting for a decision; the GRN's good pieces still those the PT covers, which a recount, a held line or a
//   damage report decided since would change; the PT's and the SKU codes' series Open; the PT's new products checked
//   by the catalogue.
// - **Steps 4 and 5 planned** (identityStep): the identity step gives every covered piece a new receipt origin of one
//   SKU at one P RATE (domain/identity.ts), with the coverage and cost of each and the end of the holds of goods Booking
//   took in (goods-in 4.6).
// - **The ledger request** (lockAndValue): Plan, the locks of steps 2 to 8, the PT's and the SKU codes' series with the
//   periods at step 8 in one call, Recheck and value.
// - **Step 1** (verifyAndUse): `access` verifies and uses the decision under those locks on the PT's cost then (9.7).
// - **Steps 4 to 6 written**: the ledger writes the identity step, the coverage and the cost at P RATE, which `finance`
//   · books posts under the posting map of `stock.cost-established` for owned goods and records only for goods the
//   brand or supplier still owns (stock-ledger 7.2, 13.4; DEC-141).
// - **Step 2** (confirmProducts): the new products confirmed with their SKU codes, and the rows' barcodes recorded.
// - **Step 3** (numberPt): the PT numbered from its series.
// - **Step 7** (recordApproval): the PT's own records, the audit record and `merchandise.pt-approved`.
//
// The goods stay at their receiving location, not accepted and not sellable until the scan-in (goods-in 6.3;
// stock-ledger 6.3).

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
    return notADraft(revisionId);
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
): CommandRefusal | undefined {
  const changed = (styleCode: string, size: string | null): CommandRefusal => ({
    kind: 'refused',
    code: 'merchandise.pt-grn-changed',
    missing: [styleSize(styleCode, size)],
  });
  const goods = new Map(basis.goods.map((each) => [keyOf(each.styleCode, each.size), each]));
  for (const each of coverage) {
    const now = goods.get(keyOf(each.styleCode, each.sizeCode));
    if (now?.quantity !== each.quantity) return changed(each.styleCode, each.sizeCode);
    goods.delete(keyOf(each.styleCode, each.sizeCode));
  }
  const [extra] = goods.values();
  return extra === undefined ? undefined : changed(extra.styleCode, extra.size);
}

type RevisionContent = Awaited<ReturnType<typeof revisionContent>>;

/**
 * The new products of the revision as the catalogue checks them, each from its rows (6.6): the rows of one new style
 * agree on its values, which the upload's check makes sure of (goods-in 5.3; code review 7), so its first row's are
 * the style's.
 */
function productRequests(content: RevisionContent, brandId: string): PtProductRequest[] {
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

/** The refusal codes of one series the approval draws from: none, Paused, or used up (goods-in 6.6, 10.4). */
interface SeriesCodes {
  readonly numberedKind: string;
  readonly missing: string;
  readonly paused: string;
  readonly exhausted: string;
}

const PT_SERIES: SeriesCodes = {
  numberedKind: PT_KIND.kind,
  missing: 'merchandise.no-pt-series',
  paused: 'merchandise.pt-series-paused',
  exhausted: 'merchandise.pt-series-exhausted',
};

const SKU_CODE_SERIES: SeriesCodes = {
  numberedKind: SKU_CODE_KIND.kind,
  missing: 'merchandise.no-sku-code-series',
  paused: 'merchandise.sku-code-series-paused',
  exhausted: 'merchandise.sku-code-series-exhausted',
};

/** A series refusal of the approval, naming the series kind (code-house-rules 12.3). */
const seriesRefusal = (codes: SeriesCodes, code: string): CommandRefusal => ({
  kind: 'unavailable',
  code,
  missing: [{ kind: 'number-series', numberedKind: codes.numberedKind }],
});

/**
 * Allocate's own refusal on a series the approval holds, as the approval's (numbering-and-audit 3.5, 3.7): none, Paused,
 * or used up. Any other cannot happen on a live series the command holds, for a new document: a defect.
 */
function allocateRefusal(codes: SeriesCodes, code: string): CommandRefusal {
  if (code === 'numbering.series-not-found') return seriesRefusal(codes, codes.missing);
  if (code === 'numbering.series-paused') return seriesRefusal(codes, codes.paused);
  if (code === 'numbering.series-exhausted') return seriesRefusal(codes, codes.exhausted);
  throw new CommandDefect(`Allocate refused the ${codes.numberedKind} series: ${code}`);
}

/** A live Open series of a kind, as a lock target, or the refusal naming the series missing or paused (10.4). */
async function openSeries(
  context: TransactionContext,
  numbering: PostingServices['numbering'],
  codes: SeriesCodes,
  scopeKey: string,
): Promise<Outcome<{ readonly seriesId: string }>> {
  const series = await numbering.liveSeries(context, { kind: codes.numberedKind, scopeKey });
  if (series === undefined) return refusalOutcome(seriesRefusal(codes, codes.missing));
  if (series.state !== 'Open') return refusalOutcome(seriesRefusal(codes, codes.paused));
  return { kind: 'success', answer: { seriesId: series.seriesId } };
}

/** What the rechecks under the locks found, which the steps after them use. */
interface Checked {
  readonly revision: RevisionRow;
  readonly date: string;
  readonly grn: GrnForPt;
  readonly place: { readonly siteId: string; readonly businessUnitId: string };
  readonly basis: PtBasis;
  readonly content: RevisionContent;
  readonly ptSeries: { readonly seriesId: string };
  /** The SKU code series, while the PT proposes new products (RR-585). */
  readonly skuSeries: { readonly seriesId: string } | undefined;
  readonly products: CheckedPtProducts;
}

/**
 * Under the locks the caller took at step 1 (goods-in 6.3 "Under the locks the approval is refused"): the revision the
 * PT's newest draft; a business date; the GRN; the policy gate (goods-in 10.5; PRD-SEC-017); nothing of the GRN waiting
 * for a decision; its good pieces still those the PT covers; the PT's series, and the SKU code series while it proposes
 * products, Open; and its new products, checked by the catalogue (step 2; RR-585). Writes nothing.
 */
async function recheckUnderLocks(
  context: TransactionContext,
  services: PostingServices,
  revisionId: string,
): Promise<Outcome<Checked>> {
  const standing = await revisionStanding(context, revisionId);
  const notDraft = draftRefusal(standing, revisionId);
  if (notDraft !== undefined || standing === undefined) return refusalOutcome(notDraft ?? revisionNotFound(revisionId));
  const { revision } = standing;
  const date = await context.businessDate();
  if (date.kind === 'not-set') return refusalOutcome(BUSINESS_DATE_NOT_SET);
  const grn = await services.receiving.grnForPt(context, standing.grnId);
  if (grn === undefined) return refusalOutcome(grnNotFound(standing.grnId));
  const place = { siteId: grn.facts.siteId, businessUnitId: grn.facts.businessUnitId };
  const gate = await ptGateRefusal(context, services.configuration, place);
  if (gate !== undefined) return refusalOutcome(gate);
  const grnBasis = await services.receiving.ptBasis(context, standing.grnId);
  if (grnBasis === undefined) return refusalOutcome(grnNotFound(standing.grnId));
  // After a reversal the pieces are on the reversed PT's origins, which the identity step takes (goods-in 6.7).
  const after = goodsAfterReversals(grnBasis, await reversedOriginsOf(context, revision.ptId));
  if (after.kind === 'changed') {
    return refused('refused', 'merchandise.pt-grn-changed', [styleSize(after.styleCode, after.size)]);
  }
  const basis = after.basis;
  const open = heldLinesOpen(basis);
  if (open !== undefined) return refusalOutcome(open);
  const content = await revisionContent(context, revisionId);
  const changed = changedRefusal(basis, content.coverage);
  if (changed !== undefined) return refusalOutcome(changed);
  const ptSeries = await openSeries(context, services.numbering, PT_SERIES, PT_SCOPE_KEY);
  if (ptSeries.kind === 'refusal') return ptSeries;
  let skuSeries: { readonly seriesId: string } | undefined;
  if (content.proposals.length > 0) {
    const found = await openSeries(context, services.numbering, SKU_CODE_SERIES, SKU_CODE_SCOPE_KEY);
    if (found.kind === 'refusal') return found;
    skuSeries = found.answer;
  }
  const checked = await checkPtProducts(context, {
    products: productRequests(content, revision.brandId),
    siteId: place.siteId,
    date: date.date,
  });
  if (checked.kind === 'refused') return refusalOutcome(checked.refusal);
  return {
    kind: 'success',
    answer: {
      revision,
      date: date.date,
      grn,
      place,
      basis,
      content,
      ptSeries: ptSeries.answer,
      skuSeries,
      products: checked.checked,
    },
  };
}

/** One new origin of the identity step, with what it covers (pt_origin). */
interface PlannedOrigin {
  readonly id: string;
  readonly coverageId: string;
  readonly grnLineId: string;
  readonly part: PtIdentityPart;
}

/** A hold of goods Booking took in that the approval ends, with its event (goods-in 4.6; pt_hold_release). */
interface PlannedRelease {
  readonly id: string;
  readonly grnLineId: string;
  readonly holdId: string;
  readonly event: 'pt-route' | 'approved-decision';
}

interface IdentityPlan {
  readonly origins: readonly PlannedOrigin[];
  readonly releases: readonly PlannedRelease[];
  readonly items: readonly LedgerItem[];
}

/** Each row's product: the SKU it names, or the one the catalogue checked for its proposal. */
function productOfRow(products: CheckedPtProducts): (row: ApprovalRow) => string {
  const skuOfProposal = new Map(products.products.map((each) => [each.key, each.skuId]));
  return (row) => {
    const skuId = row.skuId ?? (row.ptProposedSkuId === null ? undefined : skuOfProposal.get(row.ptProposedSkuId));
    if (skuId === undefined) throw new CommandDefect(`PT row ${row.id} has no product`);
    return skuId;
  };
}

/**
 * Steps 4 and 5 planned (goods-in 6.3; stock-ledger 13.14, 13.19): for each style and size the PT covers, the GRN's
 * good pieces split by the PT's rows into new receipt origins of one SKU at one P RATE (domain/identity.ts), each with
 * its coverage and its cost; and the end of each hold of goods Booking took in, an excess hold by the PT route and a
 * quarantine of wrong or unidentified goods by the approved decision (goods-in 4.6, 4.9). Writes nothing.
 */
function identityStep(checked: Checked, ptApprovalId: string, revisionId: string): Outcome<IdentityPlan> {
  const skuOfRow = productOfRow(checked.products);
  const origins: PlannedOrigin[] = [];
  const releases: PlannedRelease[] = [];
  const goods = new Map(checked.basis.goods.map((each) => [keyOf(each.styleCode, each.size), each]));
  for (const each of checked.content.coverage) {
    const group = goods.get(keyOf(each.styleCode, each.sizeCode));
    if (group === undefined) throw new CommandDefect('A PT coverage lost its GRN goods after the check');
    const sources = [];
    const lineOfOrigin = new Map<string, string>();
    for (const part of group.parts) {
      // An origin the approver may not see: the ledger's rows are hidden from them (stock-ledger 14.3).
      if (part.receiptOriginId === null) {
        return refused('not-authorised', 'access.not-authorised', [
          { kind: 'permission', recordType: STOCK_RECEIPT_ORIGIN_TYPE, action: 'view' },
        ]);
      }
      sources.push({ receiptOriginId: part.receiptOriginId, skuId: part.skuId, units: part.quantity });
      lineOfOrigin.set(part.receiptOriginId, part.grnLineId);
      for (const release of part.releases) releases.push({ id: uuidv7(), grnLineId: part.grnLineId, ...release });
    }
    const rows = checked.content.rows
      .filter((row) => row.ptCoverageId === each.id)
      .map((row) => ({ skuId: skuOfRow(row), pRatePaise: row.pRatePaise, quantity: row.quantity }));
    const split = ptIdentityParts(sources, rows, uuidv7);
    if (split.kind === 'mismatch') {
      return refused('refused', 'merchandise.pt-grn-changed', [styleSize(each.styleCode, each.sizeCode)]);
    }
    for (const part of split.parts) {
      const grnLineId = lineOfOrigin.get(part.receiptOriginId);
      if (grnLineId === undefined)
        throw new CommandDefect('The identity step made a part of an origin it was not given');
      origins.push({ id: uuidv7(), coverageId: each.id, grnLineId, part });
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
      at: checked.place,
      parts: origins.map(({ part }) => ({
        receiptOriginId: part.receiptOriginId,
        skuId: part.skuId,
        quantity: part.quantity,
        newReceiptOriginId: part.newReceiptOriginId,
      })),
    },
    ...origins.map((origin) => ({
      kind: 'record-coverage' as const,
      lineId: origin.id,
      ptRevisionId: revisionId,
      receiptOriginId: origin.part.newReceiptOriginId,
      quantity: origin.part.quantity,
    })),
    ...origins.map((origin) => ({
      kind: 'cost-established' as const,
      lineId: origin.id,
      receiptOriginId: origin.part.newReceiptOriginId,
      ptRevisionId: revisionId,
      pRatePaise: paise(origin.part.pRatePaise),
    })),
  ];
  return { kind: 'success', answer: { origins, releases, items } };
}

/**
 * The ledger request (stock-ledger 13.1 "The caller's command"): Plan; Lock, steps 2 to 6; the periods at step 7; the
 * journal series with the PT's and the SKU codes' series at step 8 in one call; Recheck and value. Writes nothing.
 */
async function lockAndValue(
  context: TransactionContext,
  services: PostingServices,
  request: PostingRequest,
  checked: Checked,
  plan: IdentityPlan,
  useId: string,
): Promise<Outcome<CheckedRequest>> {
  const planning = await services.ledger.plan(context, {
    source: {
      module: PT_MODULE,
      recordType: PT_STOCK_SOURCE_TYPE,
      recordId: request.revisionId,
      versionId: request.revisionId,
      importKind: 'none',
    },
    actor: ledgerActorOf(request.poster),
    approval: { decisionId: request.decisionId, useId },
    madeSkus: checked.products.products.map((each) => each.facts),
    items: [...plan.items],
  });
  if (planning.kind === 'refused') return refusalOutcome(planning.refusal);
  const locked = await services.ledger.lock(context, planning.value);
  const periods = await services.ledger.holdPeriods(context, planning.value);
  if (periods.kind === 'refused') return refusalOutcome(periods.refusal);
  const series: LockTarget[] = [
    ...periods.value,
    services.numbering.seriesLockTarget(checked.ptSeries.seriesId),
    ...(checked.skuSeries === undefined ? [] : [services.numbering.seriesLockTarget(checked.skuSeries.seriesId)]),
  ];
  await context.lock(LOCK_STEP.numberSeries, series);
  const recheck = await services.ledger.recheck(context, locked);
  if (recheck.kind === 'refused') return refusalOutcome(recheck.refusal);
  return { kind: 'success', answer: recheck.value };
}

/**
 * Step 1 (goods-in 6.3; access-and-approvals 9.7): `access` verifies the decision under the ledger's locks, on the PT's
 * cost established now, P RATE times the pieces (6.1; PRD-ACS-015), Unknown when any piece's is (PRD-ACS-016), and
 * records its use. Answers the refusal, or undefined.
 */
async function verifyAndUse(
  context: TransactionContext,
  services: PostingServices,
  request: PostingRequest,
  revision: RevisionRow,
  plan: IdentityPlan,
  valued: CheckedRequest,
  useId: string,
): Promise<CommandRefusal | undefined> {
  let cost = 0;
  let unknown = false;
  for (const [index, value] of valued.itemValues.entries()) {
    if (plan.items[index]?.kind !== 'cost-established') continue;
    if (value.kind === 'known') cost += value.amountPaise;
    else unknown = true;
  }
  const check = {
    decisionId: request.decisionId,
    actionType: PT_APPROVAL,
    document: { module: PT_MODULE, recordType: PT_TYPE, recordId: revision.ptId, versionId: request.revisionId },
    preparers: revision.preparerUserIds,
    value: unknown ? { kind: 'unknown' as const } : { kind: 'known' as const, amountPaise: paise(cost) },
  };
  const verified = await services.access.verifyUnderLock(context, check);
  if (verified !== undefined) return verified;
  return services.access.recordUse(context, { ...check, useId, actor: auditActorOf(request.poster) });
}

/**
 * Step 2 (goods-in 6.3; PRD-MER-013; RR-585): each new product given its code from the SKU code series and confirmed,
 * then each row's barcode not yet mapped to its product recorded under the PT's brand. Under every lock.
 */
async function confirmProducts(
  context: TransactionContext,
  services: PostingServices,
  request: PostingRequest,
  checked: Checked,
  source: AuditSource,
): Promise<CommandRefusal | undefined> {
  const { revision, products, skuSeries } = checked;
  const confirmer: PtConfirmer = {
    userId: request.approverUserId,
    approvalDecisionId: request.decisionId,
    actor: auditActorOf(request.poster),
    roleAssignmentId: request.poster.roleAssignmentId,
  };
  const codes = new Map<string, string>();
  if (skuSeries !== undefined) {
    for (const product of products.products) {
      const allocated = await services.numbering.allocate(context, {
        seriesId: skuSeries.seriesId,
        documentType: 'merchandise.sku',
        documentId: product.skuId,
      });
      if (allocated.kind === 'refused') return allocateRefusal(SKU_CODE_SERIES, allocated.refusal.code);
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
    date: checked.date,
  });
  if (confirmed.kind === 'refused') return confirmed.refusal;
  const skuOfRow = productOfRow(products);
  const mapped = await mapPtBarcodes(context, services.audit, {
    brandId: revision.brandId,
    date: checked.date,
    mappings: checked.content.rows
      .filter((row) => !row.barcodeMapped)
      .map((row) => ({ code: row.barcode, skuId: skuOfRow(row), rowNumber: row.rowNumber })),
    preparedBy: confirmer,
    source,
  });
  return mapped.kind === 'refused' ? mapped.refusal : undefined;
}

/** Step 3 (goods-in 6.3; PRD-REC-018): the PT's number from its series, which the command holds at step 8. */
async function numberPt(
  context: TransactionContext,
  services: PostingServices,
  checked: Checked,
  revisionId: string,
): Promise<Outcome<{ readonly formattedText: string; readonly allocationId: string }>> {
  const number = await services.numbering.allocate(context, {
    seriesId: checked.ptSeries.seriesId,
    documentType: PT_REVISION_TYPE,
    documentId: revisionId,
  });
  if (number.kind === 'refused') return refusalOutcome(allocateRefusal(PT_SERIES, number.refusal.code));
  return { kind: 'success', answer: number.value };
}

/**
 * Step 7 (goods-in 6.3, 6.6): the PT's records of the approval (`pt_approval`, `pt_product`, `pt_origin`,
 * `pt_hold_release`), the audit record `approve-pt` and `merchandise.pt-approved`. A PT the job posts was Posting.
 */
async function recordApproval(
  context: TransactionContext,
  services: PostingServices,
  request: PostingRequest,
  checked: Checked,
  plan: IdentityPlan,
  written: {
    readonly ptApprovalId: string;
    readonly number: string;
    readonly allocationId: string;
    readonly useId: string;
  },
  movementIds: readonly string[],
  source: AuditSource,
): Promise<void> {
  const { revision, products, grn, date } = checked;
  const { ptApprovalId, number } = written;
  const { poster, revisionId } = request;
  const scope = scopeColumnsOf(revision);
  await context.tx.insert(ptApproval).values({
    id: ptApprovalId,
    ptRevisionId: revisionId,
    ...scope,
    number,
    numberAllocationId: written.allocationId,
    approvalDecisionId: request.decisionId,
    approvalUseId: written.useId,
    approvedByUserId: request.approverUserId,
    ptPostRequestId: request.postRequestId ?? null,
    postedByServiceIdentityId: poster.kind === 'service-identity' ? poster.serviceIdentityId : null,
    postedAt: context.startedAt,
    businessDate: date,
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
    plan.origins.map((origin) => ({
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
  if (plan.releases.length > 0) {
    await insertInParts(
      context,
      ptHoldRelease,
      plan.releases.map((release) => ({ ...release, ptApprovalId, ...scope })),
    );
  }
  await services.audit.record(context, {
    actor: auditActorOf(poster),
    roleAssignmentId: poster.roleAssignmentId,
    approval: { decisionId: request.decisionId },
    ...(request.reason === undefined ? {} : { reason: request.reason }),
    scope: auditScopeOf(revision),
    record: { module: PT_MODULE, type: PT_TYPE, id: revision.ptId, versionId: revisionId },
    operation: 'approve-pt',
    changes: [
      {
        kind: 'value',
        field: 'state',
        before: request.postRequestId === undefined ? 'Awaiting approval' : 'Posting',
        after: 'Official',
      },
      { kind: 'value', field: 'number', before: null, after: number },
      { kind: 'value', field: 'movements', before: null, after: [...movementIds] },
      { kind: 'value', field: 'newProducts', before: null, after: products.products.map((each) => each.skuId) },
      { kind: 'value', field: 'holdsReleased', before: null, after: plan.releases.map((each) => each.holdId) },
      { kind: 'value', field: 'grn', before: null, after: grn.grnId },
    ],
    source,
  });
  await context.publish(ptApproved, {
    subject: { module: PT_MODULE, recordType: PT_TYPE, recordId: revision.ptId, versionId: revisionId },
    scope: auditScopeOf(revision),
    payload: { ptId: revision.ptId, revisionId, ptApprovalId },
  });
}

export async function postApproval(
  context: TransactionContext,
  services: PostingServices,
  request: PostingRequest,
): Promise<Outcome<{ readonly ptApprovalId: string; readonly number: string }>> {
  const checked = await recheckUnderLocks(context, services, request.revisionId);
  if (checked.kind === 'refusal') return checked;
  const ptApprovalId = uuidv7();
  const plan = identityStep(checked.answer, ptApprovalId, request.revisionId);
  if (plan.kind === 'refusal') return plan;
  const useId = uuidv7();
  const valued = await lockAndValue(context, services, request, checked.answer, plan.answer, useId);
  if (valued.kind === 'refusal') return valued;
  const used = await verifyAndUse(
    context,
    services,
    request,
    checked.answer.revision,
    plan.answer,
    valued.answer,
    useId,
  );
  if (used !== undefined) return refusalOutcome(used);
  // Writes, every lock held (code-house-rules 8.2): the ledger's (steps 4 to 6), then the products and barcodes (step
  // 2), the number (step 3) and the PT's own (step 7). Posted from the approval panel, or by the posting job
  // (numbering-and-audit 4.1).
  const source: AuditSource = request.poster.kind === 'user' ? { kind: 'screen' } : { kind: 'job' };
  const written = await services.ledger.write(context, valued.answer, source);
  if (written.kind === 'refused') return refusalOutcome(written.refusal);
  const confirmed = await confirmProducts(context, services, request, checked.answer, source);
  if (confirmed !== undefined) return refusalOutcome(confirmed);
  const number = await numberPt(context, services, checked.answer, request.revisionId);
  if (number.kind === 'refusal') return number;
  await recordApproval(
    context,
    services,
    request,
    checked.answer,
    plan.answer,
    { ptApprovalId, number: number.answer.formattedText, allocationId: number.answer.allocationId, useId },
    written.value.movementIds,
    source,
  );
  return { kind: 'success', answer: { ptApprovalId, number: number.answer.formattedText } };
}

/** The GRN a revision is for, as a missing item (goods-in 5.7). */
export const grnItem = (grnId: string): MissingItem => recordItem(GRN_TYPE, grnId);
