import type { RecordTypeDeclaration } from '@apparel-os/schemas';
import {
  LOCK_STEP,
  lockTable,
  type CommandRefusal,
  type LockMode,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import { authorise, type AuthoriseRequest } from '../queries/authorise.js';
import { serviceIdentityActiveOn } from '../queries/service-identities.js';
import { userInForce } from '../queries/users.js';

// The authority rows of step 0 (code-house-rules 8.2 "Authority first"; access-and-approvals 7.1 step 4; stock-ledger
// 10.3, 10.4; PRD-INT-003; RR-325): the acting user or service identity and the role assignment Authorise returned. A
// command relying on them locks them in shared mode, so such commands never wait for each other; a command changing
// one, such as disabling a user or withdrawing an assignment, locks it exclusively at the same step. The lock target is
// the identity row, not its versions. Approval limits and stand-in grants join the step with S1-F05.

const APP_USER = lockTable('access', 'app_user');
const SERVICE_IDENTITY = lockTable('access', 'service_identity');
const ROLE_ASSIGNMENT = lockTable('access', 'role_assignment');

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

/** The rows a command relies on: the actor and the assignment Authorise returned, both shared. */
export function reliedAuthorityTargets(actor: AuthorityActor, roleAssignmentId: string): LockTarget[] {
  return [identityTarget(actor, 'shared'), assignmentTarget(roleAssignmentId, 'shared')];
}

/**
 * Whether the actor is still Active today (access-and-approvals 2.1, 2.3, 7.1 step 4): read under the step-0 lock of
 * its identity row, since its versions change only under an exclusive lock of that row (code-house-rules 8.1).
 */
export async function actorActive(context: TransactionContext, actor: AuthorityActor): Promise<boolean> {
  const date = await context.businessDate();
  if (date.kind === 'not-set') return false;
  if (actor.kind === 'service-identity') return serviceIdentityActiveOn(context, actor.id, date.date);
  return (await userInForce(context, actor.id, date.date))?.state === 'Active';
}

/**
 * Takes the step-0 locks of a command that relies on the authority Authorise found before the transaction (the
 * route's guard), with any rows of that step the command changes itself, then rechecks under them that the actor is
 * still Active and that the same assignment still grants the action (code-house-rules 8.2; access-and-approvals 7.1
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
): Promise<CommandRefusal | undefined> {
  await context.lock(LOCK_STEP.authority, [...reliedAuthorityTargets(actor, roleAssignmentId), ...changed]);
  if (!(await actorActive(context, actor))) {
    return { kind: 'not-authorised', code: 'access.not-authorised', missing: [{ kind: 'user-state' }] };
  }
  const authorised = await authorise(context, registry, { ...need, actorId: actor.id });
  if (authorised.kind === 'refused') return { ...authorised.refusal, missing: [...authorised.refusal.missing] };
  if (authorised.roleAssignmentId !== roleAssignmentId) {
    return { kind: 'conflict', code: 'kernel.stale-version', missing: [] };
  }
  return undefined;
}
