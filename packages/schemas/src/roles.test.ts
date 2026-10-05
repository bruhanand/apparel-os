import { uuidv7 } from '@apparel-os/domain';
import { describe, expect, it } from 'vitest';
import {
  assignmentScopeSchema,
  permissionSchema,
  roleAssignmentDraftSchema,
  roleDraftSchema,
  scopeGrantsNothing,
} from './roles.js';

describe('permissions (POL-02.03, PRD-ACS-008)', () => {
  it('refuses a broad label instead of an explicit action', () => {
    for (const action of ['all', 'full', 'manage']) {
      expect(
        permissionSchema.safeParse({ kind: 'action', recordType: 'access.role', action, selfService: false }).success,
      ).toBe(false);
    }
    expect(
      permissionSchema.safeParse({ kind: 'action', recordType: 'access.role', action: 'view', selfService: false })
        .success,
    ).toBe(true);
  });

  it('never defaults whether a permission is self-service', () => {
    expect(permissionSchema.safeParse({ kind: 'action', recordType: 'access.role', action: 'view' }).success).toBe(
      false,
    );
  });
});

describe('self-service exclusivity (PRD-ACS-022, DEC-100)', () => {
  const own = { kind: 'action', recordType: 'hr.payslip', action: 'view', selfService: true } as const;
  const work = { kind: 'action', recordType: 'access.role', action: 'view', selfService: false } as const;

  it('accepts a role of self-service permissions only, or of none', () => {
    expect(roleDraftSchema.safeParse({ code: 'SYN-SELF', name: 'Synthetic self', permissions: [own] }).success).toBe(
      true,
    );
    expect(roleDraftSchema.safeParse({ code: 'SYN-WORK', name: 'Synthetic work', permissions: [work] }).success).toBe(
      true,
    );
  });

  it('refuses a role mixing self-service with other permissions', () => {
    expect(
      roleDraftSchema.safeParse({ code: 'SYN-MIX', name: 'Synthetic mix', permissions: [own, work] }).success,
    ).toBe(false);
  });

  it('gives own-record scope no dimension', () => {
    expect(assignmentScopeSchema.safeParse({ kind: 'own-records' }).success).toBe(true);
    expect(assignmentScopeSchema.safeParse({ kind: 'own-records', brand: { kind: 'all' } }).success).toBe(false);
  });
});

describe('scope (PRD-ACS-005)', () => {
  const all = { kind: 'all' } as const;
  const empty = { kind: 'empty' } as const;

  it('tells all members from empty, and an empty dimension grants nothing', () => {
    const allScope = assignmentScopeSchema.parse({ kind: 'dimensions', legalEntity: all, place: all, brand: all });
    const oneEmpty = assignmentScopeSchema.parse({ kind: 'dimensions', legalEntity: all, place: empty, brand: all });
    expect(scopeGrantsNothing(allScope)).toBe(false);
    expect(scopeGrantsNothing(oneEmpty)).toBe(true);
    expect(scopeGrantsNothing(assignmentScopeSchema.parse({ kind: 'own-records' }))).toBe(false);
  });

  it('never reads an empty selection as empty or as all: a selection names a member', () => {
    expect(
      assignmentScopeSchema.safeParse({
        kind: 'dimensions',
        legalEntity: all,
        place: { kind: 'selected', members: [] },
        brand: all,
      }).success,
    ).toBe(false);
    expect(
      assignmentScopeSchema.safeParse({
        kind: 'dimensions',
        legalEntity: all,
        place: { kind: 'selected', members: [{ type: 'store', id: uuidv7() }] },
        brand: all,
      }).success,
    ).toBe(true);
  });

  it('needs every dimension stated', () => {
    expect(assignmentScopeSchema.safeParse({ kind: 'dimensions', legalEntity: all, place: all }).success).toBe(false);
  });
});

describe('role assignment draft (PRD-ACS-005, PRD-MOD-010)', () => {
  const base = {
    actor: { kind: 'user', userId: uuidv7() },
    roleId: uuidv7(),
    scope: { kind: 'dimensions', legalEntity: { kind: 'all' }, place: { kind: 'all' }, brand: { kind: 'all' } },
    validFrom: '2026-10-06',
  } as const;

  it('accepts an open-ended assignment and refuses one that ends before it starts', () => {
    expect(roleAssignmentDraftSchema.safeParse(base).success).toBe(true);
    expect(roleAssignmentDraftSchema.safeParse({ ...base, validTo: '2026-10-06' }).success).toBe(false);
    expect(roleAssignmentDraftSchema.safeParse({ ...base, validTo: '2026-10-07' }).success).toBe(true);
  });
});
