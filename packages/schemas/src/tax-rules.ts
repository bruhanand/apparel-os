import { z } from 'zod';
import { approvalRequestStateSchema } from './approvals.js';
import { recordStateSchema } from './access-records.js';
import { businessDateSchema, idSchema } from './common.js';
import { evidenceFileSchema } from './files.js';
import { masterCodeSchema } from './organisation.js';
import { settingOriginSchema } from './settings.js';

// The tax rules part of `finance` (shared-calculations 3.3, 10; module-map 4.14; S1-F09-T04): goods classifications,
// rate and value rules with their slabs, registration applicability with its components, the price basis and the
// rounding rules, each effective-dated and in force only once a different authorised Accounts user decides it with the
// CA's evidence attached or referenced (10.1; books-and-posting 6.3, GC4-2; POL-10.05; DEC-116). No rate, slab,
// component, price basis, rounding rule or date is set here: they are Accounts' and the CA's, OPEN (V-18, GC7-1 to
// GC7-4, GC7-8). API only in stage 1 (DEC-116). The value shapes are those `@apparel-os/calculations` takes (section 4).

const textSchema = z.string().regex(/\S/);
/** An exact decimal, never a JavaScript number: a rate as a percentage, or a share (shared-calculations 3.1). */
export const decimalStringSchema = z.string().regex(/^\d+(\.\d+)?$/);

/** The record type every tax-rule record is read and decided under (access-and-approvals 4.1). */
export const TAX_RULE_TYPE = 'finance.tax_rule';

/** The kinds of tax-rule record (10.1, 10.3). */
export const taxRuleKindSchema = z.enum([
  'goods-classification',
  'tax-rate-rule',
  'registration-applicability',
  'price-basis',
  'rounding-rule',
]);
export type TaxRuleKind = z.infer<typeof taxRuleKindSchema>;

/** The action type of each kind's version, decided by a different authorised Accounts user (10.1; POL-10.05). */
export const TAX_RULE_CHANGE: Readonly<Record<TaxRuleKind, string>> = {
  'goods-classification': 'finance.goods_classification.change',
  'tax-rate-rule': 'finance.tax_rate_rule.change',
  'registration-applicability': 'finance.registration_tax_applicability.change',
  'price-basis': 'finance.price_basis.change',
  'rounding-rule': 'finance.rounding_rule.change',
};

/** Every version: its first day, never in the past, where its value came from (code-house-rules 12.14). */
const versionFields = { validFrom: businessDateSchema, origin: settingOriginSchema };
/** The version token of the record changed (code-house-rules 12.7); none for a record not yet versioned. */
const versionToken = { versionToken: idSchema.optional() };

/** A new goods classification, one HSN entry, with its first version (10.1). */
export const goodsClassificationDraftSchema = z.strictObject({ code: masterCodeSchema, ...versionFields });
/** A classification's later version: retired from its start, or no longer (10.3: retired, never deleted). */
export const goodsClassificationVersionDraftSchema = z.strictObject({
  retired: z.boolean(),
  ...versionFields,
  versionToken: idSchema,
});

export const roundingModeSchema = z.enum(['half-up', 'half-to-even', 'up', 'down']);

/** The value a slab is compared with, named in the rule because it is the CA's (GC7-2). */
export const comparedValueSchema = z.strictObject({
  per: z.enum(['unit', 'line']),
  discounts: z.enum(['before', 'after']),
  tax: z.enum(['excluded', 'included']),
});

export const taxSlabSchema = z.strictObject({
  /** In paise. The lowest slab starts at zero (10.3). */
  lowerBound: z.int().nonnegative(),
  boundIn: z.enum(['this-slab', 'slab-below']),
  rate: decimalStringSchema,
});

/** A rate at every value, or value slabs, each with a rate (10.1). */
export const rateRuleContentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('single-rate'), rate: decimalStringSchema }),
  z.strictObject({
    kind: z.literal('slabs'),
    comparedValue: comparedValueSchema,
    slabs: z.array(taxSlabSchema),
  }),
]);
export type RateRuleContent = z.infer<typeof rateRuleContentSchema>;

/** A rate and value rule version for one classification; the first creates the rule (10.1). */
export const taxRateRuleDraftSchema = z.strictObject({
  classificationId: idSchema,
  rule: rateRuleContentSchema,
  ...versionFields,
  ...versionToken,
});

export const taxComponentShareSchema = z.strictObject({ component: textSchema, share: decimalStringSchema });

/** A registration applicability version for one tax registration; the first creates the record (10.1; GC7-8). */
export const registrationApplicabilityDraftSchema = z.strictObject({
  taxRegistrationId: idSchema,
  chargesTax: z.boolean(),
  components: z.array(taxComponentShareSchema),
  ...versionFields,
  ...versionToken,
});

/** A price basis version for the Organisation; the first creates the record (10.1; GC7-1). */
export const priceBasisDraftSchema = z.strictObject({
  pricesIncludeTax: z.boolean(),
  ...versionFields,
  ...versionToken,
});

export const roundingKindSchema = z.enum(['discount', 'tax', 'bill']);
export type RoundingKind = z.infer<typeof roundingKindSchema>;

/** A rounding rule version of one kind; the first creates the rule (3.3, 10.3). */
export const roundingRuleDraftSchema = z.strictObject({
  kind: roundingKindSchema,
  /** In whole paise, above zero. */
  unit: z.int(),
  mode: roundingModeSchema,
  /** Each line or the bill, for the tax kind only. */
  level: z.enum(['line', 'bill']).optional(),
  ...versionFields,
  ...versionToken,
});

/** One version a piece of the CA's evidence covers. */
export const taxRuleVersionRefSchema = z.strictObject({ kind: taxRuleKindSchema, versionId: idSchema });

/**
 * The CA's evidence of a named set of versions awaiting approval (10.1; books-and-posting 6.3, GC4-2): a stored file
 * attached through files-imports (S1-F06-T05), or a reference naming what the evidence is, who gave it, its date and
 * where it is kept.
 */
export const caEvidenceDraftSchema = z.strictObject({
  versions: z
    .array(taxRuleVersionRefSchema)
    .min(1)
    .refine((list) => new Set(list.map((each) => each.versionId)).size === list.length, {
      message: 'Each is given once',
    }),
  evidence: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('file'), file: evidenceFileSchema }),
    z.strictObject({
      kind: z.literal('reference'),
      what: textSchema,
      givenBy: textSchema,
      givenOn: businessDateSchema,
      keptAt: textSchema,
    }),
  ]),
});

export type GoodsClassificationDraft = z.infer<typeof goodsClassificationDraftSchema>;
export type GoodsClassificationVersionDraft = z.infer<typeof goodsClassificationVersionDraftSchema>;
export type TaxRateRuleDraft = z.infer<typeof taxRateRuleDraftSchema>;
export type RegistrationApplicabilityDraft = z.infer<typeof registrationApplicabilityDraftSchema>;
export type PriceBasisDraft = z.infer<typeof priceBasisDraftSchema>;
export type RoundingRuleDraft = z.infer<typeof roundingRuleDraftSchema>;
export type CaEvidenceDraft = z.infer<typeof caEvidenceDraftSchema>;

/** What a change answers: the record and its version, and the approval request. */
export const taxRuleChangedSchema = z.strictObject({ recordId: idSchema, versionId: idSchema, requestId: idSchema });
export type TaxRuleChanged = z.infer<typeof taxRuleChangedSchema>;
export const caEvidenceRecordedSchema = z.strictObject({ evidenceIds: z.array(idSchema) });
export type CaEvidenceRecorded = z.infer<typeof caEvidenceRecordedSchema>;

// Read tax rules (10.2): the rules in force on a date, each with its version, in the shapes the calculations take.

/** A setting read on a date: its version in force with its identifier, or not set (code-house-rules 12.14). */
const setting = <T extends z.ZodType>(value: T) =>
  z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('set'), value, versionId: idSchema }),
    z.strictObject({ kind: z.literal('not-set') }),
  ]);

const classificationValueSchema = z.strictObject({ code: textSchema, version: idSchema });
const rateRuleValueSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('single-rate'),
    version: idSchema,
    classification: textSchema,
    rate: decimalStringSchema,
  }),
  z.strictObject({
    kind: z.literal('slabs'),
    version: idSchema,
    classification: textSchema,
    comparedValue: comparedValueSchema,
    slabs: z.array(taxSlabSchema),
  }),
]);
const applicabilityValueSchema = z.strictObject({
  version: idSchema,
  registration: textSchema,
  chargesTax: z.boolean(),
  components: z.array(taxComponentShareSchema),
});
const priceBasisValueSchema = z.strictObject({ version: idSchema, pricesIncludeTax: z.boolean() });
const roundingValueSchema = z.strictObject({ version: idSchema, unit: z.int().positive(), mode: roundingModeSchema });
const taxRoundingValueSchema = z.strictObject({
  version: idSchema,
  unit: z.int().positive(),
  mode: roundingModeSchema,
  level: z.enum(['line', 'bill']),
});

/** Classifications as HSN codes, comma-separated, each given once. */
export const taxRulesQuerySchema = z.strictObject({
  date: businessDateSchema,
  taxRegistrationId: idSchema,
  classifications: z
    .string()
    .regex(/^[^,\s]+(,[^,\s]+)*$/)
    .refine((list) => new Set(list.split(',')).size === list.split(',').length, { message: 'Each is given once' }),
});

export const taxRulesInForceSchema = z.strictObject({
  date: businessDateSchema,
  priceBasis: setting(priceBasisValueSchema),
  registration: setting(applicabilityValueSchema),
  classifications: z.array(
    z.strictObject({
      code: textSchema,
      classification: setting(classificationValueSchema),
      rateRule: setting(rateRuleValueSchema),
    }),
  ),
  rounding: z.strictObject({
    discount: setting(roundingValueSchema),
    tax: setting(taxRoundingValueSchema),
    bill: setting(roundingValueSchema),
  }),
});
export type TaxRulesInForceAnswer = z.infer<typeof taxRulesInForceSchema>;
export const taxRulesReadSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  rules: taxRulesInForceSchema,
});

// A record with every version, for maintaining it (12.7: its version token).

const versionView = {
  id: idSchema,
  validFrom: businessDateSchema,
  validTo: businessDateSchema.optional(),
  state: recordStateSchema,
  origin: settingOriginSchema,
  request: z.strictObject({ id: idSchema, state: approvalRequestStateSchema }).optional(),
  /** How many pieces of the CA's evidence the version has (10.1). */
  caEvidence: z.int().nonnegative(),
};

const contentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('goods-classification'), retired: z.boolean() }),
  z.strictObject({ kind: z.literal('tax-rate-rule'), rule: rateRuleContentSchema }),
  z.strictObject({
    kind: z.literal('registration-applicability'),
    chargesTax: z.boolean(),
    components: z.array(taxComponentShareSchema),
  }),
  z.strictObject({ kind: z.literal('price-basis'), pricesIncludeTax: z.boolean() }),
  z.strictObject({
    kind: z.literal('rounding-rule'),
    unit: z.int().positive(),
    mode: roundingModeSchema,
    level: z.enum(['line', 'bill']).optional(),
  }),
]);

export const taxRuleRecordSchema = z.strictObject({
  id: idSchema,
  kind: taxRuleKindSchema,
  /** What identifies the record: the HSN code, the classification, the tax registration or the rounding kind. */
  key: z.string(),
  versionToken: idSchema.optional(),
  versions: z.array(z.strictObject({ ...versionView, content: contentSchema })),
});
export type TaxRuleRecord = z.infer<typeof taxRuleRecordSchema>;
export const taxRuleRecordReadSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  record: taxRuleRecordSchema,
});
export const taxRuleRecordListSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  records: z.array(taxRuleRecordSchema),
  next: idSchema.nullable(),
});
