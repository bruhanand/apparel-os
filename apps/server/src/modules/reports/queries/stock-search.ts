import { addPaise, isKnown, paise } from '@apparel-os/domain';
import {
  STOCK_SEARCH_PRODUCT_CAP,
  type MaybeKnownText,
  type StockCost,
  type StockElsewhere,
  type StockPosition,
  type StockProduct,
  type StockSearch,
  type StockSearchFilters,
} from '@apparel-os/schemas';
import type { ReadModelGateway, TransactionContext } from '../../../kernel/index.js';
import {
  CATALOGUE_PRODUCT_FACTS,
  CATALOGUE_PRODUCT_SEARCH,
  type ProductFacts,
} from '../../merchandise/catalogue/index.js';
import { ORGANISATION_PLACES } from '../../organisation/index.js';
import {
  STOCK_BALANCE_COSTS,
  STOCK_POSITIONS,
  STOCK_UNIT_POSITIONS,
  type Position,
  type PositionKey,
  type UnitPosition,
  type UnitPositionsQuery,
} from '../../stock/ledger/index.js';
import { cursorOf, ledgerFilters, namedPlace, namesProducts, type NamedPlace } from '../domain/search.js';
import { factsOf, readerAuthority, type Shown } from './authority.js';
import type { Reading } from './reading.js';

// Stock search (goods-in 9.1, 9.2, 9.4; module-map section 5 `reports`; PRD-STK-001, PRD-STK-006, PRD-ACS-008,
// PRD-EXC-010, PRD-MOD-003; S2-F11-T01), composed from declared read models read through the kernel's read-model
// gateway only, in the reader's transaction under the reader's own actor: the catalogue finds the products a text, a
// size or a barcode names; the ledger answers the stock of products at places with its quantities apart, the same
// products at the other business units, and the cost of the balances the reader may see cost of; the catalogue and
// `organisation` name the products, brands and places shown. Each result is shown through the reader's own grants
// (`readerAuthority`), its cost only with the cost field class; a result the reader may not see is left out after the page
// is read, so a page may hold fewer, and its cursor still moves past them (code-house-rules 12.1, as the stage 1 master
// lists and the open-to-buy budgets).

export interface SearchRequest {
  readonly filters: StockSearchFilters;
  readonly after?: PositionKey;
  readonly limit: number;
}

/**
 * The product of a result as the reader sees it; a SKU the catalogue does not answer is Unknown (PRD-MOD-015). The
 * stock report names its products the same way (goods-in 9.5; S2-F11-T02).
 */
export function productOf(position: Pick<Position, 'product'>, facts: ReadonlyMap<string, ProductFacts>): StockProduct {
  const { product } = position;
  if (product.kind === 'counted') {
    return {
      kind: 'counted',
      styleCode: product.styleCode,
      colour: maybeKnown(product.colour),
      size: maybeKnown(product.size),
    };
  }
  if (product.kind === 'unidentified') return { kind: 'unidentified' };
  const found = facts.get(product.skuId);
  if (found === undefined) return { kind: 'product', skuId: product.skuId, facts: { kind: 'unknown' } };
  return {
    kind: 'product',
    skuId: product.skuId,
    facts: {
      kind: 'known',
      code: found.code,
      styleCode: found.styleCode,
      size: maybeKnown(found.size),
      articleNumber: found.articleNumber,
      identity: found.identity.map((value) => ({ ...value })),
    },
  };
}

/** A text the read holds as null while Unknown, in the shape the API sends Unknown in (PRD-MOD-015). */
const maybeKnown = (value: string | null): MaybeKnownText =>
  value === null ? { kind: 'unknown' } : { kind: 'known', value };

/**
 * The business units outside the place a search names, where the same products are looked for (goods-in 9.2): every
 * other Site's for a Site; every other unit's for a business unit or a location, a location's unit read from
 * `organisation`. None when the search names no place, every place being among its results already, or a location that
 * does not exist.
 */
async function outsideOf(
  gateway: ReadModelGateway,
  context: TransactionContext,
  place: NamedPlace | undefined,
  today: string,
): Promise<UnitPositionsQuery['outside'] | undefined> {
  if (place === undefined) return undefined;
  if (place.kind === 'site') return { kind: 'site', siteId: place.siteId };
  if (place.kind === 'unit') return { kind: 'unit', businessUnitId: place.businessUnitId };
  const { answer } = await gateway.read(context, ORGANISATION_PLACES, {
    siteIds: [],
    businessUnitIds: [],
    locationIds: [place.locationId],
    date: today,
  });
  const location = answer.locations.find((each) => each.id === place.locationId);
  return location === undefined ? undefined : { kind: 'unit', businessUnitId: location.businessUnitId };
}

const availableAs = (storeId: string | null) => (storeId === null ? ('move' as const) : ('sell' as const));

/** The quantities a result shows, apart (goods-in 9.2). */
const quantities = (row: Position | UnitPosition) => ({
  availableAs: availableAs(row.storeId),
  physical: row.physical,
  available: row.available,
  waiting: row.waiting,
  held: row.held,
});

/** A page of stock search, and each result it shows with the grants that show it, for an export's step 0. */
export interface SearchAnswer {
  readonly search: StockSearch;
  readonly shown: readonly Shown[];
}

/**
 * One page of stock search (goods-in 9.2): through the gateway, as the reader may see it, with the time it was read. A
 * search that names products reads at most STOCK_SEARCH_PRODUCT_CAP of them and says when more match.
 */
export async function searchStock(reading: Reading, request: SearchRequest): Promise<SearchAnswer> {
  const { gateway, context, today } = reading;
  const { filters } = request;
  const authority = readerAuthority(reading.access, context, reading.actorId);
  const found = namesProducts(filters)
    ? (
        await gateway.read(context, CATALOGUE_PRODUCT_SEARCH, {
          ...(filters.text === undefined ? {} : { text: filters.text }),
          ...(filters.size === undefined ? {} : { size: filters.size }),
          ...(filters.barcode === undefined ? {} : { barcode: filters.barcode }),
          ...(filters.brandId === undefined ? {} : { brandId: filters.brandId }),
          date: today,
          cap: STOCK_SEARCH_PRODUCT_CAP,
        })
      ).answer
    : undefined;
  const read = await gateway.read(context, STOCK_POSITIONS, {
    ...ledgerFilters(filters, found?.skuIds),
    ...(request.after === undefined ? {} : { after: request.after }),
    limit: request.limit,
  });
  const page = read.answer.positions;
  const pageFacts = page.map((position) => factsOf({ ...position, ...position.key }));
  const visible = await authority.visible(pageFacts);
  const shownRows = page.flatMap((position, at) => {
    const views = visible[at];
    const facts = pageFacts[at];
    return views === undefined || facts === undefined ? [] : [{ position, facts, views }];
  });
  const shown = shownRows.map((each) => each.position);
  const shownFacts = shownRows.map((each) => each.facts);

  // Cost only where the reader's assignment grants the cost field class; otherwise masked (access-and-approvals 6).
  const costShown = await authority.cost(shownFacts);
  const costed = shown.filter((_, at) => costShown[at] !== undefined);
  const costs = new Map(
    (
      await gateway.read(
        context,
        STOCK_BALANCE_COSTS,
        costed.flatMap((position) => position.balanceIds),
      )
    ).answer.map((each) => [each.balanceId, each.cost]),
  );
  const costOf = (position: Position, at: number): StockCost => {
    if (costShown[at] === undefined) return { kind: 'masked' };
    let total = paise(0);
    for (const balanceId of position.balanceIds) {
      const cost = costs.get(balanceId);
      // A balance whose cost the reader's rows do not answer, or not established, makes the whole Unknown (PRD-MOD-015).
      if (cost === undefined || !isKnown(cost)) return { kind: 'unknown' };
      total = addPaise(total, cost.value);
    }
    return { kind: 'known', value: total };
  };

  // The same products at the other Stores and warehouses the reader may see, when the search names a place.
  const outside = await outsideOf(gateway, context, namedPlace(filters), today);
  const elsewhereRead =
    outside === undefined || shown.length === 0
      ? []
      : (
          await gateway.read(context, STOCK_UNIT_POSITIONS, {
            productKeys: [...new Set(shown.map((position) => position.key.productKey))],
            ...(filters.brandId === undefined ? {} : { brandId: filters.brandId }),
            ...(filters.condition === undefined ? {} : { condition: filters.condition }),
            outside,
          })
        ).answer;
  const elsewhereVisible = await authority.visible(elsewhereRead.map(factsOf));
  const elsewhere = elsewhereRead.filter((_, at) => elsewhereVisible[at] !== undefined);

  const skuIds = shown.flatMap((position) => (position.product.kind === 'sku' ? [position.product.skuId] : []));
  const facts = (
    await gateway.read(context, CATALOGUE_PRODUCT_FACTS, {
      skuIds,
      brandIds: shown.map((position) => position.brandId),
      date: today,
    })
  ).answer;
  const products = new Map(facts.products.map((each) => [each.skuId, each]));
  const named = (
    await gateway.read(context, ORGANISATION_PLACES, {
      siteIds: [...shown.map((position) => position.key.siteId), ...elsewhere.map((each) => each.siteId)],
      businessUnitIds: [
        ...shown.map((position) => position.key.businessUnitId),
        ...elsewhere.map((each) => each.businessUnitId),
      ],
      locationIds: shown.map((position) => position.key.locationId),
      date: today,
    })
  ).answer;

  const positions = shown.map((position, at): StockPosition => ({
    resultKey: cursorOf(position.key),
    productKey: position.key.productKey,
    product: productOf(position, products),
    brandId: position.brandId,
    siteId: position.key.siteId,
    storeId: position.storeId,
    businessUnitId: position.key.businessUnitId,
    locationId: position.key.locationId,
    legalEntityId: position.key.legalEntityId,
    ...quantities(position),
    heldByKind: position.heldByKind.map((each) => ({ ...each })),
    frozen: position.frozen,
    cost: costOf(position, at),
  }));
  const search: StockSearch = {
    asOf: read.asOf,
    positions,
    elsewhere: elsewhere.map((each): StockElsewhere => ({
      productKey: each.productKey,
      siteId: each.siteId,
      storeId: each.storeId,
      businessUnitId: each.businessUnitId,
      legalEntityId: each.legalEntityId,
      ...quantities(each),
    })),
    productsCapped: found?.capped ?? false,
    names: {
      sites: named.sites.map((each) => ({ id: each.id, code: each.code, name: each.name })),
      businessUnits: named.businessUnits.map((each) => ({ id: each.id, code: each.code, name: each.name })),
      locations: named.locations.map((each) => ({ id: each.id, code: each.code, name: each.name, kind: each.kind })),
      brands: facts.brands.flatMap((each) =>
        each.name === null ? [] : [{ id: each.brandId, code: each.code, name: each.name }],
      ),
    },
    next: read.answer.next === null ? null : cursorOf(read.answer.next),
  };
  return {
    search,
    shown: shownRows.map(({ facts, views }, at) => ({ facts, views, costAssignmentId: costShown[at] })),
  };
}
