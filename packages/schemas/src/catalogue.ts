import { z } from 'zod';
import { approvalRequestStateSchema } from './approvals.js';
import { recordStateSchema } from './access-records.js';
import { businessDateSchema, idSchema } from './common.js';
import { businessUnitKindSchema, masterCodeSchema } from './organisation.js';

// The merchandise catalogue's first masters (structure-and-masters 4.1, 4.2, 4.7, 6.2; module-map 4.12;
// S1-F03-T01): brands with their aliases and optional parent brand (PRD-MER-001, PRD-MER-020), a business unit's brand
// coverage (3.3; PRD-ORG-006), the category tree with its size sets and identity attributes (PRD-MER-002,
// PRD-ORG-011, POL-04.01), the Organisation's attributes and their vocabularies (4.2; GC2-9), and vocabulary
// proposals, each confirmed by a different person before its value exists (PRD-IMP-008, POL-02.07). No brand,
// category, attribute or value is set here: the Organisation records its own (structure-and-masters 2.4).

const textSchema = z.string().regex(/\S/);
const distinctTexts = z
  .array(textSchema)
  .refine((list) => new Set(list).size === list.length, { message: 'Each is given once' });
const distinctIds = z
  .array(idSchema)
  .refine((list) => new Set(list).size === list.length, { message: 'Each is given once' });

/**
 * The catalogue masters built so far, each an identity row and effective-dated versions (structure-and-masters 2.2,
 * 6.2). A business unit's brand coverage has the unit's identity, so it has no record of its own to create (3.3); a
 * vocabulary value is created only by confirming its proposal (4.2), so it has no route to create one either.
 */
export const catalogueKinds = [
  'brand',
  'business_unit_brand',
  'category',
  'size_set',
  'attribute',
  'vocabulary_value',
  // Tracking profiles, styles, SKUs and packs (4.1, 4.4 to 4.6; S1-F03-T02). A style and a SKU are created only by
  // confirming a product proposal (4.2), so they have no route to create one; a category's tracking-profile link has
  // the category's identity (4.6), so it has none either.
  'tracking_profile',
  'category_tracking_profile',
  'style',
  'sku',
  'pack',
] as const;
export type CatalogueKind = (typeof catalogueKinds)[number];

/** The record type a catalogue master is authorised and audited on (access-and-approvals 4.1). */
export const catalogueRecordType = <K extends CatalogueKind>(kind: K) => `merchandise.${kind}` as const;

/**
 * The action type of a change to a business unit's brand coverage, approved by a different authorised person: the
 * coverage is a versioned field of the unit (structure-and-masters 3.1, 3.3), a change to the structure (2.3; GC2-2,
 * DEC-105). No source names an approval for the other catalogue masters, so their versions take effect when they are
 * recorded (2.3; module-map 6.2 flow A, "approval where a rule needs it").
 */
export const BRAND_COVERAGE_CHANGE = 'merchandise.business_unit_brand.change';

/** The record type and action type of a vocabulary proposal (4.2; PRD-IMP-008, POL-02.07). */
export const VOCABULARY_PROPOSAL_TYPE = 'merchandise.vocabulary_proposal';
export const VOCABULARY_CONFIRMATION = 'merchandise.vocabulary_proposal.confirm';

/** The routes of each catalogue master (code-house-rules 12.1, 12.2): list, one record, a new record, a new version. */
export const catalogueRoutes = {
  brand: { list: 'listBrands', read: 'readBrand', prepare: 'prepareBrand', version: 'prepareBrandVersion' },
  business_unit_brand: {
    list: 'listBusinessUnitBrands',
    read: 'readBusinessUnitBrand',
    prepare: null,
    version: 'prepareBusinessUnitBrandVersion',
  },
  category: {
    list: 'listCategories',
    read: 'readCategory',
    prepare: 'prepareCategory',
    version: 'prepareCategoryVersion',
  },
  size_set: { list: 'listSizeSets', read: 'readSizeSet', prepare: 'prepareSizeSet', version: 'prepareSizeSetVersion' },
  attribute: {
    list: 'listAttributes',
    read: 'readAttribute',
    prepare: 'prepareAttribute',
    version: 'prepareAttributeVersion',
  },
  vocabulary_value: {
    list: 'listVocabularyValues',
    read: 'readVocabularyValue',
    prepare: null,
    version: 'prepareVocabularyValueVersion',
  },
  tracking_profile: {
    list: 'listTrackingProfiles',
    read: 'readTrackingProfile',
    prepare: 'prepareTrackingProfile',
    version: 'prepareTrackingProfileVersion',
  },
  category_tracking_profile: {
    list: 'listCategoryTrackingProfiles',
    read: 'readCategoryTrackingProfile',
    prepare: null,
    version: 'prepareCategoryTrackingProfileVersion',
  },
  style: { list: 'listStyles', read: 'readStyle', prepare: null, version: 'prepareStyleVersion' },
  sku: { list: 'listSkus', read: 'readSku', prepare: null, version: 'prepareSkuVersion' },
  pack: { list: 'listPacks', read: 'readPack', prepare: 'preparePack', version: 'preparePackVersion' },
} as const satisfies Record<CatalogueKind, { list: string; read: string; prepare: string | null; version: string }>;

/**
 * What an attribute's values are (4.2; GC2-9): `list`, chosen only from its approved vocabulary, or `text`, as written.
 * Fixed when the attribute is created. Which attributes exist is the Organisation's (PRD-ORG-011).
 */
export const attributeValueKindSchema = z.enum(['list', 'text']);
export type AttributeValueKind = z.infer<typeof attributeValueKindSchema>;

/**
 * The version token (code-house-rules 12.7): the identifier of the record's newest version as the screen read it. A
 * new version of a record that has versions sends it back; a stale one is `kernel.stale-version`.
 */
const versionToken = { versionToken: idSchema.optional() };
const validFrom = { validFrom: businessDateSchema };

const brandFields = {
  name: textSchema,
  /** Another brand, the brand's family; kept apart from its aliases (PRD-MER-020; DEC-123). */
  parentBrandId: idSchema.optional(),
  aliases: distinctTexts,
};
const categoryFields = {
  name: textSchema,
  /** The parent in the category tree; none for a top category (4.1). */
  parentCategoryId: idSchema.optional(),
  /** A size set fixed to this category (4.1). */
  sizeSetId: idSchema.optional(),
  /** The attributes that, with style and size, make up a SKU's identity in the category (PRD-ORG-011, POL-04.02). */
  identityAttributeIds: distinctIds,
};
/** Ordered sizes, each given once, compared exactly (4.1; PRD-MER-002). */
const sizeSetFields = { name: textSchema, sizes: distinctTexts.refine((list) => list.length > 0) };
const nameFields = { name: textSchema };

export const brandDraftSchema = z.strictObject({ code: masterCodeSchema, ...brandFields, ...validFrom });
/** A later brand version; `retired` retires the brand from its start, never deleting it (2.5). */
export const brandVersionDraftSchema = z.strictObject({
  ...brandFields,
  retired: z.boolean(),
  ...validFrom,
  ...versionToken,
});
/** A business unit's brand coverage from a date (3.3; PRD-ORG-006): the brands it covers. */
export const businessUnitBrandVersionDraftSchema = z.strictObject({
  brandIds: distinctIds,
  ...validFrom,
  ...versionToken,
});
export const categoryDraftSchema = z.strictObject({ code: masterCodeSchema, ...categoryFields, ...validFrom });
export const categoryVersionDraftSchema = z.strictObject({ ...categoryFields, ...validFrom, ...versionToken });
/** A new size set, fixed to its category (4.1). */
export const sizeSetDraftSchema = z.strictObject({
  code: masterCodeSchema,
  categoryId: idSchema,
  ...sizeSetFields,
  ...validFrom,
});
export const sizeSetVersionDraftSchema = z.strictObject({ ...sizeSetFields, ...validFrom, ...versionToken });
export const attributeDraftSchema = z.strictObject({
  code: masterCodeSchema,
  valueKind: attributeValueKindSchema,
  ...nameFields,
  ...validFrom,
});
export const catalogueNameVersionDraftSchema = z.strictObject({ ...nameFields, ...validFrom, ...versionToken });
/**
 * Propose a new value of a list-type attribute (4.2; PRD-IMP-008): its code, unique in the attribute, and its name. It
 * is no value until a different person confirms it; it is in force from the day it is confirmed.
 */
export const vocabularyProposalDraftSchema = z.strictObject({
  attributeId: idSchema,
  code: masterCodeSchema,
  ...nameFields,
});

// Tracking profiles (4.5, 4.6; PRD-MER-010, PRD-MER-011, PRD-MER-014, POL-04.01, POL-04.05): none has a default.
const shelfLifeDays = z.number().int().min(0).optional();
const trackingProfileFields = {
  name: textSchema,
  /** Piece-tracked, or held as a quantity per SKU and unit (PRD-MER-014). A change to piece-tracked is 4.6's. */
  pieceTracked: z.boolean(),
  /** Batch and expiry carried through receiving, movement, sale, return and count (PRD-MER-011, POL-04.05). */
  batchExpiryRequired: z.boolean(),
  /** The identifiers the profile requires, each as written; none is set in code (4.5). */
  requiredIdentifiers: distinctTexts,
  /** Minimum remaining shelf life in days for receiving and for selling; absent is Unknown (POL-04.05; V-05). */
  receivingShelfLifeDays: shelfLifeDays,
  sellingShelfLifeDays: shelfLifeDays,
};
export const trackingProfileDraftSchema = z.strictObject({
  code: masterCodeSchema,
  ...trackingProfileFields,
  ...validFrom,
});
export const trackingProfileVersionDraftSchema = z.strictObject({
  ...trackingProfileFields,
  ...validFrom,
  ...versionToken,
});
/** A category's tracking profile from a date (4.6; POL-04.01): the dated link `category_tracking_profile`. */
const categoryTrackingProfileFields = { trackingProfileId: idSchema };
export const categoryTrackingProfileVersionDraftSchema = z.strictObject({
  ...categoryTrackingProfileFields,
  ...validFrom,
  ...versionToken,
});

/**
 * An attribute's value on a style or in a SKU's identity (4.1, 4.2; PRD-MER-004, GC2-9): an approved vocabulary value
 * of a list-type attribute, or text for a text attribute. An attribute not given is Unknown (2.4; PRD-MER-005).
 */
export const attributeValueSchema = z
  .strictObject({ attributeId: idSchema, valueId: idSchema.optional(), text: textSchema.optional() })
  .refine((each) => (each.valueId === undefined) !== (each.text === undefined), {
    message: 'Give a value or a text, not both',
  });
export type AttributeValue = z.infer<typeof attributeValueSchema>;
export const attributeValuesSchema = z
  .array(attributeValueSchema)
  .refine((list) => new Set(list.map((each) => each.attributeId)).size === list.length, {
    message: 'Each attribute is given once',
  });
/** As a record shows it: an attribute with neither a value nor a text is Unknown (2.4). */
const attributeValueView = z.strictObject({
  attributeId: idSchema,
  valueId: idSchema.optional(),
  text: textSchema.optional(),
});

/** A style's versioned fields (4.1; PRD-MER-002, PRD-MER-004, PRD-MER-005): each a value or Unknown (absent). */
const styleFields = {
  brandArticleNumber: textSchema.optional(),
  launchDate: businessDateSchema.optional(),
  /** The style's HSN as given; the classification it names is `finance`'s (POL-10.02). */
  hsn: textSchema.optional(),
  /** Season, collection, gender, fabric, fit and any other attribute the Organisation configures (4.2). */
  attributes: attributeValuesSchema,
};
export const styleVersionDraftSchema = z.strictObject({ ...styleFields, ...validFrom, ...versionToken });

/** The stock units of POL-04.03: one per SKU at a time, quantities whole (4.4). */
export const stockUnitSchema = z.enum(['piece', 'pair', 'pack']);
export type StockUnit = z.infer<typeof stockUnitSchema>;
/** A SKU's purpose (PRD-MER-019; DEC-123): every purpose keeps its actual stock cost. */
export const skuPurposeSchema = z.enum(['merchandise', 'gift-with-purchase', 'promotional', 'packaging']);
export type SkuPurpose = z.infer<typeof skuPurposeSchema>;
const skuFields = { stockUnit: stockUnitSchema, purpose: skuPurposeSchema };
export const skuVersionDraftSchema = z.strictObject({ ...skuFields, ...validFrom, ...versionToken });

/**
 * A pack's versioned fields (4.4; POL-04.03, POL-04.04): an explicit conversion to the SKU's stock units, or, for a
 * mixed size or colour pack, its contents SKU by SKU; and whether it is a purchasing pack, a selling pack or both.
 */
const packContentSchema = z.strictObject({ skuId: idSchema, quantity: z.number().int().min(1) });
const packFields = {
  units: z.number().int().min(1).optional(),
  mixed: z.boolean(),
  forPurchasing: z.boolean(),
  forSelling: z.boolean(),
  contents: z.array(packContentSchema),
};
interface PackShape {
  readonly units?: number | undefined;
  readonly mixed: boolean;
  readonly forPurchasing: boolean;
  readonly forSelling: boolean;
  readonly contents: readonly { readonly skuId: string }[];
}
const packRules = (each: PackShape) =>
  (each.mixed
    ? each.units === undefined && each.contents.length > 0
    : each.units !== undefined && each.contents.length === 0) &&
  (each.forPurchasing || each.forSelling) &&
  new Set(each.contents.map((content) => content.skuId)).size === each.contents.length;
const packMessage = {
  message: 'A pack has a conversion, or contents when mixed, each SKU once, and is for purchasing, selling or both',
};
export const packDraftSchema = z
  .strictObject({ code: masterCodeSchema, skuId: idSchema, ...packFields, ...validFrom })
  .refine(packRules, packMessage);
export const packVersionDraftSchema = z
  .strictObject({ ...packFields, ...validFrom, ...versionToken })
  .refine(packRules, packMessage);

export type BrandDraft = z.infer<typeof brandDraftSchema>;
export type BrandVersionDraft = z.infer<typeof brandVersionDraftSchema>;
export type BusinessUnitBrandVersionDraft = z.infer<typeof businessUnitBrandVersionDraftSchema>;
export type CategoryDraft = z.infer<typeof categoryDraftSchema>;
export type CategoryVersionDraft = z.infer<typeof categoryVersionDraftSchema>;
export type SizeSetDraft = z.infer<typeof sizeSetDraftSchema>;
export type SizeSetVersionDraft = z.infer<typeof sizeSetVersionDraftSchema>;
export type AttributeDraft = z.infer<typeof attributeDraftSchema>;
export type CatalogueNameVersionDraft = z.infer<typeof catalogueNameVersionDraftSchema>;
export type VocabularyProposalDraft = z.infer<typeof vocabularyProposalDraftSchema>;
export type TrackingProfileDraft = z.infer<typeof trackingProfileDraftSchema>;
export type TrackingProfileVersionDraft = z.infer<typeof trackingProfileVersionDraftSchema>;
export type CategoryTrackingProfileVersionDraft = z.infer<typeof categoryTrackingProfileVersionDraftSchema>;
export type StyleVersionDraft = z.infer<typeof styleVersionDraftSchema>;
export type SkuVersionDraft = z.infer<typeof skuVersionDraftSchema>;
export type PackDraft = z.infer<typeof packDraftSchema>;
export type PackVersionDraft = z.infer<typeof packVersionDraftSchema>;

/**
 * What recording a catalogue change answers: the record and its version, and the approval request where a rule needs
 * one (brand coverage); absent where the version took effect when it was recorded.
 */
export const catalogueChangedSchema = z.strictObject({
  recordId: idSchema,
  versionId: idSchema,
  requestId: idSchema.optional(),
});
export type CatalogueChanged = z.infer<typeof catalogueChangedSchema>;
/** What proposing answers: the proposal and its approval request, which its confirmer decides. */
export const vocabularyProposedSchema = z.strictObject({ proposalId: idSchema, requestId: idSchema });
export type VocabularyProposed = z.infer<typeof vocabularyProposedSchema>;

const versionView = {
  id: idSchema,
  validFrom: businessDateSchema,
  validTo: businessDateSchema.optional(),
  state: recordStateSchema,
  request: z.strictObject({ id: idSchema, state: approvalRequestStateSchema }).optional(),
};
const asOf = z.iso.datetime({ offset: true });

function catalogueRecord<const Fixed extends z.ZodRawShape, const Fields extends z.ZodRawShape>(
  fixed: Fixed,
  fields: Fields,
) {
  return z.strictObject({
    id: idSchema,
    code: masterCodeSchema,
    ...fixed,
    /** The newest version's identifier, sent back with a new version (code-house-rules 12.7). */
    versionToken: idSchema.optional(),
    versions: z.array(z.strictObject({ ...versionView, ...fields })),
  });
}
const pageOf = <Record extends z.ZodType>(record: Record) =>
  z.strictObject({ asOf, records: z.array(record), next: idSchema.nullable() });
const readOf = <Record extends z.ZodType>(record: Record) => z.strictObject({ asOf, record });

export const brandRecordSchema = catalogueRecord({}, { ...brandFields, retired: z.boolean() });
/** A unit's coverage: the record is the unit, named by its code and kind, read through `organisation` (3.3). */
export const businessUnitBrandRecordSchema = catalogueRecord(
  { businessUnitKind: businessUnitKindSchema },
  { brandIds: z.array(idSchema) },
);
export const categoryRecordSchema = catalogueRecord({}, categoryFields);
export const sizeSetRecordSchema = catalogueRecord({ categoryId: idSchema }, sizeSetFields);
export const attributeRecordSchema = catalogueRecord({ valueKind: attributeValueKindSchema }, nameFields);
export const vocabularyValueRecordSchema = catalogueRecord({ attributeId: idSchema }, nameFields);
export const trackingProfileRecordSchema = catalogueRecord({}, trackingProfileFields);
/** A category's tracking-profile link: the record is the category, named by its code (4.6). */
export const categoryTrackingProfileRecordSchema = catalogueRecord({}, categoryTrackingProfileFields);
export const styleRecordSchema = catalogueRecord(
  { brandId: idSchema, categoryId: idSchema },
  { ...styleFields, attributes: z.array(attributeValueView) },
);
/** A SKU: its identity fixed at creation; a size or identity value not given is Unknown (PRD-MER-005). */
export const skuRecordSchema = catalogueRecord(
  { styleId: idSchema, size: textSchema.nullable(), identity: z.array(attributeValueView) },
  skuFields,
);
export const packRecordSchema = catalogueRecord({ skuId: idSchema }, packFields);

export const brandListSchema = pageOf(brandRecordSchema);
export const businessUnitBrandListSchema = pageOf(businessUnitBrandRecordSchema);
export const categoryListSchema = pageOf(categoryRecordSchema);
export const sizeSetListSchema = pageOf(sizeSetRecordSchema);
export const attributeListSchema = pageOf(attributeRecordSchema);
export const vocabularyValueListSchema = pageOf(vocabularyValueRecordSchema);
export const trackingProfileListSchema = pageOf(trackingProfileRecordSchema);
export const categoryTrackingProfileListSchema = pageOf(categoryTrackingProfileRecordSchema);
export const styleListSchema = pageOf(styleRecordSchema);
export const skuListSchema = pageOf(skuRecordSchema);
export const packListSchema = pageOf(packRecordSchema);
export const brandReadSchema = readOf(brandRecordSchema);
export const businessUnitBrandReadSchema = readOf(businessUnitBrandRecordSchema);
export const categoryReadSchema = readOf(categoryRecordSchema);
export const sizeSetReadSchema = readOf(sizeSetRecordSchema);
export const attributeReadSchema = readOf(attributeRecordSchema);
export const vocabularyValueReadSchema = readOf(vocabularyValueRecordSchema);
export const trackingProfileReadSchema = readOf(trackingProfileRecordSchema);
export const categoryTrackingProfileReadSchema = readOf(categoryTrackingProfileRecordSchema);
export const styleReadSchema = readOf(styleRecordSchema);
export const skuReadSchema = readOf(skuRecordSchema);
export const packReadSchema = readOf(packRecordSchema);

/** Each catalogue kind's record as its list and its read carry it. */
export interface CatalogueRecords {
  brand: z.infer<typeof brandRecordSchema>;
  business_unit_brand: z.infer<typeof businessUnitBrandRecordSchema>;
  category: z.infer<typeof categoryRecordSchema>;
  size_set: z.infer<typeof sizeSetRecordSchema>;
  attribute: z.infer<typeof attributeRecordSchema>;
  vocabulary_value: z.infer<typeof vocabularyValueRecordSchema>;
  tracking_profile: z.infer<typeof trackingProfileRecordSchema>;
  category_tracking_profile: z.infer<typeof categoryTrackingProfileRecordSchema>;
  style: z.infer<typeof styleRecordSchema>;
  sku: z.infer<typeof skuRecordSchema>;
  pack: z.infer<typeof packRecordSchema>;
}

/** The states of a proposal (domain-model 4; DM-4, DEC-105). */
export const proposalStateSchema = z.enum(['Proposed', 'Confirmed', 'Rejected']);
export type ProposalState = z.infer<typeof proposalStateSchema>;

/** A vocabulary proposal, kept apart from the vocabulary (4.2): the value it became once confirmed. */
export const vocabularyProposalSchema = z.strictObject({
  id: idSchema,
  attributeId: idSchema,
  code: masterCodeSchema,
  name: textSchema,
  state: proposalStateSchema,
  proposedByUserId: idSchema,
  proposedAt: z.iso.datetime({ offset: true }),
  decidedAt: z.iso.datetime({ offset: true }).optional(),
  valueId: idSchema.optional(),
  request: z.strictObject({ id: idSchema, state: approvalRequestStateSchema }).optional(),
});
export type VocabularyProposal = z.infer<typeof vocabularyProposalSchema>;
export const vocabularyProposalListSchema = pageOf(vocabularyProposalSchema);
export const vocabularyProposalReadSchema = z.strictObject({ asOf, proposal: vocabularyProposalSchema });
