import { paise, uuidv7 } from '@apparel-os/domain';
import {
  DAMAGE_DECISION,
  DAMAGE_REVERSAL_APPROVAL,
  type ApprovalLimitDraft,
  type AssignmentScope,
} from '@apparel-os/schemas';
import {
  COMMAND_RUNNER,
  type CommandRunner,
  type RoutedOrganisation,
  type TransactionContext,
} from '../../src/kernel/index.js';
import { ACCESS, type AccessInterface } from '../../src/modules/access/index.js';
import { Audit } from '../../src/modules/audit/index.js';
import { Configuration, type ValidityCheck } from '../../src/modules/configuration/index.js';
import { EXCEPTION_CODE_KIND } from '../../src/modules/exceptions/index.js';
import { exceptionCodeSeriesCheck, exceptionRoutingCheck } from '../../src/modules/exceptions/queries/validity.js';
import { policyEvidence } from '../../src/modules/files-imports/index.js';
import { Numbering } from '../../src/modules/numbering/index.js';
import { DAMAGE_CAPABILITY, DAMAGE_REPORTS } from '../../src/modules/stock/documents/index.js';
import { syntheticName } from '../fixtures/synthetic.js';
import { TEST_COMPOSITION } from './composition.js';
import { grantSynthetic, type SyntheticAuthority } from './grants.js';
import { capturingLogger } from './jobs.js';
import { STOCK_VIEW } from './receiving.js';
import type { StructureSetup } from './organisation.js';
import { writeSyntheticStoredFile } from './tax-rules.js';
import type { AccessTestApp, SyntheticUser } from './access.js';

// The SYNTHETIC world of damage reports (goods-in 8, 10.5; S2-F08-T01), beside the receiving world that puts goods in
// custody (support/receiving.ts). Policy 17 reports no values yet: no module holds a configured record of it (goods-in
// 10.5), so a policy with nothing to validate stays unavailable (RR-480). The tests prove the gated operations through
// the test-only check below, which reports one labelled synthetic value, never KDPS's: which records are policy 17's
// values is the product owner's to say. Every person, value and setting here is SYNTHETIC.

/** The test-only check reporting policy 17's one SYNTHETIC value, entered by no one (DM-6; code-house-rules 11.1). */
export const SYNTHETIC_POLICY_17_VALUES: ValidityCheck = {
  code: 'test-damage-policy-values',
  policy: 17,
  check: () => Promise.resolve({ kind: 'valid' }),
  values: () =>
    Promise.resolve([{ key: 'SYNTHETIC-POLICY-17-VALUE', version: '1', origin: 'synthetic', enteredBy: [] }]),
  locks: () => Promise.resolve([]),
};

/** What a reporter holds: reporting and reading damage, storing photos, and seeing the stock it holds (goods-in 11). */
export const REPORTER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'stock.damage_report', action: 'view' },
  { recordType: 'stock.damage_report', action: 'create' },
  { recordType: 'files_imports.stored_file', action: 'create' },
  ...STOCK_VIEW,
];

/**
 * What a decider holds, as Operations (P-OPS) or whoever confirms or rejects a report made by someone else (goods-in
 * 8.3, 11): approve on the report, reading it and the approval panel, and seeing the stock its decision writes, since
 * the ledger's rows are scoped (stock-ledger 14.3).
 */
export const DECIDER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'stock.damage_report', action: 'view' },
  { recordType: 'stock.damage_report', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
  ...STOCK_VIEW,
];

/** What proposes a reversal of a confirmation (goods-in 8.3). */
export const PROPOSER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'stock.damage_report', action: 'view' },
  { recordType: 'stock.damage_reversal', action: 'create' },
  ...STOCK_VIEW,
];

/** What approves a reversal, a different person from its proposer (goods-in 8.3; PRD-STK-017). */
export const REVERSAL_APPROVER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'stock.damage_report', action: 'view' },
  { recordType: 'stock.damage_reversal', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
  ...STOCK_VIEW,
];

function ok<A>(
  outcome:
    | { kind: 'success'; answer: A }
    | { kind: 'refusal'; refusal: { readonly code: string; readonly missing: readonly unknown[] } },
): A {
  if (outcome.kind !== 'success') {
    throw new Error(`Refused: ${outcome.refusal.code} ${JSON.stringify(outcome.refusal.missing)}`);
  }
  return outcome.answer;
}

/**
 * Policy 17 Signed and validated on the SYNTHETIC value of the test-only check, and the damage capability switched on,
 * through configuration's commands as labelled synthetic status (DM-6; code-house-rules 12.14): the setup's preparer
 * records Signed and switches the capability, the approver, who entered no value, validates. `configuration` is composed
 * as the application under test composes it, with the exceptions' checks the damage operation names and the test-only
 * check, so its readiness reads what the application's does.
 */
export async function damageGateOpen(setup: StructureSetup, database: string): Promise<void> {
  const audit = new Audit(capturingLogger().logger);
  const configuration = new Configuration({ audit, environment: { name: 'local' }, evidence: policyEvidence(audit) });
  configuration.registerCheck(exceptionCodeSeriesCheck(new Numbering({ kinds: [EXCEPTION_CODE_KIND] })));
  configuration.registerCheck(exceptionRoutingCheck);
  configuration.registerCheck(SYNTHETIC_POLICY_17_VALUES, TEST_COMPOSITION);
  configuration.registerOperation(DAMAGE_REPORTS);
  const signer = setup.preparer;
  const signing = await grantSynthetic(database, { kind: 'user', id: signer.id }, [
    { recordType: 'configuration.policy_status', action: 'create' },
    { recordType: 'configuration.capability', action: 'edit' },
  ]);
  const by = { userId: signer.id, roleAssignmentId: signing.assignmentId };
  ok(
    await setup.run(signer.id, async (context) =>
      configuration.recordSignature(context, by, 17, {
        signatory: syntheticName('policy 17 signatory'),
        signedOn: setup.today(),
        origin: 'synthetic',
        evidence: [await writeSyntheticStoredFile(database, signer.id)],
      }),
    ),
  );
  const validator = setup.approver;
  const validating = await grantSynthetic(database, { kind: 'user', id: validator.id }, [
    { recordType: 'configuration.policy_validation', action: 'create' },
  ]);
  const evidence = await writeSyntheticStoredFile(database, validator.id);
  ok(
    await setup.run(validator.id, (context) =>
      configuration.recordValidation(context, { userId: validator.id, roleAssignmentId: validating.assignmentId }, 17, {
        origin: 'synthetic',
        evidence: [evidence],
      }),
    ),
  );
  ok(await setup.run(signer.id, (context) => configuration.switchCapability(context, by, DAMAGE_CAPABILITY, true)));
}

/** Runs work as a user in a command of the application under test, committed unless it throws (8.1). */
export function asUserIn<T>(
  app: AccessTestApp['app'],
  organisation: RoutedOrganisation,
  userId: string,
  work: (context: TransactionContext) => Promise<T>,
): Promise<T> {
  return app
    .get<CommandRunner>(COMMAND_RUNNER)
    .run(
      { commandName: 'test.damage', organisation, correlationId: uuidv7(), actor: { kind: 'actor', actorId: userId } },
      work,
    );
}

/** A SYNTHETIC limit on a damage report's decision or a reversal's approval (access-and-approvals 9.2; V-02). */
export type DamageLimit =
  | { readonly kind: 'amount'; readonly paise: number; readonly coversUnknown: boolean }
  | { readonly kind: 'unknown-only' };

/** What prepares a limit (access-and-approvals 9.2): create on the limits, read back. */
export const LIMIT_ADMIN_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'access.approval_limit', action: 'view' },
  { recordType: 'access.approval_limit', action: 'create' },
];

/** What approves a limit, a different person from its preparer (9.2, 9.11). */
export const LIMIT_APPROVER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'access.approval_limit', action: 'approve' },
  { recordType: 'access.approval_reason', action: 'view' },
];

/**
 * Gives a user an individual SYNTHETIC limit through one of their assignments, on the decision of a report or the
 * approval of a reversal, prepared through the application's `access` by an admin and approved by a different person
 * with a fresh code, as any limit is (9.2, 9.11).
 */
export async function limitFor(
  app: AccessTestApp['app'],
  organisation: RoutedOrganisation,
  people: {
    readonly admin: { readonly user: SyntheticUser; readonly assignmentId: string };
    readonly approver: SyntheticUser;
    readonly approveReasonId: string;
    readonly code: (user: SyntheticUser) => string;
  },
  holder: { readonly user: SyntheticUser; readonly assignmentId: string },
  action: typeof DAMAGE_DECISION | typeof DAMAGE_REVERSAL_APPROVAL,
  limit: DamageLimit,
  today: string,
): Promise<void> {
  const access = app.get<AccessInterface>(ACCESS);
  const draft: ApprovalLimitDraft = {
    actionType: action,
    holder: { kind: 'individual', userId: holder.user.id, roleAssignmentId: holder.assignmentId },
    limit: limit.kind === 'amount' ? { kind: 'amount', amount: paise(limit.paise) } : { kind: 'none' },
    coversUnknown: limit.kind === 'unknown-only' || limit.coversUnknown,
    origin: 'synthetic',
    validFrom: today,
  };
  const { admin } = people;
  const prepared = await asUserIn(app, organisation, admin.user.id, (context) =>
    access.prepareApprovalLimit(context, { userId: admin.user.id, roleAssignmentId: admin.assignmentId }, draft),
  );
  if (prepared.kind !== 'success') throw new Error(`limit refused: ${prepared.refusal.code}`);
  const decided = await asUserIn(app, organisation, people.approver.id, (context) =>
    access.decide(
      context,
      { kind: 'user', id: people.approver.id },
      {
        requestId: prepared.answer.requestId,
        versionId: prepared.answer.limitId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: people.approveReasonId },
        totpCode: people.code(people.approver),
      },
    ),
  );
  if (decided.kind !== 'success') throw new Error(`limit not approved: ${decided.refusal.code}`);
}

/** A scope of one Store's place, every legal entity and brand (access-and-approvals 5.3). */
export function storeScope(storeId: string): AssignmentScope {
  return {
    kind: 'dimensions',
    legalEntity: { kind: 'all' },
    place: { kind: 'selected', members: [{ type: 'store', id: storeId }] },
    brand: { kind: 'all' },
  };
}

export { DECIDER_AUTHORITY as OPERATIONS_AUTHORITY };
