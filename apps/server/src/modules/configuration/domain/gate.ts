import type { Activity, MissingItem, PermissionAction, PolicyNumber, SettingOrigin } from '@apparel-os/schemas';
import { PRODUCTION_COMPOSITION, type Composition, type TransactionContext } from '../../../kernel/index.js';

// What the policy gate asks of the other modules (module-map 4.4, section 3 rule 6; domain-model 3.6, DM-6;
// code-house-rules 12.14; PRD-SEC-017; S1-F04-T01). `configuration` calls no one: each module declares, at start, the
// policy-dependent operations it owns and the validity checks of its own configured records, and the gate asks them
// through these shapes. The defining module never depends on the implementing one.

/**
 * A policy-dependent operation, as its owning module declares it (module-map 4.4; S1-F04-T01 Build): its governing
 * policy, the capability that switches it on, whether an activity grant applies, and the validity checks of the
 * configured records it needs. Only operations that record business effects are declared: stock or money posting,
 * opening-data publishing, device selling. Setup and configuration operations are not policy-gated (DEC-116).
 */
export interface GatedOperation {
  /** `<module>.<operation>`; a synthetic one, for tests only, begins `test-` (code-house-rules 11.1). */
  readonly code: string;
  readonly policy: PolicyNumber;
  /** `<module>.<feature>`, off for every Organisation until an Admin switches it on (PRD-SEC-017). */
  readonly capability: string;
  /** For receiving, movement and selling: the activity the Site or business unit must hold (PRD-LIF-001). */
  readonly activity: Activity | null;
  /** The validity checks it needs, each with the subject it asks about, such as an exception type it raises. */
  readonly checks: readonly { readonly check: string; readonly subject?: string }[];
  /**
   * For an operation with an activity: the people it needs at the unit, which the users-and-access readiness check
   * reads (domain-model 3.6; PRD-ACS-006; DEC-116; S1-F04-T02). None declared needs none.
   */
  readonly needs?: ActivityNeeds;
}

/**
 * The permissions an operation needs someone at the unit to hold, and its independently approved actions, each with
 * the permission that prepares it and the record type approve is held on (access-and-approvals 8, 9.3; PRD-ACS-006).
 */
export interface ActivityNeeds {
  readonly permissions?: readonly { readonly action: PermissionAction; readonly recordType: string }[];
  readonly approvals?: readonly {
    readonly actionType: string;
    readonly prepare: { readonly action: PermissionAction; readonly recordType: string };
    readonly approveRecordType: string;
  }[];
}

/** One configured value a module holds, as it reports it for validation and for its origin (DM-6; 12.14). */
export interface ConfiguredValue {
  /** The value's identity within its check, such as a setting version's identifier. */
  readonly key: string;
  readonly origin: SettingOrigin;
  /** The people who entered it: its preparers (access-and-approvals 9.1). The validator must be none of them. */
  readonly enteredBy: readonly string[];
}

/** What the gate asks a validity check about: the operation's subject and its place, where it has one. */
export interface ValiditySubject {
  readonly subject: string | null;
  readonly siteId: string | null;
  readonly businessUnitId: string | null;
}

/** A validity check's answer: valid, or what is missing, as identifiers and codes only (code-house-rules 12.3). */
export type ValidityAnswer =
  { readonly kind: 'valid' } | { readonly kind: 'invalid'; readonly missing: readonly MissingItem[] };

/**
 * A module's check of its own configured records (module-map section 3, rule 6; 4.4 "Register a validity check"). It
 * runs as the asking actor, in the caller's transaction, and reads only its own module's tables.
 */
export interface ValidityCheck {
  /** `<module>.<what>`; a synthetic one begins `test-`. */
  readonly code: string;
  /**
   * The policy whose real values it holds, which a validation covers (DM-6), or null where its records are no
   * policy's values, as a number series is not.
   */
  readonly policy: PolicyNumber | null;
  /** Whether the records the operation needs are valid for this subject and place. */
  check(context: TransactionContext, subject: ValiditySubject): Promise<ValidityAnswer>;
  /** Every value it holds that is in force now or later, Organisation-wide, with its origin and who entered it. */
  values(context: TransactionContext): Promise<readonly ConfiguredValue[]>;
}

/** The prefix of every synthetic operation, capability and check code (code-house-rules 11.1). */
export const SYNTHETIC_GATE_PREFIX = 'test-';

/**
 * The operations and checks the modules declared, kept by `configuration` (module-map 4.4). Each module registers at
 * start; a code registered twice, an operation naming a check no one registered, or a synthetic code outside a test
 * composition is a defect of the composition, refused at once.
 */
export class GateRegistry {
  private readonly operationsByCode = new Map<string, GatedOperation>();
  private readonly checksByCode = new Map<string, ValidityCheck>();

  /** A synthetic check, for tests only, comes with the test composition (stock-ledger 15.3; code-house-rules 11.1). */
  registerCheck(check: ValidityCheck, composition: Composition = PRODUCTION_COMPOSITION): void {
    admit(check.code, 'validity check', composition);
    if (this.checksByCode.has(check.code)) throw new Error(`Validity check ${check.code} is registered twice`);
    this.checksByCode.set(check.code, check);
  }

  /** A synthetic operation, for tests only, comes with the test composition. */
  registerOperation(operation: GatedOperation, composition: Composition = PRODUCTION_COMPOSITION): void {
    admit(operation.code, 'operation', composition);
    admit(operation.capability, 'capability', composition);
    if (this.operationsByCode.has(operation.code)) throw new Error(`Operation ${operation.code} is registered twice`);
    this.operationsByCode.set(operation.code, operation);
  }

  operation(code: string): GatedOperation | undefined {
    return this.operationsByCode.get(code);
  }

  /** Every operation, in code order. */
  operations(): readonly GatedOperation[] {
    return [...this.operationsByCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  check(code: string): ValidityCheck {
    const found = this.checksByCode.get(code);
    if (found === undefined) throw new Error(`No validity check ${code} is registered`);
    return found;
  }

  /** The checks that hold a policy's real values, in code order (DM-6). */
  checksOfPolicy(policy: PolicyNumber): readonly ValidityCheck[] {
    return [...this.checksByCode.values()]
      .filter((each) => each.policy === policy)
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  hasCapability(capability: string): boolean {
    return [...this.operationsByCode.values()].some((each) => each.capability === capability);
  }
}

function admit(code: string, what: string, composition: Composition): void {
  if (code.startsWith(SYNTHETIC_GATE_PREFIX) && composition.kind !== 'test') {
    throw new Error(`A synthetic ${what} ${code} is registered outside a test composition (code-house-rules 11.1)`);
  }
}
