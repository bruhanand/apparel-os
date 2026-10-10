import type { SettingOrigin } from '@apparel-os/schemas';
import { bigint, boolean, customType, numeric, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of the tax rules part's tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0052) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the unit's index.ts (code-house-rules 2).

const finance = pgSchema('finance');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** A half-open range of business dates, `[start, end)`, read and written as PostgreSQL's text form (7.3). */
const daterange = customType<{ data: string; driverData: string }>({ dataType: () => 'daterange' });

/** A version's decision (code-house-rules 7.3; structure-and-masters 2.3). */
export type Decision = 'Awaiting approval' | 'Approved' | 'Rejected';

const versionColumns = () => ({
  id: uuid('id').primaryKey(),
  origin: text('origin').$type<SettingOrigin>().notNull(),
  validDuring: daterange('valid_during').notNull(),
  decision: text('decision').$type<Decision>().notNull(),
  preparedByUserId: uuid('prepared_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const goodsClassification = finance.table('goods_classification', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const goodsClassificationVersion = finance.table('goods_classification_version', {
  ...versionColumns(),
  goodsClassificationId: uuid('goods_classification_id').notNull(),
  retired: boolean('retired').notNull(),
});

export const taxRateRule = finance.table('tax_rate_rule', {
  id: uuid('id').primaryKey(),
  goodsClassificationId: uuid('goods_classification_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const taxRateRuleVersion = finance.table('tax_rate_rule_version', {
  ...versionColumns(),
  taxRateRuleId: uuid('tax_rate_rule_id').notNull(),
  ruleKind: text('rule_kind').$type<'single-rate' | 'slabs'>().notNull(),
  rate: numeric('rate'),
  comparedPer: text('compared_per').$type<'unit' | 'line'>(),
  comparedDiscounts: text('compared_discounts').$type<'before' | 'after'>(),
  comparedTax: text('compared_tax').$type<'excluded' | 'included'>(),
});
export const taxRateSlab = finance.table('tax_rate_slab', {
  id: uuid('id').primaryKey(),
  taxRateRuleVersionId: uuid('tax_rate_rule_version_id').notNull(),
  lowerBoundPaise: bigint('lower_bound_paise', { mode: 'number' }).notNull(),
  boundIn: text('bound_in').$type<'this-slab' | 'slab-below'>().notNull(),
  rate: numeric('rate').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const registrationTaxApplicability = finance.table('registration_tax_applicability', {
  id: uuid('id').primaryKey(),
  taxRegistrationId: uuid('tax_registration_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const registrationTaxApplicabilityVersion = finance.table('registration_tax_applicability_version', {
  ...versionColumns(),
  registrationTaxApplicabilityId: uuid('registration_tax_applicability_id').notNull(),
  chargesTax: boolean('charges_tax').notNull(),
});
export const registrationTaxComponent = finance.table('registration_tax_component', {
  id: uuid('id').primaryKey(),
  registrationTaxApplicabilityVersionId: uuid('registration_tax_applicability_version_id').notNull(),
  component: text('component').notNull(),
  share: numeric('share').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const priceBasis = finance.table('price_basis', {
  id: uuid('id').primaryKey(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const priceBasisVersion = finance.table('price_basis_version', {
  ...versionColumns(),
  priceBasisId: uuid('price_basis_id').notNull(),
  pricesIncludeTax: boolean('prices_include_tax').notNull(),
});

export const roundingRule = finance.table('rounding_rule', {
  id: uuid('id').primaryKey(),
  kind: text('kind').$type<'discount' | 'tax' | 'bill'>().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const roundingRuleVersion = finance.table('rounding_rule_version', {
  ...versionColumns(),
  roundingRuleId: uuid('rounding_rule_id').notNull(),
  kind: text('kind').$type<'discount' | 'tax' | 'bill'>().notNull(),
  unitPaise: bigint('unit_paise', { mode: 'number' }).notNull(),
  mode: text('mode').$type<'half-up' | 'half-to-even' | 'up' | 'down'>().notNull(),
  level: text('level').$type<'line' | 'bill'>(),
});
