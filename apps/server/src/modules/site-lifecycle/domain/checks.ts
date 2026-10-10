import type { Activity, MissingItem, PolicyNumber, ReadinessCheck, ReadinessCheckCode } from '@apparel-os/schemas';
import type { BusinessUnitKind } from '@apparel-os/schemas';

// The readiness checks of a business unit for an activity, judged from what each module answered (module-map 4.16;
// domain-model 3.6; PRD-LIF-002, PRD-LIF-003, PRD-ORG-006, PRD-ACS-006, POL-10.08; DEC-116, DEC-117; S1-F04-T02). As
// the product owner answered RR-016: no replenishment threshold and no new business prerequisite. Pure: the answers
// are gathered in queries/checks.ts.

/** What the modules answered about the unit, the activity's operations and the people at the unit. */
export interface ReadinessFacts {
  readonly businessUnitId: string;
  readonly kind: BusinessUnitKind;
  /** `organisation`: the mapping in force today and its verification (structure-and-masters 3.4, 3.8). */
  readonly mapping: 'none' | 'unverified' | 'verified';
  /** `organisation`: the unit's locations in force and not retired today (3.5). */
  readonly locationsInForce: number;
  /** `configuration`: whether any operation declares the activity. */
  readonly operationsDeclared: boolean;
  /** `access`: each permission the activity's operations need, with who holds it at the unit. */
  readonly permissions: readonly {
    readonly action: string;
    readonly recordType: string;
    readonly holders: readonly string[];
  }[];
  /** `access`: each independently approved action, with who can prepare it and who can approve it at the unit. */
  readonly approvals: readonly {
    readonly actionType: string;
    readonly preparers: readonly string[];
    readonly approvers: readonly string[];
  }[];
  /** `configuration`: what each policy the operations need lacks; empty when the Available check passes for it. */
  readonly policies: readonly { readonly policy: PolicyNumber; readonly missing: readonly MissingItem[] }[];
  /** An approved, unpublished opening-data batch for the unit (imports-and-opening-data 10; DEC-117). */
  readonly openingPlanApproved: boolean;
  /** An explicit declaration that the unit genuinely holds no stock (PRD-LIF-003). */
  readonly zeroStockDeclared: boolean;
  /** `merchandise`: the brands its coverage holds in force today (structure-and-masters 3.3). */
  readonly brandsInForce: number;
}

function judged(check: ReadinessCheckCode, missing: MissingItem[]): ReadinessCheck {
  return { check, state: missing.length === 0 ? 'passed' : 'failed', missing };
}

const notNeeded = (check: ReadinessCheckCode): ReadinessCheck => ({ check, state: 'not-needed', missing: [] });

/** Whether two different people can prepare and approve: someone who prepares, and someone else who approves. */
function twoPeople(preparers: readonly string[], approvers: readonly string[]): boolean {
  return preparers.some((preparer) => approvers.some((approver) => approver !== preparer));
}

/**
 * Every check, in the order of `readinessCheckCodes`. The devices check (offline-counter section 11) joins with
 * S1-F12-T02.
 */
export function judgeReadiness(activity: Activity, facts: ReadinessFacts): ReadinessCheck[] {
  const unit = facts.businessUnitId;
  const mapping: MissingItem[] =
    facts.mapping === 'verified'
      ? []
      : [{ kind: 'mapping', businessUnitId: unit, lacks: facts.mapping === 'none' ? 'mapping' : 'verification' }];
  const locations: MissingItem[] = facts.locationsInForce > 0 ? [] : [{ kind: 'location', businessUnitId: unit }];
  const people: MissingItem[] = [
    ...facts.permissions
      .filter((each) => each.holders.length === 0)
      .map((each) => ({ kind: 'permission-holder', action: each.action, recordType: each.recordType })),
    ...facts.approvals
      .filter((each) => !twoPeople(each.preparers, each.approvers))
      .map((each) => ({ kind: 'approval-people', actionType: each.actionType })),
  ];
  // An activity no operation declares has nothing whose policy could be checked, so it is not ready (DEC-116).
  const policies: MissingItem[] = facts.operationsDeclared
    ? facts.policies.flatMap((each) => [...each.missing])
    : [{ kind: 'activity-operation', activity }];
  const stockPlan =
    facts.kind === 'office'
      ? notNeeded('stock-plan')
      : judged(
          'stock-plan',
          facts.openingPlanApproved || facts.zeroStockDeclared ? [] : [{ kind: 'stock-plan', businessUnitId: unit }],
        );
  const brands =
    facts.kind === 'brand-counter'
      ? judged('brand-coverage', facts.brandsInForce > 0 ? [] : [{ kind: 'brand-coverage', businessUnitId: unit }])
      : notNeeded('brand-coverage');
  return [
    judged('mappings', mapping),
    judged('locations', locations),
    judged('users-and-access', people),
    judged('required-policies', policies),
    stockPlan,
    brands,
  ];
}

/** Whether every check passed or is not needed. */
export function allPassed(checks: readonly ReadinessCheck[]): boolean {
  return checks.every((each) => each.state !== 'failed');
}

/** What a refusal names: each failing check, then what it lacks (PRD-UXP-003). */
export function failingItems(checks: readonly ReadinessCheck[]): MissingItem[] {
  return checks
    .filter((each) => each.state === 'failed')
    .flatMap((each) => [{ kind: 'readiness-check', check: each.check }, ...each.missing]);
}
