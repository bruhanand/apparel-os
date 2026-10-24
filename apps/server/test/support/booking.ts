import { paise, uuidv7 } from '@apparel-os/domain';
import { BOOKING_APPROVAL, type PolicyNumber } from '@apparel-os/schemas';
import type { Access } from '../../src/modules/access/index.js';
import { Audit } from '../../src/modules/audit/index.js';
import {
  BOOKING_CAPABILITY,
  BOOKING_KIND,
  BOOKING_OPERATIONS,
  bookingApprovals,
} from '../../src/modules/booking/index.js';
import { Configuration, type ValidityCheck } from '../../src/modules/configuration/index.js';
import { policyEvidence } from '../../src/modules/files-imports/index.js';
import { Numbering } from '../../src/modules/numbering/index.js';
import { syntheticName } from '../fixtures/synthetic.js';
import { TEST_COMPOSITION } from './composition.js';
import { grantSynthetic } from './grants.js';
import { capturingLogger } from './jobs.js';
import type { StructureSetup } from './organisation.js';
import { connect } from './postgres.js';
import { writeSyntheticStoredFile } from './tax-rules.js';

// The policy gate of a booking's approval in tests (goods-in 10.5; S2-F01-T03). A booking's approval needs policies 5
// and 1 Signed and validated, but no module reports a value of either yet: which records are policy 5's values is OPEN
// for the product owner (RR-561), and the Agreements are not reported as policy 1's (RR-480). So these tests open the
// gate through TEST-ONLY validity checks, each reporting one labelled synthetic value, registered only in the test
// composition (code-house-rules 11.1). They stand for nothing of KDPS's; live use waits for RR-561 and policy 1's
// values.

/**
 * A SYNTHETIC open-to-buy budget of a brand and season, Approved and in force from a day before now, written as a
 * fixture, as writeSyntheticMarking writes a marking (code-house-rules 11.1, 12.14), for the browser journey's booking:
 * a version approved through Decide is in force from its decision's instant, which a fixture's clock may put after the
 * server's. Preparing, checking and approving a budget are proved through the routes (open-to-buy-budgets.int.test.ts).
 * Answers the budget.
 */
export async function writeSyntheticBudget(
  database: string,
  budget: {
    readonly brandId: string;
    readonly seasonAttributeId: string;
    readonly seasonValueId: string;
    readonly markingVersionId: string;
    readonly amountPaise: number;
    readonly preparedBy: string;
  },
): Promise<string> {
  const owner = await connect(database, 'migration');
  try {
    const budgetId = uuidv7();
    await owner.query(
      `insert into booking.open_to_buy_budget
         (id, brand_id, season_attribute_id, season_value_id, season_marked_attribute_version_id)
       values ($1, $2, $3, $4, $5)`,
      [budgetId, budget.brandId, budget.seasonAttributeId, budget.seasonValueId, budget.markingVersionId],
    );
    await owner.query(
      `insert into booking.open_to_buy_budget_version
         (id, open_to_buy_budget_id, amount_paise, origin, decision, valid_during, prepared_by_user_id)
       values ($1, $2, $3, 'synthetic', 'Approved', tstzrange($4::timestamptz, null), $5)`,
      [uuidv7(), budgetId, budget.amountPaise, new Date(Date.now() - 86_400_000).toISOString(), budget.preparedBy],
    );
    return budgetId;
  } finally {
    await owner.end();
  }
}

/**
 * A SYNTHETIC individual booking limit on cost, through `access`'s own commands (access-and-approvals 9.2; DM-8,
 * DEC-105; code-house-rules 11.2): the setup's preparer prepares it, its approver, a different person, approves it.
 * `access` is composed with `booking`'s approval rules, so the action type is known. The real limits and their holders
 * are the product owner's (V-02).
 */
export async function bookingLimitApproved(
  setup: StructureSetup,
  database: string,
  holder: { readonly userId: string; readonly roleAssignmentId: string },
  amountPaise: number,
): Promise<void> {
  const audit = new Audit(capturingLogger().logger);
  const configuration = new Configuration({ audit, environment: { name: 'local' } });
  const access: Access = setup.accessWith(
    bookingApprovals({
      audit,
      configuration,
      numbering: new Numbering({ kinds: [BOOKING_KIND] }),
      requests: () => access,
    }),
  );
  const preparing = await grantSynthetic(database, { kind: 'user', id: setup.preparer.id }, [
    { recordType: 'access.approval_limit', action: 'view' },
    { recordType: 'access.approval_limit', action: 'create' },
  ]);
  await grantSynthetic(database, { kind: 'user', id: setup.approver.id }, [
    { recordType: 'access.approval_limit', action: 'view' },
    { recordType: 'access.approval_limit', action: 'approve' },
  ]);
  const prepared = await setup.run(setup.preparer.id, (context) =>
    access.prepareApprovalLimit(
      context,
      { userId: setup.preparer.id, roleAssignmentId: preparing.assignmentId },
      {
        actionType: BOOKING_APPROVAL,
        holder: { kind: 'individual', ...holder },
        limit: { kind: 'amount', amount: paise(amountPaise) },
        coversUnknown: false,
        origin: 'synthetic',
        validFrom: setup.today(),
      },
    ),
  );
  if (prepared.kind !== 'success') throw new Error(`The booking limit was refused: ${prepared.refusal.code}`);
  const approved = await setup.decideThrough(access, prepared.answer.requestId, prepared.answer.limitId);
  if (approved.kind !== 'success') throw new Error(`The booking limit was not approved: ${approved.refusal.code}`);
}

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
 * preparer switches the bookings capability on. The values validated are the TEST-ONLY checks' above. A world whose
 * other gate opened policy 1 already, as the PT approval world's does, names policy 5 alone (S2-F11-T02).
 */
export async function bookingGateOpen(
  setup: StructureSetup,
  database: string,
  policies: readonly PolicyNumber[] = BOOKING_POLICIES,
): Promise<void> {
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
  for (const policy of policies) {
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
