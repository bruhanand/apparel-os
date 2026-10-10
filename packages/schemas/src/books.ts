import { z } from 'zod';
import { approvalRequestStateSchema } from './approvals.js';
import { recordStateSchema } from './access-records.js';
import { businessDateSchema, idSchema } from './common.js';
import { evidenceFileSchema } from './files.js';
import { masterCodeSchema } from './organisation.js';
import { settingOriginSchema } from './settings.js';

// The books part of `finance` (books-and-posting 2, 3, 6.3, 9.1; module-map 4.14; S1-F09-T01): each book's cost
// setting and voucher-model setting, effective-dated with no default (PRD-LED-014, PRD-LED-015, DEC-004, DEC-031;
// MM-12, DEC-105), the chart of accounts (PRD-LED-001), and the CA's approval evidence that lets a version take effect
// (POL-09.01; DEC-112, GC4-2). No formula, pool mode, voucher model or account is set here: they are KDPS's, Accounts'
// and the CA's (V-08, V-09, V-10, V-46; SL-1). API only in stage 1 (DEC-116).

const textSchema = z.string().regex(/\S/);
const asOf = z.iso.datetime({ offset: true });
const validFrom = { validFrom: businessDateSchema };
/** The version token of the record changed (code-house-rules 12.7); none for a record not yet versioned. */
const versionToken = { versionToken: idSchema.optional() };

/** The record types and action types of the books part (access-and-approvals 4.1, 8). */
export const ACCOUNT_TYPE = 'finance.account';
export const BOOK_SETTING_TYPE = 'finance.book_setting';
export const CA_APPROVAL_EVIDENCE_TYPE = 'finance.ca_approval_evidence';
/** A book's posting map for one event kind (books-and-posting 6; S1-F09-T02). */
export const POSTING_MAP_TYPE = 'finance.posting_map';
/** An account version, decided by a different authorised Accounts user (books-and-posting 6.3; POL-09.01; GC4-2). */
export const ACCOUNT_CHANGE = 'finance.account.change';
/** A cost-setting or voucher-model-setting version, decided the same way (6.3; POL-09.01; GC4-2). */
export const BOOK_SETTING_CHANGE = 'finance.book_setting.change';

/** An account's nature, fixed at creation (3.1): the trial balance and the reports group by it. */
export const accountNatureSchema = z.enum(['asset', 'liability', 'equity', 'income', 'expense']);
export type AccountNature = z.infer<typeof accountNatureSchema>;

/** The cost formula (PRD-LED-014, DEC-004), as the stock ledger's pools name it (stock-ledger 7.1). */
export const costFormulaSchema = z.enum(['moving-average', 'fifo']);
export type CostFormula = z.infer<typeof costFormulaSchema>;
/** The cost-pool mode: one pool per SKU across the book, or one per SKU at each Site (PRD-LED-015, DEC-031). */
export const costPoolModeSchema = z.enum(['book', 'site']);
export type CostPoolMode = z.infer<typeof costPoolModeSchema>;
/** The Tally voucher model: vouchers with items, or without items (2.3; MM-12, DEC-105). */
export const voucherModelSchema = z.enum(['with-items', 'without-items']);
export type VoucherModel = z.infer<typeof voucherModelSchema>;
/** The two kinds of book setting (13.1). */
export const bookSettingKindSchema = z.enum(['cost', 'voucher-model']);
export type BookSettingKind = z.infer<typeof bookSettingKindSchema>;

/**
 * A new account in a book, with its first version (3.1): its code unique in the book, its nature fixed, and where its
 * value came from (code-house-rules 12.14; RR-487, product owner, 10 Oct 2026), with no default.
 */
export const accountDraftSchema = z.strictObject({
  bookId: idSchema,
  code: masterCodeSchema,
  nature: accountNatureSchema,
  name: textSchema,
  origin: settingOriginSchema,
  ...validFrom,
});
/**
 * A later version of an account: its name, and whether it is retired from the start (3.1), with its origin (RR-487).
 * The nature never changes.
 */
export const accountVersionDraftSchema = z.strictObject({
  name: textSchema,
  retired: z.boolean(),
  origin: settingOriginSchema,
  ...validFrom,
  ...versionToken,
});
export type AccountDraft = z.infer<typeof accountDraftSchema>;
export type AccountVersionDraft = z.infer<typeof accountVersionDraftSchema>;

/**
 * A new version of a book's cost setting or voucher-model setting (2.2, 2.3), with where its value came from
 * (code-house-rules 12.14). Neither has a default.
 */
export const bookSettingDraftSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('cost'),
    formula: costFormulaSchema,
    poolMode: costPoolModeSchema,
    origin: settingOriginSchema,
    ...validFrom,
    ...versionToken,
  }),
  z.strictObject({
    kind: z.literal('voucher-model'),
    voucherModel: voucherModelSchema,
    origin: settingOriginSchema,
    ...validFrom,
    ...versionToken,
  }),
]);
export type BookSettingDraft = z.infer<typeof bookSettingDraftSchema>;

/**
 * A version the CA's approval evidence covers: an account version, a book-setting version or a posting map version
 * (6.3; S1-F09-T02).
 */
export const coveredVersionSchema = z.strictObject({
  recordType: z.enum([ACCOUNT_TYPE, BOOK_SETTING_TYPE, POSTING_MAP_TYPE]),
  versionId: idSchema,
});
export type CoveredVersion = z.infer<typeof coveredVersionSchema>;

/**
 * The CA's approval evidence (6.3; POL-09.01; GC4-2): a stored file attached to each version it covers (S1-F06-T05), or
 * a reference naming what the evidence is, who gave it, its date and where it is kept. One piece may cover a named set
 * of versions, and says which. The same for every version of `finance`, a tax-rule version's included (RR-486).
 */
export const caEvidenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('file'), file: evidenceFileSchema }),
  z.strictObject({
    kind: z.literal('reference'),
    what: textSchema,
    givenBy: textSchema,
    givenOn: businessDateSchema,
    keptAt: textSchema,
  }),
]);
export const caEvidenceDraftSchema = z.strictObject({
  versions: z
    .array(coveredVersionSchema)
    .min(1)
    .refine((list) => new Set(list.map((each) => each.versionId)).size === list.length, {
      message: 'Each version is named once',
    }),
  evidence: caEvidenceSchema,
});
export type CaEvidenceDraft = z.infer<typeof caEvidenceDraftSchema>;

/** What a change answers: the record and its version, and its approval request. */
export const financeChangedSchema = z.strictObject({
  recordId: idSchema,
  versionId: idSchema,
  requestId: idSchema.optional(),
});
export type FinanceChanged = z.infer<typeof financeChangedSchema>;
export const caEvidenceRecordedSchema = z.strictObject({ evidenceId: idSchema });
export type CaEvidenceRecorded = z.infer<typeof caEvidenceRecordedSchema>;

/** The CA's evidence of a version as a reader sees it: the file's attachment to this version, or the reference. */
export const caEvidenceViewSchema = z.discriminatedUnion('kind', [
  z.strictObject({ id: idSchema, kind: z.literal('file'), attachmentId: idSchema }),
  z.strictObject({
    id: idSchema,
    kind: z.literal('reference'),
    what: z.string(),
    givenBy: z.string(),
    givenOn: businessDateSchema,
    keptAt: z.string(),
  }),
]);
export type CaEvidenceView = z.infer<typeof caEvidenceViewSchema>;

const versionView = {
  id: idSchema,
  validFrom: businessDateSchema,
  validTo: businessDateSchema.optional(),
  state: recordStateSchema,
  request: z.strictObject({ id: idSchema, state: approvalRequestStateSchema }).optional(),
  caEvidence: z.array(caEvidenceViewSchema),
};

export const accountRecordSchema = z.strictObject({
  id: idSchema,
  bookId: idSchema,
  code: masterCodeSchema,
  nature: accountNatureSchema,
  versionToken: idSchema.optional(),
  versions: z.array(
    z.strictObject({ ...versionView, name: z.string(), retired: z.boolean(), origin: settingOriginSchema }),
  ),
});
export type AccountRecord = z.infer<typeof accountRecordSchema>;
export const accountListSchema = z.strictObject({ asOf, records: z.array(accountRecordSchema) });
export const accountReadSchema = z.strictObject({ asOf, record: accountRecordSchema });

const settingVersionView = z.strictObject({
  ...versionView,
  origin: settingOriginSchema,
  formula: costFormulaSchema.optional(),
  poolMode: costPoolModeSchema.optional(),
  voucherModel: voucherModelSchema.optional(),
});
export const bookSettingRecordSchema = z.strictObject({
  id: idSchema,
  bookId: idSchema,
  kind: bookSettingKindSchema,
  versionToken: idSchema.optional(),
  versions: z.array(settingVersionView),
});
export type BookSettingRecord = z.infer<typeof bookSettingRecordSchema>;
export const bookSettingListSchema = z.strictObject({ asOf, records: z.array(bookSettingRecordSchema) });

/** Read the cost setting of a book on a date (stock-ledger 13.1): its version in force, or not set (12.14). */
export const costSettingQuerySchema = z.strictObject({ date: businessDateSchema });
export const costSettingInForceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('set'),
    versionId: idSchema,
    formula: costFormulaSchema,
    poolMode: costPoolModeSchema,
    origin: settingOriginSchema,
    validFrom: businessDateSchema,
    validTo: businessDateSchema.optional(),
  }),
  z.strictObject({ kind: z.literal('not-set') }),
]);
export type CostSettingInForce = z.infer<typeof costSettingInForceSchema>;
export const costSettingReadSchema = z.strictObject({ asOf, bookId: idSchema, setting: costSettingInForceSchema });
