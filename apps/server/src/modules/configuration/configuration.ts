import {
  policyNumbers,
  type MissingItem,
  type PolicyNumber,
  type PolicyRecordOrigin,
  type PolicySignatureDraft,
  type PolicyValidationDraft,
  type SettingOrigin,
} from '@apparel-os/schemas';
import { CommandDefect, type CommandRefusal, type Composition, type TransactionContext } from '../../kernel/index.js';
import type { AuditInterface } from '../audit/index.js';
import {
  originRefusal,
  recordSignature,
  recordValidation,
  switchCapability,
  type Outcome,
  type Recorder,
} from './commands/policy-status.js';
import { grantActivity, grantedActivities, type ActivityGrantWriter } from './commands/activity-grants.js';
import type { PolicyEvidence } from './contracts/policy-evidence.js';
import { GateRegistry, type GatedOperation, type ValidityCheck } from './domain/gate.js';
import type { DeploymentEnvironment } from './domain/origins.js';
import {
  availability,
  capabilityOn,
  covers,
  latestSignature,
  latestValidation,
  policyMissing,
  policyValues,
  type GateReading,
  type PlaceAsked,
} from './queries/availability.js';

/** What Check availability answers for one operation (module-map 4.4). */
export interface AvailabilityAnswer {
  readonly operation: string;
  readonly policy: PolicyNumber;
  readonly state: 'available' | 'unavailable';
  readonly missing: readonly MissingItem[];
}

/** A policy's readiness, as the read model holds it (module-map 4.4 "Read model: policy readiness"). */
export interface PolicyReadinessRow {
  readonly policy: PolicyNumber;
  readonly state: 'Open' | 'Signed';
  readonly signature: {
    readonly signatureId: string;
    readonly signatory: string;
    readonly signedOn: string;
    readonly origin: PolicyRecordOrigin;
    readonly recordedAt: Date;
    readonly evidence: readonly string[];
  } | null;
  readonly validation: {
    readonly validationId: string;
    readonly origin: PolicyRecordOrigin;
    readonly validatedByUserId: string;
    readonly validatedAt: Date;
    readonly evidence: readonly string[];
    readonly current: boolean;
  } | null;
  readonly values: readonly {
    readonly check: string;
    readonly key: string;
    readonly origin: SettingOrigin;
    readonly enteredByYou: boolean;
  }[];
  readonly missing: readonly MissingItem[];
  readonly operations: readonly {
    readonly operation: string;
    readonly capability: string;
    readonly capabilityOn: boolean;
    readonly activity: GatedOperation['activity'];
    readonly state: 'available' | 'unavailable';
    readonly missing: readonly MissingItem[];
  }[];
}

export interface ConfigurationDependencies {
  readonly audit: AuditInterface;
  readonly environment: DeploymentEnvironment;
  /** Where a signature's and a validation's evidence files are attached (DEC-116); files-imports implements it. */
  readonly evidence?: PolicyEvidence | undefined;
}

/**
 * The configuration module's policy gate (module-map 4.4; domain-model 3.6; access-and-approvals 7.1 step 2;
 * S1-F04-T01): the status of each policy, the validation of its real values, the capabilities, the activity grants
 * and the one answer to "is this operation available here, now?". It calls no business module: the modules register
 * their operations and validity checks with it at start. Every operation joins the caller's transaction.
 */
export interface ConfigurationInterface {
  /** Declares a policy-dependent operation, at start; a synthetic one only in a test composition. */
  registerOperation(operation: GatedOperation, composition?: Composition): void;
  /** Registers a module's check of its own configured records, at start (module-map 4.4). */
  registerCheck(check: ValidityCheck, composition?: Composition): void;
  /** Every operation declared. */
  operations(): readonly GatedOperation[];
  /**
   * Check availability (module-map 4.4): every command and job step of a policy-dependent operation asks it at step 2
   * of module-map 6.1, and a refusal carries `missing` and `next` (code-house-rules 12.3). Undefined for an operation
   * no module declared.
   */
  checkAvailability(
    context: TransactionContext,
    operation: string,
    place: PlaceAsked,
  ): Promise<AvailabilityAnswer | undefined>;
  /**
   * The refusal of a value of an origin this environment does not accept: synthetic outside local work, tests and
   * `dev` or on an Organisation that is not synthetic; test-setup outside `kdps-test` (code-house-rules 12.14).
   */
  originRefusal(context: TransactionContext, origin: SettingOrigin): CommandRefusal | undefined;
  /** The policy readiness read model, as the reader sees it: whether the reader entered each value (DM-6). */
  readiness(context: TransactionContext, readerId: string): Promise<PolicyReadinessRow[]>;
  recordSignature(
    context: TransactionContext,
    recorder: Recorder,
    policy: PolicyNumber,
    draft: PolicySignatureDraft,
  ): Promise<Outcome<{ signatureId: string }>>;
  recordValidation(
    context: TransactionContext,
    validator: Recorder,
    policy: PolicyNumber,
    draft: PolicyValidationDraft,
  ): Promise<Outcome<{ validationId: string }>>;
  switchCapability(
    context: TransactionContext,
    by: Recorder,
    capability: string,
    on: boolean,
  ): Promise<Outcome<{ capability: string; on: boolean }>>;
  /**
   * What a policy itself lacks now: its signature, its validated values, a value of an origin not accepted here; empty
   * when Signed and validated. The required-policies readiness check asks it for each policy an activity's operations
   * need (domain-model 3.6; DEC-116; S1-F04-T02).
   */
  policyMissing(context: TransactionContext, policy: PolicyNumber): Promise<MissingItem[]>;
  /**
   * The one writer of activity grants (module-map 4.4 "Grant or withdraw an activity"): claimed once, at start, by the
   * composition root for `site-lifecycle`'s decision effect, which writes a grant in the transaction of the decision
   * approving it, with its audit record and `configuration.activity-changed` (PRD-LIF-001; S1-F04 review H4). A
   * second claim is a defect of the composition.
   */
  claimActivityGrants(): ActivityGrantWriter;
  /** The activities granted now at a business unit, or at each unit of a Site (structure-and-masters 3.7). */
  grantedActivities(
    context: TransactionContext,
    place: { readonly siteId: string; readonly businessUnitId?: string | undefined },
  ): ReturnType<typeof grantedActivities>;
}

/** The next action an unavailable operation names: open Setup › Policy readiness (design-language 10.17). */
export const OPEN_POLICY_READINESS = 'configuration.open-policy-readiness';

/**
 * The refusal of a command whose operation Available refuses (access-and-approvals 7.1 step 2; code-house-rules 12.3),
 * or undefined when it is available.
 */
export function unavailableRefusal(answer: AvailabilityAnswer): CommandRefusal | undefined {
  if (answer.state === 'available') return undefined;
  return {
    kind: 'unavailable',
    code: 'configuration.operation-unavailable',
    missing: answer.missing,
    next: OPEN_POLICY_READINESS,
  };
}

export class Configuration implements ConfigurationInterface {
  private readonly registry = new GateRegistry();
  private grantsClaimed = false;

  constructor(private readonly dependencies: ConfigurationDependencies) {}

  private get reading(): GateReading {
    return { registry: this.registry, environment: this.dependencies.environment };
  }

  private get statusDependencies() {
    return { ...this.dependencies, evidence: this.dependencies.evidence, registry: this.registry };
  }

  registerOperation(operation: GatedOperation, composition?: Composition): void {
    this.registry.registerOperation(operation, composition);
  }

  registerCheck(check: ValidityCheck, composition?: Composition): void {
    this.registry.registerCheck(check, composition);
  }

  operations(): readonly GatedOperation[] {
    return this.registry.operations();
  }

  async checkAvailability(context: TransactionContext, code: string, place: PlaceAsked) {
    const operation = this.registry.operation(code);
    if (operation === undefined) return undefined;
    const missing = await availability(context, this.reading, operation, place);
    return {
      operation: code,
      policy: operation.policy,
      state: missing.length === 0 ? ('available' as const) : ('unavailable' as const),
      missing,
    };
  }

  originRefusal(context: TransactionContext, origin: SettingOrigin): CommandRefusal | undefined {
    return originRefusal(this.dependencies.environment, context, origin);
  }

  async readiness(context: TransactionContext, readerId: string): Promise<PolicyReadinessRow[]> {
    const rows: PolicyReadinessRow[] = [];
    for (const policy of policyNumbers) rows.push(await this.policyRow(context, policy, readerId));
    return rows;
  }

  private async policyRow(
    context: TransactionContext,
    policy: PolicyNumber,
    readerId: string,
  ): Promise<PolicyReadinessRow> {
    const values = await policyValues(context, this.registry, policy);
    const missing = await policyMissing(context, this.reading, policy, values);
    const signature = await latestSignature(context, policy);
    const validation = await latestValidation(context, policy);
    const operations = [];
    for (const operation of this.registry.operations().filter((each) => each.policy === policy)) {
      const blocked = await availability(context, this.reading, operation, {});
      operations.push({
        operation: operation.code,
        capability: operation.capability,
        capabilityOn: await capabilityOn(context, operation.capability),
        activity: operation.activity,
        state: blocked.length === 0 ? ('available' as const) : ('unavailable' as const),
        missing: blocked,
      });
    }
    return {
      policy,
      state: missing.some((item) => item.kind === 'policy' && item.lacks === 'signature') ? 'Open' : 'Signed',
      signature:
        signature === undefined
          ? null
          : {
              signatureId: signature.id,
              signatory: signature.signatory,
              signedOn: signature.signedOn,
              origin: signature.origin,
              recordedAt: signature.recordedAt,
              evidence: signature.evidenceAttachmentIds,
            },
      validation:
        validation === undefined
          ? null
          : {
              validationId: validation.id,
              origin: validation.origin,
              validatedByUserId: validation.validatedByUserId,
              validatedAt: validation.validatedAt,
              evidence: validation.evidenceAttachmentIds,
              current: covers(validation.validatedValues, values),
            },
      values: values.map((value) => ({
        check: value.check,
        key: value.key,
        origin: value.origin,
        enteredByYou: value.enteredBy.includes(readerId),
      })),
      missing,
      operations,
    };
  }

  recordSignature(context: TransactionContext, recorder: Recorder, policy: PolicyNumber, draft: PolicySignatureDraft) {
    return recordSignature(context, this.statusDependencies, recorder, policy, draft);
  }

  recordValidation(
    context: TransactionContext,
    validator: Recorder,
    policy: PolicyNumber,
    draft: PolicyValidationDraft,
  ) {
    return recordValidation(context, this.statusDependencies, validator, policy, draft);
  }

  switchCapability(context: TransactionContext, by: Recorder, capability: string, on: boolean) {
    return switchCapability(context, this.statusDependencies, by, capability, on);
  }

  async policyMissing(context: TransactionContext, policy: PolicyNumber): Promise<MissingItem[]> {
    return policyMissing(context, this.reading, policy, await policyValues(context, this.registry, policy));
  }

  claimActivityGrants(): ActivityGrantWriter {
    if (this.grantsClaimed)
      throw new CommandDefect('The activity grant writer is claimed once, at start (module-map 4.4)');
    this.grantsClaimed = true;
    const { audit } = this.dependencies;
    return { grant: (context, by, grant) => grantActivity(context, audit, by, grant) };
  }

  grantedActivities(
    context: TransactionContext,
    place: { readonly siteId: string; readonly businessUnitId?: string | undefined },
  ) {
    return grantedActivities(context, place);
  }
}
