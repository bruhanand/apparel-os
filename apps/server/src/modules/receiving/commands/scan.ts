import { uuidv7 } from '@apparel-os/domain';
import { GRN_TYPE, SCAN_TYPE, type ScanAnswered, type ScanDraft, type ScanRefusal } from '@apparel-os/schemas';
import { LOCK_STEP, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { resolveCode } from '../../merchandise/catalogue/index.js';
import { termsOfVersion } from '../../merchandise/parties/index.js';
import type { LedgerItem, Owner, StockLedgerInterface } from '../../stock/ledger/index.js';
import { scan } from '../db/schema.js';
import { RECEIVING_MODULE, SCAN_SOURCE_TYPE } from '../domain/kinds.js';
import { ownerOfGrn } from '../domain/owner.js';
import { originToScan } from '../domain/scan-in.js';
import { pieceAccepted } from '../events.js';
import { receivingMissing, receivingUnavailable, type AvailabilityDependencies } from '../queries/availability.js';
import { grnRow } from '../queries/grns.js';
import { destinationsOf, officialPtOf } from '../queries/scan-in.js';
import {
  arrivalRow,
  audited,
  factsOf,
  recordItem,
  recordNotFound,
  refusalOf,
  refused,
  scopeColumns,
  today,
  valueChange,
  type Actor,
  type ArrivalRow,
  type Outcome,
} from './common.js';
import { ptMarkLock } from './pt-mark.js';

// A scan of the scan-in at the Site (goods-in 7.1 to 7.4, 10.3; PRD-REC-021, PRD-REC-022, PRD-STK-003, PRD-MER-007;
// DEC-135, DEC-141; S2-F07-T01). One piece a scan, with no second person (PRD-REC-022). Locks the GRN's row at step 1,
// which a PT's approval, withdrawal, rejection and reversal lock too (goods-in 5.8), so every scan of a GRN is made one
// after another and never passes a change of its PT: two scans of its last piece at once accept it once. Under the lock
// it asks receiving's gate at the unit (goods-in 10.5), reads the GRN's approved PT and the goods it covers, and checks
// where the piece goes; resolves the barcode under the PT's brand (RR-554) to the PT's products it is on: none, or a
// product with no piece waiting, is refused and kept in the scan-in's record with no stock change; more than one asks
// which, never choosing for the person (PRD-MER-007). An accepted scan, in one transaction, moves its piece from the
// receiving location to where it goes and accepts it there through the ledger, and, under an Agreement passing ownership
// at receipt and acceptance, changes its owner to the Organisation (DEC-141, POL-01.05), which the ledger refuses while
// SL-26 is open; then the scan, its audit record and `receiving.piece-accepted`.

export interface ScanDependencies extends AvailabilityDependencies {
  readonly audit: AuditInterface;
  readonly ledger: StockLedgerInterface;
}

/** The PT's products a barcode is on (goods-in 7.2): every SKU its mappings name under the PT's brand that it covers. */
async function productsOfBarcode(
  context: TransactionContext,
  barcode: string,
  brandId: string,
  date: string,
  covered: ReadonlySet<string>,
): Promise<string[]> {
  const resolved = await resolveCode(context, { code: barcode, kind: 'supplier-barcode', brandId, date });
  // A code no mapping names, or names ambiguously, names none of the PT's products.
  if (!('resolved' in resolved)) return [];
  return [...new Set(resolved.resolved.candidates.map((each) => each.skuId))].filter((skuId) => covered.has(skuId));
}

/**
 * The owner a scan gives its piece (goods-in 4.5, 4.8; DEC-141, POL-01.05): under the GRN's Agreement version, when it
 * passes ownership at receipt and acceptance, the Organisation, as the legal entity of the receiving unit, the scan-in
 * being the acceptance; under any other, none, the piece keeping the owner the GRN gave it.
 */
async function ownerAtAcceptance(
  context: TransactionContext,
  grn: NonNullable<Awaited<ReturnType<typeof grnRow>>>,
): Promise<Owner | undefined> {
  const kept = ownerOfGrn(grn);
  if (kept.kind !== 'brand' && kept.kind !== 'supplier') return undefined;
  const terms = await termsOfVersion(context, kept.agreementVersionId, false);
  if (terms?.terms.ownershipEvent?.kind !== 'receipt-and-acceptance') return undefined;
  return { kind: 'organisation', legalEntityId: grn.legalEntityId, agreementVersionId: kept.agreementVersionId };
}

/** Writes the scan, its audit record and, for an accepted one, its event (goods-in 7.2, 10.4). */
async function recorded(
  context: TransactionContext,
  dependencies: ScanDependencies,
  actor: Actor,
  at: { readonly grnId: string; readonly arrival: ArrivalRow; readonly ptRevisionId: string; readonly date: string },
  entry: {
    readonly scanId: string;
    readonly barcode: string;
    readonly destinationLocationId: string;
    readonly idempotencyKey: string;
  } & (
    | { readonly outcome: 'accepted'; readonly skuId: string; readonly receiptOriginId: string }
    | { readonly outcome: 'refused'; readonly reason: ScanRefusal; readonly skuId: string | null }
  ),
): Promise<Outcome<ScanAnswered>> {
  const reason = entry.outcome === 'refused' ? entry.reason : null;
  const receiptOriginId = entry.outcome === 'accepted' ? entry.receiptOriginId : null;
  await context.tx.insert(scan).values({
    id: entry.scanId,
    grnId: at.grnId,
    ...scopeColumns(at.arrival),
    ptRevisionId: at.ptRevisionId,
    barcode: entry.barcode,
    destinationLocationId: entry.destinationLocationId,
    outcome: entry.outcome,
    reason,
    skuId: entry.skuId,
    receiptOriginId,
    scannedByUserId: actor.userId,
    roleAssignmentId: actor.roleAssignmentId,
    scannedAt: context.startedAt,
    businessDate: at.date,
  });
  await audited(context, dependencies.audit, actor, at.arrival, {
    record: { type: SCAN_TYPE, id: entry.scanId },
    operation: entry.outcome === 'accepted' ? 'accept-scan' : 'refuse-scan',
    changes: [
      valueChange('grn', null, at.grnId),
      valueChange('barcode', null, entry.barcode),
      valueChange('outcome', null, entry.outcome),
      valueChange('reason', null, reason),
      valueChange('skuId', null, entry.skuId),
      valueChange('receiptOriginId', null, receiptOriginId),
      valueChange('destinationLocationId', null, entry.destinationLocationId),
    ],
    idempotencyKey: entry.idempotencyKey,
  });
  if (entry.outcome === 'accepted') {
    await context.publish(pieceAccepted, {
      subject: { module: RECEIVING_MODULE, recordType: SCAN_TYPE, recordId: entry.scanId },
      scope: factsOf(at.arrival),
      payload: { scanId: entry.scanId, grnId: at.grnId },
    });
  }
  return {
    kind: 'success',
    answer: { scanId: entry.scanId, outcome: entry.outcome, reason, skuId: entry.skuId },
  };
}

export async function scanPiece(
  context: TransactionContext,
  dependencies: ScanDependencies,
  actor: Actor,
  grnId: string,
  draft: ScanDraft,
  idempotencyKey: string,
): Promise<Outcome<ScanAnswered>> {
  // Step 1: the GRN's row (code-house-rules 8.2), read under the lock.
  const held = await context.lock(LOCK_STEP.document, [ptMarkLock(grnId)]);
  if (held.missing.length > 0) return refusalOf(recordNotFound(GRN_TYPE, grnId));
  const grn = await grnRow(context, grnId);
  const arrival = grn === undefined ? undefined : await arrivalRow(context, grn.arrivalId);
  if (grn === undefined || arrival === undefined) return refusalOf(recordNotFound(GRN_TYPE, grnId));
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  // Receiving's gate at the unit: a scan accepts goods, as a GRN's issue counts them (goods-in 10.5).
  const place = { siteId: arrival.siteId, businessUnitId: arrival.businessUnitId };
  const unavailable = receivingUnavailable(await receivingMissing(context, dependencies, place, date));
  if (unavailable !== undefined) return refusalOf(unavailable);
  const pt = await officialPtOf(context, grn.id);
  if (pt === undefined) return refused('refused', 'receiving.pt-not-official', [recordItem(GRN_TYPE, grn.id)]);
  const destination = (await destinationsOf(context, arrival, date)).find(
    (each) => each.id === draft.destinationLocationId,
  );
  if (destination === undefined) {
    return refused('refused', 'receiving.destination-not-allowed', [
      recordItem('organisation.location', draft.destinationLocationId),
    ]);
  }
  const barcode = draft.barcode.trim();
  const at = { grnId: grn.id, arrival, ptRevisionId: pt.ptRevisionId, date };
  const entry = { scanId: uuidv7(), barcode, destinationLocationId: destination.id, idempotencyKey };
  const products = await productsOfBarcode(
    context,
    barcode,
    grn.brandId,
    date,
    new Set(pt.goods.map((each) => each.skuId)),
  );
  if (products.length === 0) {
    return recorded(context, dependencies, actor, at, {
      ...entry,
      outcome: 'refused',
      reason: 'not-covered',
      skuId: null,
    });
  }
  let skuId: string;
  if (draft.skuId !== undefined) {
    if (!products.includes(draft.skuId)) {
      return refused('refused', 'receiving.product-not-of-barcode', [recordItem('merchandise.sku', draft.skuId)]);
    }
    skuId = draft.skuId;
  } else {
    const [only] = products;
    if (products.length > 1 || only === undefined) {
      return refused(
        'refused',
        'receiving.barcode-repeated',
        products.map((each) => recordItem('merchandise.sku', each)),
      );
    }
    skuId = only;
  }
  const receiptOriginId = originToScan(pt.goods, skuId, arrival.receivingLocationId);
  if (receiptOriginId === undefined) {
    return recorded(context, dependencies, actor, at, { ...entry, outcome: 'refused', reason: 'nothing-left', skuId });
  }

  // The scan's one ledger request (stock-ledger 13.1, 13.20): the piece moved from the receiving location to where it
  // goes, in good condition; accepted there, its barcode verified (PRD-REC-021); and its owner changed where the
  // Agreement passes ownership at receipt and acceptance (DEC-141).
  const from = {
    siteId: arrival.siteId,
    businessUnitId: arrival.businessUnitId,
    locationId: arrival.receivingLocationId,
  };
  const to = { ...from, locationId: destination.id };
  const goods = { skuId, quantity: 1, receiptOriginId };
  const owner = await ownerAtAcceptance(context, grn);
  const items: LedgerItem[] = [
    {
      kind: 'location-move',
      lineId: uuidv7(),
      from,
      to: { businessUnitId: to.businessUnitId, locationId: to.locationId },
      condition: 'good',
      goods,
    },
    { kind: 'record-acceptance', lineId: uuidv7(), at: to, goods, condition: 'good' },
    ...(owner === undefined
      ? []
      : [{ kind: 'ownership-change' as const, lineId: uuidv7(), receiptOriginId, quantity: 1, at: to, owner }]),
  ];
  const planned = await dependencies.ledger.plan(context, {
    source: {
      module: RECEIVING_MODULE,
      recordType: SCAN_SOURCE_TYPE,
      recordId: entry.scanId,
      versionId: entry.scanId,
      importKind: 'none',
    },
    actor: { kind: 'user', userId: actor.userId, roleAssignmentId: actor.roleAssignmentId },
    idempotencyKey,
    items,
  });
  if (planned.kind === 'refused') return refusalOf(planned.refusal);
  const locked = await dependencies.ledger.lock(context, planned.value);
  const periods = await dependencies.ledger.holdPeriods(context, planned.value);
  if (periods.kind === 'refused') return refusalOf(periods.refusal);
  if (periods.value.length > 0) await context.lock(LOCK_STEP.numberSeries, [...periods.value]);
  const checked = await dependencies.ledger.recheck(context, locked);
  if (checked.kind === 'refused') return refusalOf(checked.refusal);
  const written = await dependencies.ledger.write(context, checked.value, { kind: 'screen' });
  if (written.kind === 'refused') return refusalOf(written.refusal);
  return recorded(context, dependencies, actor, at, { ...entry, outcome: 'accepted', skuId, receiptOriginId });
}
