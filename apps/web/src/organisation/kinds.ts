import {
  BRAND_COVERAGE_CHANGE,
  catalogueKinds,
  catalogueRecordType,
  catalogueRoutes,
  masterActionType,
  masterKinds,
  masterRecordType,
  masterRoutes,
  type CatalogueKind,
  type MasterKind,
} from '@apparel-os/schemas';
import type { MessageId } from '../messages/catalogue';

// The masters of the organisation structure as the Setup screens show them (structure-and-masters 3.1, 3.6, 8;
// ui-blueprint Setup › Organisation structure and Geography and groupings; S1-F02-T01): each kind's routes, record
// type and fields. A field fixed at creation is shown in the new record's form only (3.1).

// The merchandise catalogue's masters join them with S1-F03-T01 (structure-and-masters 4.1, 8): the same tab, form and
// version history serve both.

export const kinds = [...masterKinds, ...catalogueKinds] as const;
export type Kind = MasterKind | CatalogueKind;

const isCatalogue = (kind: Kind): kind is CatalogueKind => (catalogueKinds as readonly string[]).includes(kind);

/** Each kind's routes: its paged list, its one-record read, a new record and a new version. */
export const kindRoutes: Readonly<
  Record<
    Kind,
    { readonly list: string; readonly read: string; readonly prepare: string | null; readonly version: string }
  >
> &
  typeof masterRoutes &
  typeof catalogueRoutes = { ...masterRoutes, ...catalogueRoutes };

export function recordTypeOf(kind: Kind): string {
  return isCatalogue(kind) ? catalogueRecordType(kind) : masterRecordType(kind);
}

/**
 * The catalogue kinds whose versions take effect when recorded, as no rule names an approval for them
 * (structure-and-masters 2.3; S1-F03-T01): their forms say Save and Recorded, not Request approval.
 */
export function takesEffectWhenRecorded(kind: Kind): boolean {
  return isCatalogue(kind) && kind !== 'business_unit_brand';
}

/** The kind of an approval request's action type, `organisation.<kind>.change` or brand coverage, or undefined. */
export function kindOfActionType(actionType: string): Kind | undefined {
  if (actionType === BRAND_COVERAGE_CHANGE) return 'business_unit_brand';
  return masterKinds.find((kind) => masterActionType(kind) === actionType);
}

/**
 * The words each kind's screens use, each a catalogue entry (code-house-rules 12.13). A unit's mapping and a Store's
 * default warehouse have no record of their own to add: only versions (structure-and-masters 3.4, 3.6).
 */
export const kindText: Readonly<Record<Kind, { readonly add: MessageId | null; readonly what: MessageId }>> = {
  country: { add: 'organisation.new.country', what: 'organisation.what.country' },
  state: { add: 'organisation.new.state', what: 'organisation.what.state' },
  city: { add: 'organisation.new.city', what: 'organisation.what.city' },
  area: { add: 'organisation.new.area', what: 'organisation.what.area' },
  legal_entity: { add: 'organisation.new.legal_entity', what: 'organisation.what.legal_entity' },
  tax_registration: { add: 'organisation.new.tax_registration', what: 'organisation.what.tax_registration' },
  accounting_book: { add: 'organisation.new.accounting_book', what: 'organisation.what.accounting_book' },
  site: { add: 'organisation.new.site', what: 'organisation.what.site' },
  store: { add: 'organisation.new.store', what: 'organisation.what.store' },
  grouping: { add: 'organisation.new.grouping', what: 'organisation.what.grouping' },
  business_unit: { add: 'organisation.new.business_unit', what: 'organisation.what.business_unit' },
  business_unit_mapping: { add: null, what: 'organisation.what.business_unit_mapping' },
  location: { add: 'organisation.new.location', what: 'organisation.what.location' },
  store_default_warehouse: { add: null, what: 'organisation.what.store_default_warehouse' },
  grouping_kind: { add: 'organisation.new.grouping_kind', what: 'organisation.what.grouping_kind' },
  classification_kind: { add: 'organisation.new.classification_kind', what: 'organisation.what.classification_kind' },
  classification_value: {
    add: 'organisation.new.classification_value',
    what: 'organisation.what.classification_value',
  },
  // The catalogue (structure-and-masters 4.1, 4.2). A unit's coverage and a vocabulary value have no record to add here:
  // coverage is the unit's (3.3), and a value is made by confirming its proposal (4.2).
  brand: { add: 'merchandise.new.brand', what: 'merchandise.what.brand' },
  business_unit_brand: { add: null, what: 'merchandise.what.business_unit_brand' },
  category: { add: 'merchandise.new.category', what: 'merchandise.what.category' },
  size_set: { add: 'merchandise.new.size_set', what: 'merchandise.what.size_set' },
  attribute: { add: 'merchandise.new.attribute', what: 'merchandise.what.attribute' },
  vocabulary_value: { add: null, what: 'merchandise.what.vocabulary_value' },
  // S1-F03-T02. A category's profile link is the category's (4.6); a style and a SKU are made by confirming a product
  // proposal (4.2), so none has a record to add here.
  tracking_profile: { add: 'merchandise.new.tracking_profile', what: 'merchandise.what.tracking_profile' },
  category_tracking_profile: { add: null, what: 'merchandise.what.category_tracking_profile' },
  style: { add: null, what: 'merchandise.what.style' },
  sku: { add: null, what: 'merchandise.what.sku' },
  pack: { add: 'merchandise.new.pack', what: 'merchandise.what.pack' },
};

/** Only the records whose fixed field holds a value, such as the classification values of a Site kind. */
export interface RecordFilter {
  readonly field: string;
  readonly equals: string;
}

/**
 * A references field holding at most one target for each record of `kind`, such as one classification value of each
 * classification kind: the target's `field` names its record of that kind (structure-and-masters 3.1).
 */
export interface OnePer {
  readonly kind: Kind;
  readonly field: string;
}

export interface Option {
  readonly value: string;
  readonly label: MessageId;
}

/**
 * One field of a master's form and of its version history. `fixed`: set when the record is created, shown with the
 * record. `withFirst`: given with a record's first version only, as a unit's first mapping is (3.4), and shown in its
 * own place, not with the versions. `laterOnly`: a later version's field only, as retiring a location (3.5).
 */
export type FieldSpec = {
  readonly name: string;
  readonly label: MessageId;
  readonly fixed?: true;
  readonly withFirst?: true;
  readonly laterOnly?: true;
} & (
  | { readonly kind: 'text'; readonly mono?: true; readonly optional?: true }
  /** A whole number, such as a shelf life in days; empty is Unknown where optional (S1-F03-T02). */
  | { readonly kind: 'whole'; readonly optional?: true }
  /**
   * Attribute values, each a vocabulary value or text, or Unknown (structure-and-masters 4.2; S1-F03-T02): shown in
   * words; a new version keeps those of the version it starts from, as the screen does not edit them yet.
   */
  | { readonly kind: 'attribute-values' }
  /** A mixed pack's contents, SKU by SKU, each with its quantity (4.4; POL-04.03; S1-F03-T02). */
  | { readonly kind: 'contents' }
  | { readonly kind: 'date'; readonly optional?: true }
  | { readonly kind: 'select'; readonly options: readonly Option[] }
  | { readonly kind: 'reference'; readonly target: Kind; readonly optional?: true }
  | { readonly kind: 'lines' }
  | {
      readonly kind: 'references';
      readonly target: Kind;
      readonly where?: RecordFilter;
      /** At most one of the targets for each record of another kind, chosen from one list each (OnePer). */
      readonly onePer?: OnePer;
    }
  | { readonly kind: 'yes-no' }
);

const code: FieldSpec = { name: 'code', label: 'organisation.field.code', kind: 'text', mono: true, fixed: true };
const name: FieldSpec = { name: 'name', label: 'organisation.field.name', kind: 'text' };
const openingDate: FieldSpec = {
  name: 'openingDate',
  label: 'organisation.field.openingDate',
  kind: 'date',
  optional: true,
};
const closingDate: FieldSpec = {
  name: 'closingDate',
  label: 'organisation.field.closingDate',
  kind: 'date',
  optional: true,
};
const aliases: FieldSpec = { name: 'aliases', label: 'organisation.field.aliases', kind: 'lines' };
/**
 * The Organisation's own classifications a Site or Store version carries: the values of its kinds for Sites, or for
 * Stores, at most one of each kind, chosen from one list for each kind (structure-and-masters 3.1, 8; PRD-ORG-008;
 * S1-F02-T04; product owner, 9 Oct 2026). None is set in the app.
 */
const classifications = (place: 'site' | 'store'): FieldSpec => ({
  name: 'classificationValueIds',
  label: 'organisation.field.classificationValueIds',
  kind: 'references',
  target: 'classification_value',
  where: { field: 'appliesTo', equals: place },
  onePer: { kind: 'classification_kind', field: 'classificationKindId' },
});

export const fields: Readonly<Record<Kind, readonly FieldSpec[]>> = {
  country: [code, name],
  state: [
    { name: 'countryId', label: 'organisation.field.countryId', kind: 'reference', target: 'country', fixed: true },
    code,
    name,
  ],
  city: [
    { name: 'stateId', label: 'organisation.field.stateId', kind: 'reference', target: 'state', fixed: true },
    code,
    name,
  ],
  area: [
    { name: 'cityId', label: 'organisation.field.cityId', kind: 'reference', target: 'city', fixed: true },
    code,
    name,
  ],
  legal_entity: [code, { name: 'legalName', label: 'organisation.field.legalName', kind: 'text' }],
  tax_registration: [
    code,
    {
      name: 'legalEntityId',
      label: 'organisation.field.legalEntityId',
      kind: 'reference',
      target: 'legal_entity',
      fixed: true,
    },
    { name: 'registrationNumber', label: 'organisation.field.registrationNumber', kind: 'text', mono: true },
    { name: 'stateId', label: 'organisation.field.registrationState', kind: 'reference', target: 'state' },
    { name: 'validityFrom', label: 'organisation.field.validityFrom', kind: 'date' },
    { name: 'validityTo', label: 'organisation.field.validityTo', kind: 'date', optional: true },
  ],
  accounting_book: [
    code,
    {
      name: 'legalEntityId',
      label: 'organisation.field.legalEntityId',
      kind: 'reference',
      target: 'legal_entity',
      fixed: true,
    },
    name,
  ],
  site: [
    code,
    name,
    {
      name: 'physicalKind',
      label: 'organisation.field.physicalKind',
      kind: 'select',
      options: [
        { value: 'head-office', label: 'physical-kind.head-office' },
        { value: 'regional-office', label: 'physical-kind.regional-office' },
        { value: 'central-warehouse', label: 'physical-kind.central-warehouse' },
        { value: 'regional-warehouse', label: 'physical-kind.regional-warehouse' },
        { value: 'retail-site', label: 'physical-kind.retail-site' },
      ],
    },
    { name: 'areaId', label: 'organisation.field.areaId', kind: 'reference', target: 'area' },
    { name: 'addresses', label: 'organisation.field.addresses', kind: 'lines' },
    aliases,
    classifications('site'),
    openingDate,
    closingDate,
  ],
  store: [
    code,
    name,
    {
      name: 'format',
      label: 'organisation.field.format',
      kind: 'select',
      options: [
        { value: 'mbo', label: 'store-format.mbo' },
        { value: 'ebo', label: 'store-format.ebo' },
        { value: 'shop-in-shop', label: 'store-format.shop-in-shop' },
        { value: 'kiosk', label: 'store-format.kiosk' },
      ],
    },
    {
      name: 'operatingModel',
      label: 'organisation.field.operatingModel',
      kind: 'select',
      options: [
        { value: 'company-owned', label: 'operating-model.company-owned' },
        { value: 'franchise-owned', label: 'operating-model.franchise-owned' },
        { value: 'franchise-owned-company-operated', label: 'operating-model.franchise-owned-company-operated' },
      ],
    },
    { name: 'siteId', label: 'organisation.field.siteId', kind: 'reference', target: 'site' },
    aliases,
    classifications('store'),
    openingDate,
    closingDate,
  ],
  grouping: [
    code,
    // One of the Organisation's own grouping kinds (3.6; RR-440).
    {
      name: 'groupingKindId',
      label: 'organisation.field.groupingKindId',
      kind: 'reference',
      target: 'grouping_kind',
      fixed: true,
    },
    name,
    { name: 'storeIds', label: 'organisation.field.storeIds', kind: 'references', target: 'store' },
  ],
  business_unit: [
    code,
    { name: 'siteId', label: 'organisation.field.siteId', kind: 'reference', target: 'site', fixed: true },
    {
      name: 'kind',
      label: 'organisation.field.unitKind',
      kind: 'select',
      options: [
        { value: 'whole-store', label: 'unit-kind.whole-store' },
        { value: 'brand-counter', label: 'unit-kind.brand-counter' },
        { value: 'warehouse', label: 'unit-kind.warehouse' },
        { value: 'office', label: 'unit-kind.office' },
      ],
      fixed: true,
    },
    {
      name: 'storeId',
      label: 'organisation.field.storeId',
      kind: 'reference',
      target: 'store',
      optional: true,
      fixed: true,
    },
    name,
    ...mappingFields(true),
  ],
  business_unit_mapping: mappingFields(false),
  location: [
    code,
    { name: 'siteId', label: 'organisation.field.siteId', kind: 'reference', target: 'site', fixed: true },
    {
      name: 'businessUnitId',
      label: 'organisation.field.businessUnitId',
      kind: 'reference',
      target: 'business_unit',
      fixed: true,
    },
    name,
    {
      name: 'kind',
      label: 'organisation.field.locationKind',
      kind: 'select',
      options: [
        { value: 'floor', label: 'location-kind.floor' },
        { value: 'backstore', label: 'location-kind.backstore' },
        { value: 'zone', label: 'location-kind.zone' },
        { value: 'rack', label: 'location-kind.rack' },
        { value: 'bin', label: 'location-kind.bin' },
        { value: 'fixture', label: 'location-kind.fixture' },
        { value: 'display', label: 'location-kind.display' },
        { value: 'alteration', label: 'location-kind.alteration' },
      ],
    },
    {
      name: 'parentLocationId',
      label: 'organisation.field.parentLocationId',
      kind: 'reference',
      target: 'location',
      optional: true,
    },
    { name: 'retired', label: 'organisation.field.retired', kind: 'yes-no', laterOnly: true },
  ],
  store_default_warehouse: [
    {
      name: 'warehouseUnitId',
      label: 'organisation.field.warehouseUnitId',
      kind: 'reference',
      target: 'business_unit',
    },
  ],
  grouping_kind: [code, name],
  classification_kind: [
    code,
    {
      name: 'appliesTo',
      label: 'organisation.field.appliesTo',
      kind: 'select',
      options: [
        { value: 'site', label: 'classifies.site' },
        { value: 'store', label: 'classifies.store' },
      ],
      fixed: true,
    },
    name,
  ],
  classification_value: [
    {
      name: 'classificationKindId',
      label: 'organisation.field.classificationKindId',
      kind: 'reference',
      target: 'classification_kind',
      fixed: true,
    },
    code,
    name,
  ],
  // The merchandise catalogue (structure-and-masters 4.1, 4.2; S1-F03-T01). No value is set in the app.
  brand: [
    code,
    name,
    {
      name: 'parentBrandId',
      label: 'merchandise.field.parentBrandId',
      kind: 'reference',
      target: 'brand',
      optional: true,
    },
    { name: 'aliases', label: 'organisation.field.aliases', kind: 'lines' },
    { name: 'retired', label: 'merchandise.field.retired', kind: 'yes-no', laterOnly: true },
  ],
  business_unit_brand: [{ name: 'brandIds', label: 'merchandise.field.brandIds', kind: 'references', target: 'brand' }],
  category: [
    code,
    name,
    {
      name: 'parentCategoryId',
      label: 'merchandise.field.parentCategoryId',
      kind: 'reference',
      target: 'category',
      optional: true,
    },
    { name: 'sizeSetId', label: 'merchandise.field.sizeSetId', kind: 'reference', target: 'size_set', optional: true },
    {
      name: 'identityAttributeIds',
      label: 'merchandise.field.identityAttributeIds',
      kind: 'references',
      target: 'attribute',
    },
  ],
  size_set: [
    code,
    { name: 'categoryId', label: 'merchandise.field.categoryId', kind: 'reference', target: 'category', fixed: true },
    name,
    { name: 'sizes', label: 'merchandise.field.sizes', kind: 'lines' },
  ],
  attribute: [
    code,
    {
      name: 'valueKind',
      label: 'merchandise.field.valueKind',
      kind: 'select',
      options: [
        { value: 'list', label: 'merchandise.value-kind.list' },
        { value: 'text', label: 'merchandise.value-kind.text' },
      ],
      fixed: true,
    },
    name,
  ],
  vocabulary_value: [
    {
      name: 'attributeId',
      label: 'merchandise.field.attributeId',
      kind: 'reference',
      target: 'attribute',
      fixed: true,
    },
    code,
    name,
  ],
  // Tracking profiles, a category's profile, styles, SKUs and packs (structure-and-masters 4.1, 4.4 to 4.6;
  // S1-F03-T02). No profile, unit or value is set in the app; an empty shelf life is Unknown (POL-04.05).
  tracking_profile: [
    code,
    name,
    { name: 'pieceTracked', label: 'merchandise.field.pieceTracked', kind: 'yes-no' },
    { name: 'batchExpiryRequired', label: 'merchandise.field.batchExpiryRequired', kind: 'yes-no' },
    { name: 'requiredIdentifiers', label: 'merchandise.field.requiredIdentifiers', kind: 'lines' },
    {
      name: 'receivingShelfLifeDays',
      label: 'merchandise.field.receivingShelfLifeDays',
      kind: 'whole',
      optional: true,
    },
    { name: 'sellingShelfLifeDays', label: 'merchandise.field.sellingShelfLifeDays', kind: 'whole', optional: true },
  ],
  category_tracking_profile: [
    {
      name: 'trackingProfileId',
      label: 'merchandise.field.trackingProfileId',
      kind: 'reference',
      target: 'tracking_profile',
    },
  ],
  style: [
    code,
    { name: 'brandId', label: 'merchandise.field.brandId', kind: 'reference', target: 'brand', fixed: true },
    { name: 'categoryId', label: 'merchandise.field.categoryId', kind: 'reference', target: 'category', fixed: true },
    { name: 'brandArticleNumber', label: 'merchandise.field.brandArticleNumber', kind: 'text', optional: true },
    { name: 'launchDate', label: 'merchandise.field.launchDate', kind: 'date', optional: true },
    { name: 'hsn', label: 'merchandise.field.hsn', kind: 'text', mono: true, optional: true },
    { name: 'attributes', label: 'merchandise.field.attributes', kind: 'attribute-values' },
  ],
  sku: [
    code,
    { name: 'styleId', label: 'merchandise.field.styleId', kind: 'reference', target: 'style', fixed: true },
    { name: 'size', label: 'merchandise.field.size', kind: 'text', fixed: true },
    { name: 'identity', label: 'merchandise.field.identity', kind: 'attribute-values', fixed: true },
    {
      name: 'stockUnit',
      label: 'merchandise.field.stockUnit',
      kind: 'select',
      options: [
        { value: 'piece', label: 'merchandise.stock-unit.piece' },
        { value: 'pair', label: 'merchandise.stock-unit.pair' },
        { value: 'pack', label: 'merchandise.stock-unit.pack' },
      ],
    },
    {
      name: 'purpose',
      label: 'merchandise.field.purpose',
      kind: 'select',
      options: [
        { value: 'merchandise', label: 'merchandise.purpose.merchandise' },
        { value: 'gift-with-purchase', label: 'merchandise.purpose.gift-with-purchase' },
        { value: 'promotional', label: 'merchandise.purpose.promotional' },
        { value: 'packaging', label: 'merchandise.purpose.packaging' },
      ],
    },
  ],
  pack: [
    code,
    { name: 'skuId', label: 'merchandise.field.skuId', kind: 'reference', target: 'sku', fixed: true },
    { name: 'units', label: 'merchandise.field.units', kind: 'whole', optional: true },
    { name: 'mixed', label: 'merchandise.field.mixed', kind: 'yes-no' },
    { name: 'contents', label: 'merchandise.field.contents', kind: 'contents' },
    { name: 'forPurchasing', label: 'merchandise.field.forPurchasing', kind: 'yes-no' },
    { name: 'forSelling', label: 'merchandise.field.forSelling', kind: 'yes-no' },
  ],
};

/**
 * A unit's mapping: its legal entity, tax registration and book together (structure-and-masters 3.4, 8). On a unit,
 * given with its first version only.
 */
function mappingFields(withFirst: boolean): FieldSpec[] {
  const flag = withFirst ? ({ withFirst: true } as const) : {};
  return [
    {
      name: 'legalEntityId',
      label: 'organisation.field.legalEntityId',
      kind: 'reference',
      target: 'legal_entity',
      ...flag,
    },
    {
      name: 'taxRegistrationId',
      label: 'organisation.field.taxRegistrationId',
      kind: 'reference',
      target: 'tax_registration',
      ...flag,
    },
    {
      name: 'accountingBookId',
      label: 'organisation.field.accountingBookId',
      kind: 'reference',
      target: 'accounting_book',
      ...flag,
    },
  ];
}

/**
 * The field that names a version: its name, legal name or registration number; none for a mapping or a default
 * warehouse, whose record is named by its unit's or Store's code.
 */
export function labelField(kind: Kind): string {
  if (kind === 'legal_entity') return 'legalName';
  if (kind === 'tax_registration') return 'registrationNumber';
  if (kind === 'business_unit_mapping') return 'legalEntityId';
  if (kind === 'store_default_warehouse') return 'warehouseUnitId';
  if (kind === 'business_unit_brand') return 'brandIds';
  // S1-F03-T02: a style, SKU, pack or category profile has no name of its own.
  if (kind === 'category_tracking_profile') return 'trackingProfileId';
  if (kind === 'style') return 'brandArticleNumber';
  if (kind === 'sku') return 'stockUnit';
  if (kind === 'pack') return 'units';
  return 'name';
}

/** The kinds whose versions carry a status of the place's lifecycle (structure-and-masters 3.7). */
export const PLACE_KINDS: readonly Kind[] = ['site', 'store', 'business_unit'];

/** The reads a change makes stale: every master's list and record, the master lists and My work. */
export const ORGANISATION_READS = [
  ...kinds.flatMap((kind) => [kindRoutes[kind].list, kindRoutes[kind].read]),
  'readMasterLists',
  'listMyWork',
] as const;
