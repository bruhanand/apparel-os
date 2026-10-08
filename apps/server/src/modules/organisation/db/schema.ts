import { customType, date, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  decision: text('decision').notNull(),
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
  physicalKind: text('physical_kind').notNull(),
  areaId: uuid('area_id').notNull(),
  addresses: text('addresses').array().notNull(),
  openingDate: date('opening_date', { mode: 'string' }),
  closingDate: date('closing_date', { mode: 'string' }),
  status: text('status').notNull(),
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
  format: text('format').notNull(),
  operatingModel: text('operating_model').notNull(),
  siteId: uuid('site_id').notNull(),
  openingDate: date('opening_date', { mode: 'string' }),
  closingDate: date('closing_date', { mode: 'string' }),
  status: text('status').notNull(),
});
export const storeAlias = organisation.table('store_alias', {
  id: uuid('id').primaryKey(),
  storeVersionId: uuid('store_version_id').notNull(),
  alias: text('alias').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const grouping = organisation.table('grouping', { ...identityColumns(), kind: text('kind').notNull() });
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
