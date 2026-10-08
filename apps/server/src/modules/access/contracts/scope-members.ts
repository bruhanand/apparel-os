import type { PlaceMember } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';

/** A member a role assignment's scope may select: a legal entity, a place or a brand (access-and-approvals 5.1). */
export type ScopeMemberType = 'legal-entity' | 'site' | 'store' | 'business-unit' | 'brand';

export interface ScopeMember {
  readonly type: ScopeMemberType;
  readonly id: string;
}

/** A place a role assignment selects (access-and-approvals 5.2; structure-and-masters 3.9). */
export type SelectedPlace = PlaceMember;

/** The Stores and business units a selected place covers on a date (structure-and-masters 3.9). */
export interface PlaceExpansion {
  readonly storeIds: readonly string[];
  readonly businessUnitIds: readonly string[];
}

/**
 * The scope contract (module-map section 3, rule 6; access-and-approvals 5.1, 5.2; structure-and-masters 3.8, 3.9):
 * `access` defines it and never depends on the modules that own the members; `organisation` implements it for legal
 * entities and places, and `merchandise` for brands (S1-F03-T01). The composition root hands every implementation to
 * `access` at start under SCOPE_MEMBERS. A member type no implementation answers cannot be selected yet
 * (`access.scope-members-not-available`).
 */
export interface ScopeMembers {
  /** The member types this implementation answers. */
  readonly answers: readonly ScopeMemberType[];
  /**
   * Check scope membership, in the caller's transaction: of the members named, those that do not exist as the type
   * named, or have no approved version in force on any day of the assignment's dates `[validFrom, validTo)`. The
   * answer does not depend on what the caller's actor may see.
   */
  notFound(
    context: TransactionContext,
    members: readonly ScopeMember[],
    dates: { readonly validFrom: string; readonly validTo?: string | undefined },
  ): Promise<ScopeMember[]>;
  /**
   * Expand a place for access (module-map 4.11 and section 3, rule 6; structure-and-masters 3.8): the Stores linked to
   * a Site on the date and the business units at it, or the business units of a Store, or a unit itself. The design
   * names it as an operation of the contract; Authorise and row-level security never call it (access-and-approvals
   * 7.2), and an implementation that answers no place, as `merchandise`'s for brands, leaves it out.
   */
  expand?(context: TransactionContext, place: SelectedPlace, date: string): Promise<PlaceExpansion>;
}

/** The token under which the composition root provides the implementations, a `readonly ScopeMembers[]`. */
export const SCOPE_MEMBERS = 'access.ScopeMembers';
