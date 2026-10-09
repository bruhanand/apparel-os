import { z } from 'zod';
import { approvalRequestStateSchema } from './approvals.js';
import { recordStateSchema } from './access-records.js';
import { businessDateSchema, idSchema, totpCodeSchema } from './common.js';
import { evidenceFileSchema } from './files.js';
import { masterCodeSchema } from './organisation.js';

// The parties part of `merchandise` (structure-and-masters 5, 6.2, 8; module-map 4.12; S1-F03-T03): parties with their
// dated roles (PRD-MER-001), brand–supplier links (PRD-MER-021; DEC-123), bank details, a restricted field class kept
// encrypted (PRD-ACS-008, PRD-SEC-006), and agreements with a brand or a supplier, each version's terms a value or
// Unknown, none defaulted (PRD-ORG-016, PRD-PAY-015, POL-01.01 to POL-01.11, POL-01.14). No party, term, margin or
// bank detail is set here: they are KDPS's values (V-14, V-61, RR-235). Unknown travels as null (2.4; PRD-MOD-015).

const textSchema = z.string().regex(/\S/);
const distinct = <T extends z.ZodType>(item: T) =>
  z.array(item).refine((list) => new Set(list.map((each) => JSON.stringify(each))).size === list.length, {
    message: 'Each is given once',
  });
const validFrom = { validFrom: businessDateSchema };
/** The version token of the record changed (code-house-rules 12.7); none for a record not yet versioned. */
const versionToken = { versionToken: idSchema.optional() };

/** The roles a party holds, each its own dated record (structure-and-masters 5.1; PRD-MER-001). */
export const partyRoleSchema = z.enum(['supplier', 'agent', 'ordering-party', 'invoicing-party', 'goods-mover']);
export type PartyRole = z.infer<typeof partyRoleSchema>;

/**
 * A party's MSME classification (PRD "Words used": MSME), or Unknown. Verified against evidence before any payment
 * control uses it (POL-10.09); each supplier's is KDPS's (V-61). Nothing here reads it yet.
 */
export const msmeClassificationSchema = z.enum(['micro', 'small', 'medium', 'not-msme']);
export type MsmeClassification = z.infer<typeof msmeClassificationSchema>;

/** A tax identity number, kept as text with the kind the Organisation names it by (5.1). */
export const taxIdentitySchema = z.strictObject({ kind: textSchema, number: textSchema });

const partyFields = {
  legalName: textSchema,
  taxIdentities: distinct(taxIdentitySchema),
  msmeClassification: msmeClassificationSchema.nullable(),
  /** Contacts, each a line of text, in the order given. */
  contacts: distinct(textSchema),
};

/** A new party with its first version and the roles it holds from the same day (5.1). */
export const partyDraftSchema = z.strictObject({
  code: masterCodeSchema,
  ...partyFields,
  roles: distinct(partyRoleSchema),
  ...validFrom,
});
export const partyVersionDraftSchema = z.strictObject({ ...partyFields, ...validFrom, ...versionToken });
/** A role held, or no longer held, from a date: its own dated record, so each role is maintained alone (5.1). */
export const partyRoleVersionDraftSchema = z.strictObject({
  role: partyRoleSchema,
  held: z.boolean(),
  ...validFrom,
  ...versionToken,
});

const bankFields = {
  accountHolder: textSchema,
  accountNumber: textSchema,
  ifsc: textSchema,
  bankName: textSchema,
};
/**
 * A change of a party's bank details: a new version that waits for a different authorised person (POL-02.07 for a
 * supplier, GC2-6 for every other party). Changing bank details is a protected action, so it takes a fresh
 * authenticator code (access-and-approvals 3.3; PRD-SEC-001).
 */
export const bankDetailsDraftSchema = z.strictObject({
  ...bankFields,
  ...validFrom,
  ...versionToken,
  totpCode: totpCodeSchema,
});
/** Show one bank-detail version unmasked: a protected action with a fresh code and an access record (DEC-114). */
export const bankDetailsShowRequestSchema = z.strictObject({ totpCode: totpCodeSchema });

/** A brand linked to, or unlinked from, a supplier from a date (PRD-MER-021; DEC-123): never exclusive. */
export const brandSupplierLinkDraftSchema = z.strictObject({
  brandId: idSchema,
  partyId: idSchema,
  linked: z.boolean(),
  ...validFrom,
  ...versionToken,
});

// Agreements (5.2): every term a value or Unknown (null), none defaulted (POL-01.11).

export const commercialModelSchema = z.enum(['outright', 'sale-or-return', 'consignment']);
export type CommercialModel = z.infer<typeof commercialModelSchema>;

/** The ownership-transfer event (POL-01.05, POL-01.06): one of three, or another explicitly agreed event, described. */
export const ownershipEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('supplier-dispatch') }),
  z.strictObject({ kind: z.literal('receipt-and-acceptance') }),
  z.strictObject({ kind: z.literal('sale-to-customer') }),
  z.strictObject({ kind: z.literal('other'), description: textSchema }),
]);

/** Return rights (POL-01.08, POL-01.09). */
export const returnRightsSchema = z.strictObject({
  allowed: z.boolean().nullable(),
  window: z
    .discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('days'), days: z.int().positive() }),
      z.strictObject({ kind: z.literal('season-end'), date: businessDateSchema }),
    ])
    .nullable(),
  startsAt: z.enum(['dispatch', 'receipt', 'acceptance']).nullable(),
});

/** Return conditions (POL-01.10). */
export const returnConditionsSchema = z.strictObject({
  conditionTags: distinct(textSchema).nullable(),
  packagingLimits: textSchema.nullable(),
  quantityLimits: textSchema.nullable(),
  supplierApproval: z.boolean().nullable(),
  freightAndDeductions: textSchema.nullable(),
  settlement: z.enum(['credit-note', 'replacement', 'refund']).nullable(),
});

/**
 * A structured supplier term (PRD-PAY-015; DEC-123): the rate as agreed, the days and from when they count, each a
 * value or Unknown. Nothing calculates, applies or posts it; values and treatment are Accounts' and the CA's (RR-235).
 */
export const supplierTermSchema = z.strictObject({
  rate: textSchema.nullable(),
  days: z.int().nonnegative().nullable(),
  from: textSchema.nullable(),
});

/** An agreement version's terms other than margins, which are restricted (PRD-ACS-008) and kept apart. */
export const agreementTermsSchema = z.strictObject({
  commercialModel: commercialModelSchema.nullable(),
  /** The default model for new bookings of the brand (POL-01.02). */
  defaultModel: commercialModelSchema.nullable(),
  ownershipEvent: ownershipEventSchema.nullable(),
  returnRights: returnRightsSchema,
  returnConditions: returnConditionsSchema,
  // Money terms (PRD-ORG-016, POL-01.14), as agreed.
  commissions: textSchema.nullable(),
  paymentTerms: textSchema.nullable(),
  creditNoteTerms: textSchema.nullable(),
  promotionTerms: textSchema.nullable(),
  // A supplier agreement's cash-discount and interest terms (PRD-PAY-015); Unknown on a brand agreement.
  cashDiscount: supplierTermSchema,
  interest: supplierTermSchema,
});
export type AgreementTerms = z.infer<typeof agreementTermsSchema>;

/** Who the agreement is with: a brand or a supplier, fixed at creation (5.2). */
export const agreementCounterpartySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('brand'), brandId: idSchema }),
  z.strictObject({ kind: z.literal('supplier'), partyId: idSchema }),
]);

const agreementVersionFields = {
  terms: agreementTermsSchema,
  /** Margins (PRD-ORG-016), a restricted field class (PRD-ACS-008), or Unknown. */
  margins: textSchema.nullable(),
  /** The signed agreement: stored files attached to the version as evidence (S1-F06-T05; DEC-116). */
  signedAgreement: z
    .array(evidenceFileSchema)
    .refine((list) => new Set(list.map((each) => each.storedFileId)).size === list.length, {
      message: 'Each is given once',
    }),
};
export const agreementDraftSchema = z.strictObject({
  code: masterCodeSchema,
  counterparty: agreementCounterpartySchema,
  ...agreementVersionFields,
  ...validFrom,
});
export const agreementVersionDraftSchema = z.strictObject({ ...agreementVersionFields, ...validFrom, ...versionToken });

export type PartyDraft = z.infer<typeof partyDraftSchema>;
export type PartyVersionDraft = z.infer<typeof partyVersionDraftSchema>;
export type PartyRoleVersionDraft = z.infer<typeof partyRoleVersionDraftSchema>;
export type BankDetailsDraft = z.infer<typeof bankDetailsDraftSchema>;
export type BrandSupplierLinkDraft = z.infer<typeof brandSupplierLinkDraftSchema>;
export type AgreementDraft = z.infer<typeof agreementDraftSchema>;
export type AgreementVersionDraft = z.infer<typeof agreementVersionDraftSchema>;

/** The record types and action types of the parties part (access-and-approvals 4.1, 8). */
export const PARTY_TYPE = 'merchandise.party';
export const BANK_DETAILS_TYPE = 'merchandise.party_bank_details';
export const BRAND_SUPPLIER_LINK_TYPE = 'merchandise.brand_supplier_link';
export const AGREEMENT_TYPE = 'merchandise.agreement';
/** A party's bank-detail change, approved by a different authorised person (POL-02.07; GC2-6, DEC-105). */
export const BANK_DETAILS_CHANGE = 'merchandise.party_bank_details.change';
/** An agreement version, approved by a different authorised person (GC2-2, DEC-105). */
export const AGREEMENT_CHANGE = 'merchandise.agreement.change';

/** What a change answers: the record and its version, and the approval request where a rule needs one. */
export const partyChangedSchema = z.strictObject({
  recordId: idSchema,
  versionId: idSchema,
  requestId: idSchema.optional(),
});
export type PartyChanged = z.infer<typeof partyChangedSchema>;

const asOf = z.iso.datetime({ offset: true });
const versionView = {
  id: idSchema,
  validFrom: businessDateSchema,
  validTo: businessDateSchema.optional(),
  state: recordStateSchema,
  request: z.strictObject({ id: idSchema, state: approvalRequestStateSchema }).optional(),
};

/** A party as a reader sees it: bank details are always masked here; Show unmasks one version (5.5; DEC-114). */
export const partyRecordSchema = z.strictObject({
  id: idSchema,
  code: masterCodeSchema,
  versionToken: idSchema.optional(),
  versions: z.array(z.strictObject({ ...versionView, ...partyFields })),
  roles: z.array(
    z.strictObject({
      role: partyRoleSchema,
      versionToken: idSchema,
      versions: z.array(z.strictObject({ ...versionView, held: z.boolean() })),
    }),
  ),
  bankDetails: z.strictObject({
    versionToken: idSchema.optional(),
    versions: z.array(z.strictObject({ ...versionView, masked: z.literal(true) })),
  }),
});
export type PartyRecord = z.infer<typeof partyRecordSchema>;
export const partyListSchema = z.strictObject({ asOf, records: z.array(partyRecordSchema), next: idSchema.nullable() });
export const partyReadSchema = z.strictObject({ asOf, record: partyRecordSchema });

/** One bank-detail version shown unmasked, once: never kept, never repeated (code-house-rules 12.4, 12.6; DEC-114). */
export const bankDetailsShownSchema = z.strictObject({ partyId: idSchema, versionId: idSchema, ...bankFields });
export type BankDetailsShown = z.infer<typeof bankDetailsShownSchema>;

export const brandSupplierLinkRecordSchema = z.strictObject({
  id: idSchema,
  brandId: idSchema,
  partyId: idSchema,
  versionToken: idSchema,
  versions: z.array(z.strictObject({ ...versionView, linked: z.boolean() })),
});
export type BrandSupplierLinkRecord = z.infer<typeof brandSupplierLinkRecordSchema>;
export const brandSupplierLinkListSchema = z.strictObject({
  asOf,
  records: z.array(brandSupplierLinkRecordSchema),
  next: idSchema.nullable(),
});

/** Margins as a reader sees them: shown, a value or Unknown, only with the field class; otherwise masked (6). */
export const restrictedTextSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('shown'), value: textSchema.nullable() }),
  z.strictObject({ kind: z.literal('masked') }),
]);
export type RestrictedText = z.infer<typeof restrictedTextSchema>;

const agreementVersionView = z.strictObject({
  ...versionView,
  terms: agreementTermsSchema,
  margins: restrictedTextSchema,
  /** The attachments of the signed agreement, read through files-imports (imports-and-opening-data 11). */
  signedAgreement: z.array(idSchema),
});
export const agreementRecordSchema = z.strictObject({
  id: idSchema,
  code: masterCodeSchema,
  counterparty: agreementCounterpartySchema,
  versionToken: idSchema.optional(),
  versions: z.array(agreementVersionView),
});
export type AgreementRecord = z.infer<typeof agreementRecordSchema>;
export const agreementListSchema = z.strictObject({
  asOf,
  records: z.array(agreementRecordSchema),
  next: idSchema.nullable(),
});
export const agreementReadSchema = z.strictObject({ asOf, record: agreementRecordSchema });

/** Read the terms in force (5.5; PRD-ORG-016): of a brand or a supplier, on a date. */
export const termsInForceQuerySchema = z
  .strictObject({ brandId: idSchema.optional(), partyId: idSchema.optional(), date: businessDateSchema })
  .refine((query) => (query.brandId === undefined) !== (query.partyId === undefined), {
    message: 'Name a brand or a supplier, one of them',
  });
/** The agreement version in force, with its identifier, which a transaction keeps (2.2; PRD-ACP-013). */
export const termsInForceSchema = z.strictObject({
  asOf,
  agreementId: idSchema,
  code: masterCodeSchema,
  versionId: idSchema,
  validFrom: businessDateSchema,
  validTo: businessDateSchema.optional(),
  terms: agreementTermsSchema,
  margins: restrictedTextSchema,
});
export type TermsInForce = z.infer<typeof termsInForceSchema>;
