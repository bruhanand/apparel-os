import {
  fieldClassSchema,
  permissionRegistry,
  type FieldClass,
  type Permission,
  type PermissionAction,
} from '@apparel-os/schemas';

// The role editor's permission grid (access-and-approvals 4.1, 4.2; POL-02.01, POL-02.03, POL-02.04): one row per
// record type the permission registry declares, with only the actions it declares, and one row per restricted field
// class. A broad choice such as All actions is expanded into the explicit actions before saving; it is never sent.
// No self-service permission is offered: no declared record type has a subject person yet (access-and-approvals 5.4;
// PRD-ACS-022), so a self-service role could grant nothing.

/** One row of the grid: a record type and the actions it declares. */
export interface GridRow {
  readonly recordType: string;
  readonly actions: readonly PermissionAction[];
}

/** The rows of the grid, in the registry's order. */
export function permissionGrid(): GridRow[] {
  return permissionRegistry.map((declaration) => ({
    recordType: declaration.code,
    actions: declaration.actions,
  }));
}

/** The restricted field classes (PRD-ACS-008, PRD-SEC-010). */
export const fieldClasses: readonly FieldClass[] = fieldClassSchema.options;

/** A ticked cell: `action:<recordType>:<action>`, or `field:<fieldClass>:<view | view-and-edit>`. */
export const actionCell = (recordType: string, action: PermissionAction) => `action:${recordType}:${action}`;
export const fieldCell = (fieldClass: FieldClass, access: 'view' | 'view-and-edit') => `field:${fieldClass}:${access}`;

/** POL-02.03: All actions on a record type ticks each action it declares, explicitly. */
export function withAllActions(selection: ReadonlySet<string>, recordType: string): Set<string> {
  const next = new Set(selection);
  const row = permissionGrid().find((each) => each.recordType === recordType);
  for (const action of row?.actions ?? []) next.add(actionCell(recordType, action));
  return next;
}

/** The explicit permissions of the ticked cells, in the grid's order. A field class takes its wider access. */
export function permissionsOfGrid(selection: ReadonlySet<string>): Permission[] {
  const actions: Permission[] = permissionGrid().flatMap((row) =>
    row.actions
      .filter((action) => selection.has(actionCell(row.recordType, action)))
      .map((action) => ({ kind: 'action' as const, recordType: row.recordType, action, selfService: false })),
  );
  const fields: Permission[] = fieldClasses.flatMap((fieldClass): Permission[] => {
    if (selection.has(fieldCell(fieldClass, 'view-and-edit'))) {
      return [{ kind: 'field-class', fieldClass, access: 'view-and-edit', selfService: false }];
    }
    if (selection.has(fieldCell(fieldClass, 'view'))) {
      return [{ kind: 'field-class', fieldClass, access: 'view', selfService: false }];
    }
    return [];
  });
  return [...actions, ...fields];
}

/** The cells of a list of permissions, to start a new role or version from an existing one. */
export function gridOfPermissions(permissions: readonly Permission[]): Set<string> {
  return new Set(
    permissions.map((permission) =>
      permission.kind === 'action'
        ? actionCell(permission.recordType, permission.action)
        : fieldCell(permission.fieldClass, permission.access),
    ),
  );
}
