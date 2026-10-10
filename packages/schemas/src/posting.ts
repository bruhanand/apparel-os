import { z } from 'zod';
import { approvalRequestStateSchema } from './approvals.js';
import { recordStateSchema } from './access-records.js';
import { accountNatureSchema, caEvidenceViewSchema } from './books.js';
import { businessDateSchema, idSchema } from './common.js';
import { masterCodeSchema } from './organisation.js';
import { settingOriginSchema } from './settings.js';

// The posting half of `finance` · books (books-and-posting 4.1, 5, 6, 7, 9, 12, 14; module-map 4.14; S1-F09-T02):
// financial periods, posting maps with their versions and lines, and the internal ledger and trial balance. No
// period, financial year, account or map is set here: they are Accounts' and the CA's (GC4-1, GC5-1, V-10).

const textSchema = z.string().regex(/\S/);
const asOf = z.iso.datetime({ offset: true });
/** An amount in integer paise (PRD-MOD-014); signed where it is a balance, debit positive. */
const paiseSchema = z.int();

/** The record types and action type of the posting half (access-and-approvals 4.1, 8); POSTING_MAP_TYPE is books.ts's. */
export const FINANCIAL_PERIOD_TYPE = 'finance.financial_period';
/** A journal and its lines, read through the internal ledger and trial balance (12). */
export const JOURNAL_TYPE = 'finance.journal';
/** A posting map version, decided by a different authorised Accounts user with the CA's evidence (6.3; GC4-2). */
export const POSTING_MAP_CHANGE = 'finance.posting_map.change';

/** The side of a map line or a journal line (5.1, 6.1). */
export const sideSchema = z.enum(['debit', 'credit']);
export type PostingSide = z.infer<typeof sideSchema>;

/** A posting event kind, `module.effect` (7.1). */
export const eventKindSchema = z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/);
/** A component of an event kind (7.1). */
export const componentSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);

/** A financial period of a book (4.1): its code, the financial year it lies in, and its first and last day. */
export const periodDraftSchema = z.strictObject({
  code: masterCodeSchema,
  financialYear: textSchema,
  firstDay: businessDateSchema,
  lastDay: businessDateSchema,
});
export type PeriodDraft = z.infer<typeof periodDraftSchema>;
/** A period's state (4.1; design-language 7): Open here; Locked and Reopened come with S1-F09-T03. */
export const periodStateSchema = z.enum(['Open']);
export const periodRecordSchema = z.strictObject({
  id: idSchema,
  bookId: idSchema,
  code: z.string(),
  financialYear: z.string(),
  firstDay: businessDateSchema,
  lastDay: businessDateSchema,
  state: periodStateSchema,
});
export type PeriodRecord = z.infer<typeof periodRecordSchema>;
export const periodListSchema = z.strictObject({ asOf, records: z.array(periodRecordSchema) });
export const periodDefinedSchema = z.strictObject({ periodId: idSchema });

/** A line of a map version (6.1): a component, a side, an account of the map's book and the dimensions it requires. */
export const mapLineDraftSchema = z.strictObject({
  component: componentSchema,
  side: sideSchema,
  accountId: idSchema,
  requiresStore: z.boolean(),
  requiresBrand: z.boolean(),
});
export type MapLineDraft = z.infer<typeof mapLineDraftSchema>;
/** A new version of a book's posting map for one event kind (6.1 to 6.3), with where it came from (12.14). */
export const postingMapDraftSchema = z.strictObject({
  bookId: idSchema,
  eventKind: eventKindSchema,
  origin: settingOriginSchema,
  validFrom: businessDateSchema,
  versionToken: idSchema.optional(),
  lines: z.array(mapLineDraftSchema).min(1),
});
export type PostingMapDraft = z.infer<typeof postingMapDraftSchema>;

export const mapLineViewSchema = z.strictObject({
  component: z.string(),
  side: sideSchema,
  accountId: idSchema,
  accountCode: z.string(),
  requiresStore: z.boolean(),
  requiresBrand: z.boolean(),
});
export const postingMapVersionViewSchema = z.strictObject({
  id: idSchema,
  validFrom: businessDateSchema,
  validTo: businessDateSchema.optional(),
  state: recordStateSchema,
  request: z.strictObject({ id: idSchema, state: approvalRequestStateSchema }).optional(),
  caEvidence: z.array(caEvidenceViewSchema),
  origin: settingOriginSchema,
  lines: z.array(mapLineViewSchema),
});
export const postingMapRecordSchema = z.strictObject({
  id: idSchema,
  bookId: idSchema,
  eventKind: z.string(),
  /** The components the event kind declares (7.1); empty for a kind no module declares in this build. */
  components: z.array(z.string()),
  versionToken: idSchema.optional(),
  /** The approved version in force on the date asked, if any (6.2 condition 1). */
  inForceOn: idSchema.optional(),
  versions: z.array(postingMapVersionViewSchema),
});
export type PostingMapRecord = z.infer<typeof postingMapRecordSchema>;
export const postingMapQuerySchema = z.strictObject({ on: businessDateSchema });
export const eventKindViewSchema = z.strictObject({
  kind: z.string(),
  components: z.array(z.string()),
  reversalKind: z.string(),
});
export const postingMapListSchema = z.strictObject({
  asOf,
  on: businessDateSchema,
  /** The event kinds declared in this build, each with its components (7.1). */
  eventKinds: z.array(eventKindViewSchema),
  records: z.array(postingMapRecordSchema),
});

/** The trial balance of a book for one period (12; PRD-MOD-003, PRD-PRF-004, POL-11.01). */
export const trialBalanceQuerySchema = z.strictObject({ periodId: idSchema });
export const trialBalanceRowSchema = z.strictObject({
  accountId: idSchema,
  code: z.string(),
  name: z.string(),
  nature: accountNatureSchema,
  /** Balances are signed, debit positive. */
  openingPaise: paiseSchema,
  debitPaise: paiseSchema,
  creditPaise: paiseSchema,
  closingPaise: paiseSchema,
});
export const trialBalanceSchema = z.strictObject({
  asOf,
  /** The internal ledger, not the official book: Tally stays KDPS's official book (POL-11.01). */
  ledger: z.literal('internal'),
  bookId: idSchema,
  period: z.strictObject({ id: idSchema, code: z.string(), firstDay: businessDateSchema, lastDay: businessDateSchema }),
  /** True when the reader's scope covers only part of the book (12). */
  partial: z.boolean(),
  rows: z.array(trialBalanceRowSchema),
  totals: z.strictObject({ debitPaise: paiseSchema, creditPaise: paiseSchema }),
});
export type TrialBalance = z.infer<typeof trialBalanceSchema>;

/** The ledger of one account over a date range (12; PRD-LED-001, PRD-LED-004). */
export const ledgerQuerySchema = z.strictObject({ from: businessDateSchema, to: businessDateSchema });
export const ledgerLineSchema = z.strictObject({
  lineId: idSchema,
  journalId: idSchema,
  journalNumber: z.string(),
  accountingDate: businessDateSchema,
  eventKind: z.string(),
  side: sideSchema,
  amountPaise: paiseSchema,
  businessUnitId: idSchema,
  storeId: idSchema.optional(),
  brandId: idSchema.optional(),
  reversesJournalId: idSchema.optional(),
  source: z.strictObject({ module: z.string(), recordType: z.string(), recordId: idSchema }),
});
export const ledgerSchema = z.strictObject({
  asOf,
  ledger: z.literal('internal'),
  accountId: idSchema,
  bookId: idSchema,
  from: businessDateSchema,
  to: businessDateSchema,
  partial: z.boolean(),
  openingPaise: paiseSchema,
  closingPaise: paiseSchema,
  lines: z.array(ledgerLineSchema),
});
export type Ledger = z.infer<typeof ledgerSchema>;
