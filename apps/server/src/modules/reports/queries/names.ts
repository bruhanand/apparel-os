import type { ReportNames } from '@apparel-os/schemas';
import type { ReadModelGateway, TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import { CATALOGUE_PRODUCT_FACTS, CATALOGUE_VALUE_NAMES } from '../../merchandise/catalogue/index.js';
import { PARTY_NAMES } from '../../merchandise/parties/index.js';
import { ORGANISATION_PLACES } from '../../organisation/index.js';
import { RECEIVING_GRN_NAMES, type SourceRecord } from '../../receiving/index.js';

// The names of what a report shows (goods-in 9.1, 9.5; S2-F11-T02), each read through the read-model gateway as in
// force on the business date: places and legal entities from `organisation`, brands and seasons from `merchandise` ·
// catalogue, suppliers from `merchandise` · parties, GRNs by their numbers and Arrivals from `receiving`; people by
// their names from `access`, as every screen names who did what. A record not answered is Unknown to the reader
// (PRD-MOD-015): the screen and the export say so, never an identifier for a name.

export interface NamesWanted {
  readonly siteIds?: readonly string[];
  readonly businessUnitIds?: readonly string[];
  readonly locationIds?: readonly string[];
  readonly legalEntityIds?: readonly string[];
  readonly brandIds?: readonly string[];
  readonly supplierIds?: readonly string[];
  readonly seasonIds?: readonly string[];
  readonly userIds?: readonly string[];
  readonly grnIds?: readonly string[];
  /** The sources a stock row's receipt origins name, answered by their GRN. */
  readonly sources?: readonly SourceRecord[];
}

export interface NamesRead {
  readonly names: ReportNames;
  /** Each source answered by its GRN. */
  readonly sourceGrns: readonly (SourceRecord & { readonly grnId: string })[];
}

const distinct = (values: readonly string[] | undefined): string[] => [...new Set(values ?? [])];

export async function namesOf(
  gateway: ReadModelGateway,
  access: Pick<AccessInterface, 'partyNames'>,
  context: TransactionContext,
  wanted: NamesWanted,
  date: string,
): Promise<NamesRead> {
  const places = (
    await gateway.read(context, ORGANISATION_PLACES, {
      siteIds: distinct(wanted.siteIds),
      businessUnitIds: distinct(wanted.businessUnitIds),
      locationIds: distinct(wanted.locationIds),
      legalEntityIds: distinct(wanted.legalEntityIds),
      date,
    })
  ).answer;
  const brands = distinct(wanted.brandIds);
  const facts =
    brands.length === 0
      ? { brands: [] }
      : (await gateway.read(context, CATALOGUE_PRODUCT_FACTS, { skuIds: [], brandIds: brands, date })).answer;
  const suppliers = (await gateway.read(context, PARTY_NAMES, { partyIds: distinct(wanted.supplierIds), date })).answer;
  const seasons = (await gateway.read(context, CATALOGUE_VALUE_NAMES, { valueIds: distinct(wanted.seasonIds), date }))
    .answer;
  const grns = (
    await gateway.read(context, RECEIVING_GRN_NAMES, {
      grnIds: distinct(wanted.grnIds),
      sources: wanted.sources ?? [],
    })
  ).answer;
  const userIds = distinct(wanted.userIds);
  const people =
    userIds.length === 0 ? new Map<string, string>() : (await access.partyNames(context, userIds, [])).users;
  const named = (list: readonly { readonly id: string; readonly code: string; readonly name: string }[]) =>
    list.map((each) => ({ id: each.id, code: each.code, name: each.name }));
  return {
    names: {
      sites: named(places.sites),
      businessUnits: named(places.businessUnits),
      locations: named(places.locations),
      legalEntities: named(places.legalEntities),
      brands: facts.brands.flatMap((each) =>
        each.name === null ? [] : [{ id: each.brandId, code: each.code, name: each.name }],
      ),
      suppliers: named(suppliers),
      seasons: named(seasons),
      people: [...people].map(([userId, name]) => ({ userId, name })),
      grns: grns.grns.map((each) => ({
        grnId: each.grnId,
        number: each.number,
        arrivalId: each.arrivalId,
        siteId: each.siteId,
      })),
    },
    sourceGrns: grns.sources,
  };
}
