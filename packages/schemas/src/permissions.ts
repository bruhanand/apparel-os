import type { FieldClass, PermissionAction } from './roles.js';

// The permission registry (access-and-approvals 4.1, 5.3, 5.4). Each module declares here its record types, the
// actions each takes and the scope facts each record carries; a new record type or action is added by a reviewed code
// change, never at run time. The server checks role permissions against it and builds effective grants from it; the
// web shell names the record types its screens need from it (RR-261). A permission on a record type that is not
// declared here grants nothing.

/**
 * Which scope facts a record of the type carries (access-and-approvals 5.3). A dimension it does not carry is not
 * checked; a dimension it carries but a record leaves empty is Unknown, covered only by all-members scope
 * (PRD-MOD-015). `place` covers the Site, the Store and the business unit (7.2).
 */
export interface ScopeFactsDeclared {
  readonly legalEntity: boolean;
  readonly place: boolean;
  readonly brand: boolean;
}

/** One record type as its module declares it (access-and-approvals 4.1). */
export interface RecordTypeDeclaration {
  /** `<module>.<record>`, in lower-case snake_case after the module. */
  readonly code: string;
  readonly actions: readonly PermissionAction[];
  readonly scopeFacts: ScopeFactsDeclared;
  /**
   * Whether a record of the type has a subject person, so own-record scope can cover it (5.4). Only such a type can
   * carry a self-service permission (PRD-ACS-022).
   */
  readonly subject: boolean;
  /** The restricted field classes its fields belong to (access-and-approvals 4.1, 6). */
  readonly fieldClasses: readonly FieldClass[];
  /**
   * Whether only a service identity holds permissions on the type, never a person's role (access-and-approvals 2.3;
   * PRD-SEC-018; S1-F01-T29). The role editor does not offer it and a role change that holds it is refused.
   */
  readonly serviceOnly: boolean;
}

const NONE: ScopeFactsDeclared = { legalEntity: false, place: false, brand: false };
const ALL: ScopeFactsDeclared = { legalEntity: true, place: true, brand: true };
const PLACE: ScopeFactsDeclared = { legalEntity: false, place: true, brand: false };
const LEGAL_ENTITY_AND_PLACE: ScopeFactsDeclared = { legalEntity: true, place: true, brand: false };
const PREPARED: readonly PermissionAction[] = ['view', 'create', 'edit', 'approve'];

function declare<const Code extends string>(
  code: Code,
  actions: readonly PermissionAction[],
  scopeFacts: ScopeFactsDeclared,
): RecordTypeDeclaration & { readonly code: Code } {
  return { code, actions, scopeFacts, subject: false, fieldClasses: [], serviceOnly: false };
}

/** A record type only a service identity holds permissions on (access-and-approvals 2.3; S1-F01-T29). */
function declareServiceOnly<const Code extends string>(
  code: Code,
  actions: readonly PermissionAction[],
  scopeFacts: ScopeFactsDeclared,
): RecordTypeDeclaration & { readonly code: Code } {
  return { ...declare(code, actions, scopeFacts), serviceOnly: true };
}

/**
 * `access`: the records of access changes, each prepared and approved by a different authorised person
 * (access-and-approvals 9.11; POL-02.07). They belong to the Organisation as a whole, so they carry no scope fact: the
 * permission on the type decides (5.3). The approval request and decision are read only; `access.effective_grant` is
 * rebuilt by the scheduled job when a start or end date passes (7.2). Revoking another user's sessions and resetting
 * another user's credential take effect at once, with no approval (3.2, 3.3), so they are no prepared types.
 */
const accessRecordTypes = [
  declare('access.user', PREPARED, NONE),
  declare('access.role', PREPARED, NONE),
  declare('access.role_assignment', PREPARED, NONE),
  declare('access.approval_rule_setting', PREPARED, NONE),
  declare('access.approval_reason', PREPARED, NONE),
  // Approval limits (9.2; S1-F05-T01): create prepares a limit, a new one or one replacing another from its start;
  // approve decides it. A limit is never edited in place, so edit is not declared.
  declare('access.approval_limit', ['view', 'create', 'approve'], NONE),
  // Stand-in grants (10; PRD-ACS-018, POL-02.20; S1-F05-T02): create records a grant, approve decides it (GC3-7). A
  // grant is never edited in place, so edit is not declared.
  declare('access.stand_in_grant', ['view', 'create', 'approve'], NONE),
  // The essential security settings: edit prepares a new version, approve decides it; no setting is created or
  // removed through a permission, since a required setting is never left unset (3.3; DEC-118, RR-334; S1-F01-T25).
  declare('access.setting', ['view', 'edit', 'approve'], NONE),
  declare('access.approval_request', ['view'], NONE),
  declare('access.approval_decision', ['view'], NONE),
  declareServiceOnly('access.effective_grant', ['edit'], NONE),
  // Another user's sessions: edit revokes them (3.3). A user's own sessions need no permission (3.2; S1-F01-T09).
  declare('access.session', ['view', 'edit'], NONE),
  // Another user's credentials: edit resets them (3.2; GC3-4). Nobody resets their own (S1-F01-T09).
  declare('access.user_credential', ['edit'], NONE),
] as const;

/**
 * `audit` (numbering-and-audit 4.5, 5; access-and-approvals 9.11). `audit.audit_record` is the history of records: an
 * audit row is read only by a reader who holds view on it and, through one grant, on the audited record's own type
 * covering the row's facts, so history never reaches past the records the reader may see (RR-242). The access
 * records carry the facts of the place where they happened; a sign-in has none, so only all-members scope reads it
 * (the Organisation-wide view of 9.11). Sensitive-access and device records are types apart, which neither first role
 * holds (9.11). The seal and partition types are for the audit jobs (RR-273), so they are service-only; create on partitions is the scheduled upkeep's (DEC-118).
 */
const auditRecordTypes = [
  declare('audit.audit_record', ['view'], NONE),
  declare('audit.access_record', ['view'], ALL),
  declare('audit.sensitive_access_record', ['view'], ALL),
  declare('audit.device_access_record', ['view'], ALL),
  declareServiceOnly('audit.audit_seal', ['view', 'create'], NONE),
  declareServiceOnly('audit.audit_partition', ['view', 'create'], NONE),
] as const;

/**
 * `kernel`: the outbox, which the outbox processor dispatches (code-house-rules 12.8; RR-273); and the jobs of the
 * worker, whose failed ones the operations view lists to whoever holds view on `kernel.job` (12.9; module-map 4.1;
 * PRD-SEC-013; S1-F08-T04). A job belongs to the Organisation as a whole, so it carries no scope fact. Who holds it is
 * KDPS's (V-01, RR-064).
 */
const kernelRecordTypes = [
  declareServiceOnly('kernel.outbox_event', ['view', 'edit'], NONE),
  declare('kernel.job', ['view'], NONE),
] as const;

/**
 * `inbox` (access-and-approvals 11; module-map 4.8). My work needs no permission (11.2, 9.11); `inbox.work_item`
 * edit is what the inbox's consumers hold, under their service identity, to publish, update and close work items
 * from the owners' events (RR-273; S1-F01-T13).
 */
const inboxRecordTypes = [
  declareServiceOnly('inbox.work_item', ['edit'], NONE),
  // Task and approval routing (9.4, 11.3; GC3-8, DEC-105; S1-F05-T02): the Organisation's setting, as exception
  // routing is: edit prepares a version, approve decides it.
  declare('inbox.work_item_routing', ['view', 'edit', 'approve'], NONE),
] as const;

/**
 * `files-imports` (module-map 4.7; imports-and-opening-data 13.1, 15.1). A stored file belongs to the Organisation
 * and carries no scope fact of its own: storing one needs create on the type. Reading a file goes through the
 * record it is attached to, authorised on that record's own type and scope facts (section 11), so no permission on
 * the stored file lets anyone read its content.
 */
const filesImportsRecordTypes = [declare('files_imports.stored_file', ['view', 'create'], NONE)] as const;

/** A record type whose fields include restricted field classes (access-and-approvals 4.1, 6). */
function declareWithFields<const Code extends string>(
  code: Code,
  actions: readonly PermissionAction[],
  scopeFacts: ScopeFactsDeclared,
  fieldClasses: readonly FieldClass[],
): RecordTypeDeclaration & { readonly code: Code } {
  return { ...declare(code, actions, scopeFacts), fieldClasses };
}

/**
 * `stock` · ledger (stock-ledger 13.6, 14.1, 14.3; S1-F10-T01). Each type covers the tables of one ledger record: its
 * rows carry the legal entity, the place and the brand as 14.1 sets them, and row-level security reads them under the
 * type (code-house-rules 6.2). Only view is declared: a business action is authorised on its own document's type by
 * the module that posts it (13.2), and the policy admits a write only where its actor could read the row. Cost and
 * value are the restricted field class cost, masked rather than filtered (13.6; access-and-approvals 6).
 */
const stockRecordTypes = [
  declare('stock.balance', ['view'], ALL),
  declareWithFields('stock.receipt_origin', ['view'], ALL, ['cost']),
  declare('stock.movement', ['view'], ALL),
  declare('stock.piece', ['view'], ALL),
  declare('stock.coverage', ['view'], ALL),
  declare('stock.acceptance', ['view'], ALL),
  declare('stock.hold', ['view'], ALL),
  declare('stock.reservation', ['view'], ALL),
  declareWithFields('stock.cost_pool', ['view'], ALL, ['cost']),
  declareWithFields('stock.valuation', ['view'], ALL, ['cost']),
  declareWithFields('stock.transit_value', ['view'], ALL, ['cost']),
] as const;

/**
 * `organisation` (structure-and-masters 3, 6.1; module-map 4.11; S1-F02-T01, S1-F02-T03). Geography, legal entities,
 * tax registrations, books and groupings belong to the Organisation as a whole, as the records of access changes do,
 * so they carry no scope fact and the permission on the type decides (5.3). Sites, Stores, business units with their
 * mappings and the mappings' verifications, locations and Stores' default warehouses carry their place (product
 * owner, 8 Oct 2026; S1-F02-T03): a Site is its own place, a Store is itself at its Site, a unit and what belongs to it
 * is the unit at its Site and Store (structure-and-masters 6.1). A unit and what belongs to it carry the legal entity
 * of the unit's mapping too, never the Site's (POL-10.01; product owner, 9 Oct 2026); a Site and a Store carry none,
 * since a Site may hold units of several legal entities. Each master is prepared (create, edit) and approved by a different
 * authorised person (GC2-2, DEC-105). The master lists have no permission of their own: they show each master whose
 * type the reader may view, and of the place-scoped ones the records the reader's scope covers, and name the others
 * (product owner, 8 Oct 2026; module-map section 3, rule 5).
 */
const organisationRecordTypes = [
  declare('organisation.country', PREPARED, NONE),
  declare('organisation.state', PREPARED, NONE),
  declare('organisation.city', PREPARED, NONE),
  declare('organisation.area', PREPARED, NONE),
  declare('organisation.legal_entity', PREPARED, NONE),
  declare('organisation.tax_registration', PREPARED, NONE),
  declare('organisation.accounting_book', PREPARED, NONE),
  declare('organisation.site', PREPARED, PLACE),
  declare('organisation.store', PREPARED, PLACE),
  declare('organisation.grouping', PREPARED, NONE),
  // Business units, their mappings, locations and default warehouses (S1-F02-T02). A mapping and a default warehouse
  // are dated records of a unit and of a Store, which have no record to create: edit prepares a version.
  declare('organisation.business_unit', PREPARED, LEGAL_ENTITY_AND_PLACE),
  declare('organisation.business_unit_mapping', ['view', 'edit', 'approve'], LEGAL_ENTITY_AND_PLACE),
  declare('organisation.location', PREPARED, LEGAL_ENTITY_AND_PLACE),
  declare('organisation.store_default_warehouse', ['view', 'edit', 'approve'], LEGAL_ENTITY_AND_PLACE),
  // Verifying a mapping version is a permission of its own (structure-and-masters 2.3, 3.4; GC2-2, DEC-105;
  // POL-10.08): create on the verification record, which no other permission gives, held by a different person from
  // the one who made the mapping. No new action is needed (access-and-approvals 4.1).
  declare('organisation.business_unit_mapping_verification', ['view', 'create'], LEGAL_ENTITY_AND_PLACE),
  // The Organisation's own grouping kinds and classification kinds and values (structure-and-masters 3.1, 3.6; RR-440;
  // S1-F02-T04): records of the Organisation as a whole, like groupings, so they carry no scope fact.
  declare('organisation.grouping_kind', PREPARED, NONE),
  declare('organisation.classification_kind', PREPARED, NONE),
  declare('organisation.classification_value', PREPARED, NONE),
] as const;

const PLACE_AND_BRAND: ScopeFactsDeclared = { legalEntity: false, place: true, brand: true };

/**
 * `exceptions` (access-and-approvals 12, 14; module-map 4.13; S1-F08-T02). An exception carries its Site, and its
 * Store, business unit and brand where they apply (12.1), so view, create (a person raising one) and edit (reassign,
 * comment, close and reopen as an authorised person) cover those facts; its owner acts on it by being its owner
 * (module-map 4.13). The routing is the Organisation's setting, read and changed under the type alone.
 */
const exceptionsRecordTypes = [
  declare('exceptions.exception', ['view', 'create', 'edit'], PLACE_AND_BRAND),
  declare('exceptions.exception_routing', ['view', 'edit', 'approve'], NONE),
] as const;

/**
 * `merchandise` · catalogue (structure-and-masters 4, 6.2; module-map 4.12; S1-F03-T01). Brands, categories, size
 * sets, attributes and vocabulary values belong to the Organisation as a whole, as the structure's own kinds do, so
 * they carry no scope fact and the permission on the type decides (5.3). A brand's coverage by a business unit is a
 * dated record of the unit, which has no record to create: edit prepares a version, approve decides it (3.3; GC2-2,
 * DEC-105). A vocabulary value is created only by confirming its proposal: create proposes, approve confirms or
 * rejects, by a different person (4.2; PRD-IMP-008, POL-02.07). Whether these types carry place or brand facts is the
 * product owner's to confirm (S1-F03-T01, open item).
 */
const merchandiseRecordTypes = [
  declare('merchandise.brand', ['view', 'create', 'edit'], NONE),
  declare('merchandise.business_unit_brand', ['view', 'edit', 'approve'], NONE),
  declare('merchandise.category', ['view', 'create', 'edit'], NONE),
  declare('merchandise.size_set', ['view', 'create', 'edit'], NONE),
  declare('merchandise.attribute', ['view', 'create', 'edit'], NONE),
  declare('merchandise.vocabulary_value', ['view', 'edit'], NONE),
  declare('merchandise.vocabulary_proposal', ['view', 'create', 'approve'], NONE),
  // Tracking profiles, styles, SKUs, packs, external codes and product proposals (structure-and-masters 4; S1-F03-T02),
  // the Organisation's as the catalogue is, so they carry no scope fact (5.3). A style or SKU is created only by
  // confirming a product proposal: create proposes, approve confirms or rejects, by a different person (4.2; DM-5,
  // DEC-105); edit records a later version. A category's tracking-profile link is the category's: edit records it.
  declare('merchandise.tracking_profile', ['view', 'create', 'edit'], NONE),
  declare('merchandise.category_tracking_profile', ['view', 'edit'], NONE),
  declare('merchandise.style', ['view', 'edit'], NONE),
  declare('merchandise.sku', ['view', 'edit'], NONE),
  declare('merchandise.pack', ['view', 'create', 'edit'], NONE),
  declare('merchandise.external_code', ['view', 'create', 'edit'], NONE),
  declare('merchandise.product_proposal', ['view', 'create', 'approve'], NONE),
  // `merchandise` · parties (structure-and-masters 5, 6.2; S1-F03-T03). A party, its roles and its brand–supplier
  // links belong to the Organisation as a whole, as the catalogue does, so they carry no scope fact (5.3): create adds
  // a party, edit records a version or a role; they take effect when recorded, as no source names an approval for
  // them (2.3). Bank details are the restricted field class bank-details (PRD-ACS-008): edit prepares a change, which
  // a different authorised person approves (POL-02.07; GC2-6, DEC-105). An agreement's versions are approved by a
  // different authorised person too (GC2-2, DEC-105); its margins are the restricted field class margin.
  declare('merchandise.party', ['view', 'create', 'edit'], NONE),
  declareWithFields('merchandise.party_bank_details', ['view', 'edit', 'approve'], NONE, ['bank-details']),
  declare('merchandise.brand_supplier_link', ['view', 'edit'], NONE),
  declareWithFields('merchandise.agreement', ['view', 'create', 'edit', 'approve'], NONE, ['margin']),
] as const;

/**
 * `configuration`: the policy gate (module-map 4.4; domain-model 3.6; S1-F04-T01). The policy status is the readiness
 * of the 19 policies: view reads Setup › Policy readiness, create records a policy as Signed with its evidence
 * (DEC-092). Create on the validation is the validate permission of DM-6: it records a policy's real values as
 * validated, by a person who did not enter them (DEC-105, DEC-116). Edit on a capability switches it on or off for the
 * Organisation (PRD-SEC-017). They belong to the Organisation as a whole, so they carry no scope fact. Who holds them
 * is KDPS's (V-01).
 */
const configurationRecordTypes = [
  declare('configuration.policy_status', ['view', 'create'], NONE),
  declare('configuration.policy_validation', ['view', 'create'], NONE),
  declare('configuration.capability', ['view', 'edit'], NONE),
] as const;

/** Every record type declared so far. */
export const permissionRegistry: readonly RecordTypeDeclaration[] = [
  ...accessRecordTypes,
  ...auditRecordTypes,
  ...kernelRecordTypes,
  ...inboxRecordTypes,
  ...filesImportsRecordTypes,
  ...stockRecordTypes,
  ...organisationRecordTypes,
  ...exceptionsRecordTypes,
  ...merchandiseRecordTypes,
  ...configurationRecordTypes,
];

/** The code of a declared record type. */
export type RecordTypeCode =
  | (typeof accessRecordTypes)[number]['code']
  | (typeof auditRecordTypes)[number]['code']
  | (typeof kernelRecordTypes)[number]['code']
  | (typeof inboxRecordTypes)[number]['code']
  | (typeof filesImportsRecordTypes)[number]['code']
  | (typeof stockRecordTypes)[number]['code']
  | (typeof organisationRecordTypes)[number]['code']
  | (typeof exceptionsRecordTypes)[number]['code']
  | (typeof merchandiseRecordTypes)[number]['code']
  | (typeof configurationRecordTypes)[number]['code'];

/** Whether a record type is service-only: declared as such, never held by a person's role (S1-F01-T29). */
export function isServiceOnly(
  recordType: string,
  registry: readonly RecordTypeDeclaration[] = permissionRegistry,
): boolean {
  return registry.some((declaration) => declaration.code === recordType && declaration.serviceOnly);
}

/** A registry, as `access` reads it: the declarations by code. */
export function registryByCode(
  registry: readonly RecordTypeDeclaration[] = permissionRegistry,
): ReadonlyMap<string, RecordTypeDeclaration> {
  const map = new Map<string, RecordTypeDeclaration>();
  for (const declaration of registry) {
    if (map.has(declaration.code)) throw new Error(`Record type ${declaration.code} is declared twice`);
    map.set(declaration.code, declaration);
  }
  return map;
}
