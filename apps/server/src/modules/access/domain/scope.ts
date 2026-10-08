import type { AssignmentScope, PermissionAction, RecordTypeDeclaration } from '@apparel-os/schemas';

// Scope: the canonical key of an exact scope, matching a record's facts, and the effective grants of one assignment
// (access-and-approvals 5, 7.2; code-house-rules 7.3; DEC-112, CH-7). Pure: no database, no clock.

type DimensionScope<Member> =
  | { readonly kind: 'all' }
  | { readonly kind: 'selected'; readonly members: readonly Member[] }
  | { readonly kind: 'empty' };

interface PlaceMember {
  readonly type: 'site' | 'store' | 'business-unit';
  readonly id: string;
}

function keyPart<Member>(scope: DimensionScope<Member>, name: (member: Member) => string): string {
  if (scope.kind !== 'selected') return scope.kind;
  return `selected:${[...new Set(scope.members.map(name))].sort().join(',')}`;
}

/**
 * The canonical form of an exact scope (code-house-rules 7.3; DEC-112, CH-7): `own-records`, or
 * `legal-entity=<part>;place=<part>;brand=<part>`, a part being `all`, `empty` or `selected:` and the members sorted
 * by code unit and joined by commas, a place member as `<type>:<id>`. Two scopes are the same exact scope when their
 * keys are equal. The database makes the same form from the scope rows (access.scope_key_of) and checks it at commit.
 */
export function scopeKeyOf(scope: AssignmentScope): string {
  if (scope.kind === 'own-records') return 'own-records';
  return [
    `legal-entity=${keyPart(scope.legalEntity, (id) => id)}`,
    `place=${keyPart<PlaceMember>(scope.place, (member) => `${member.type}:${member.id}`)}`,
    `brand=${keyPart(scope.brand, (id) => id)}`,
  ].join(';');
}

/**
 * A record's scope facts, as its owning module passes them (access-and-approvals 5.3). A fact left out is Unknown
 * when the record type declares it (PRD-MOD-015); `subjectId` is the person a record of a type with a subject is about
 * (5.4).
 */
export interface RecordFacts {
  readonly legalEntityId?: string | undefined;
  readonly siteId?: string | undefined;
  readonly storeId?: string | undefined;
  readonly businessUnitId?: string | undefined;
  readonly brandId?: string | undefined;
  readonly subjectId?: string | undefined;
}

export type ScopeDimension = 'legal-entity' | 'place' | 'brand' | 'own-records';

/** A fact of a record that a scope does not cover: a place, a legal entity or a brand, by type and identifier. */
export interface UncoveredFact {
  readonly type: 'site' | 'store' | 'business-unit' | 'legal-entity' | 'brand';
  readonly id: string;
}

/**
 * Whether a scope covers a record; when it does not, the dimension and, where the record carries it, the fact missing
 * (PRD-UXP-003): for place, the most exact place the record carries, its unit, else its Store, else its Site. An
 * Unknown fact names none.
 */
export type Coverage =
  | { readonly covered: true }
  | { readonly covered: false; readonly dimension: ScopeDimension; readonly fact?: UncoveredFact };

/** The most exact place a record carries: its business unit, else its Store, else its Site (5.2). */
function placeFactOf(facts: RecordFacts): UncoveredFact | undefined {
  if (facts.businessUnitId !== undefined) return { type: 'business-unit', id: facts.businessUnitId };
  if (facts.storeId !== undefined) return { type: 'store', id: facts.storeId };
  if (facts.siteId !== undefined) return { type: 'site', id: facts.siteId };
  return undefined;
}

function uncovered(dimension: ScopeDimension, fact: UncoveredFact | undefined): Coverage {
  return fact === undefined ? { covered: false, dimension } : { covered: false, dimension, fact };
}

function coversMember(scope: DimensionScope<string>, fact: string | undefined): boolean {
  if (scope.kind === 'all') return true;
  if (scope.kind === 'empty' || fact === undefined) return false;
  return scope.members.includes(fact);
}

function coversPlace(scope: DimensionScope<PlaceMember>, facts: RecordFacts): boolean {
  if (scope.kind === 'all') return true;
  if (scope.kind === 'empty') return false;
  // A row carries its Site, Store and unit, so a selected member matches by equality; the tree is never expanded
  // (access-and-approvals 7.2). All three left out is Unknown, covered only by all members.
  return scope.members.some(
    (member) =>
      (member.type === 'site' && member.id === facts.siteId) ||
      (member.type === 'store' && member.id === facts.storeId) ||
      (member.type === 'business-unit' && member.id === facts.businessUnitId),
  );
}

/**
 * Whether an assignment's scope covers a record (access-and-approvals 5.3, 5.4): for each dimension the record type
 * carries, the scope covers the record's fact; a scope empty in any dimension covers nothing, even of a record type
 * that does not carry that dimension, since such an assignment grants nothing (PRD-ACS-005); an Unknown fact only
 * all members (PRD-MOD-015). Own-record scope covers only a record of a type with a subject whose subject is the actor
 * (PRD-ACS-022). Answers the first dimension that fails.
 */
export function scopeCovers(
  scope: AssignmentScope,
  recordType: RecordTypeDeclaration,
  actorId: string,
  facts: RecordFacts,
): Coverage {
  if (scope.kind === 'own-records') {
    return recordType.subject && facts.subjectId === actorId
      ? { covered: true }
      : { covered: false, dimension: 'own-records' };
  }
  // An assignment empty in any dimension grants nothing, whatever the record type carries (PRD-ACS-005).
  if (scope.legalEntity.kind === 'empty') return { covered: false, dimension: 'legal-entity' };
  if (scope.place.kind === 'empty') return { covered: false, dimension: 'place' };
  if (scope.brand.kind === 'empty') return { covered: false, dimension: 'brand' };
  const declared = recordType.scopeFacts;
  if (declared.legalEntity && !coversMember(scope.legalEntity, facts.legalEntityId)) {
    return uncovered(
      'legal-entity',
      facts.legalEntityId === undefined ? undefined : { type: 'legal-entity', id: facts.legalEntityId },
    );
  }
  if (declared.place && !coversPlace(scope.place, facts)) return uncovered('place', placeFactOf(facts));
  if (declared.brand && !coversMember(scope.brand, facts.brandId)) {
    return uncovered('brand', facts.brandId === undefined ? undefined : { type: 'brand', id: facts.brandId });
  }
  return { covered: true };
}

/** A permission of a role version as `access` stores it: actions only matter for grants (4.1). */
export type StoredPermission =
  | { readonly kind: 'action'; readonly recordType: string; readonly action: string }
  | { readonly kind: 'field-class'; readonly fieldClass: string; readonly fieldAccess: string };

/** One assignment in force with its role's permissions in force, as the rebuild reads it. */
export interface AssignmentInForce {
  readonly assignmentId: string;
  readonly actorId: string;
  readonly scope: AssignmentScope;
  readonly permissions: readonly StoredPermission[];
}

/** One row of the effective-grant table, without its identifier and date (access-and-approvals 7.2). */
export interface GrantRow {
  readonly actorId: string;
  readonly recordType: string;
  readonly roleAssignmentId: string;
  readonly actions: string[];
  readonly ownRecords: boolean;
  readonly declaresLegalEntity: boolean;
  readonly declaresPlace: boolean;
  readonly declaresBrand: boolean;
  readonly legalEntityAll: boolean;
  readonly legalEntityIds: string[];
  readonly placeAll: boolean;
  readonly siteIds: string[];
  readonly storeIds: string[];
  readonly businessUnitIds: string[];
  readonly brandAll: boolean;
  readonly brandIds: string[];
}

/** Whether a scope grants nothing: empty in any dimension (PRD-ACS-005). */
function grantsNothing(scope: AssignmentScope): boolean {
  return (
    scope.kind === 'dimensions' &&
    (scope.legalEntity.kind === 'empty' || scope.place.kind === 'empty' || scope.brand.kind === 'empty')
  );
}

const selected = <Member>(scope: DimensionScope<Member>): readonly Member[] =>
  scope.kind === 'selected' ? scope.members : [];

/**
 * The effective grants of one assignment (access-and-approvals 7.2): one row per record type its role grants an
 * action on, with the actions sorted, the scope's members by kind and all members as a wildcard, and which facts the
 * record type declares, from the registry. A permission on a type the registry does not declare grants nothing
 * (4.1); an assignment empty in any dimension gives no row (PRD-ACS-005). Rows are ordered by record type.
 */
export function grantRowsOf(
  assignment: AssignmentInForce,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
): GrantRow[] {
  if (grantsNothing(assignment.scope)) return [];
  const actions = new Map<string, Set<string>>();
  for (const permission of assignment.permissions) {
    if (permission.kind !== 'action') continue;
    const declaration = registry.get(permission.recordType);
    if (declaration?.actions.includes(permission.action as PermissionAction) !== true) continue;
    const set = actions.get(permission.recordType) ?? new Set<string>();
    set.add(permission.action);
    actions.set(permission.recordType, set);
  }
  const { scope } = assignment;
  return [...actions.keys()].sort().map((recordType) => {
    const declared = registry.get(recordType)?.scopeFacts ?? { legalEntity: false, place: false, brand: false };
    const dimensions = scope.kind === 'dimensions' ? scope : undefined;
    const places = dimensions === undefined ? [] : selected(dimensions.place);
    return {
      actorId: assignment.actorId,
      recordType,
      roleAssignmentId: assignment.assignmentId,
      actions: [...(actions.get(recordType) ?? [])].sort(),
      ownRecords: scope.kind === 'own-records',
      declaresLegalEntity: declared.legalEntity,
      declaresPlace: declared.place,
      declaresBrand: declared.brand,
      legalEntityAll: dimensions?.legalEntity.kind === 'all',
      legalEntityIds: dimensions === undefined ? [] : [...selected(dimensions.legalEntity)],
      placeAll: dimensions?.place.kind === 'all',
      siteIds: places.filter((member) => member.type === 'site').map((member) => member.id),
      storeIds: places.filter((member) => member.type === 'store').map((member) => member.id),
      businessUnitIds: places.filter((member) => member.type === 'business-unit').map((member) => member.id),
      brandAll: dimensions?.brand.kind === 'all',
      brandIds: dimensions === undefined ? [] : [...selected(dimensions.brand)],
    };
  });
}
