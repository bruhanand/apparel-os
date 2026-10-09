import { z } from 'zod';
import { approvalRequestStateSchema } from './approvals.js';
import { attributeValuesSchema, proposalStateSchema, skuPurposeSchema, stockUnitSchema } from './catalogue.js';
import { businessDateSchema, idSchema } from './common.js';
import { masterCodeSchema } from './organisation.js';

// Product proposals, external codes, Resolve a code and Read a SKU as of a date (structure-and-masters 4.2, 4.3, 4.7;
// module-map 4.12; S1-F03-T02). No style, SKU, code, unit or profile is set here: the Organisation records its own.

const textSchema = z.string().regex(/\S/);
const asOf = z.iso.datetime({ offset: true });

/** The record type and action type of a product proposal (4.2; PRD-MER-013; DM-5, DEC-105). */
export const PRODUCT_PROPOSAL_TYPE = 'merchandise.product_proposal';
export const PRODUCT_CONFIRMATION = 'merchandise.product_proposal.confirm';
/** The record type of an external code mapping (4.3; PRD-MER-006 to PRD-MER-008). */
export const EXTERNAL_CODE_TYPE = 'merchandise.external_code';

/**
 * A SKU a product proposal names (4.1; PRD-MER-002, PRD-MER-005, POL-04.02, POL-04.03, PRD-MER-019): its code, its
 * size from the category's size set or absent for Unknown, and the category's identity attributes, each absent for
 * Unknown; its stock unit and purpose.
 */
export const proposedSkuSchema = z.strictObject({
  code: masterCodeSchema,
  size: textSchema.optional(),
  identity: attributeValuesSchema,
  stockUnit: stockUnitSchema,
  purpose: skuPurposeSchema,
});
export type ProposedSku = z.infer<typeof proposedSkuSchema>;

/** The new style a proposal names (4.1): brand and category fixed, the rest each a value or Unknown (absent). */
export const proposedStyleSchema = z.strictObject({
  code: masterCodeSchema,
  brandId: idSchema,
  categoryId: idSchema,
  brandArticleNumber: textSchema.optional(),
  launchDate: businessDateSchema.optional(),
  hsn: textSchema.optional(),
  attributes: attributeValuesSchema,
});
export type ProposedStyle = z.infer<typeof proposedStyleSchema>;

/**
 * Propose a product (4.2; PRD-MER-013, PRD-IMP-009): a new style with its SKUs, or new SKUs of an existing style, with
 * the original source words as given. Nothing enters the catalogue until a different person confirms it (DM-5).
 */
export const productProposalDraftSchema = z
  .strictObject({
    style: proposedStyleSchema.optional(),
    styleId: idSchema.optional(),
    skus: z.array(proposedSkuSchema).min(1),
    sourceWords: textSchema.optional(),
  })
  .refine((draft) => (draft.style === undefined) !== (draft.styleId === undefined), {
    message: 'Name a new style or an existing one',
  })
  .refine((draft) => new Set(draft.skus.map((sku) => sku.code)).size === draft.skus.length, {
    message: 'Each SKU code is given once',
  });
export type ProductProposalDraft = z.infer<typeof productProposalDraftSchema>;

/** What proposing answers: the proposal and its approval request, which its confirmer decides. */
export const productProposedSchema = z.strictObject({ proposalId: idSchema, requestId: idSchema });
export type ProductProposed = z.infer<typeof productProposedSchema>;

/** A product proposal, kept apart from the catalogue (4.2): the style and SKUs it made once confirmed. */
export const productProposalSchema = z.strictObject({
  id: idSchema,
  style: proposedStyleSchema.optional(),
  styleId: idSchema.optional(),
  skus: z.array(proposedSkuSchema),
  sourceWords: textSchema.optional(),
  state: proposalStateSchema,
  proposedByUserId: idSchema,
  proposedAt: asOf,
  decidedAt: asOf.optional(),
  /** The SKUs confirming it made, in the order proposed. */
  skuIds: z.array(idSchema),
  request: z.strictObject({ id: idSchema, state: approvalRequestStateSchema }).optional(),
});
export type ProductProposal = z.infer<typeof productProposalSchema>;
export const productProposalListSchema = z.strictObject({
  asOf,
  records: z.array(productProposalSchema),
  next: idSchema.nullable(),
});
export const productProposalReadSchema = z.strictObject({ asOf, proposal: productProposalSchema });

/**
 * The kinds of external code (4.3): a supplier barcode, a supplier style code, another code a source uses, or an
 * internal barcode the Organisation issues (PRD-MER-008).
 */
export const externalCodeKindSchema = z.enum(['supplier-barcode', 'supplier-style-code', 'other', 'internal']);
export type ExternalCodeKind = z.infer<typeof externalCodeKindSchema>;
/** A code's scope (4.3): one supplier, one brand or the whole Organisation. */
export const codeScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('supplier'), partyId: idSchema }),
  z.strictObject({ kind: z.literal('brand'), brandId: idSchema }),
  z.strictObject({ kind: z.literal('organisation') }),
]);
export type CodeScope = z.infer<typeof codeScopeSchema>;

/**
 * Map a code (4.3; PRD-MER-006, PRD-MER-007): the code as supplied, leading zeros kept, to a SKU and a unit, the stock
 * unit or one of the SKU's packs, in a scope from a date, as an active mapping or a historical alias. An internal
 * barcode is the Organisation's own (PRD-MER-008).
 */
export const codeMappingDraftSchema = z
  .strictObject({
    code: z.string().min(1),
    kind: externalCodeKindSchema,
    scope: codeScopeSchema,
    skuId: idSchema,
    packId: idSchema.optional(),
    alias: z.boolean(),
    validFrom: businessDateSchema,
    validTo: businessDateSchema.optional(),
  })
  .refine((draft) => draft.kind !== 'internal' || draft.scope.kind === 'organisation', {
    message: 'An internal barcode is the Organisation’s',
  })
  .refine((draft) => draft.validTo === undefined || draft.validTo > draft.validFrom, {
    message: 'A mapping ends after it starts',
  });
export type CodeMappingDraft = z.infer<typeof codeMappingDraftSchema>;
/** End a mapping on a date, today or later; an earlier code stays as it was (4.3; PRD-MER-007). */
export const codeMappingEndSchema = z.strictObject({ validTo: businessDateSchema });
export type CodeMappingEnd = z.infer<typeof codeMappingEndSchema>;
export const codeMappedSchema = z.strictObject({ mappingId: idSchema });
export type CodeMapped = z.infer<typeof codeMappedSchema>;

export const codeMappingSchema = z.strictObject({
  id: idSchema,
  code: z.string(),
  kind: externalCodeKindSchema,
  scope: codeScopeSchema,
  skuId: idSchema,
  packId: idSchema.optional(),
  alias: z.boolean(),
  validFrom: businessDateSchema,
  validTo: businessDateSchema.optional(),
});
export type CodeMapping = z.infer<typeof codeMappingSchema>;
export const codeMappingListQuerySchema = z.strictObject({
  skuId: idSchema.optional(),
  after: idSchema.optional(),
  limit: z
    .string()
    .regex(/^[1-9]\d{0,2}$/)
    .optional(),
});
export const codeMappingListSchema = z.strictObject({
  asOf,
  records: z.array(codeMappingSchema),
  next: idSchema.nullable(),
});

/** Resolve a code (4.7; PRD-MER-006, PRD-MER-007): the code, its kind, a supplier or brand where known, a date. */
export const resolveCodeQuerySchema = z.strictObject({
  code: z.string().min(1),
  kind: externalCodeKindSchema,
  supplierId: idSchema.optional(),
  brandId: idSchema.optional(),
  date: businessDateSchema,
});
export type ResolveCodeQuery = z.infer<typeof resolveCodeQuerySchema>;
/** The SKU and unit the code names: a pack, or the stock unit when no pack; whether it matched a historical alias. */
export const codeResolvedSchema = z.strictObject({
  skuId: idSchema,
  packId: idSchema.optional(),
  mappingId: idSchema,
  alias: z.boolean(),
});
export type CodeResolved = z.infer<typeof codeResolvedSchema>;
export const resolveCodeAnswerSchema = z.strictObject({ asOf, resolved: codeResolvedSchema });

/** Read a SKU as of a date at a Site (4.7). */
export const skuAsOfQuerySchema = z.strictObject({ date: businessDateSchema, siteId: idSchema });

/** A pack in force, with the version identifier a quantity stores (POL-04.04). */
export const packInForceSchema = z.strictObject({
  packId: idSchema,
  code: masterCodeSchema,
  versionId: idSchema,
  units: z.number().int().optional(),
  mixed: z.boolean(),
  forPurchasing: z.boolean(),
  forSelling: z.boolean(),
  contents: z.array(z.strictObject({ skuId: idSchema, quantity: z.number().int() })),
});

/**
 * The tracking profile in force for the SKU at a Site (4.5, 4.6): the profile and the link versions to store; whether
 * piece rules apply at the Site, which a change to piece-tracked starts only with the Site's labelling count
 * (PRD-MER-018), apart from whether the profile asks for them.
 */
export const trackingInForceSchema = z.strictObject({
  trackingProfileId: idSchema,
  versionId: idSchema,
  linkVersionId: idSchema,
  pieceTracked: z.boolean(),
  pieceTrackingRequested: z.boolean(),
  batchExpiryRequired: z.boolean(),
  requiredIdentifiers: z.array(z.string()),
  receivingShelfLifeDays: z.number().int().optional(),
  sellingShelfLifeDays: z.number().int().optional(),
});

/**
 * A SKU as of a date (4.7; PRD-MER-002, PRD-MER-004, PRD-MER-014, PRD-MER-019): identity, purpose, stock unit, packs,
 * tracking profile at the Site, HSN and attributes, with the version identifiers to store (PRD-MOD-010). An Unknown
 * value is absent, never a default; a SKU's profile is Unknown while its category has none in force.
 */
export const skuAsOfSchema = z.strictObject({
  skuId: idSchema,
  code: masterCodeSchema,
  versionId: idSchema,
  styleId: idSchema,
  styleVersionId: idSchema,
  styleCode: masterCodeSchema,
  brandId: idSchema,
  categoryId: idSchema,
  size: z.string().nullable(),
  identity: z.array(
    z.strictObject({ attributeId: idSchema, valueId: idSchema.optional(), text: z.string().optional() }),
  ),
  purpose: skuPurposeSchema,
  stockUnit: stockUnitSchema,
  packs: z.array(packInForceSchema),
  tracking: trackingInForceSchema.optional(),
  hsn: z.string().optional(),
  brandArticleNumber: z.string().optional(),
  launchDate: businessDateSchema.optional(),
  attributes: z.array(
    z.strictObject({ attributeId: idSchema, valueId: idSchema.optional(), text: z.string().optional() }),
  ),
});
export type SkuAsOf = z.infer<typeof skuAsOfSchema>;
export const skuAsOfAnswerSchema = z.strictObject({ asOf, sku: skuAsOfSchema });
