import { uuidv7 } from '@apparel-os/domain';
import type {
  AssignmentScope,
  PermissionAction,
  PersonaId,
  RecordTypeDeclaration,
  SetupSettings,
} from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { AuditActor, AuditInterface } from '../../audit/index.js';
import { setUpTimezone } from '../../configuration/index.js';
import {
  appUser,
  appUserVersion,
  assignmentScope,
  passwordCredential,
  personaHeld,
  role,
  roleAssignment,
  rolePermission,
  roleVersion,
  serviceIdentity,
  serviceIdentityVersion,
  setting,
  settingVersion,
  setupRecord,
} from '../db/schema.js';
import {
  FIRST_ADMIN_PERMISSIONS,
  FIRST_ADMIN_ROLE,
  FIRST_APPROVER_PERMISSIONS,
  FIRST_APPROVER_ROLE,
  SETUP_IDENTITY,
} from '../domain/first-roles.js';
import { scopeKeyOf } from '../domain/scope.js';
import { SETTING_FORMATS, SETTING_SCHEMAS, type AccessSettingKey } from '../domain/sign-in-rules.js';
import { rebuildGrants } from './rebuild-grants.js';

/** One action on one record type, as a job step declares it and a service identity's role grants it. */
export interface Authority {
  readonly action: PermissionAction;
  readonly recordType: string;
}

/** An internal service identity the worker runs as, with what its role assignment grants (RR-271, RR-290). */
export interface ServiceIdentityGrant {
  readonly code: string;
  readonly authorities: readonly Authority[];
}

/** One of the two first users, with the Argon2id hash of the temporary password, made before the transaction. */
export interface SetupUser {
  readonly login: string;
  readonly displayName: string;
  readonly personas: readonly PersonaId[];
  readonly passwordHash: string;
}

/** What the setup step's one transaction writes (access-and-approvals 9.11; spec section 9). */
export interface SetupWrite {
  readonly organisationCode: string;
  readonly fingerprint: string;
  readonly canonicalFormVersion: string;
  /** The `setup` identity's identifier: the command's actor, written first in the transaction. */
  readonly setupIdentityId: string;
  readonly firstAdmin: SetupUser;
  readonly firstApprover: SetupUser;
  readonly settings: SetupSettings;
  readonly serviceIdentities: readonly ServiceIdentityGrant[];
}

const ALL_MEMBERS: AssignmentScope = {
  kind: 'dimensions',
  legalEntity: { kind: 'all' },
  place: { kind: 'all' },
  brand: { kind: 'all' },
};

/** The access settings the request carries, by key (access-and-approvals 3.1, 3.2, 3.3). */
function accessSettingsOf(settings: SetupSettings): [AccessSettingKey, unknown][] {
  return [
    ['access.password-rules', settings.passwordRules],
    ['access.sign-in-throttling', settings.signInThrottling],
    ['access.office-session-limits', settings.officeSessionLimits],
  ];
}

/**
 * Writes a new Organisation's first rows in the setup step's one transaction (access-and-approvals 9.11; PRD-ACS-023,
 * DEC-101, DEC-112), as the runtime role under the `setup` service identity, so row-level security and every guard
 * apply (CH-1). In order: the timezone (configuration), so every later version is dated by today under it; the
 * `setup` identity; the access settings, each labelled with its origin (code-house-rules 12.14); the two users,
 * Approved and Active from today, with their personas and temporary passwords as Argon2id hashes only (3.2); the two
 * roles of the 9.11 matrix and one all-members assignment each; the internal service identities the worker runs as,
 * each with a role holding exactly what its steps declare and an all-members assignment (RR-271, RR-290); the
 * effective grants (7.2); the setup record (13.1); and an audit record of each, naming the `setup` identity as actor,
 * with a permission-change access record for each assignment (9.11). Nothing is sent (DEC-099), and no outbox row is
 * written. Returns the two users' identifiers.
 */
export async function writeSetup(
  context: TransactionContext,
  audit: AuditInterface,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
  write: SetupWrite,
): Promise<{ readonly firstAdminUserId: string; readonly firstApproverUserId: string }> {
  const actor: AuditActor = { kind: 'service-identity', id: write.setupIdentityId };
  const record = async (
    entry: Pick<Parameters<AuditInterface['record']>[1], 'record' | 'changes'>,
  ): Promise<{ auditRecordId: string }> =>
    audit.record(context, { actor, ...entry, operation: 'set-up-organisation', source: { kind: 'operator-command' } });

  await setUpTimezone(context, audit, actor, { timezone: write.settings.timezone, origin: write.settings.origin });
  const date = await context.businessDate();
  if (date.kind === 'not-set') throw new CommandDefect('The timezone the setup step wrote is not in force');
  const from = `[${date.date},)`;

  await writeServiceIdentity(context, write.setupIdentityId, SETUP_IDENTITY, from);
  await record({
    record: { module: 'access', type: 'service_identity', id: write.setupIdentityId },
    changes: [{ kind: 'value', field: 'code', before: null, after: SETUP_IDENTITY }],
  });

  for (const [key, value] of accessSettingsOf(write.settings)) {
    const parsed = SETTING_SCHEMAS[key].parse(value);
    const settingId = uuidv7();
    const versionId = uuidv7();
    await context.tx.insert(setting).values({ id: settingId, settingKey: key });
    await context.tx.insert(settingVersion).values({
      id: versionId,
      settingId,
      valueFormat: SETTING_FORMATS[key],
      value: parsed,
      origin: write.settings.origin,
      // Setting versions are dated by instants (access-and-approvals 3.3; DEC-118): from the setup step's start.
      validDuring: `[${context.startedAt.toISOString()},)`,
      decision: 'Approved',
      startsOn: null,
    });
    await record({
      record: { module: 'access', type: 'setting', id: settingId, versionId },
      changes: [
        { kind: 'value', field: 'key', before: null, after: key },
        { kind: 'value', field: 'value', before: null, after: parsed },
        { kind: 'value', field: 'origin', before: null, after: write.settings.origin },
      ],
    });
  }

  const userIds: string[] = [];
  for (const user of [write.firstAdmin, write.firstApprover]) {
    const userId = uuidv7();
    const versionId = uuidv7();
    await context.tx.insert(appUser).values({ id: userId, login: user.login, partnerId: null });
    await context.tx.insert(appUserVersion).values({
      id: versionId,
      appUserId: userId,
      displayName: user.displayName,
      state: 'Active',
      // User versions are dated by instants (access-and-approvals 9.5; DEC-118): from the setup step's start.
      validDuring: `[${context.startedAt.toISOString()},)`,
      decision: 'Approved',
    });
    if (user.personas.length > 0) {
      await context.tx.insert(personaHeld).values(
        user.personas.map((persona, index) => ({
          id: uuidv7(),
          appUserVersionId: versionId,
          persona,
          position: index + 1,
        })),
      );
    }
    await context.tx.insert(passwordCredential).values({
      id: uuidv7(),
      appUserId: userId,
      passwordHash: user.passwordHash,
      temporary: true,
      enteredWithVersionId: versionId,
      replacedAt: null,
    });
    await record({
      record: { module: 'access', type: 'user', id: userId, versionId },
      changes: [
        { kind: 'value', field: 'login', before: null, after: user.login },
        { kind: 'value', field: 'displayName', before: null, after: user.displayName },
        { kind: 'value', field: 'personas', before: null, after: [...user.personas] },
        { kind: 'value', field: 'state', before: null, after: 'Active' },
        { kind: 'secret', field: 'password' },
      ],
    });
    userIds.push(userId);
  }
  const [firstAdminUserId, firstApproverUserId] = userIds as [string, string];

  const holders: { actor: { kind: 'user' | 'service-identity'; id: string }; role: RoleToWrite }[] = [
    {
      actor: { kind: 'user', id: firstAdminUserId },
      role: { ...FIRST_ADMIN_ROLE, permissions: FIRST_ADMIN_PERMISSIONS },
    },
    {
      actor: { kind: 'user', id: firstApproverUserId },
      role: { ...FIRST_APPROVER_ROLE, permissions: FIRST_APPROVER_PERMISSIONS },
    },
  ];
  for (const identity of write.serviceIdentities) {
    const id = uuidv7();
    await writeServiceIdentity(context, id, identity.code, from);
    await record({
      record: { module: 'access', type: 'service_identity', id },
      changes: [{ kind: 'value', field: 'code', before: null, after: identity.code }],
    });
    holders.push({
      actor: { kind: 'service-identity', id },
      role: { code: `service-identity:${identity.code}`, name: identity.code, permissions: identity.authorities },
    });
  }

  for (const holder of holders) {
    for (const permission of holder.role.permissions) {
      if (registry.get(permission.recordType)?.actions.includes(permission.action) !== true) {
        throw new CommandDefect(`The setup step would grant an undeclared permission on ${permission.recordType}`);
      }
    }
    const roleId = await writeRole(context, holder.role, from);
    await record({
      record: { module: 'access', type: 'role', id: roleId.roleId, versionId: roleId.versionId },
      changes: [
        { kind: 'value', field: 'code', before: null, after: holder.role.code },
        { kind: 'value', field: 'name', before: null, after: holder.role.name },
        {
          kind: 'value',
          field: 'permissions',
          before: null,
          after: holder.role.permissions.map((each) => ({ ...each })),
        },
      ],
    });
    const assignmentId = await writeAssignment(context, holder.actor, roleId.roleId, from);
    const auditRecord = await record({
      record: { module: 'access', type: 'role_assignment', id: assignmentId },
      changes: [
        { kind: 'value', field: 'actor', before: null, after: { ...holder.actor } },
        { kind: 'value', field: 'roleId', before: null, after: roleId.roleId },
        { kind: 'value', field: 'scope', before: null, after: ALL_MEMBERS },
        { kind: 'value', field: 'validFrom', before: null, after: date.date },
      ],
    });
    await audit.recordAccess(context, {
      kind: 'permission-changed',
      outcome: 'succeeded',
      auditRecord,
      ...(holder.actor.kind === 'user' ? { userId: holder.actor.id } : {}),
    });
  }
  await rebuildGrants(
    context,
    registry,
    holders.map((holder) => holder.actor.id),
  );

  const setupRecordId = uuidv7();
  await context.tx.insert(setupRecord).values({
    id: setupRecordId,
    organisationCode: write.organisationCode,
    fingerprint: write.fingerprint,
    canonicalFormVersion: write.canonicalFormVersion,
    firstAdminUserId,
    firstApproverUserId,
  });
  await record({
    record: { module: 'access', type: 'setup_record', id: setupRecordId },
    changes: [
      { kind: 'value', field: 'fingerprint', before: null, after: write.fingerprint },
      { kind: 'value', field: 'canonicalFormVersion', before: null, after: write.canonicalFormVersion },
    ],
  });
  return { firstAdminUserId, firstApproverUserId };
}

interface RoleToWrite {
  readonly code: string;
  readonly name: string;
  readonly permissions: readonly Authority[];
}

async function writeServiceIdentity(context: TransactionContext, id: string, code: string, from: string) {
  const taken = await context.tx
    .select({ id: serviceIdentity.id })
    .from(serviceIdentity)
    .where(eq(serviceIdentity.code, code));
  if (taken.length > 0) throw new CommandDefect(`Service identity ${code} is written twice`);
  await context.tx.insert(serviceIdentity).values({ id, code, kind: 'internal' });
  await context.tx.insert(serviceIdentityVersion).values({
    id: uuidv7(),
    serviceIdentityId: id,
    state: 'Active',
    validDuring: from,
    decision: 'Approved',
  });
}

/** A role and its first version: Awaiting approval, its permissions, then Approved, as the guards require (7.3). */
async function writeRole(
  context: TransactionContext,
  draft: RoleToWrite,
  from: string,
): Promise<{ roleId: string; versionId: string }> {
  const roleId = uuidv7();
  const versionId = uuidv7();
  await context.tx.insert(role).values({ id: roleId, code: draft.code, selfService: false });
  await context.tx
    .insert(roleVersion)
    .values({ id: versionId, roleId, name: draft.name, validDuring: from, decision: 'Awaiting approval' });
  if (draft.permissions.length > 0) {
    await context.tx.insert(rolePermission).values(
      draft.permissions.map((permission) => ({
        id: uuidv7(),
        roleVersionId: versionId,
        kind: 'action',
        recordType: permission.recordType,
        action: permission.action,
        fieldClass: null,
        fieldAccess: null,
      })),
    );
  }
  await context.tx.update(roleVersion).set({ decision: 'Approved' }).where(eq(roleVersion.id, versionId));
  return { roleId, versionId };
}

/** An all-members assignment from today: Awaiting approval, its scope rows, then Approved (4.3, 5.1; 7.3). */
async function writeAssignment(
  context: TransactionContext,
  actor: { readonly kind: 'user' | 'service-identity'; readonly id: string },
  roleId: string,
  from: string,
): Promise<string> {
  const assignmentId = uuidv7();
  await context.tx.insert(roleAssignment).values({
    id: assignmentId,
    appUserId: actor.kind === 'user' ? actor.id : null,
    serviceIdentityId: actor.kind === 'service-identity' ? actor.id : null,
    roleId,
    roleSelfService: false,
    ownRecords: false,
    scopeKey: scopeKeyOf(ALL_MEMBERS),
    validDuring: from,
    decision: 'Awaiting approval',
    withdrawalId: null,
  });
  await context.tx.insert(assignmentScope).values(
    (['legal-entity', 'place', 'brand'] as const).map((dimension) => ({
      id: uuidv7(),
      roleAssignmentId: assignmentId,
      dimension,
      kind: 'all',
    })),
  );
  await context.tx.update(roleAssignment).set({ decision: 'Approved' }).where(eq(roleAssignment.id, assignmentId));
  return assignmentId;
}
