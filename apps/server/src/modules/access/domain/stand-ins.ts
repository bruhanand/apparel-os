import type { AssignmentScope, PlaceMember } from '@apparel-os/schemas';
import { limitCovers, type LimitedValue, type ValueAuthority } from './approval-limits.js';

/** The Stores and business units a selected place covers on a day (access-and-approvals 5.2; structure-and-masters 3.9). */
export interface PlaceCover {
  readonly storeIds: readonly string[];
  readonly businessUnitIds: readonly string[];
}

// Stand-in grants: whether a grant is within its giver's authority, and whether a value is within a grant's action
// (access-and-approvals 9.3, 10; PRD-ACS-016, PRD-ACS-018, POL-02.20; S1-F05-T02). Pure: no database, no clock.

/** One action a grant gives, with its limit, as the database keeps it (13.1; migration 0041). */
export interface GrantAction extends ValueAuthority {
  readonly actionType: string;
}

type Dimension<Member> =
  | { readonly kind: 'all' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'selected'; readonly members: readonly Member[] };

function dimensionWithin<Member>(
  inner: Dimension<Member>,
  outer: Dimension<Member>,
  memberWithin: (member: Member, outerMembers: readonly Member[]) => boolean,
): boolean {
  if (inner.kind === 'empty' || outer.kind === 'empty') return false;
  if (outer.kind === 'all') return true;
  if (inner.kind === 'all') return false;
  return inner.members.every((member) => memberWithin(member, outer.members));
}

/** The key of a place member, as the expansions are kept: `<type>:<id>`. */
export const placeKey = (member: PlaceMember): string => `${member.type}:${member.id}`;

/**
 * Whether a grant's scope is within another scope (access-and-approvals 5.1, 5.2, 10): in each dimension, all members
 * within all members only, and selected members within all members or within the selected members. A place member is
 * within when the outer scope selects the same member, or selects a Site or Store whose expansion on the day (`covers`,
 * from the scope contract's place expansion, keyed by `placeKey`) holds it: a Store under a selected Site, a business
 * unit under a selected Site or Store (PRD-ACS-021). A place with no expansion given is matched only by itself, which
 * may refuse a grant that is within but never admits one that is wider (5.3). A scope empty in any dimension grants
 * nothing, so it is within nothing and nothing is within it (PRD-ACS-005). Own-record scope is never a grant's.
 */
export function scopeWithin(
  inner: AssignmentScope,
  outer: AssignmentScope,
  covers: ReadonlyMap<string, PlaceCover> = new Map(),
): boolean {
  if (inner.kind !== 'dimensions' || outer.kind !== 'dimensions') return false;
  const same = <Member>(member: Member, members: readonly Member[]) => members.includes(member);
  const placeWithin = (member: PlaceMember, members: readonly PlaceMember[]) =>
    members.some((each) => {
      if (placeKey(each) === placeKey(member)) return true;
      const cover = covers.get(placeKey(each));
      if (cover === undefined) return false;
      if (member.type === 'store') return each.type === 'site' && cover.storeIds.includes(member.id);
      if (member.type === 'business-unit') return cover.businessUnitIds.includes(member.id);
      return false;
    });
  return (
    dimensionWithin(inner.legalEntity, outer.legalEntity, same) &&
    dimensionWithin(inner.place, outer.place, placeWithin) &&
    dimensionWithin(inner.brand, outer.brand, same)
  );
}

/**
 * Whether a limit of the person stood in for gives a grant's action (access-and-approvals 9.2, 10; POL-02.09,
 * PRD-ACS-016): a value up to the limit's own amount, or any under explicit unlimited authority; explicit unlimited
 * authority only from explicit unlimited authority; authority over Unknown value only from the same. An action stating
 * no value needs nothing of the limit.
 */
export function limitGivesAction(limit: ValueAuthority, action: GrantAction): boolean {
  if (action.coversUnknown && !limit.coversUnknown) return false;
  if (action.unlimited) return limit.unlimited;
  if (action.amount !== null) return limit.unlimited || (limit.amount !== null && action.amount <= limit.amount);
  return true;
}

/** Whether a value is within a grant's action, as a limit covers one (9.2, 9.3; PRD-ACS-016). */
export function grantActionCovers(action: GrantAction, value: LimitedValue): boolean {
  return limitCovers(action, value);
}
