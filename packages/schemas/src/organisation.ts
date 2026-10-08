import { z } from 'zod';
import { businessDateSchema, idSchema } from './common.js';
import { recordStateSchema } from './access-records.js';
import { approvalRequestStateSchema } from './approvals.js';

// The organisation structure the first organisation ticket builds (structure-and-masters 2, 3.1 to 3.3, 3.6 to 3.8,
// 8; module-map 4.11; S1-F02-T01): geography, legal entities, tax registrations, accounting books, Sites, Stores and
// groupings. Each master is prepared as a draft version for a different authorised person to approve (2.3; GC2-2,
// DEC-105; PRD-ACS-006); no field has a default (2.4).

/**
 * A code the Organisation chooses: not blank, kept as text and compared exactly, so leading zeros stay
 * (structure-and-masters 2.1; PRD-MOD-008). Unique in its scope and never changed or reused.
 */
export const masterCodeSchema = z.string().regex(/\S/);
/** A name or other text that is not blank. */
const textSchema = z.string().regex(/\S/);
/** A list of texts, each given once. */
const distinctTexts = z
  .array(textSchema)
  .refine((list) => new Set(list).size === list.length, { message: 'Each is given once' });
const distinctIds = z
  .array(idSchema)
  .refine((list) => new Set(list).size === list.length, { message: 'Each is given once' });

/**
 * The masters of the organisation structure built so far (structure-and-masters 3.1, 6.1; S1-F02-T01). The one list
 * of kinds the server, the web app and the route table all read.
 */
export const masterKinds = [
  'country',
  'state',
  'city',
  'area',
  'legal_entity',
  'tax_registration',
  'accounting_book',
  'site',
  'store',
  'grouping',
] as const;
export type MasterKind = (typeof masterKinds)[number];

/** The record type a master is authorised, audited and approved on (access-and-approvals 4.1). */
export const masterRecordType = <K extends MasterKind>(kind: K) => `organisation.${kind}` as const;

/** The action type of a change to a master: one approval rule each (access-and-approvals 8). */
export const masterActionType = <K extends MasterKind>(kind: K) => `organisation.${kind}.change` as const;

/**
 * The routes of each master (code-house-rules 12.1, 12.2): its paged list, its one-record read, a new record and a new
 * version; and the key of its list in the master lists read model.
 */
export const masterRoutes = {
  country: {
    list: 'listCountries',
    read: 'readCountry',
    prepare: 'prepareCountry',
    version: 'prepareCountryVersion',
    lists: 'countries',
  },
  state: {
    list: 'listStates',
    read: 'readState',
    prepare: 'prepareState',
    version: 'prepareStateVersion',
    lists: 'states',
  },
  city: {
    list: 'listCities',
    read: 'readCity',
    prepare: 'prepareCity',
    version: 'prepareCityVersion',
    lists: 'cities',
  },
  area: { list: 'listAreas', read: 'readArea', prepare: 'prepareArea', version: 'prepareAreaVersion', lists: 'areas' },
  legal_entity: {
    list: 'listLegalEntities',
    read: 'readLegalEntity',
    prepare: 'prepareLegalEntity',
    version: 'prepareLegalEntityVersion',
    lists: 'legalEntities',
  },
  tax_registration: {
    list: 'listTaxRegistrations',
    read: 'readTaxRegistration',
    prepare: 'prepareTaxRegistration',
    version: 'prepareTaxRegistrationVersion',
    lists: 'taxRegistrations',
  },
  accounting_book: {
    list: 'listAccountingBooks',
    read: 'readAccountingBook',
    prepare: 'prepareAccountingBook',
    version: 'prepareAccountingBookVersion',
    lists: 'accountingBooks',
  },
  site: { list: 'listSites', read: 'readSite', prepare: 'prepareSite', version: 'prepareSiteVersion', lists: 'sites' },
  store: {
    list: 'listStores',
    read: 'readStore',
    prepare: 'prepareStore',
    version: 'prepareStoreVersion',
    lists: 'stores',
  },
  grouping: {
    list: 'listGroupings',
    read: 'readGrouping',
    prepare: 'prepareGrouping',
    version: 'prepareGroupingVersion',
    lists: 'groupings',
  },
} as const satisfies Record<
  MasterKind,
  { list: string; read: string; prepare: string; version: string; lists: string }
>;

/**
 * The largest page of a master list: a technical cap the builders set (code-house-rules 12.1 "Reads"), not a KDPS
 * value. A longer list is read page by page with the cursor.
 */
export const MASTER_PAGE_CAP = 100;

/**
 * A page of a master list (code-house-rules 12.1): records in code order, then by identifier, starting after the
 * record `after` names, at most `limit` of them (the cap when left out). The cursor is the last record's identifier,
 * opaque to the screen, which only hands back the `next` it was given.
 */
export const masterPageQuerySchema = z.strictObject({
  after: idSchema.optional(),
  limit: z
    .string()
    .regex(/^[1-9]\d*$/)
    .refine((limit) => Number(limit) <= MASTER_PAGE_CAP, { message: `At most ${String(MASTER_PAGE_CAP)}` })
    .optional(),
});
export type MasterPageQuery = z.infer<typeof masterPageQuerySchema>;

/** The first day a version is in force: today or later, never a past date (structure-and-masters 2.2; GC2-7). */
const validFrom = businessDateSchema;

/** The physical kinds of a Site (PRD-ORG-010; GC2-3, DEC-105). */
export const physicalKindSchema = z.enum([
  'head-office',
  'regional-office',
  'central-warehouse',
  'regional-warehouse',
  'retail-site',
]);
export type PhysicalKind = z.infer<typeof physicalKindSchema>;
/** Store formats: MBO, EBO, shop-in-shop and kiosk (PRD-ORG-010). */
export const storeFormatSchema = z.enum(['mbo', 'ebo', 'shop-in-shop', 'kiosk']);
export type StoreFormat = z.infer<typeof storeFormatSchema>;
/** Operating models (PRD-ORG-010). */
export const operatingModelSchema = z.enum(['company-owned', 'franchise-owned', 'franchise-owned-company-operated']);
export type OperatingModel = z.infer<typeof operatingModelSchema>;
/** The states of a Site or Store (structure-and-masters 3.7; DM-4, DEC-105). A new one is Setting up. */
export const placeStatusSchema = z.enum(['Setting up', 'Active', 'Closing', 'Closed']);
export type PlaceStatus = z.infer<typeof placeStatusSchema>;
/** The kinds of a grouping built so far (structure-and-masters 3.6; PRD-ORG-007). */
export const groupingKindSchema = z.enum(['region', 'cluster']);
export type GroupingKind = z.infer<typeof groupingKindSchema>;

/** Opening and closing dates: each Unknown until given (structure-and-masters 2.4), the closing never first. */
const placeDates = {
  openingDate: businessDateSchema.optional(),
  closingDate: businessDateSchema.optional(),
};
const datesInOrder = (value: { openingDate?: string | undefined; closingDate?: string | undefined }) =>
  value.openingDate === undefined || value.closingDate === undefined || value.closingDate >= value.openingDate;
const DATES_IN_ORDER = { message: 'A closing date is never before the opening date', path: ['closingDate'] };

// The fields each master's versions hold (structure-and-masters 3.1).
const nameFields = { name: textSchema };
const legalEntityFields = { legalName: textSchema };
const taxRegistrationFields = {
  /** Kept as text and compared exactly (POL-10.06). */
  registrationNumber: textSchema,
  stateId: idSchema,
  /** The registration's own validity: its first day, and the day after its last, absent while open-ended. */
  validityFrom: businessDateSchema,
  validityTo: businessDateSchema.optional(),
};
const validityInOrder = (value: { validityFrom: string; validityTo?: string | undefined }) =>
  value.validityTo === undefined || value.validityTo > value.validityFrom;
const VALIDITY_IN_ORDER = { message: 'A validity ends after it starts', path: ['validityTo'] };
const siteFields = {
  name: textSchema,
  physicalKind: physicalKindSchema,
  areaId: idSchema,
  addresses: distinctTexts,
  aliases: distinctTexts,
  ...placeDates,
};
const storeFields = {
  name: textSchema,
  format: storeFormatSchema,
  operatingModel: operatingModelSchema,
  /** The Site the Store is at while the version is in force (structure-and-masters 3.3; PRD-ORG-021). */
  siteId: idSchema,
  aliases: distinctTexts,
  ...placeDates,
};
const groupingFields = { name: textSchema, storeIds: distinctIds };

// Drafts: a new master with its first version, or a new version of one. A field fixed at creation is only in the
// first (structure-and-masters 3.1).
export const countryDraftSchema = z.strictObject({ code: masterCodeSchema, ...nameFields, validFrom });
export const stateDraftSchema = z.strictObject({
  countryId: idSchema,
  code: masterCodeSchema,
  ...nameFields,
  validFrom,
});
export const cityDraftSchema = z.strictObject({ stateId: idSchema, code: masterCodeSchema, ...nameFields, validFrom });
export const areaDraftSchema = z.strictObject({ cityId: idSchema, code: masterCodeSchema, ...nameFields, validFrom });
export const nameVersionDraftSchema = z.strictObject({ ...nameFields, validFrom });
export const legalEntityDraftSchema = z.strictObject({ code: masterCodeSchema, ...legalEntityFields, validFrom });
export const legalEntityVersionDraftSchema = z.strictObject({ ...legalEntityFields, validFrom });
export const taxRegistrationDraftSchema = z
  .strictObject({ code: masterCodeSchema, legalEntityId: idSchema, ...taxRegistrationFields, validFrom })
  .refine(validityInOrder, VALIDITY_IN_ORDER);
export const taxRegistrationVersionDraftSchema = z
  .strictObject({ ...taxRegistrationFields, validFrom })
  .refine(validityInOrder, VALIDITY_IN_ORDER);
export const accountingBookDraftSchema = z.strictObject({
  code: masterCodeSchema,
  legalEntityId: idSchema,
  ...nameFields,
  validFrom,
});
export const siteDraftSchema = z
  .strictObject({ code: masterCodeSchema, ...siteFields, validFrom })
  .refine(datesInOrder, DATES_IN_ORDER);
export const siteVersionDraftSchema = z.strictObject({ ...siteFields, validFrom }).refine(datesInOrder, DATES_IN_ORDER);
export const storeDraftSchema = z
  .strictObject({ code: masterCodeSchema, ...storeFields, validFrom })
  .refine(datesInOrder, DATES_IN_ORDER);
export const storeVersionDraftSchema = z
  .strictObject({ ...storeFields, validFrom })
  .refine(datesInOrder, DATES_IN_ORDER);
export const groupingDraftSchema = z.strictObject({
  code: masterCodeSchema,
  kind: groupingKindSchema,
  ...groupingFields,
  validFrom,
});
export const groupingVersionDraftSchema = z.strictObject({ ...groupingFields, validFrom });

export type CountryDraft = z.infer<typeof countryDraftSchema>;
export type StateDraft = z.infer<typeof stateDraftSchema>;
export type CityDraft = z.infer<typeof cityDraftSchema>;
export type AreaDraft = z.infer<typeof areaDraftSchema>;
export type NameVersionDraft = z.infer<typeof nameVersionDraftSchema>;
export type LegalEntityDraft = z.infer<typeof legalEntityDraftSchema>;
export type LegalEntityVersionDraft = z.infer<typeof legalEntityVersionDraftSchema>;
export type TaxRegistrationDraft = z.infer<typeof taxRegistrationDraftSchema>;
export type TaxRegistrationVersionDraft = z.infer<typeof taxRegistrationVersionDraftSchema>;
export type AccountingBookDraft = z.infer<typeof accountingBookDraftSchema>;
export type SiteDraft = z.infer<typeof siteDraftSchema>;
export type SiteVersionDraft = z.infer<typeof siteVersionDraftSchema>;
export type StoreDraft = z.infer<typeof storeDraftSchema>;
export type StoreVersionDraft = z.infer<typeof storeVersionDraftSchema>;
export type GroupingDraft = z.infer<typeof groupingDraftSchema>;
export type GroupingVersionDraft = z.infer<typeof groupingVersionDraftSchema>;

/** What preparing a master or a version answers: the record, its draft version and the approval request. */
export const masterPreparedSchema = z.strictObject({ recordId: idSchema, versionId: idSchema, requestId: idSchema });
export type MasterPrepared = z.infer<typeof masterPreparedSchema>;

/** What every version shows: its dates, half-open, its state and its latest approval request (code-house-rules 7.3). */
const versionView = {
  id: idSchema,
  validFrom: businessDateSchema,
  validTo: businessDateSchema.optional(),
  state: recordStateSchema,
  request: z.strictObject({ id: idSchema, state: approvalRequestStateSchema }).optional(),
};
const asOf = z.iso.datetime({ offset: true });

// The fields of each master's versions as the screens read them: the drafts' fields, with the status of a Site or Store.
const siteVersionFields = { ...siteFields, status: placeStatusSchema };
const storeVersionFields = { ...storeFields, status: placeStatusSchema };

function masterRecord<const Fixed extends z.ZodRawShape, const Fields extends z.ZodRawShape>(
  fixed: Fixed,
  fields: Fields,
) {
  return z.strictObject({
    id: idSchema,
    code: masterCodeSchema,
    ...fixed,
    versions: z.array(z.strictObject({ ...versionView, ...fields })),
  });
}

/** A page of a master's records, and where the next page starts, null on the last (code-house-rules 12.1). */
const pageOf = <Record extends z.ZodType>(record: Record) =>
  z.strictObject({ asOf, records: z.array(record), next: idSchema.nullable() });
/** One master's record read on its own, as the approval panel shows the version it binds to. */
const readOf = <Record extends z.ZodType>(record: Record) => z.strictObject({ asOf, record });

/**
 * Each master with every version, newest first, and the state each shows (structure-and-masters 8: version history;
 * design-language 7). The screen shows the version in force on a chosen date from them.
 */
export const countryRecordSchema = masterRecord({}, nameFields);
export const stateRecordSchema = masterRecord({ countryId: idSchema }, nameFields);
export const cityRecordSchema = masterRecord({ stateId: idSchema }, nameFields);
export const areaRecordSchema = masterRecord({ cityId: idSchema }, nameFields);
export const legalEntityRecordSchema = masterRecord({}, legalEntityFields);
export const taxRegistrationRecordSchema = masterRecord({ legalEntityId: idSchema }, taxRegistrationFields);
export const accountingBookRecordSchema = masterRecord({ legalEntityId: idSchema }, nameFields);
export const siteRecordSchema = masterRecord({}, siteVersionFields);
export const storeRecordSchema = masterRecord({}, storeVersionFields);
export const groupingRecordSchema = masterRecord({ kind: groupingKindSchema }, groupingFields);

export const countryListSchema = pageOf(countryRecordSchema);
export const stateListSchema = pageOf(stateRecordSchema);
export const cityListSchema = pageOf(cityRecordSchema);
export const areaListSchema = pageOf(areaRecordSchema);
export const legalEntityListSchema = pageOf(legalEntityRecordSchema);
export const taxRegistrationListSchema = pageOf(taxRegistrationRecordSchema);
export const accountingBookListSchema = pageOf(accountingBookRecordSchema);
export const siteListSchema = pageOf(siteRecordSchema);
export const storeListSchema = pageOf(storeRecordSchema);
export const groupingListSchema = pageOf(groupingRecordSchema);

export const countryReadSchema = readOf(countryRecordSchema);
export const stateReadSchema = readOf(stateRecordSchema);
export const cityReadSchema = readOf(cityRecordSchema);
export const areaReadSchema = readOf(areaRecordSchema);
export const legalEntityReadSchema = readOf(legalEntityRecordSchema);
export const taxRegistrationReadSchema = readOf(taxRegistrationRecordSchema);
export const accountingBookReadSchema = readOf(accountingBookRecordSchema);
export const siteReadSchema = readOf(siteRecordSchema);
export const storeReadSchema = readOf(storeRecordSchema);
export const groupingReadSchema = readOf(groupingRecordSchema);

export type CountryList = z.infer<typeof countryListSchema>;
export type StateList = z.infer<typeof stateListSchema>;
export type CityList = z.infer<typeof cityListSchema>;
export type AreaList = z.infer<typeof areaListSchema>;
export type LegalEntityList = z.infer<typeof legalEntityListSchema>;
export type TaxRegistrationList = z.infer<typeof taxRegistrationListSchema>;
export type AccountingBookList = z.infer<typeof accountingBookListSchema>;
export type SiteList = z.infer<typeof siteListSchema>;
export type StoreList = z.infer<typeof storeListSchema>;
export type GroupingList = z.infer<typeof groupingListSchema>;
export type SiteRecord = SiteList['records'][number];
export type StoreRecord = StoreList['records'][number];

/** Each master kind's record as its list and its read carry it. */
export interface MasterRecords {
  country: z.infer<typeof countryRecordSchema>;
  state: z.infer<typeof stateRecordSchema>;
  city: z.infer<typeof cityRecordSchema>;
  area: z.infer<typeof areaRecordSchema>;
  legal_entity: z.infer<typeof legalEntityRecordSchema>;
  tax_registration: z.infer<typeof taxRegistrationRecordSchema>;
  accounting_book: z.infer<typeof accountingBookRecordSchema>;
  site: z.infer<typeof siteRecordSchema>;
  store: z.infer<typeof storeRecordSchema>;
  grouping: z.infer<typeof groupingRecordSchema>;
}

/** One master as of a date: its version in force then (structure-and-masters 3.8). */
function inForce<const Fixed extends z.ZodRawShape, const Fields extends z.ZodRawShape>(fixed: Fixed, fields: Fields) {
  return z.array(z.strictObject({ id: idSchema, code: masterCodeSchema, versionId: idSchema, ...fixed, ...fields }));
}

/**
 * The master lists read model (module-map 4.11; phases.md stage 1 reports): every master with a version in force on
 * the date, as of the time read (PRD-PRF-004). It shows every master the reader may view: a list of a record type the
 * reader may not view is left out and its type named in `notShown` (access-and-approvals 7.1; module-map section 3,
 * rule 5). It needs no permission of its own (product owner, 8 Oct 2026).
 */
export const masterListsSchema = z.strictObject({
  date: businessDateSchema,
  asOf,
  notShown: z.array(z.string().min(1)),
  countries: inForce({}, nameFields),
  states: inForce({ countryId: idSchema }, nameFields),
  cities: inForce({ stateId: idSchema }, nameFields),
  areas: inForce({ cityId: idSchema }, nameFields),
  legalEntities: inForce({}, legalEntityFields),
  taxRegistrations: inForce({ legalEntityId: idSchema }, taxRegistrationFields),
  accountingBooks: inForce({ legalEntityId: idSchema }, nameFields),
  sites: inForce({}, siteVersionFields),
  stores: inForce({}, storeVersionFields),
  groupings: inForce({ kind: groupingKindSchema }, groupingFields),
});
export type MasterLists = z.infer<typeof masterListsSchema>;

/** The query of the master lists: the business date they are read as of. */
export const masterListsQuerySchema = z.strictObject({ date: businessDateSchema });
