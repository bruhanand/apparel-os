import type { ItemValue, LedgerItem } from './request.js';
import { Corrections } from './valuing/corrections.js';
import type { Touch } from './working.js';

// The valued items of stock-ledger 13.4 on the working state (7, 13.1 "Recheck and value"; S1-F10-T03): value is
// worked out in posting order under the pool locks (7.10), every outflow at the formula cost (7.3 to 7.5), inflows
// that undo an outflow at the cost it left with (7.5), value held on a dispatch or a supplier-return shipment between
// pools (7.8), cost established and late cost changes following their goods (7.6, 7.7). Pure: no database, no clock
// (code-house-rules 2). The items are split by kind under `valuing/`: the common part (`core.ts`), cost established
// and changed (`cost.ts`), reservations, transfers and supplier returns (`transfer.ts`), sales and customer returns
// (`sale.ts`), and disposal, counts, reversals and piece corrections (`corrections.ts`).

export type {
  PostShare,
  SaleState,
  TransitLayerState,
  TransitState,
  ValuationEntry,
  ValuingInputs,
} from './valuing/state.js';

export class Valuing extends Corrections {
  protected override applyValued(item: LedgerItem): ItemValue {
    switch (item.kind) {
      case 'cost-established':
        return this.costEstablished(item);
      case 'cost-adjustment':
        return this.costAdjustment(item);
      case 'sale-issue':
        return this.saleIssue(item);
      case 'customer-return':
        return this.customerReturn(item);
      case 'dispatch':
      case 'supplier-return-departure':
        return this.depart(item);
      case 'arrival-count':
      case 'supplier-rejection-return':
      case 'supplier-handover':
        return this.leaveTransit(item);
      case 'disposal':
        return this.disposal(item);
      case 'count-difference':
        return this.countDifference(item);
      case 'reversal':
        return this.reversal(item);
      case 'piece-correction':
        return this.pieceCorrection(item);
      default:
        throw new Error(`Not a valued item: ${item.kind}`);
    }
  }

  /** What a valued item touches, for the count-freeze check (8.1): a late cost change waits until the count closes. */
  override touches(item: LedgerItem): Touch[] {
    const at = (siteId: string, businessUnitId: string, locationId: string | null, skuId: string): Touch[] => [
      ...(locationId === null ? [] : [{ siteId, businessUnitId, kind: 'location' as const, id: locationId }]),
      { siteId, businessUnitId, kind: 'sku', id: skuId },
      { siteId, businessUnitId, kind: 'brand', id: this.sku(skuId).brandId },
    ];
    switch (item.kind) {
      case 'sale-issue':
        return at(item.at.siteId, item.at.businessUnitId, item.at.locationId, item.goods.skuId);
      case 'dispatch':
      case 'supplier-return-departure':
        return at(item.from.siteId, item.from.businessUnitId, item.from.locationId, item.goods.skuId);
      case 'customer-return':
        return at(item.to.siteId, item.to.businessUnitId, item.to.locationId, item.goods.skuId);
      case 'arrival-count':
      case 'supplier-rejection-return':
        return [
          ...at(item.to.siteId, item.to.businessUnitId, item.to.locationId, item.goods.skuId),
          ...at(item.from.siteId, item.from.businessUnitId, null, item.goods.skuId),
        ];
      case 'supplier-handover':
        return at(item.from.siteId, item.from.businessUnitId, null, item.goods.skuId);
      case 'disposal':
      case 'count-difference':
      case 'reversal':
        return at(item.at.siteId, item.at.businessUnitId, item.at.locationId, item.goods.skuId);
      case 'piece-correction': {
        const found = this.piecesByCode.get(item.foundPieceCode);
        const missing = this.piecesByCode.get(item.missingPieceCode);
        if (found?.skuId == null) return [];
        return [
          ...at(item.at.siteId, item.at.businessUnitId, item.at.locationId, found.skuId),
          ...(missing === undefined ? [] : at(missing.siteId, missing.businessUnitId, missing.locationId, found.skuId)),
        ];
      }
      case 'cost-adjustment': {
        const origin = this.origins.get(item.receiptOriginId);
        if (origin?.skuId == null) return [];
        const skuId = origin.skuId;
        return this.originBalances(origin).flatMap((row) => at(row.siteId, row.businessUnitId, null, skuId));
      }
      default:
        return super.touches(item);
    }
  }
}
