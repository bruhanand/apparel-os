import {
  permissionRegistry,
  registryByCode,
  type AssignmentScope,
  type RecordTypeDeclaration,
} from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { grantRowsOf, scopeCovers, scopeKeyOf } from './scope.js';

// S1-F01-T11: the canonical scope key (code-house-rules 7.3; DEC-112, CH-7), scope matching (access-and-approvals
// 5.3, 5.4) and the effective grants of one assignment (7.2). SYNTHETIC identifiers only.

const SITE_B = '01900000-0000-7000-8000-00000000b002';
const SITE_A = '01900000-0000-7000-8000-00000000b001';
const STORE = '01900000-0000-7000-8000-00000000b101';
const UNIT = '01900000-0000-7000-8000-00000000b201';
const BRAND = '01900000-0000-7000-8000-00000000b301';
const ENTITY = '01900000-0000-7000-8000-00000000b401';
const ACTOR = '01900000-0000-7000-8000-00000000a001';
const OTHER = '01900000-0000-7000-8000-00000000a002';

const all = { kind: 'all' } as const;
const empty = { kind: 'empty' } as const;
const everywhere: AssignmentScope = { kind: 'dimensions', legalEntity: all, place: all, brand: all };

/** A SYNTHETIC record type with every fact and a subject person, for matching only. */
const scoped: RecordTypeDeclaration = {
  code: 'syn.scoped_record',
  actions: ['view', 'edit'],
  scopeFacts: { legalEntity: true, place: true, brand: true },
  subject: true,
  fieldClasses: [],
  serviceOnly: false,
};

describe('the canonical scope key (code-house-rules 7.3; DEC-112, CH-7)', () => {
  it('names own-record scope, and each dimension in a fixed order', () => {
    expect(scopeKeyOf({ kind: 'own-records' })).toBe('own-records');
    expect(scopeKeyOf({ kind: 'dimensions', legalEntity: all, place: all, brand: empty })).toBe(
      'legal-entity=all;place=all;brand=empty',
    );
  });

  it('gives the same key to the same members in any order, and another key to other members', () => {
    const one = scopeKeyOf({
      kind: 'dimensions',
      legalEntity: all,
      place: {
        kind: 'selected',
        members: [
          { type: 'site', id: SITE_B },
          { type: 'store', id: STORE },
          { type: 'site', id: SITE_A },
        ],
      },
      brand: all,
    });
    const same = scopeKeyOf({
      kind: 'dimensions',
      legalEntity: all,
      place: {
        kind: 'selected',
        members: [
          { type: 'store', id: STORE },
          { type: 'site', id: SITE_A },
          { type: 'site', id: SITE_B },
        ],
      },
      brand: all,
    });
    expect(one).toBe(same);
    expect(one).toBe(`legal-entity=all;place=selected:site:${SITE_A},site:${SITE_B},store:${STORE};brand=all`);
    expect(
      scopeKeyOf({
        kind: 'dimensions',
        legalEntity: all,
        place: { kind: 'selected', members: [{ type: 'site', id: SITE_A }] },
        brand: all,
      }),
    ).not.toBe(one);
  });
});

describe('matching a record (access-and-approvals 5.3, 5.4)', () => {
  const facts = { siteId: SITE_A, storeId: STORE, businessUnitId: UNIT, legalEntityId: ENTITY, brandId: BRAND };

  it('PRD-ACS-005 all members covers any fact, including one added later; an empty dimension covers nothing', () => {
    expect(scopeCovers(everywhere, scoped, ACTOR, facts)).toEqual({ covered: true });
    expect(
      scopeCovers({ kind: 'dimensions', legalEntity: all, place: empty, brand: all }, scoped, ACTOR, facts),
    ).toEqual({ covered: false, dimension: 'place' });
  });

  it('PRD-MOD-015 an Unknown fact is covered only by all members', () => {
    const brandSelected: AssignmentScope = {
      kind: 'dimensions',
      legalEntity: all,
      place: all,
      brand: { kind: 'selected', members: [BRAND] },
    };
    expect(scopeCovers(brandSelected, scoped, ACTOR, { ...facts, brandId: undefined })).toEqual({
      covered: false,
      dimension: 'brand',
    });
    expect(scopeCovers(everywhere, scoped, ACTOR, { ...facts, brandId: undefined })).toEqual({ covered: true });
  });

  it('matches a selected Site, Store or unit by equality (7.2)', () => {
    const store: AssignmentScope = {
      kind: 'dimensions',
      legalEntity: all,
      place: { kind: 'selected', members: [{ type: 'store', id: STORE }] },
      brand: all,
    };
    expect(scopeCovers(store, scoped, ACTOR, facts)).toEqual({ covered: true });
    expect(scopeCovers(store, scoped, ACTOR, { ...facts, storeId: undefined })).toEqual({
      covered: false,
      dimension: 'place',
    });
  });

  it('does not check a dimension the record type does not carry', () => {
    const [user] = permissionRegistry.filter((each) => each.code === 'access.user');
    if (user === undefined) throw new Error('access.user is not declared');
    expect(scopeCovers({ kind: 'dimensions', legalEntity: all, place: all, brand: all }, user, ACTOR, {})).toEqual({
      covered: true,
    });
    expect(
      scopeCovers(
        { kind: 'dimensions', legalEntity: all, place: { kind: 'selected', members: [] }, brand: all },
        user,
        ACTOR,
        {},
      ),
    ).toEqual({ covered: true });
  });

  it('PRD-ACS-005 an empty dimension grants nothing, even on a record type that does not carry it', () => {
    const [user] = permissionRegistry.filter((each) => each.code === 'access.user');
    if (user === undefined) throw new Error('access.user is not declared');
    expect(scopeCovers({ kind: 'dimensions', legalEntity: all, place: all, brand: empty }, user, ACTOR, {})).toEqual({
      covered: false,
      dimension: 'brand',
    });
  });

  it("PRD-ACS-022 own-record scope covers only the actor's own record of a type with a subject", () => {
    expect(scopeCovers({ kind: 'own-records' }, scoped, ACTOR, { subjectId: ACTOR })).toEqual({ covered: true });
    expect(scopeCovers({ kind: 'own-records' }, scoped, ACTOR, { subjectId: OTHER })).toEqual({
      covered: false,
      dimension: 'own-records',
    });
    expect(scopeCovers(everywhere, scoped, ACTOR, { ...facts, subjectId: ACTOR })).toEqual({ covered: true });
  });
});

describe('the effective grants of one assignment (access-and-approvals 7.2)', () => {
  const registry = registryByCode([...permissionRegistry, scoped]);
  const base = {
    assignmentId: '01900000-0000-7000-8000-00000000e001',
    actorId: ACTOR,
    permissions: [
      { kind: 'action', recordType: 'access.role', action: 'view' },
      { kind: 'action', recordType: 'access.role', action: 'create' },
      { kind: 'action', recordType: 'syn.scoped_record', action: 'view' },
      { kind: 'action', recordType: 'syn.not_declared', action: 'view' },
    ],
  } as const;

  it('gives one row per declared record type with its actions, all members kept as a wildcard', () => {
    const rows = grantRowsOf({ ...base, scope: everywhere }, registry);
    expect(rows.map((row) => [row.recordType, row.actions])).toEqual([
      ['access.role', ['create', 'view']],
      ['syn.scoped_record', ['view']],
    ]);
    expect(rows[1]).toMatchObject({
      ownRecords: false,
      declaresLegalEntity: true,
      declaresPlace: true,
      declaresBrand: true,
      legalEntityAll: true,
      placeAll: true,
      brandAll: true,
      siteIds: [],
    });
  });

  it('PRD-ACS-005 gives no row to an assignment empty in any dimension', () => {
    expect(grantRowsOf({ ...base, scope: { ...everywhere, brand: empty } }, registry)).toEqual([]);
  });

  it('keeps selected members by kind', () => {
    const rows = grantRowsOf(
      {
        ...base,
        scope: {
          kind: 'dimensions',
          legalEntity: { kind: 'selected', members: [ENTITY] },
          place: {
            kind: 'selected',
            members: [
              { type: 'site', id: SITE_A },
              { type: 'business-unit', id: UNIT },
            ],
          },
          brand: all,
        },
      },
      registry,
    );
    expect(rows[0]).toMatchObject({
      legalEntityAll: false,
      legalEntityIds: [ENTITY],
      placeAll: false,
      siteIds: [SITE_A],
      storeIds: [],
      businessUnitIds: [UNIT],
    });
  });
});
