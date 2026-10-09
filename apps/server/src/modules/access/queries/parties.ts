import type { RecordTypeDeclaration } from '@apparel-os/schemas';
import { inArray } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { appUser, role } from '../db/schema.js';
import { scopeCovers, type RecordFacts } from '../domain/scope.js';
import { assignmentsInForce } from './assignments.js';
import { userInForce } from './users.js';

// What other modules ask of users and roles as parties to their records: who holds a role within a record's scope,
// and the names a reader sees (access-and-approvals 11.2, 12.2; S1-F08-T02).

/** One question: does the user hold the role through an assignment whose scope covers the record's facts? */
export interface RoleHeldQuestion {
  readonly roleId: string;
  /** The record type whose declared scope facts are matched (5.3). */
  readonly recordType: string;
  readonly facts: RecordFacts;
}

/**
 * For each question, whether the user holds the role today, under the Organisation's timezone, through one Approved,
 * not withdrawn assignment whose scope covers the record's facts as its record type declares them (5.3): "a role
 * within the Site's scope" of 12.2. A persona grants nothing (PRD-ACS-002). With today not known, nobody holds any.
 */
export async function rolesHeld(
  context: TransactionContext,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
  userId: string,
  questions: readonly RoleHeldQuestion[],
): Promise<boolean[]> {
  if (questions.length === 0) return [];
  const today = await context.businessDate();
  if (today.kind === 'not-set') return questions.map(() => false);
  const assignments = await assignmentsInForce(context, today.date, userId);
  return questions.map((question) => {
    const declaration = registry.get(question.recordType);
    if (declaration === undefined) return false;
    return assignments.some(
      (assignment) =>
        assignment.roleId === question.roleId &&
        scopeCovers(assignment.scope, declaration, userId, question.facts).covered,
    );
  });
}

/** The names of users and roles: a user's display name in force, a role's code. Unknown identifiers are left out. */
export interface PartyNames {
  readonly users: ReadonlyMap<string, string>;
  readonly roles: ReadonlyMap<string, string>;
}

export async function partyNames(
  context: TransactionContext,
  userIds: readonly string[],
  roleIds: readonly string[],
): Promise<PartyNames> {
  const users = new Map<string, string>();
  const roles = new Map<string, string>();
  const knownUsers =
    userIds.length === 0
      ? []
      : await context.tx
          .select({ id: appUser.id, login: appUser.login })
          .from(appUser)
          .where(inArray(appUser.id, [...new Set(userIds)]));
  for (const user of knownUsers) {
    const inForce = await userInForce(context, user.id);
    // A user whose first version waits has no name in force yet; their login stands for them.
    users.set(user.id, inForce?.displayName ?? user.login);
  }
  if (roleIds.length > 0) {
    const rows = await context.tx
      .select({ id: role.id, code: role.code })
      .from(role)
      .where(inArray(role.id, [...new Set(roleIds)]));
    for (const row of rows) roles.set(row.id, row.code);
  }
  return { users, roles };
}
