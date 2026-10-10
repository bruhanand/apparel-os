import { uuidv7 } from '@apparel-os/domain';
import type {
  EvidenceFile,
  PolicyNumber,
  PolicyRecordOrigin,
  PolicySignatureDraft,
  PolicyValidationDraft,
} from '@apparel-os/schemas';
import { CommandDefect, LOCK_STEP, type CommandRefusal, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { PolicyEvidence } from '../contracts/policy-evidence.js';
import { capabilityChange, policySignature, policyValidation } from '../db/schema.js';
import type { GateRegistry } from '../domain/gate.js';
import { originAccepted, originMissing, type DeploymentEnvironment } from '../domain/origins.js';
import { capabilityChanged, policyStatusChanged } from '../events.js';
import { policyValues, valueName } from '../queries/availability.js';

// Recording a policy's status and switching a capability (module-map 4.4 "Record policy status", "Set a capability";
// domain-model 3.6, DM-6; code-house-rules 12.14; PRD-SEC-017; DEC-092, DEC-105, DEC-116; S1-F04-T01). Setup and
// configuration operations: not policy-gated, since they are how a policy gets configured, but each needs its
// permission, which the caller has authorised and holds (access-and-approvals 7.1). Every record is append-only.

/** The person recording, and the role assignment Authorise used (access-and-approvals 7.1 step 3). */
export interface Recorder {
  readonly userId: string;
  readonly roleAssignmentId: string;
}

export type Outcome<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

export interface PolicyStatusDependencies {
  readonly audit: AuditInterface;
  readonly registry: GateRegistry;
  readonly environment: DeploymentEnvironment;
  readonly evidence: PolicyEvidence | undefined;
}

const SIGNATURE_TYPE = 'configuration.policy_status';
const VALIDATION_TYPE = 'configuration.policy_validation';

/** The refusal of a record whose origin this environment does not accept (code-house-rules 12.14; DEC-116). */
export function originRefusal(
  environment: DeploymentEnvironment,
  context: TransactionContext,
  origin: PolicyRecordOrigin | 'test-setup',
): CommandRefusal | undefined {
  if (originAccepted(environment, origin, context.organisationCode)) return undefined;
  return { kind: 'refused', code: 'configuration.origin-not-allowed', missing: [originMissing(environment, origin)] };
}

/**
 * Records a policy as Signed (DEC-092): its "Signed by, date" line, complete, with the signed evidence attached in
 * this transaction. A synthetic record is refused outside local work, tests and `dev`, and on an Organisation that is
 * not synthetic (code-house-rules 12.14; DEC-116). A later record of the same policy is its signature from then on.
 */
export async function recordSignature(
  context: TransactionContext,
  dependencies: PolicyStatusDependencies,
  recorder: Recorder,
  policy: PolicyNumber,
  draft: PolicySignatureDraft,
): Promise<Outcome<{ signatureId: string }>> {
  const refused = originRefusal(dependencies.environment, context, draft.origin);
  if (refused !== undefined) return { kind: 'refusal', refusal: refused };
  const signatureId = uuidv7();
  const evidence = await attachAll(context, dependencies, recorder, SIGNATURE_TYPE, signatureId, draft.evidence);
  await context.tx.insert(policySignature).values({
    id: signatureId,
    policyNumber: policy,
    signatory: draft.signatory,
    signedOn: draft.signedOn,
    origin: draft.origin,
    evidenceAttachmentIds: evidence,
    recordedByUserId: recorder.userId,
    roleAssignmentId: recorder.roleAssignmentId,
    recordedAt: context.startedAt,
  });
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: recorder.userId },
    roleAssignmentId: recorder.roleAssignmentId,
    record: { module: 'configuration', type: 'policy_status', id: signatureId },
    operation: 'record-policy-signature',
    changes: [
      { kind: 'value', field: 'policy', before: null, after: policy },
      { kind: 'value', field: 'signatory', before: null, after: draft.signatory },
      { kind: 'value', field: 'signedOn', before: null, after: draft.signedOn },
      { kind: 'value', field: 'origin', before: null, after: draft.origin },
      { kind: 'value', field: 'evidence', before: null, after: evidence },
    ],
    source: { kind: 'screen' },
  });
  await context.publish(policyStatusChanged, {
    subject: { module: 'configuration', recordType: SIGNATURE_TYPE, recordId: signatureId },
    payload: { policyNumber: policy, recordId: signatureId, change: 'signature' },
  });
  return { kind: 'success', answer: { signatureId } };
}

/**
 * Records a policy's real values as validated, with the evidence (DM-6; DEC-105, DEC-116): by a person holding the
 * validate permission, which the caller authorised, who entered none of the values the policy's checks report now.
 * The person who recorded Signed may validate. The validation covers exactly the values configured now, by identity
 * and version; once one is added, changed or ended it covers them no longer (module-map 4.4 "As built"; RR-478). It is
 * refused while no module reports a value of the policy (RR-480), and the rows a change of the values locks are held
 * shared while it is recorded. A synthetic validation is refused where a synthetic Signed record is.
 */
export async function recordValidation(
  context: TransactionContext,
  dependencies: PolicyStatusDependencies,
  validator: Recorder,
  policy: PolicyNumber,
  draft: PolicyValidationDraft,
): Promise<Outcome<{ validationId: string }>> {
  const refused = originRefusal(dependencies.environment, context, draft.origin);
  if (refused !== undefined) return { kind: 'refusal', refusal: refused };
  // What a change of the values locks, shared, before they are read: none changes before the insert (S1-F04 review S3).
  const locks = [];
  for (const check of dependencies.registry.checksOfPolicy(policy)) locks.push(...(await check.locks(context)));
  if (locks.length > 0) await context.lock(LOCK_STEP.document, locks);
  const values = await policyValues(context, dependencies.registry, policy);
  // Fail closed: with no values reported, a validation would cover nothing (RR-480; S1-F04 review S1).
  if (values.length === 0) {
    return {
      kind: 'refusal',
      refusal: {
        kind: 'refused',
        code: 'configuration.no-values-to-validate',
        missing: [{ kind: 'policy', policy: String(policy), lacks: 'values' }],
      },
    };
  }
  if (values.some((value) => value.enteredBy.includes(validator.userId))) {
    return {
      kind: 'refusal',
      refusal: {
        kind: 'refused',
        code: 'configuration.validator-entered-values',
        missing: [{ kind: 'validator', policy: String(policy) }],
      },
    };
  }
  const validationId = uuidv7();
  const evidence = await attachAll(context, dependencies, validator, VALIDATION_TYPE, validationId, draft.evidence);
  const validated = values.map(valueName).sort();
  await context.tx.insert(policyValidation).values({
    id: validationId,
    policyNumber: policy,
    origin: draft.origin,
    validatedValues: validated,
    evidenceAttachmentIds: evidence,
    validatedByUserId: validator.userId,
    roleAssignmentId: validator.roleAssignmentId,
    validatedAt: context.startedAt,
  });
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: validator.userId },
    roleAssignmentId: validator.roleAssignmentId,
    record: { module: 'configuration', type: 'policy_validation', id: validationId },
    operation: 'record-policy-validation',
    changes: [
      { kind: 'value', field: 'policy', before: null, after: policy },
      { kind: 'value', field: 'origin', before: null, after: draft.origin },
      { kind: 'value', field: 'validatedValues', before: null, after: validated },
      { kind: 'value', field: 'evidence', before: null, after: evidence },
    ],
    source: { kind: 'screen' },
  });
  await context.publish(policyStatusChanged, {
    subject: { module: 'configuration', recordType: VALIDATION_TYPE, recordId: validationId },
    payload: { policyNumber: policy, recordId: validationId, change: 'validation' },
  });
  return { kind: 'success', answer: { validationId } };
}

/**
 * Switches a capability on or off for the Organisation (PRD-SEC-017). Every capability is off until switched on;
 * switching one on bypasses nothing: the operation stays unavailable while anything else it needs is missing. A
 * capability no declared operation uses is not found.
 */
export async function switchCapability(
  context: TransactionContext,
  dependencies: PolicyStatusDependencies,
  by: Recorder,
  capability: string,
  on: boolean,
): Promise<Outcome<{ capability: string; on: boolean }>> {
  if (!dependencies.registry.hasCapability(capability)) {
    return {
      kind: 'refusal',
      refusal: {
        kind: 'not-found',
        code: 'configuration.capability-not-found',
        missing: [{ kind: 'capability', capability }],
      },
    };
  }
  const changeId = uuidv7();
  await context.tx.insert(capabilityChange).values({
    id: changeId,
    capability,
    switchedOn: on,
    changedByUserId: by.userId,
    roleAssignmentId: by.roleAssignmentId,
    changedAt: context.startedAt,
  });
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: by.userId },
    roleAssignmentId: by.roleAssignmentId,
    record: { module: 'configuration', type: 'capability', id: changeId },
    operation: 'switch-capability',
    changes: [
      { kind: 'value', field: 'capability', before: null, after: capability },
      { kind: 'value', field: 'on', before: null, after: on },
    ],
    source: { kind: 'screen' },
  });
  await context.publish(capabilityChanged, {
    subject: { module: 'configuration', recordType: 'configuration.capability', recordId: changeId },
    payload: { changeId, capability, on },
  });
  return { kind: 'success', answer: { capability, on } };
}

/** Links each evidence file to the record, in this transaction (DEC-116; imports-and-opening-data 13.1). */
async function attachAll(
  context: TransactionContext,
  dependencies: PolicyStatusDependencies,
  recorder: Recorder,
  type: string,
  id: string,
  files: readonly EvidenceFile[],
): Promise<string[]> {
  const evidence = dependencies.evidence;
  if (evidence === undefined) throw new CommandDefect('Policy evidence was given with no evidence contract composed');
  const attachments: string[] = [];
  for (const file of files) {
    const attached = await evidence.attach(context, {
      storedFileId: file.storedFileId,
      fileReceiptId: file.fileReceiptId,
      record: { module: 'configuration', type, id },
      evidence: {
        kind: type === SIGNATURE_TYPE ? 'configuration.policy-signature' : 'configuration.policy-validation',
        restrictedClasses: [],
      },
      attachedBy: { kind: 'user', id: recorder.userId },
      roleAssignmentId: recorder.roleAssignmentId,
    });
    attachments.push(attached.attachmentId);
  }
  return attachments;
}
