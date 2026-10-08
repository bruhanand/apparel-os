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
 * The masters of the organisation structure built so far (structure-and-masters 3.1, 6.1; S1-F02-T01, S1-F02-T02). The
 * one list of kinds the server, the web app and the route table all read. A business unit's mapping and a Store's
 * default warehouse are dated records whose identity is another master's: the unit's and the Store's (3.4, 3.6), so
 * they have no record of their own to create, only versions.
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
  'business_unit',
  'business_unit_mapping',
  'location',
  'store_default_warehouse',
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
  business_unit: {
    list: 'listBusinessUnits',
    read: 'readBusinessUnit',
    prepare: 'prepareBusinessUnit',
    version: 'prepareBusinessUnitVersion',
    lists: 'businessUnits',
  },
  business_unit_mapping: {
    list: 'listBusinessUnitMappings',
    read: 'readBusinessUnitMapping',
    prepare: null,
    version: 'prepareBusinessUnitMappingVersion',
    lists: 'businessUnitMappings',
  },
  location: {
    list: 'listLocations',
    read: 'readLocation',
    prepare: 'prepareLocation',
    version: 'prepareLocationVersion',
    lists: 'locations',
  },
  store_default_warehouse: {
    list: 'listStoreDefaultWarehouses',
    read: 'readStoreDefaultWarehouse',
    prepare: null,
    version: 'prepareStoreDefaultWarehouseVersion',
    lists: 'storeDefaultWarehouses',
  },
} as const satisfies Record<
  MasterKind,
  { list: string; read: string; prepare: string | null; version: string; lists: string }
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

// Business units, their mappings, locations and default warehouses (structure-and-masters 3.3 to 3.6; S1-F02-T02).

/** The four kinds of business unit the PRD names (PRD-ORG-004, PRD-ORG-006); no other until the PRD names one. */
export const businessUnitKindSchema = z.enum(['whole-store', 'brand-counter', 'warehouse', 'office']);
export type BusinessUnitKind = z.infer<typeof businessUnitKindSchema>;
/** The kinds that belong to a Store (structure-and-masters 3.3). */
export const STORE_UNIT_KINDS: readonly BusinessUnitKind[] = ['whole-store', 'brand-counter'];
const storeForStoreKinds = (value: { kind: BusinessUnitKind; storeId?: string | undefined }) =>
  STORE_UNIT_KINDS.includes(value.kind) === (value.storeId !== undefined);
const STORE_FOR_STORE_KINDS = {
  message: 'A whole-store or brand-counter unit names its Store; a warehouse or office unit names none',
  path: ['storeId'],
};

/**
 * A business unit's mapping: one legal entity, one tax registration and one accounting book, never inferred from the
 * Site (structure-and-masters 3.4; PRD-ORG-005, POL-10.01).
 */
const mappingFields = { legalEntityId: idSchema, taxRegistrationId: idSchema, accountingBookId: idSchema };
const businessUnitFields = { name: textSchema };

/** The kinds of internal stock location (PRD-ORG-012). */
export const locationKindSchema = z.enum([
  'floor',
  'backstore',
  'zone',
  'rack',
  'bin',
  'fixture',
  'display',
  'alteration',
]);
export type LocationKind = z.infer<typeof locationKindSchema>;
/** The kinds that may nest under a parent location (structure-and-masters 3.5). */
export const NESTING_LOCATION_KINDS: readonly LocationKind[] = ['zone', 'rack', 'bin'];
const locationFields = { name: textSchema, kind: locationKindSchema, parentLocationId: idSchema.optional() };
const parentOnlyWhenNesting = (value: { kind: LocationKind; parentLocationId?: string | undefined }) =>
  value.parentLocationId === undefined || NESTING_LOCATION_KINDS.includes(value.kind);
const PARENT_ONLY_WHEN_NESTING = {
  message: 'Only a zone, rack or bin nests under a parent',
  path: ['parentLocationId'],
};

/**
 * A new business unit: its Site, kind and Store fixed (3.3), its name, and its first mapping version, prepared with it
 * and approved with it (3.4; domain-model invariant 8).
 */
export const businessUnitDraftSchema = z
  .strictObject({
    code: masterCodeSchema,
    siteId: idSchema,
    kind: businessUnitKindSchema,
    storeId: idSchema.optional(),
    ...businessUnitFields,
    ...mappingFields,
    validFrom,
  })
  .refine(storeForStoreKinds, STORE_FOR_STORE_KINDS);
/**
 * A later version of a unit: its name. A unit that has no approved version yet, such as a new unit's draft being
 * re-dated (GC2-7), names its first mapping again: all three fields, or none.
 */
export const businessUnitVersionDraftSchema = z
  .strictObject({
    ...businessUnitFields,
    legalEntityId: idSchema.optional(),
    taxRegistrationId: idSchema.optional(),
    accountingBookId: idSchema.optional(),
    validFrom,
  })
  .refine(
    (value) => {
      const given = [value.legalEntityId, value.taxRegistrationId, value.accountingBookId].filter(
        (each) => each !== undefined,
      );
      return given.length === 0 || given.length === 3;
    },
    { message: 'A mapping names its legal entity, tax registration and book together', path: ['legalEntityId'] },
  );
/** A later mapping version of a unit (3.4). */
export const businessUnitMappingVersionDraftSchema = z.strictObject({ ...mappingFields, validFrom });
/** A new location, in use from its start: its Site and unit fixed (3.5). */
export const locationDraftSchema = z
  .strictObject({ code: masterCodeSchema, siteId: idSchema, businessUnitId: idSchema, ...locationFields, validFrom })
  .refine(parentOnlyWhenNesting, PARENT_ONLY_WHEN_NESTING);
/** A later version of a location; `retired` retires it from its start, never deleting it (3.5). */
export const locationVersionDraftSchema = z
  .strictObject({ ...locationFields, retired: z.boolean(), validFrom })
  .refine(parentOnlyWhenNesting, PARENT_ONLY_WHEN_NESTING);
/** A Store's default warehouse from a date: a warehouse unit (3.6; PRD-ORG-013). */
export const storeDefaultWarehouseVersionDraftSchema = z.strictObject({ warehouseUnitId: idSchema, validFrom });

/** One evidence file, as Store a file answered it (imports-and-opening-data 13.1). */
const evidenceFileSchema = z.strictObject({ storedFileId: idSchema, fileReceiptId: idSchema });
/**
 * Verify a mapping version (3.4; POL-10.08): the evidence, one stored file or more, each given once, attached to the
 * verification through files-imports (S1-F06-T05).
 */
export const mappingVerificationRequestSchema = z.strictObject({
  evidence: z
    .array(evidenceFileSchema)
    .min(1)
    .refine((list) => new Set(list.map((each) => each.storedFileId)).size === list.length, {
      message: 'Each is given once',
    }),
});
export type MappingVerificationRequest = z.infer<typeof mappingVerificationRequestSchema>;
/** What verifying answers: the verification and the attachment of each evidence file. */
export const mappingVerifiedSchema = z.strictObject({ verificationId: idSchema, attachmentIds: z.array(idSchema) });
export type MappingVerified = z.infer<typeof mappingVerifiedSchema>;

export type BusinessUnitDraft = z.infer<typeof businessUnitDraftSchema>;
export type BusinessUnitVersionDraft = z.infer<typeof businessUnitVersionDraftSchema>;
export type BusinessUnitMappingVersionDraft = z.infer<typeof businessUnitMappingVersionDraftSchema>;
export type LocationDraft = z.infer<typeof locationDraftSchema>;
export type LocationVersionDraft = z.infer<typeof locationVersionDraftSchema>;
export type StoreDefaultWarehouseVersionDraft = z.infer<typeof storeDefaultWarehouseVersionDraftSchema>;

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
const businessUnitVersionFields = { ...businessUnitFields, status: placeStatusSchema };
/**
 * In a unit's history, a version a mapping was prepared with (a new unit's first, or its re-dated draft) shows that
 * mapping's three fields, so its approver sees what the decision makes take effect (PRD-ACS-007; 3.4).
 */
const businessUnitHistoryFields = {
  ...businessUnitVersionFields,
  legalEntityId: idSchema.optional(),
  taxRegistrationId: idSchema.optional(),
  accountingBookId: idSchema.optional(),
};
const businessUnitFixed = { siteId: idSchema, kind: businessUnitKindSchema, storeId: idSchema.optional() };
/**
 * A mapping version's verification: who verified it, when, and the attachment of each evidence file (3.4; POL-10.08).
 * Absent while it is unverified.
 */
export const mappingVerificationSchema = z.strictObject({
  id: idSchema,
  verifiedByUserId: idSchema,
  verifiedAt: z.iso.datetime({ offset: true }),
  attachmentIds: z.array(idSchema),
});
export type MappingVerification = z.infer<typeof mappingVerificationSchema>;
const mappingVersionFields = { ...mappingFields, verification: mappingVerificationSchema.optional() };
const locationFixed = { siteId: idSchema, businessUnitId: idSchema };
const locationVersionFields = { ...locationFields, retired: z.boolean() };
const defaultWarehouseFields = { warehouseUnitId: idSchema };

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
export const businessUnitRecordSchema = masterRecord(businessUnitFixed, businessUnitHistoryFields);
/** A unit with its mapping versions: the record is the unit, and each version a mapping (3.4). */
export const businessUnitMappingRecordSchema = masterRecord({}, mappingVersionFields);
export const locationRecordSchema = masterRecord(locationFixed, locationVersionFields);
/** A Store with its default warehouse versions (3.6). */
export const storeDefaultWarehouseRecordSchema = masterRecord({}, defaultWarehouseFields);

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
export const businessUnitListSchema = pageOf(businessUnitRecordSchema);
export const businessUnitMappingListSchema = pageOf(businessUnitMappingRecordSchema);
export const locationListSchema = pageOf(locationRecordSchema);
export const storeDefaultWarehouseListSchema = pageOf(storeDefaultWarehouseRecordSchema);

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
export const businessUnitReadSchema = readOf(businessUnitRecordSchema);
export const businessUnitMappingReadSchema = readOf(businessUnitMappingRecordSchema);
export const locationReadSchema = readOf(locationRecordSchema);
export const storeDefaultWarehouseReadSchema = readOf(storeDefaultWarehouseRecordSchema);

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
export type BusinessUnitList = z.infer<typeof businessUnitListSchema>;
export type BusinessUnitMappingList = z.infer<typeof businessUnitMappingListSchema>;
export type LocationList = z.infer<typeof locationListSchema>;
export type StoreDefaultWarehouseList = z.infer<typeof storeDefaultWarehouseListSchema>;
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
  business_unit: z.infer<typeof businessUnitRecordSchema>;
  business_unit_mapping: z.infer<typeof businessUnitMappingRecordSchema>;
  location: z.infer<typeof locationRecordSchema>;
  store_default_warehouse: z.infer<typeof storeDefaultWarehouseRecordSchema>;
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
  /** Each unit with its kind, so `merchandise` can apply brand coverage by kind (3.3). */
  businessUnits: inForce(businessUnitFixed, businessUnitVersionFields),
  /** Each unit's mapping version in force, with its verification, absent while unverified (3.4). */
  businessUnitMappings: inForce({}, mappingVersionFields),
  locations: inForce(locationFixed, locationVersionFields),
  storeDefaultWarehouses: inForce({}, defaultWarehouseFields),
});
export type MasterLists = z.infer<typeof masterListsSchema>;

/** The query of the master lists: the business date they are read as of. */
export const masterListsQuerySchema = z.strictObject({ date: businessDateSchema });
