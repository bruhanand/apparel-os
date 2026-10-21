import { uuidv7 } from '@apparel-os/domain';
import type { PolicyNumber } from '@apparel-os/schemas';
import { Audit } from '../../src/modules/audit/index.js';
import { BOOKING_CAPABILITY, BOOKING_OPERATIONS } from '../../src/modules/booking/index.js';
import { Configuration, type ValidityCheck } from '../../src/modules/configuration/index.js';
import { policyEvidence } from '../../src/modules/files-imports/index.js';
import { syntheticName } from '../fixtures/synthetic.js';
import { TEST_COMPOSITION } from './composition.js';
import { grantSynthetic } from './grants.js';
import { capturingLogger } from './jobs.js';
import type { StructureSetup } from './organisation.js';
import { writeSyntheticStoredFile } from './tax-rules.js';

// The policy gate of a booking's approval in tests (goods-in 10.5; S2-F01-T03). A booking's approval needs policies 5
// and 1 Signed and validated, but no module reports a value of either yet: which records are policy 5's values is OPEN
// for the product owner (RR-561), and the Agreements are not reported as policy 1's (RR-480). So these tests open the
// gate through TEST-ONLY validity checks, each reporting one labelled synthetic value, registered only in the test
// composition (code-house-rules 11.1). They stand for nothing of KDPS's; live use waits for RR-561 and policy 1's
// values.

/** Who entered the synthetic values: a SYNTHETIC person who is none of the validators (DM-6). */
const SYNTHETIC_ENTERER = uuidv7();

/** A TEST-ONLY check reporting one SYNTHETIC value of the policy, valid for any subject and place. */
export function syntheticPolicyValues(policy: PolicyNumber): ValidityCheck {
  return {
    code: `test-booking.policy-${String(policy)}-values`,
    policy,
    check: () => Promise.resolve({ kind: 'valid' }),
    values: () =>
      Promise.resolve([
        {
          key: `SYNTHETIC-policy-${String(policy)}-value`,
          version: '1',
          origin: 'synthetic',
          enteredBy: [SYNTHETIC_ENTERER],
        },
      ]),
    locks: () => Promise.resolve([]),
  };
}

/** The TEST-ONLY checks of policies 5 and 1, which the application under test registers too. */
export const BOOKING_POLICY_CHECKS: readonly ValidityCheck[] = [syntheticPolicyValues(5), syntheticPolicyValues(1)];

/** The two policies a booking's approval needs (goods-in 10.5). */
const BOOKING_POLICIES: readonly PolicyNumber[] = [5, 1];

/**
 * The booking gate open Organisation-wide (goods-in 10.5; module-map 4.4; DM-6), through configuration's commands as
 * labelled synthetic status (code-house-rules 12.14): the setup's preparer records policies 5 and 1 Signed; the
 * approver, who entered none of their values, validates them, each with a SYNTHETIC stored file as evidence; the
 * preparer switches the bookings capability on. The values validated are the TEST-ONLY checks' above.
 */
export async function bookingGateOpen(setup: StructureSetup, database: string): Promise<void> {
  const audit = new Audit(capturingLogger().logger);
  const configuration = new Configuration({ audit, environment: { name: 'local' }, evidence: policyEvidence(audit) });
  for (const check of BOOKING_POLICY_CHECKS) configuration.registerCheck(check, TEST_COMPOSITION);
  for (const operation of BOOKING_OPERATIONS) configuration.registerOperation(operation);
  const signer = setup.preparer;
  const validator = setup.approver;
  const signing = await grantSynthetic(database, { kind: 'user', id: signer.id }, [
    { recordType: 'configuration.policy_status', action: 'create' },
    { recordType: 'configuration.capability', action: 'edit' },
  ]);
  const validating = await grantSynthetic(database, { kind: 'user', id: validator.id }, [
    { recordType: 'configuration.policy_validation', action: 'create' },
  ]);
  const ok = (outcome: { kind: string; refusal?: { code: string } }) => {
    if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal?.code ?? outcome.kind}`);
  };
  for (const policy of BOOKING_POLICIES) {
    const signatureEvidence = await writeSyntheticStoredFile(database, signer.id);
    ok(
      await setup.run(signer.id, (context) =>
        configuration.recordSignature(context, { userId: signer.id, roleAssignmentId: signing.assignmentId }, policy, {
          signatory: syntheticName(`policy ${String(policy)} signatory`),
          signedOn: setup.today(),
          origin: 'synthetic',
          evidence: [signatureEvidence],
        }),
      ),
    );
    const validationEvidence = await writeSyntheticStoredFile(database, validator.id);
    ok(
      await setup.run(validator.id, (context) =>
        configuration.recordValidation(
          context,
          { userId: validator.id, roleAssignmentId: validating.assignmentId },
          policy,
          { origin: 'synthetic', evidence: [validationEvidence] },
        ),
      ),
    );
  }
  ok(
    await setup.run(signer.id, (context) =>
      configuration.switchCapability(
        context,
        { userId: signer.id, roleAssignmentId: signing.assignmentId },
        BOOKING_CAPABILITY,
        true,
      ),
    ),
  );
}
