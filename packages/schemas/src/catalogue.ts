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

export const brandListSchema = pageOf(brandRecordSchema);
export const businessUnitBrandListSchema = pageOf(businessUnitBrandRecordSchema);
export const categoryListSchema = pageOf(categoryRecordSchema);
export const sizeSetListSchema = pageOf(sizeSetRecordSchema);
export const attributeListSchema = pageOf(attributeRecordSchema);
export const vocabularyValueListSchema = pageOf(vocabularyValueRecordSchema);
export const brandReadSchema = readOf(brandRecordSchema);
export const businessUnitBrandReadSchema = readOf(businessUnitBrandRecordSchema);
export const categoryReadSchema = readOf(categoryRecordSchema);
export const sizeSetReadSchema = readOf(sizeSetRecordSchema);
export const attributeReadSchema = readOf(attributeRecordSchema);
export const vocabularyValueReadSchema = readOf(vocabularyValueRecordSchema);

/** Each catalogue kind's record as its list and its read carry it. */
export interface CatalogueRecords {
  brand: z.infer<typeof brandRecordSchema>;
  business_unit_brand: z.infer<typeof businessUnitBrandRecordSchema>;
  category: z.infer<typeof categoryRecordSchema>;
  size_set: z.infer<typeof sizeSetRecordSchema>;
  attribute: z.infer<typeof attributeRecordSchema>;
  vocabulary_value: z.infer<typeof vocabularyValueRecordSchema>;
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
