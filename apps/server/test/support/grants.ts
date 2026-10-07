import { uuidv7 } from '@apparel-os/domain';
import {
  permissionRegistry,
  registryByCode,
  type AssignmentScope,
  type FieldClass,
  type PermissionAction,
  type RecordTypeDeclaration,
} from '@apparel-os/schemas';
// The access module's own pure helpers, used only so the rows a test writes directly are the rows access would write
// (code-house-rules 11.2): the canonical scope key and the effective grants of one assignment.
import { grantRowsOf, scopeKeyOf } from '../../src/modules/access/domain/scope.js';
import { syntheticCode } from '../fixtures/synthetic.js';
import type { Client } from 'pg';
import { connect } from './postgres.js';

// S1-F01-T11: a SYNTHETIC role and an Approved role assignment written directly, as the migration role, until the
// setup step (S1-F01-T10) and the approval of access changes (S1-F01-T13) write them. Every value here is SYNTHETIC.

export interface SyntheticAuthority {
  readonly recordType: string;
  readonly action: PermissionAction;
}

const ALL_MEMBERS: AssignmentScope = {
  kind: 'dimensions',
  legalEntity: { kind: 'all' },
  place: { kind: 'all' },
  brand: { kind: 'all' },
};

/** Yesterday as a business date in the synthetic timezone (Etc/UTC). */
function yesterday(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Writes a SYNTHETIC role holding the permissions given, Approved from yesterday, and an Approved assignment of it to
 * the actor from yesterday with all-members scope (unless another scope is given), then the actor's effective grants
 * as access builds them (access-and-approvals 7.2). Returns the role's and the assignment's identifiers.
 */
export async function grantSynthetic(
  database: string,
  actor: { readonly kind: 'user' | 'service-identity'; readonly id: string },
  authorities: readonly SyntheticAuthority[],
  options: {
    readonly scope?: AssignmentScope;
    readonly registry?: readonly RecordTypeDeclaration[];
    /** Field classes the role also grants (access-and-approvals 4.1, 6). None by default. */
    readonly fieldClasses?: readonly { readonly fieldClass: FieldClass; readonly access: 'view' | 'view-and-edit' }[];
  } = {},
): Promise<{ roleId: string; assignmentId: string }> {
  const scope = options.scope ?? ALL_MEMBERS;
  const roleId = uuidv7();
  const versionId = uuidv7();
  const assignmentId = uuidv7();
  const start = yesterday();
  const owner = await connect(database, 'migration');
  try {
    await owner.query('begin');
    await owner.query('insert into access.role (id, code, self_service) values ($1, $2, $3)', [
      roleId,
      syntheticCode(`ROLE-${roleId.slice(-8).toUpperCase()}`),
      scope.kind === 'own-records',
    ]);
    await owner.query(
      `insert into access.role_version (id, role_id, name, valid_during, decision)
       values ($1, $2, 'SYNTHETIC role', daterange($3::date, null), 'Awaiting approval')`,
      [versionId, roleId, start],
    );
    for (const authority of authorities) {
      await owner.query(
        `insert into access.role_permission (id, role_version_id, kind, record_type, action, field_class, field_access)
         values ($1, $2, 'action', $3, $4, null, null)`,
        [uuidv7(), versionId, authority.recordType, authority.action],
      );
    }
    for (const granted of options.fieldClasses ?? []) {
      await owner.query(
        `insert into access.role_permission (id, role_version_id, kind, record_type, action, field_class, field_access)
         values ($1, $2, 'field-class', null, null, $3, $4)`,
        [uuidv7(), versionId, granted.fieldClass, granted.access],
      );
    }
    await owner.query(`update access.role_version set decision = 'Approved' where id = $1`, [versionId]);
    await writeAssignment(owner, {
      actor,
      roleId,
      versionId,
      assignmentId,
      start,
      scope,
      authorities,
      registry: options.registry,
    });
    await owner.query('commit');
    return { roleId, assignmentId };
  } catch (error) {
    await owner.query('rollback');
    throw error;
  } finally {
    await owner.end();
  }
}

/**
 * Writes an Approved, all-members assignment to the actor of a role that already exists, such as one of the two
 * roles the setup step creates (access-and-approvals 9.11), from the start of the role's Approved version, then the
 * actor's effective grants from that version's actions, as access builds them (7.2). SYNTHETIC; returns the
 * assignment's identifier.
 */
export async function assignSyntheticRole(
  database: string,
  actor: { readonly kind: 'user' | 'service-identity'; readonly id: string },
  roleCode: string,
): Promise<string> {
  const assignmentId = uuidv7();
  const owner = await connect(database, 'migration');
  try {
    await owner.query('begin');
    const version = await owner.query<{ role_id: string; version_id: string; start: string }>(
      `select r.id as role_id, v.id as version_id, to_char(lower(v.valid_during), 'YYYY-MM-DD') as start
       from access.role r join access.role_version v on v.role_id = r.id and v.decision = 'Approved'
       where r.code = $1 and upper_inf(v.valid_during)`,
      [roleCode],
    );
    const [found] = version.rows;
    if (found === undefined) throw new Error(`No Approved version of the role ${roleCode}`);
    const permissions = await owner.query<{ record_type: string; action: PermissionAction }>(
      `select record_type, action from access.role_permission where role_version_id = $1 and kind = 'action'`,
      [found.version_id],
    );
    await writeAssignment(owner, {
      actor,
      roleId: found.role_id,
      versionId: found.version_id,
      assignmentId,
      start: found.start,
      scope: ALL_MEMBERS,
      authorities: permissions.rows.map((row) => ({ recordType: row.record_type, action: row.action })),
      registry: undefined,
    });
    await owner.query('commit');
    return assignmentId;
  } catch (error) {
    await owner.query('rollback');
    throw error;
  } finally {
    await owner.end();
  }
}

/** The assignment, its scope rows and its effective grants, in the caller's transaction as the migration role. */
async function writeAssignment(
  owner: Client,
  assignment: {
    readonly actor: { readonly kind: 'user' | 'service-identity'; readonly id: string };
    readonly roleId: string;
    readonly versionId: string;
    readonly assignmentId: string;
    readonly start: string;
    readonly scope: AssignmentScope;
    readonly authorities: readonly SyntheticAuthority[];
    readonly registry: readonly RecordTypeDeclaration[] | undefined;
  },
): Promise<void> {
  const { actor, roleId, versionId, assignmentId, start, scope, authorities } = assignment;
  await owner.query(
    `insert into access.role_assignment (id, app_user_id, service_identity_id, role_id, role_self_service, own_records,
         scope_key, valid_during, decision, withdrawal_id)
       values ($1, $2, $3, $4, $5, $5, $6, daterange($7::date, null), 'Awaiting approval', null)`,
    [
      assignmentId,
      actor.kind === 'user' ? actor.id : null,
      actor.kind === 'service-identity' ? actor.id : null,
      roleId,
      scope.kind === 'own-records',
      scopeKeyOf(scope),
      start,
    ],
  );
  if (scope.kind === 'dimensions') {
    for (const [dimension, dimensionScope] of [
      ['legal-entity', scope.legalEntity],
      ['place', scope.place],
      ['brand', scope.brand],
    ] as const) {
      const scopeId = uuidv7();
      await owner.query(
        'insert into access.assignment_scope (id, role_assignment_id, dimension, kind) values ($1, $2, $3, $4)',
        [scopeId, assignmentId, dimension, dimensionScope.kind],
      );
      if (dimensionScope.kind !== 'selected') continue;
      // The selected members (access-and-approvals 5.1): a legal entity or a brand by identifier, a place by type.
      for (const member of dimensionScope.members as readonly (string | { type: string; id: string })[]) {
        const [memberType, memberId] = typeof member === 'string' ? [dimension, member] : [member.type, member.id];
        await owner.query(
          'insert into access.assignment_scope_member (id, assignment_scope_id, member_type, member_id) values ($1, $2, $3, $4)',
          [uuidv7(), scopeId, memberType, memberId],
        );
      }
    }
  }
  await owner.query(`update access.role_assignment set decision = 'Approved' where id = $1`, [assignmentId]);
  const rows = grantRowsOf(
    {
      assignmentId,
      actorId: actor.id,
      scope,
      permissions: authorities.map((authority) => ({ kind: 'action', ...authority })),
    },
    registryByCode(assignment.registry ?? permissionRegistry),
  );
  for (const row of rows) {
    await owner.query(
      `insert into access.effective_grant (id, actor_id, record_type, role_assignment_id, actions, own_records,
           declares_legal_entity, declares_place, declares_brand, legal_entity_all, legal_entity_ids, place_all,
           site_ids, store_ids, business_unit_ids, brand_all, brand_ids, as_of, role_version_id, valid_during)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, current_date, $18,
           daterange($19::date, null))`,
      [
        uuidv7(),
        row.actorId,
        row.recordType,
        row.roleAssignmentId,
        row.actions,
        row.ownRecords,
        row.declaresLegalEntity,
        row.declaresPlace,
        row.declaresBrand,
        row.legalEntityAll,
        row.legalEntityIds,
        row.placeAll,
        row.siteIds,
        row.storeIds,
        row.businessUnitIds,
        row.brandAll,
        row.brandIds,
        versionId,
        start,
      ],
    );
  }
}
