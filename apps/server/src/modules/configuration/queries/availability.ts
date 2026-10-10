import type { MissingItem, PolicyNumber, PolicyRecordOrigin, SettingOrigin } from '@apparel-os/schemas';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { activityGrant, capabilityChange, policySignature, policyValidation } from '../db/schema.js';
import type { GatedOperation, GateRegistry } from '../domain/gate.js';
import { originAccepted, type DeploymentEnvironment } from '../domain/origins.js';

// Check availability and the policy readiness read model (module-map 4.4; access-and-approvals 7.1 step 2;
// domain-model 3.6, DM-6; code-house-rules 12.3, 12.14; PRD-SEC-017, PRD-UXP-003, PRD-LIF-001; DEC-092, DEC-105,
// DEC-116; S1-F04-T01). It only answers: it writes nothing, so it runs in a read or inside the asking command.

/** Where an operation is asked about, where an activity grant applies (PRD-LIF-001). */
export interface PlaceAsked {
  readonly siteId?: string | undefined;
  readonly businessUnitId?: string | undefined;
}

/** One configured value of a policy, with the check that reports it (DM-6). */
export interface PolicyValue {
  readonly check: string;
  readonly key: string;
  readonly origin: SettingOrigin;
  readonly enteredBy: readonly string[];
}

export interface GateReading {
  readonly registry: GateRegistry;
  readonly environment: DeploymentEnvironment;
}

/** Whether a capability is on: its latest change says on. With none it is off (PRD-SEC-017). */
export async function capabilityOn(context: TransactionContext, capability: string): Promise<boolean> {
  const [latest] = await context.tx
    .select({ on: capabilityChange.switchedOn })
    .from(capabilityChange)
    .where(eq(capabilityChange.capability, capability))
    .orderBy(desc(capabilityChange.id))
    .limit(1);
  return latest?.on === true;
}

export async function latestSignature(context: TransactionContext, policy: PolicyNumber) {
  const [latest] = await context.tx
    .select()
    .from(policySignature)
    .where(eq(policySignature.policyNumber, policy))
    .orderBy(desc(policySignature.id))
    .limit(1);
  return latest;
}

export async function latestValidation(context: TransactionContext, policy: PolicyNumber) {
  const [latest] = await context.tx
    .select()
    .from(policyValidation)
    .where(eq(policyValidation.policyNumber, policy))
    .orderBy(desc(policyValidation.id))
    .limit(1);
  return latest;
}

/** Every value the checks of the policy hold, in a stable order (DM-6). */
export async function policyValues(
  context: TransactionContext,
  registry: GateRegistry,
  policy: PolicyNumber,
): Promise<PolicyValue[]> {
  const values: PolicyValue[] = [];
  for (const check of registry.checksOfPolicy(policy)) {
    for (const value of await check.values(context)) values.push({ check: check.code, ...value });
  }
  return values.sort((a, b) => valueName(a).localeCompare(valueName(b)));
}

/** How a validation names a value it covers: `<check>:<key>`. */
export function valueName(value: Pick<PolicyValue, 'check' | 'key'>): string {
  return `${value.check}:${value.key}`;
}

/** Whether a validation covers exactly the values configured now: one more, one fewer or one changed needs another. */
export function covers(validated: readonly string[], values: readonly PolicyValue[]): boolean {
  const now = values.map(valueName).sort();
  const then = [...validated].sort();
  return now.length === then.length && now.every((name, index) => name === then[index]);
}

/** Whether a Signed record or a validation counts here: one of an origin this environment does not accept does not. */
function counts(reading: GateReading, context: TransactionContext, origin: string): boolean {
  return originAccepted(reading.environment, origin as PolicyRecordOrigin, context.organisationCode);
}

/**
 * What the policy itself lacks (module-map 4.4; code-house-rules 12.14): its signature, its validated values, and any
 * configured value of an origin this environment does not accept. Empty when Signed and its values are validated.
 */
export async function policyMissing(
  context: TransactionContext,
  reading: GateReading,
  policy: PolicyNumber,
  values: readonly PolicyValue[],
): Promise<MissingItem[]> {
  const missing: MissingItem[] = [];
  const number = String(policy);
  const signature = await latestSignature(context, policy);
  if (signature === undefined || !counts(reading, context, signature.origin)) {
    missing.push({ kind: 'policy', policy: number, lacks: 'signature' });
  }
  for (const value of values) {
    if (!originAccepted(reading.environment, value.origin, context.organisationCode)) {
      missing.push({ kind: 'origin', check: value.check, key: value.key, origin: value.origin });
    }
  }
  const validation = await latestValidation(context, policy);
  if (
    validation === undefined ||
    !counts(reading, context, validation.origin) ||
    !covers(validation.validatedValues, values)
  ) {
    missing.push({ kind: 'policy', policy: number, lacks: 'validation' });
  }
  return missing;
}

/**
 * Check availability (module-map 4.4; access-and-approvals 7.1 step 2): available only when the capability is on, the
 * governing policy is Signed, the owning module's configured records are valid, the policy's real values are
 * validated, and, for receiving, movement and selling, the Site or business unit holds the activity grant. Otherwise
 * every thing missing is named, by its kind: the capability, the policy and what it lacks, the configuration, the
 * origin of a value, or the activity and the place (PRD-SEC-017, PRD-UXP-003, PRD-LIF-001; DEC-116). Without a place,
 * an operation that needs an activity names the activity alone, granted nowhere yet.
 */
export async function availability(
  context: TransactionContext,
  reading: GateReading,
  operation: GatedOperation,
  place: PlaceAsked,
): Promise<MissingItem[]> {
  const missing: MissingItem[] = [];
  if (!(await capabilityOn(context, operation.capability))) {
    missing.push({ kind: 'capability', capability: operation.capability });
  }
  const values = await policyValues(context, reading.registry, operation.policy);
  missing.push(...(await policyMissing(context, reading, operation.policy, values)));
  for (const needed of operation.checks) {
    const answer = await reading.registry.check(needed.check).check(context, {
      subject: needed.subject ?? null,
      siteId: place.siteId ?? null,
      businessUnitId: place.businessUnitId ?? null,
    });
    if (answer.kind === 'invalid') missing.push(...answer.missing);
  }
  if (operation.activity !== null && !(await activityGranted(context, operation, place))) {
    missing.push(activityMissing(operation, place));
  }
  return missing;
}

/** Whether the activity's latest grant at the place grants it: a business unit's, or else the Site's own. */
async function activityGranted(
  context: TransactionContext,
  operation: GatedOperation,
  place: PlaceAsked,
): Promise<boolean> {
  if (operation.activity === null) return true;
  if (place.businessUnitId === undefined && place.siteId === undefined) return false;
  const [latest] = await context.tx
    .select({ granted: activityGrant.granted })
    .from(activityGrant)
    .where(
      and(
        eq(activityGrant.activity, operation.activity),
        place.businessUnitId === undefined
          ? and(eq(activityGrant.siteId, place.siteId ?? ''), isNull(activityGrant.businessUnitId))
          : sql`${activityGrant.businessUnitId} = ${place.businessUnitId}::uuid`,
      ),
    )
    .orderBy(desc(activityGrant.id))
    .limit(1);
  return latest?.granted === true;
}

function activityMissing(operation: GatedOperation, place: PlaceAsked): MissingItem {
  const activity = operation.activity ?? '';
  if (place.businessUnitId !== undefined) {
    return { kind: 'activity', activity, placeType: 'business-unit', placeId: place.businessUnitId };
  }
  if (place.siteId !== undefined) return { kind: 'activity', activity, placeType: 'site', placeId: place.siteId };
  return { kind: 'activity', activity };
}
