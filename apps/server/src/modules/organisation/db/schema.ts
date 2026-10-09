import type {
  BusinessUnitKind,
  Classifies,
  LocationKind,
  OperatingModel,
  PhysicalKind,
  PlaceStatus,
  StoreFormat,
} from '@apparel-os/schemas';
import { boolean, customType, date, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { Decision } from '../domain/kinds.js';

// Drizzle definitions of the organisation module's tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0028) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the module's index.ts, so no other unit can name these tables
// (code-house-rules 2).

const organisation = pgSchema('organisation');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** A half-open range of business dates, `[start, end)`, read and written as PostgreSQL's text form (7.3). */
const daterange = customType<{ data: string; driverData: string }>({
  dataType: () => 'daterange',
});

/** The columns every version row has (structure-and-masters 2.2; code-house-rules 7.3). */
const versionColumns = () => ({
  id: uuid('id').primaryKey(),
  validDuring: daterange('valid_during').notNull(),
  decision: text('decision').$type<Decision>().notNull(),
  preparedByUserId: uuid('prepared_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

const identityColumns = () => ({
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const country = organisation.table('country', identityColumns());
export const countryVersion = organisation.table('country_version', {
  ...versionColumns(),
  countryId: uuid('country_id').notNull(),
  name: text('name').notNull(),
});

export const state = organisation.table('state', { ...identityColumns(), countryId: uuid('country_id').notNull() });
export const stateVersion = organisation.table('state_version', {
  ...versionColumns(),
  stateId: uuid('state_id').notNull(),
  name: text('name').notNull(),
});

export const city = organisation.table('city', { ...identityColumns(), stateId: uuid('state_id').notNull() });
export const cityVersion = organisation.table('city_version', {
  ...versionColumns(),
  cityId: uuid('city_id').notNull(),
  name: text('name').notNull(),
});

export const area = organisation.table('area', { ...identityColumns(), cityId: uuid('city_id').notNull() });
export const areaVersion = organisation.table('area_version', {
  ...versionColumns(),
  areaId: uuid('area_id').notNull(),
  name: text('name').notNull(),
});

export const legalEntity = organisation.table('legal_entity', identityColumns());
export const legalEntityVersion = organisation.table('legal_entity_version', {
  ...versionColumns(),
  legalEntityId: uuid('legal_entity_id').notNull(),
  legalName: text('legal_name').notNull(),
});

export const taxRegistration = organisation.table('tax_registration', {
  ...identityColumns(),
  legalEntityId: uuid('legal_entity_id').notNull(),
});
export const taxRegistrationVersion = organisation.table('tax_registration_version', {
  ...versionColumns(),
  taxRegistrationId: uuid('tax_registration_id').notNull(),
  registrationNumber: text('registration_number').notNull(),
  stateId: uuid('state_id').notNull(),
  validity: daterange('validity').notNull(),
});

export const accountingBook = organisation.table('accounting_book', {
  ...identityColumns(),
  legalEntityId: uuid('legal_entity_id').notNull(),
});
export const accountingBookVersion = organisation.table('accounting_book_version', {
  ...versionColumns(),
  accountingBookId: uuid('accounting_book_id').notNull(),
  name: text('name').notNull(),
});

export const site = organisation.table('site', identityColumns());
export const siteVersion = organisation.table('site_version', {
  ...versionColumns(),
  siteId: uuid('site_id').notNull(),
  name: text('name').notNull(),
  physicalKind: text('physical_kind').$type<PhysicalKind>().notNull(),
  areaId: uuid('area_id').notNull(),
  addresses: text('addresses').array().notNull(),
  openingDate: date('opening_date', { mode: 'string' }),
  closingDate: date('closing_date', { mode: 'string' }),
  status: text('status').$type<PlaceStatus>().notNull(),
});
export const siteAlias = organisation.table('site_alias', {
  id: uuid('id').primaryKey(),
  siteVersionId: uuid('site_version_id').notNull(),
  alias: text('alias').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const store = organisation.table('store', identityColumns());
export const storeVersion = organisation.table('store_version', {
  ...versionColumns(),
  storeId: uuid('store_id').notNull(),
  name: text('name').notNull(),
  format: text('format').$type<StoreFormat>().notNull(),
  operatingModel: text('operating_model').$type<OperatingModel>().notNull(),
  siteId: uuid('site_id').notNull(),
  openingDate: date('opening_date', { mode: 'string' }),
  closingDate: date('closing_date', { mode: 'string' }),
  status: text('status').$type<PlaceStatus>().notNull(),
});
export const storeAlias = organisation.table('store_alias', {
  id: uuid('id').primaryKey(),
  storeVersionId: uuid('store_version_id').notNull(),
  alias: text('alias').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const grouping = organisation.table('grouping', {
  ...identityColumns(),
  /** The code of its grouping kind (migration 0044; S1-F02-T04). */
  kind: text('kind').notNull(),
});
export const groupingVersion = organisation.table('grouping_version', {
  ...versionColumns(),
  groupingId: uuid('grouping_id').notNull(),
  name: text('name').notNull(),
});
export const groupingMember = organisation.table('grouping_member', {
  id: uuid('id').primaryKey(),
  groupingVersionId: uuid('grouping_version_id').notNull(),
  storeId: uuid('store_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

// Business units, mappings and their verifications, locations and default warehouses (migrations/organisation/0029;
// S1-F02-T02).

export const businessUnit = organisation.table('business_unit', {
  ...identityColumns(),
  siteId: uuid('site_id').notNull(),
  kind: text('kind').$type<BusinessUnitKind>().notNull(),
  storeId: uuid('store_id'),
});
export const businessUnitVersion = organisation.table('business_unit_version', {
  ...versionColumns(),
  businessUnitId: uuid('business_unit_id').notNull(),
  name: text('name').notNull(),
  status: text('status').$type<PlaceStatus>().notNull(),
});

export const businessUnitMapping = organisation.table('business_unit_mapping', {
  ...versionColumns(),
  businessUnitId: uuid('business_unit_id').notNull(),
  legalEntityId: uuid('legal_entity_id').notNull(),
  taxRegistrationId: uuid('tax_registration_id').notNull(),
  accountingBookId: uuid('accounting_book_id').notNull(),
  preparedWithVersionId: uuid('prepared_with_version_id'),
});

export const businessUnitMappingVerification = organisation.table('business_unit_mapping_verification', {
  id: uuid('id').primaryKey(),
  businessUnitMappingId: uuid('business_unit_mapping_id').notNull(),
  verifiedByUserId: uuid('verified_by_user_id').notNull(),
  verifiedAt: at('verified_at').notNull(),
  attachmentIds: uuid('attachment_ids').array().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const location = organisation.table('location', {
  ...identityColumns(),
  siteId: uuid('site_id').notNull(),
  businessUnitId: uuid('business_unit_id').notNull(),
});
export const locationVersion = organisation.table('location_version', {
  ...versionColumns(),
  locationId: uuid('location_id').notNull(),
  name: text('name').notNull(),
  kind: text('kind').$type<LocationKind>().notNull(),
  parentLocationId: uuid('parent_location_id'),
  retired: boolean('retired').notNull(),
});

export const storeDefaultWarehouse = organisation.table('store_default_warehouse', {
  ...versionColumns(),
  storeId: uuid('store_id').notNull(),
  warehouseUnitId: uuid('warehouse_unit_id').notNull(),
});

// The Organisation's own grouping kinds, and classification kinds and values of Sites and Stores, with the
// classifications each Site and Store version carries (migrations/organisation/0044; S1-F02-T04).

export const groupingKind = organisation.table('grouping_kind', identityColumns());
export const groupingKindVersion = organisation.table('grouping_kind_version', {
  ...versionColumns(),
  groupingKindId: uuid('grouping_kind_id').notNull(),
  name: text('name').notNull(),
});

export const classificationKind = organisation.table('classification_kind', {
  ...identityColumns(),
  appliesTo: text('applies_to').$type<Classifies>().notNull(),
});
export const classificationKindVersion = organisation.table('classification_kind_version', {
  ...versionColumns(),
  classificationKindId: uuid('classification_kind_id').notNull(),
  name: text('name').notNull(),
});

export const classificationValue = organisation.table('classification_value', {
  ...identityColumns(),
  classificationKindId: uuid('classification_kind_id').notNull(),
  appliesTo: text('applies_to').$type<Classifies>().notNull(),
});
export const classificationValueVersion = organisation.table('classification_value_version', {
  ...versionColumns(),
  classificationValueId: uuid('classification_value_id').notNull(),
  name: text('name').notNull(),
});

export const siteClassification = organisation.table('site_classification', {
  id: uuid('id').primaryKey(),
  siteVersionId: uuid('site_version_id').notNull(),
  classificationValueId: uuid('classification_value_id').notNull(),
  appliesTo: text('applies_to').$type<'site'>().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const storeClassification = organisation.table('store_classification', {
  id: uuid('id').primaryKey(),
  storeVersionId: uuid('store_version_id').notNull(),
  classificationValueId: uuid('classification_value_id').notNull(),
  appliesTo: text('applies_to').$type<'store'>().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
