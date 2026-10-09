import type { RecordTypeDeclaration } from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import {
  LOCK_STEP,
  lockTable,
  type CommandRefusal,
  type LockMode,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import { roleAssignment, roleVersion } from '../db/schema.js';
import { authorise, type AuthoriseRequest } from '../queries/authorise.js';
import { serviceIdentityActiveOn } from '../queries/service-identities.js';
import { userInForce } from '../queries/users.js';

// The authority rows of step 0 (code-house-rules 8.2 "Authority first"; access-and-approvals 7.1 step 4; stock-ledger
// 10.3, 10.4; PRD-INT-003; RR-325): the acting user or service identity and the role assignment Authorise returned. A
// command relying on them locks them in shared mode, so such commands never wait for each other; a command changing
// one, such as disabling a user or withdrawing an assignment, locks it exclusively at the same step. The lock target is
// the identity row, not its versions. The role the assignment grants joins the step (DEC-118, RR-360): shared when
// relied on, exclusive when a decision makes a version of it take effect, and under the locks the command rechecks
// the role's version in force. The approval limit a decision relies on joins the step (S1-F05-T01); stand-in grants
// join it with S1-F05-T02.

const APP_USER = lockTable('access', 'app_user');
const SERVICE_IDENTITY = lockTable('access', 'service_identity');
const ROLE_ASSIGNMENT = lockTable('access', 'role_assignment');
const ROLE = lockTable('access', 'role');
const APPROVAL_LIMIT = lockTable('access', 'approval_limit');

/** An actor whose authority a command relies on or changes (access-and-approvals 2.1, 2.3). */
export interface AuthorityActor {
  readonly kind: 'user' | 'service-identity';
  readonly id: string;
}

/** The identity row of a user or service identity, as a step-0 lock target. */
export function identityTarget(actor: AuthorityActor, mode: LockMode): LockTarget {
  return { table: actor.kind === 'user' ? APP_USER : SERVICE_IDENTITY, id: actor.id, mode };
}

/** A role assignment, as a step-0 lock target. */
export function assignmentTarget(assignmentId: string, mode: LockMode): LockTarget {
  return { table: ROLE_ASSIGNMENT, id: assignmentId, mode };
}

/** A role, as a step-0 lock target (DEC-118, RR-360). */
export function roleTarget(roleId: string, mode: LockMode): LockTarget {
  return { table: ROLE, id: roleId, mode };
}

/**
 * An approval limit, as a step-0 lock target (access-and-approvals 9.5; S1-F05-T01): shared by a decision relying on
 * it, exclusive by the decision that approves it or a limit that ends it, so the two never pass each other.
 */
export function limitTarget(limitId: string, mode: LockMode): LockTarget {
  return { table: APPROVAL_LIMIT, id: limitId, mode };
}

/**
 * The rows a command relies on: the actor, the assignment Authorise returned and the role it grants, all shared
 * (code-house-rules 8.2; DEC-118). The role is left out only when the assignment names none, which no row does.
 */
export function reliedAuthorityTargets(
  actor: AuthorityActor,
  roleAssignmentId: string,
  roleId: string | undefined,
): LockTarget[] {
  return [
    identityTarget(actor, 'shared'),
    assignmentTarget(roleAssignmentId, 'shared'),
    ...(roleId === undefined ? [] : [roleTarget(roleId, 'shared')]),
  ];
}

/** The role an assignment grants, read before the step-0 locks so that it can be locked with them. */
export async function roleOfAssignment(context: TransactionContext, roleAssignmentId: string) {
  const [row] = await context.tx
    .select({ roleId: roleAssignment.roleId })
    .from(roleAssignment)
    .where(eq(roleAssignment.id, roleAssignmentId));
  return row?.roleId;
}

/**
 * The role's version in force today (access-and-approvals 4.2), or undefined when none is. Read before the step-0
 * locks and again under them: a difference means a version took effect meanwhile (code-house-rules 8.2; RR-360).
 */
export async function roleVersionInForce(context: TransactionContext, roleId: string): Promise<string | undefined> {
  const date = await context.businessDate();
  if (date.kind === 'not-set') return undefined;
  const [row] = await context.tx
    .select({ id: roleVersion.id })
    .from(roleVersion)
    .where(
      and(
        eq(roleVersion.roleId, roleId),
        eq(roleVersion.decision, 'Approved'),
        sql`${roleVersion.validDuring} @> ${date.date}::date`,
      ),
    );
  return row?.id;
}

/**
 * The step-0 rows of a command relying on an assignment, with what to recheck under them: the role's version in
 * force when they were planned. `changed` says whether it differs under the locks (code-house-rules 8.2; DEC-118).
 */
export async function reliedAuthority(
  context: TransactionContext,
  actor: AuthorityActor,
  roleAssignmentId: string,
): Promise<{ readonly targets: LockTarget[]; readonly roleChanged: () => Promise<boolean> }> {
  const roleId = await roleOfAssignment(context, roleAssignmentId);
  const planned = roleId === undefined ? undefined : await roleVersionInForce(context, roleId);
  return {
    targets: reliedAuthorityTargets(actor, roleAssignmentId, roleId),
    roleChanged: async () => roleId !== undefined && (await roleVersionInForce(context, roleId)) !== planned,
  };
}

/**
 * Whether the actor is still Active today (access-and-approvals 2.1, 2.3, 7.1 step 4): read under the step-0 lock of
 * its identity row, since its versions change only under an exclusive lock of that row (code-house-rules 8.1).
 */
export async function actorActive(context: TransactionContext, actor: AuthorityActor): Promise<boolean> {
  const date = await context.businessDate();
  if (date.kind === 'not-set') return false;
  if (actor.kind === 'service-identity') return serviceIdentityActiveOn(context, actor.id, date.date);
  return (await userInForce(context, actor.id))?.state === 'Active';
}

/**
 * Takes the step-0 locks of a command that relies on the authority Authorise found before the transaction (the
 * route's guard): the actor, the assignment and the role it grants, with any rows of that step the command changes
 * itself, then rechecks under them that the actor is still Active, that the role's version in force is the one seen
 * before the locks (DEC-118, RR-360), and that the same assignment still grants the action (code-house-rules 8.2; access-and-approvals 7.1
 * step 4; PRD-INT-001). Answers the refusal when it no longer holds; a different assignment granting it now is a
 * stale authority, to be tried again.
 */
export async function holdAuthority(
  context: TransactionContext,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
  actor: AuthorityActor,
  roleAssignmentId: string,
  need: Omit<AuthoriseRequest, 'actorId'>,
  changed: readonly LockTarget[] = [],
  further: readonly HeldNeed[] = [],
): Promise<CommandRefusal | undefined> {
  const held = [{ roleAssignmentId, need }, ...further];
  const relied = [];
  for (const each of held) relied.push(await reliedAuthority(context, actor, each.roleAssignmentId));
  // One step-0 call; the lock helper takes a row named twice once (code-house-rules 8.2).
  await context.lock(LOCK_STEP.authority, [...relied.flatMap((each) => each.targets), ...changed]);
  if (!(await actorActive(context, actor))) {
    return { kind: 'not-authorised', code: 'access.not-authorised', missing: [{ kind: 'user-state' }] };
  }
  for (const [index, each] of held.entries()) {
    // A version of the role took effect while the locks were taken: the authority changed, try again (RR-360).
    if (await relied[index]?.roleChanged()) return { kind: 'conflict', code: 'kernel.stale-version', missing: [] };
    const authorised = await authorise(context, registry, { ...each.need, actorId: actor.id });
    if (authorised.kind === 'refused') return { ...authorised.refusal, missing: [...authorised.refusal.missing] };
    if (authorised.roleAssignmentId !== each.roleAssignmentId) {
      return { kind: 'conflict', code: 'kernel.stale-version', missing: [] };
    }
  }
  return undefined;
}

/**
 * A further permission a command relies on besides its route's, with the assignment Authorise found for it, held at
 * the same step 0: preparing a unit with its first mapping needs edit on the mapping too (access-and-approvals 9.8b;
 * RR-444).
 */
export interface HeldNeed {
  readonly roleAssignmentId: string;
  readonly need: Omit<AuthoriseRequest, 'actorId'>;
}
