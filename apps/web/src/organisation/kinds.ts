import { masterActionType, masterKinds, masterRecordType, masterRoutes, type MasterKind } from '@apparel-os/schemas';
import type { MessageId } from '../messages/catalogue';

// The masters of the organisation structure as the Setup screens show them (structure-and-masters 3.1, 3.6, 8;
// ui-blueprint Setup › Organisation structure and Geography and groupings; S1-F02-T01): each kind's routes, record
// type and fields. A field fixed at creation is shown in the new record's form only (3.1).

export const kinds = masterKinds;
export type Kind = MasterKind;

/** Each kind's routes: its paged list, its one-record read, a new record and a new version. */
export const kindRoutes = masterRoutes;

export const recordTypeOf = masterRecordType;

/** The kind of an approval request's action type, `organisation.<kind>.change`, or undefined. */
export function kindOfActionType(actionType: string): Kind | undefined {
  return kinds.find((kind) => masterActionType(kind) === actionType);
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
};

/** Only the records whose fixed field holds a value, such as the classification values of a Site kind. */
export interface RecordFilter {
  readonly field: string;
  readonly equals: string;
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
  | { readonly kind: 'text'; readonly mono?: true }
  | { readonly kind: 'date'; readonly optional?: true }
  | { readonly kind: 'select'; readonly options: readonly Option[] }
  | { readonly kind: 'reference'; readonly target: Kind; readonly optional?: true }
  | { readonly kind: 'lines' }
  | { readonly kind: 'references'; readonly target: Kind; readonly where?: RecordFilter }
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
 * Stores (structure-and-masters 3.1, 8; PRD-ORG-008; S1-F02-T04). None is set in the app.
 */
const classifications = (place: 'site' | 'store'): FieldSpec => ({
  name: 'classificationValueIds',
  label: 'organisation.field.classificationValueIds',
  kind: 'references',
  target: 'classification_value',
  where: { field: 'appliesTo', equals: place },
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
