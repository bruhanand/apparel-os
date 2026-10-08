import type { MessageId } from '../messages/catalogue';

// The masters of the organisation structure as the Setup screens show them (structure-and-masters 3.1, 3.6, 8;
// ui-blueprint Setup › Organisation structure and Geography and groupings; S1-F02-T01): each kind's routes, record
// type and fields. A field fixed at creation is shown in the new record's form only (3.1).

export const kinds = [
  'country',
  'state',
  'city',
  'area',
  'legal_entity',
  'tax_registration',
  'accounting_book',
  'site',
  'store',
  'grouping',
] as const;
export type Kind = (typeof kinds)[number];

export const listRead = {
  country: 'listCountries',
  state: 'listStates',
  city: 'listCities',
  area: 'listAreas',
  legal_entity: 'listLegalEntities',
  tax_registration: 'listTaxRegistrations',
  accounting_book: 'listAccountingBooks',
  site: 'listSites',
  store: 'listStores',
  grouping: 'listGroupings',
} as const satisfies Record<Kind, string>;

export const prepareCommand = {
  country: 'prepareCountry',
  state: 'prepareState',
  city: 'prepareCity',
  area: 'prepareArea',
  legal_entity: 'prepareLegalEntity',
  tax_registration: 'prepareTaxRegistration',
  accounting_book: 'prepareAccountingBook',
  site: 'prepareSite',
  store: 'prepareStore',
  grouping: 'prepareGrouping',
} as const satisfies Record<Kind, string>;

export const versionCommand = {
  country: 'prepareCountryVersion',
  state: 'prepareStateVersion',
  city: 'prepareCityVersion',
  area: 'prepareAreaVersion',
  legal_entity: 'prepareLegalEntityVersion',
  tax_registration: 'prepareTaxRegistrationVersion',
  accounting_book: 'prepareAccountingBookVersion',
  site: 'prepareSiteVersion',
  store: 'prepareStoreVersion',
  grouping: 'prepareGroupingVersion',
} as const satisfies Record<Kind, string>;

export const recordTypeOf = (kind: Kind) => `organisation.${kind}` as const;

/** The kind of an approval request's action type, `organisation.<kind>.change`, or undefined. */
export function kindOfActionType(actionType: string): Kind | undefined {
  return kinds.find((kind) => `organisation.${kind}.change` === actionType);
}

export interface Option {
  readonly value: string;
  readonly label: MessageId;
}

/** One field of a master's form and of its version history. */
export type FieldSpec = { readonly name: string; readonly label: MessageId; readonly fixed?: true } & (
  | { readonly kind: 'text'; readonly mono?: true }
  | { readonly kind: 'date'; readonly optional?: true }
  | { readonly kind: 'select'; readonly options: readonly Option[] }
  | { readonly kind: 'reference'; readonly target: Kind }
  | { readonly kind: 'lines' }
  | { readonly kind: 'references'; readonly target: Kind }
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

const options = (prefix: string, values: readonly string[]): Option[] =>
  values.map((value) => ({ value, label: `${prefix}.${value}` as MessageId }));

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
      options: options('physical-kind', [
        'head-office',
        'regional-office',
        'central-warehouse',
        'regional-warehouse',
        'retail-site',
      ]),
    },
    { name: 'areaId', label: 'organisation.field.areaId', kind: 'reference', target: 'area' },
    { name: 'addresses', label: 'organisation.field.addresses', kind: 'lines' },
    aliases,
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
      options: options('store-format', ['mbo', 'ebo', 'shop-in-shop', 'kiosk']),
    },
    {
      name: 'operatingModel',
      label: 'organisation.field.operatingModel',
      kind: 'select',
      options: options('operating-model', ['company-owned', 'franchise-owned', 'franchise-owned-company-operated']),
    },
    { name: 'siteId', label: 'organisation.field.siteId', kind: 'reference', target: 'site' },
    aliases,
    openingDate,
    closingDate,
  ],
  grouping: [
    code,
    {
      name: 'kind',
      label: 'organisation.field.groupingKind',
      kind: 'select',
      options: options('grouping-kind', ['region', 'cluster']),
      fixed: true,
    },
    name,
    { name: 'storeIds', label: 'organisation.field.storeIds', kind: 'references', target: 'store' },
  ],
};

/** The field that names a version: its name, legal name or registration number. */
export function labelField(kind: Kind): string {
  if (kind === 'legal_entity') return 'legalName';
  if (kind === 'tax_registration') return 'registrationNumber';
  return 'name';
}

/** The reads a change makes stale. */
export const ORGANISATION_READS = [
  'listCountries',
  'listStates',
  'listCities',
  'listAreas',
  'listLegalEntities',
  'listTaxRegistrations',
  'listAccountingBooks',
  'listSites',
  'listStores',
  'listGroupings',
  'readMasterLists',
  'listMyWork',
] as const;
