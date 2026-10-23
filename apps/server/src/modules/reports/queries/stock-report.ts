import { addPaise, isKnown, paise, type Paise } from '@apparel-os/domain';
import type { StockCost, StockReport, StockReportFilters, StockReportRow } from '@apparel-os/schemas';
import type { ReadModelGateway, TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface, RecordFacts } from '../../access/index.js';
import { CATALOGUE_PRODUCT_FACTS } from '../../merchandise/catalogue/index.js';
import { PT_ORIGIN_MRP } from '../../merchandise/pt/index.js';
import { STOCK_BALANCE_COSTS, STOCK_HOLDINGS, type Holding, type HoldingKey } from '../../stock/ledger/index.js';
import { holdingCursorOf, mrpValueOf } from '../domain/stock-report.js';
import { namesOf } from './names.js';
import { productOf, type Authority, type CostShown } from './stock-search.js';

// The stock report (goods-in 9.2, 9.3, 9.5; PRD-PRO-001, PRD-ORG-014, PRD-ORG-015, PRD-ACS-008, PRD-MOD-015;
// S2-F11-T02): stock by product, size, location, condition and owner, with the quantities of stock search apart, the
// MRP value of the physical pieces for every reader (goods-in 9.1) and their cost only for a reader whose assignment
// grants the cost field class, read through the read-model gateway: `stock` · ledger's `stock.holdings` and
// `stock.balance-costs`, `merchandise` · PT's MRP of the PT's goods, the catalogue's products. Each row is shown by
// its own facts, as stock search shows a result (`Authority`; goods-in 9.4); the page may then hold fewer, its cursor
// still moving past them. A row drills down to the GRNs its pieces were counted on.

export interface StockReportRequest {
  readonly filters: StockReportFilters;
  readonly after?: HoldingKey;
  readonly limit: number;
  readonly today: string;
}

/** A page of the stock report, and each row whose cost it shows, for an export's access record. */
export interface StockReportAnswer {
  readonly report: StockReport;
  readonly costShown: readonly CostShown[];
}

const factsOf = (holding: Holding): RecordFacts => ({
  siteId: holding.key.siteId,
  ...(holding.storeId === null ? {} : { storeId: holding.storeId }),
  businessUnitId: holding.key.businessUnitId,
  legalEntityId: holding.key.legalEntityId,
  brandId: holding.brandId,
});

export async function stockReport(
  gateway: ReadModelGateway,
  access: AccessInterface,
  context: TransactionContext,
  request: StockReportRequest,
  authority: Authority,
): Promise<StockReportAnswer> {
  const read = await gateway.read(context, STOCK_HOLDINGS, {
    ...request.filters,
    ...(request.after === undefined ? {} : { after: request.after }),
    limit: request.limit,
  });
  const page = read.answer.holdings;
  const pageFacts = page.map(factsOf);
  const visible = await authority.visible(pageFacts);
  const shown = page.filter((_, at) => visible[at] === true);
  const shownFacts = pageFacts.filter((_, at) => visible[at] === true);

  // Cost only where the reader's assignment grants the cost field class; otherwise masked (access-and-approvals 6).
  const costShown = await authority.cost(shownFacts);
  const costed = (at: number) => costShown[at] !== undefined;
  const costs = new Map(
    (
      await gateway.read(
        context,
        STOCK_BALANCE_COSTS,
        shown.filter((_, at) => costed(at)).flatMap((each) => each.balances.map((b) => b.balanceId)),
      )
    ).answer.map((each) => [each.balanceId, each.cost]),
  );
  const costOf = (holding: Holding, at: number): StockCost => {
    if (!costed(at)) return { kind: 'masked' };
    let total = paise(0);
    for (const balance of holding.balances) {
      const cost = costs.get(balance.balanceId);
      // A balance whose cost the reader's rows do not answer, or not established, makes the whole Unknown (PRD-MOD-015).
      if (cost === undefined || !isKnown(cost)) return { kind: 'unknown' };
      total = addPaise(total, cost.value);
    }
    return { kind: 'known', value: total };
  };

  // The MRP of every piece shown, from its PT, which needs no permission (goods-in 9.1).
  const mrp = new Map<string, Paise>(
    (
      await gateway.read(
        context,
        PT_ORIGIN_MRP,
        shown.flatMap((each) => each.balances.map((balance) => balance.receiptOriginId)),
      )
    ).answer.map((each) => [each.receiptOriginId, each.mrp]),
  );

  const facts = (
    await gateway.read(context, CATALOGUE_PRODUCT_FACTS, {
      skuIds: shown.flatMap((each) => (each.product.kind === 'sku' ? [each.product.skuId] : [])),
      brandIds: [],
      date: request.today,
    })
  ).answer;
  const products = new Map(facts.products.map((each) => [each.skuId, each]));
  const { names, sourceGrns } = await namesOf(
    gateway,
    access,
    context,
    {
      siteIds: shown.map((each) => each.key.siteId),
      businessUnitIds: shown.map((each) => each.key.businessUnitId),
      locationIds: shown.map((each) => each.key.locationId),
      legalEntityIds: shown.flatMap((each) => (each.owner.kind === 'organisation' ? [each.owner.legalEntityId] : [])),
      brandIds: [
        ...shown.map((each) => each.brandId),
        ...shown.flatMap((each) => (each.owner.kind === 'brand' ? [each.owner.brandId] : [])),
      ],
      supplierIds: shown.flatMap((each) => (each.owner.kind === 'supplier' ? [each.owner.partyId] : [])),
      sources: shown.flatMap((each) => each.sources),
    },
    request.today,
  );
  const grnOf = (source: Holding['sources'][number]) =>
    sourceGrns.find(
      (each) =>
        each.module === source.module && each.recordType === source.recordType && each.recordId === source.recordId,
    )?.grnId;

  const rows = shown.map((holding, at): StockReportRow => ({
    rowKey: holdingCursorOf(holding.key),
    product: productOf(holding, products),
    brandId: holding.brandId,
    siteId: holding.key.siteId,
    storeId: holding.storeId,
    businessUnitId: holding.key.businessUnitId,
    locationId: holding.key.locationId,
    condition: holding.condition,
    owner: { ...holding.owner },
    availableAs: holding.storeId === null ? 'move' : 'sell',
    physical: holding.physical,
    available: holding.available,
    waiting: holding.waiting,
    held: holding.held,
    heldByKind: holding.heldByKind.map((each) => ({ ...each })),
    frozen: holding.frozen,
    mrpValue: mrpValueOf(holding.balances, mrp),
    cost: costOf(holding, at),
    grnIds: [
      ...new Set(
        holding.sources.flatMap((source) => {
          const grnId = grnOf(source);
          return grnId === undefined ? [] : [grnId];
        }),
      ),
    ],
  }));
  return {
    report: {
      asOf: read.asOf,
      rows,
      names,
      next: read.answer.next === null ? null : holdingCursorOf(read.answer.next),
    },
    costShown: shownFacts.flatMap((facts, at) => {
      const roleAssignmentId = costShown[at];
      return roleAssignmentId === undefined ? [] : [{ facts, roleAssignmentId }];
    }),
  };
}
