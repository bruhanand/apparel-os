import { uuidv7 } from '@apparel-os/domain';
import { connect } from './postgres.js';

// A policy's SYNTHETIC Signed record and validation, written as fixtures (module-map 4.4; DM-6; code-house-rules 11.2),
// for the tests and journeys whose subject is not the policy status but an operation it gates, such as a unit's
// readiness (S1-F04-T02): S1-F04-T01 proves recording them through configuration's commands, with their evidence. Each
// is labelled synthetic. A test that goes through those commands instead uses configuration's interface, as
// support/receiving.ts does. Never a KDPS value.

/**
 * Policy `policy` Signed and validated as SYNTHETIC fixtures, the validation covering `validatedValues`, each
 * `<check>:<key>@<version>` of a SYNTHETIC validity check the composition registers (RR-480).
 */
export async function signedFixture(
  database: string,
  policy: number,
  validatedValues: readonly string[],
): Promise<void> {
  const owner = await connect(database, 'migration');
  try {
    await owner.query(
      `insert into configuration.policy_signature (id, policy_number, signatory, signed_on, origin,
         evidence_attachment_ids, recorded_by_user_id, role_assignment_id, recorded_at)
       values ($1, $2, 'SYNTHETIC signatory', current_date, 'synthetic', array[$3::uuid], $4, $5, now())`,
      [uuidv7(), policy, uuidv7(), uuidv7(), uuidv7()],
    );
    await owner.query(
      `insert into configuration.policy_validation (id, policy_number, origin, validated_values,
         evidence_attachment_ids, validated_by_user_id, role_assignment_id, validated_at)
       values ($1, $2, 'synthetic', $6::text[], array[$3::uuid], $4, $5, now())`,
      [uuidv7(), policy, uuidv7(), uuidv7(), uuidv7(), [...validatedValues]],
    );
  } finally {
    await owner.end();
  }
}
