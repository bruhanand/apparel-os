import type { Paise } from '@apparel-os/domain';
import type { AssignmentScope } from '@apparel-os/schemas';

// Approval limits: who may decide a valued request and to whom it is offered (access-and-approvals 9.2, 9.3, 9.4;
// POL-02.09, POL-02.15, PRD-ACS-015, PRD-ACS-016; DEC-043). Pure: no database, no clock.

/** One approval limit in force today for the request's action type, as the database keeps it (13.1). */
export interface LimitRow {
  readonly id: string;
  readonly holder:
    | { readonly kind: 'role'; readonly roleId: string; readonly scope: AssignmentScope }
    | { readonly kind: 'individual'; readonly userId: string; readonly roleAssignmentId: string };
  /** The limit on the rule's basis, in paise, or null when it states no value (PRD-MOD-014). */
  readonly amount: Paise | null;
  readonly unlimited: boolean;
  readonly coversUnknown: boolean;
}

/** An assignment in force that grants approve on the request's record type and covers its facts (9.3). */
export interface CoveringAssignment {
  readonly assignmentId: string;
  readonly roleId: string;
}

/** A request's value on its basis: Unknown, never zero (PRD-MOD-015), or known in whole paise. */
export type LimitedValue = { readonly kind: 'unknown' } | { readonly kind: 'known'; readonly amountPaise: Paise };

/**
 * Where one approver stands against a valued request (9.3): covered, through one assignment and the limit relied on;
 * above, their limits falling short, with the highest finite one; no limit at all for the value; or an Unknown value
 * none of their limits gives explicit authority over (PRD-ACS-016).
 */
export type Authority =
  | { readonly kind: 'covered'; readonly assignmentId: string; readonly limit: LimitRow }
  | { readonly kind: 'above'; readonly highest: LimitRow }
  | { readonly kind: 'no-limit' }
  | { readonly kind: 'unknown-not-covered' };

/**
 * The limits that apply through one assignment (9.2): the user's individual limits naming that assignment, which
 * replace the role's for the user and action; otherwise the limits of the assignment's role whose scope covers the
 * request's facts (`covers`, as Authorise matches a scope; 5.3).
 */
export function limitsThrough(
  actorId: string,
  assignment: CoveringAssignment,
  limits: readonly LimitRow[],
  covers: (scope: AssignmentScope) => boolean,
): LimitRow[] {
  const individual = limits.filter(
    (limit) =>
      limit.holder.kind === 'individual' &&
      limit.holder.userId === actorId &&
      limit.holder.roleAssignmentId === assignment.assignmentId,
  );
  if (individual.length > 0) return individual;
  return limits.filter(
    (limit) => limit.holder.kind === 'role' && limit.holder.roleId === assignment.roleId && covers(limit.holder.scope),
  );
}

/**
 * Whether a limit covers a value (9.2, 9.3): a known value at most its amount, or any known value under explicit
 * unlimited authority; an Unknown value only under explicit authority over Unknown (PRD-ACS-016).
 */
export function limitCovers(limit: LimitRow, value: LimitedValue): boolean {
  if (value.kind === 'unknown') return limit.coversUnknown;
  return limit.unlimited || (limit.amount !== null && value.amountPaise <= limit.amount);
}

/**
 * The order of limits, lowest first (9.4; DEC-043): finite limits by amount, then explicit unlimited authority, then a
 * limit stating no value; ties by identifier, so the order is the same at every read.
 */
export function compareLimits(a: LimitRow, b: LimitRow): number {
  const tier = (limit: LimitRow) => (limit.amount !== null ? 0 : limit.unlimited ? 1 : 2);
  if (tier(a) !== tier(b)) return tier(a) - tier(b);
  if (a.amount !== null && b.amount !== null && a.amount !== b.amount) return a.amount < b.amount ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * One approver's authority for a valued request (9.3): of the limits that apply through each covering assignment,
 * the lowest that covers the value is relied on, with its assignment, since approve and the limit must come through
 * the same assignment (PRD-ACS-004). A missing limit grants nothing (POL-02.09).
 */
export function authorityOf(
  actorId: string,
  assignments: readonly CoveringAssignment[],
  limits: readonly LimitRow[],
  covers: (scope: AssignmentScope) => boolean,
  value: LimitedValue,
): Authority {
  const through = assignments.flatMap((assignment) =>
    limitsThrough(actorId, assignment, limits, covers).map((limit) => ({ assignment, limit })),
  );
  const covering = through
    .filter((each) => limitCovers(each.limit, value))
    .sort((a, b) => compareLimits(a.limit, b.limit));
  const relied = covering[0];
  if (relied !== undefined) {
    return { kind: 'covered', assignmentId: relied.assignment.assignmentId, limit: relied.limit };
  }
  if (value.kind === 'unknown') return through.length === 0 ? { kind: 'no-limit' } : { kind: 'unknown-not-covered' };
  const finite = through.map((each) => each.limit).filter((limit) => limit.amount !== null);
  const highest = finite.sort((a, b) => compareLimits(b, a))[0];
  return highest === undefined ? { kind: 'no-limit' } : { kind: 'above', highest };
}

/**
 * To whom a valued request is offered (9.4; POL-02.09, DEC-043): the eligible approvers whose relied-on limit is the
 * lowest that covers it, explicit unlimited authority coming after every finite limit; an Unknown value to every
 * approver with explicit authority over Unknown (PRD-ACS-016). Nobody, when nobody is eligible: the request stays
 * Awaiting approval. Answers the actors offered, in the order given.
 */
export function offeredTo(
  candidates: readonly { readonly actorId: string; readonly authority: Authority }[],
  value: LimitedValue,
): string[] {
  const covered = candidates.flatMap((candidate) =>
    candidate.authority.kind === 'covered' ? [{ actorId: candidate.actorId, limit: candidate.authority.limit }] : [],
  );
  if (value.kind === 'unknown') return covered.map((each) => each.actorId);
  const lowest = [...covered].sort((a, b) => compareLimits(a.limit, b.limit))[0];
  if (lowest === undefined) return [];
  const level = (limit: LimitRow) =>
    limit.amount !== null ? `amount:${String(limit.amount)}` : String(limit.unlimited);
  return covered.filter((each) => level(each.limit) === level(lowest.limit)).map((each) => each.actorId);
}
