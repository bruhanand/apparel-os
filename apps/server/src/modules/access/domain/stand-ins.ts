import type { Paise } from '@apparel-os/domain';
import type { AssignmentScope } from '@apparel-os/schemas';
import { limitCovers, type LimitedValue, type LimitRow } from './approval-limits.js';

// Stand-in grants: whether a grant is within its giver's authority, and whether a value is within a grant's action
// (access-and-approvals 9.3, 10; PRD-ACS-016, PRD-ACS-018, POL-02.20; S1-F05-T02). Pure: no database, no clock.

/** One action a grant gives, with its limit, as the database keeps it (13.1; migration 0041). */
export interface GrantAction {
  readonly actionType: string;
  /** The limit on the rule's basis, in paise, or null when it states no value (PRD-MOD-014). */
  readonly amount: Paise | null;
  readonly unlimited: boolean;
  readonly coversUnknown: boolean;
}

type Dimension<Member> =
  | { readonly kind: 'all' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'selected'; readonly members: readonly Member[] };

function dimensionWithin<Member>(
  inner: Dimension<Member>,
  outer: Dimension<Member>,
  key: (member: Member) => string,
): boolean {
  if (inner.kind === 'empty' || outer.kind === 'empty') return false;
  if (outer.kind === 'all') return true;
  if (inner.kind === 'all') return false;
  const allowed = new Set(outer.members.map(key));
  return inner.members.every((member) => allowed.has(key(member)));
}

/**
 * Whether a grant's scope is within another scope (access-and-approvals 5.1, 10): in each dimension, all members within
 * all members only, and selected members within all members or the same members or more. A place member is matched by
 * its own type and identifier: the place tree is never expanded, so a Store under a selected Site is not taken as
 * within it, which may refuse a grant that is within but never admits one that is wider (5.3). A scope empty in any
 * dimension grants nothing, so it is within nothing and nothing is within it (PRD-ACS-005). Own-record scope is
 * never a grant's.
 */
export function scopeWithin(inner: AssignmentScope, outer: AssignmentScope): boolean {
  if (inner.kind !== 'dimensions' || outer.kind !== 'dimensions') return false;
  return (
    dimensionWithin(inner.legalEntity, outer.legalEntity, (member) => member) &&
    dimensionWithin(inner.place, outer.place, (member) => `${member.type}:${member.id}`) &&
    dimensionWithin(inner.brand, outer.brand, (member) => member)
  );
}

/**
 * Whether a limit of the person stood in for gives a grant's action (access-and-approvals 9.2, 10; POL-02.09,
 * PRD-ACS-016): a value up to the limit's own amount, or any under explicit unlimited authority; explicit unlimited
 * authority only from explicit unlimited authority; authority over Unknown value only from the same. An action stating
 * no value needs nothing of the limit.
 */
export function limitGivesAction(limit: LimitRow, action: GrantAction): boolean {
  if (action.coversUnknown && !limit.coversUnknown) return false;
  if (action.unlimited) return limit.unlimited;
  if (action.amount !== null) return limit.unlimited || (limit.amount !== null && action.amount <= limit.amount);
  return true;
}

/** Whether a value is within a grant's action, as a limit covers one (9.2, 9.3; PRD-ACS-016). */
export function grantActionCovers(action: GrantAction, value: LimitedValue): boolean {
  return limitCovers(
    {
      id: '',
      holder: { kind: 'individual', userId: '', roleAssignmentId: '' },
      amount: action.amount,
      unlimited: action.unlimited,
      coversUnknown: action.coversUnknown,
    },
    value,
  );
}
