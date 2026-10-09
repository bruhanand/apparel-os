import type { MsmeClassification, PartyRole } from '@apparel-os/schemas';
import { boolean, customType, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of the parties part's tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0046) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the unit's index.ts (code-house-rules 2).

const merchandise = pgSchema('merchandise');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** A half-open range of business dates, `[start, end)`, read and written as PostgreSQL's text form (7.3). */
const daterange = customType<{ data: string; driverData: string }>({ dataType: () => 'daterange' });

/** A version's decision (code-house-rules 7.3; structure-and-masters 2.3). */
export type Decision = 'Awaiting approval' | 'Approved' | 'Rejected';

const versionColumns = () => ({
  id: uuid('id').primaryKey(),
  validDuring: daterange('valid_during').notNull(),
  decision: text('decision').$type<Decision>().notNull(),
  preparedByUserId: uuid('prepared_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const party = merchandise.table('party', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const partyVersion = merchandise.table('party_version', {
  ...versionColumns(),
  partyId: uuid('party_id').notNull(),
  legalName: text('legal_name').notNull(),
  msmeClassification: text('msme_classification').$type<MsmeClassification>(),
});
export const partyTaxIdentity = merchandise.table('party_tax_identity', {
  id: uuid('id').primaryKey(),
  partyVersionId: uuid('party_version_id').notNull(),
  kind: text('kind').notNull(),
  number: text('number').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const partyContact = merchandise.table('party_contact', {
  id: uuid('id').primaryKey(),
  partyVersionId: uuid('party_version_id').notNull(),
  position: integer('position').notNull(),
  contact: text('contact').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const partyRole = merchandise.table('party_role', {
  ...versionColumns(),
  partyId: uuid('party_id').notNull(),
  role: text('role').$type<PartyRole>().notNull(),
  held: boolean('held').notNull(),
});
export const partyBankDetails = merchandise.table('party_bank_details', {
  ...versionColumns(),
  partyId: uuid('party_id').notNull(),
  sealed: text('sealed').notNull(),
  scheme: text('scheme').notNull(),
});
export const brandSupplierLink = merchandise.table('brand_supplier_link', {
  id: uuid('id').primaryKey(),
  brandId: uuid('brand_id').notNull(),
  partyId: uuid('party_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const brandSupplierLinkVersion = merchandise.table('brand_supplier_link_version', {
  ...versionColumns(),
  linkId: uuid('link_id').notNull(),
  linked: boolean('linked').notNull(),
});
export const agreement = merchandise.table('agreement', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  brandId: uuid('brand_id'),
  partyId: uuid('party_id'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const agreementVersion = merchandise.table('agreement_version', {
  ...versionColumns(),
  agreementId: uuid('agreement_id').notNull(),
  terms: jsonb('terms').notNull(),
  termsFormat: text('terms_format').notNull(),
  margins: text('margins'),
  signedAgreementAttachmentIds: uuid('signed_agreement_attachment_ids').array().notNull(),
});
