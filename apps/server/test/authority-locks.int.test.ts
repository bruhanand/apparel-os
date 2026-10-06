import { randomInt } from 'node:crypto';
import type { AssignmentScope } from '@apparel-os/schemas';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CommandRunner,
  newCorrelationId,
  OrganisationRouter,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import { Access, type DecisionInput, type Preparer } from '../src/modules/access/index.js';
// The access module's own key reader, so the fresh-code check opens the synthetic factor secrets (11.2).
import { OrganisationKeys } from '../src/modules/access/domain/organisation-keys.js';
import { Audit } from '../src/modules/audit/index.js';
import {
  codeFor,
  syntheticKeysEnvironment,
  syntheticTimezone,
  writeSyntheticUser,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic } from './support/grants.js';
import { capturingLogger } from './support/jobs.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';
import { backendPid, gate, waitUntilAnyWaitingForLock } from './support/transactions.js';

// S1-F01 review (RR-325): the authority rows of step 0 (code-house-rules 8.2 "Authority first"; access-and-approvals
// 7.1 step 4; stock-ledger 10.3, 10.4; spec section 9 "rechecks ... under the lock"). A decision relies on its
// approver's user row and role assignment, locked in shared mode at step 0; disabling that user takes the user row
// exclusively at the same step. So a decision and the disabling of its approver never pass each other: whichever
// locks second waits, and then sees the other's commit (PRD-INT-003; access-and-approvals 2.1). Commands run as the
// runtime role through Organisation routing. Every value is SYNTHETIC.

const all = { kind: 'all' } as const;
const EVERYWHERE: AssignmentScope = { kind: 'dimensions', legalEntity: all, place: all, brand: all };
const TYPES = ['access.user', 'access.role', 'access.role_assignment', 'access.approval_reason'];

let world: SyntheticWorld;
let database: string;
let router: OrganisationRouter;
let routed: RoutedOrganisation;
let keysEnvironment: Record<string, string>;
let access: Access;
const log = capturingLogger();
let admin: SyntheticUser;
let disabler: SyntheticUser;
let adminPreparer: Preparer;
let reasonId: string;
let roleId: string;
let offsetMs = 0;

function now(): Date {
  return new Date(Date.now() + offsetMs);
}

const today = () => now().toISOString().slice(0, 10);

function as<T>(actorId: string, work: (context: TransactionContext) => Promise<T>): Promise<T> {
  const runner = new CommandRunner({ clock: { now }, timezones: syntheticTimezone, logger: log.logger });
  return runner.run(
    {
      commandName: 'access.synthetic-test',
      organisation: routed,
      correlationId: newCorrelationId(),
      actor: { kind: 'actor', actorId },
    },
    work,
  );
}

/** A code of a step later than any used before: the clock moves on 30 seconds (access-and-approvals 3.3). */
function nextCode(user: SyntheticUser): string {
  offsetMs += 30_000;
  if (user.factorSecret === undefined) throw new Error('not enrolled');
  return codeFor(user.factorSecret, 0, now());
}

function decideIn(context: TransactionContext, user: SyntheticUser, input: Omit<DecisionInput, 'totpCode'>) {
  return access.decide(context, { kind: 'user', id: user.id }, { ...input, totpCode: nextCode(user) });
}

async function requestState(requestId: string): Promise<string | undefined> {
  const client: Client = await connect(database, 'migration');
  try {
    const result = await client.query<{ state: string }>('select state from access.approval_request where id = $1', [
      requestId,
    ]);
    return result.rows[0]?.state;
  } finally {
    await client.end();
  }
}

async function enrolledApprover(label: string): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(database, routed.organisationCode, keysEnvironment, { label, enrolled: true });
  await grantSynthetic(
    database,
    { kind: 'user', id: user.id },
    TYPES.map((recordType) => ({ recordType, action: 'approve' as const })),
  );
  return user;
}

/** A role assignment of a fresh grantee, prepared by the Admin: a request an approver can decide. */
async function assignmentRequest() {
  const grantee = await writeSyntheticUser(database, routed.organisationCode, keysEnvironment, {
    label: `GRANTEE-${String(randomInt(1_000_000))}`,
  });
  const prepared = await as(admin.id, (c) =>
    access.prepareAssignment(c, adminPreparer, {
      actor: { kind: 'user', userId: grantee.id },
      roleId,
      scope: EVERYWHERE,
      validFrom: today(),
    }),
  );
  if (prepared.kind !== 'success') throw new Error(`assignment not prepared: ${prepared.refusal.code}`);
  return { requestId: prepared.answer.requestId, versionId: prepared.answer.assignmentId };
}

/** The Admin prepares the disabling of a user: a user version, state Disabled (access-and-approvals 2.1). */
async function disablingOf(user: SyntheticUser) {
  const prepared = await as(admin.id, (c) =>
    access.prepareUserVersion(c, adminPreparer, user.id, {
      displayName: user.displayName,
      personas: [],
      state: 'Disabled',
    }),
  );
  if (prepared.kind !== 'success') throw new Error(`disabling not prepared: ${prepared.refusal.code}`);
  return { requestId: prepared.answer.requestId, versionId: prepared.answer.versionId };
}

/**
 * Runs `first` in a transaction that stays open, after its work, until the test lets it commit; answers its pid
 * once the work is done and its locks are held, and its outcome once it has committed.
 */
function heldOpen<T>(actorId: string, first: (context: TransactionContext) => Promise<T>) {
  const release = gate();
  const reported: { resolve?: (pid: number) => void } = {};
  const pid = new Promise<number>((resolve) => {
    reported.resolve = resolve;
  });
  const reportPid = (value: number): void => reported.resolve?.(value);
  const outcome = as(actorId, async (c) => {
    const result = await first(c);
    reportPid(await backendPid(c));
    await release.wait;
    return result;
  });
  return { pid, outcome, commit: release.open };
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('authority');
  database = world.organisations[0].database;
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 6 },
    log.logger,
  );
  const found = await router.resolveForSignIn(world.organisations[0].code);
  if (!found.routed) throw new Error('not routed');
  routed = found.organisation;
  keysEnvironment = syntheticKeysEnvironment(world);
  access = new Access({ audit: new Audit(log.logger), keys: OrganisationKeys.fromEnvironment(keysEnvironment) });
  admin = await writeSyntheticUser(database, routed.organisationCode, keysEnvironment, { label: 'ADMIN' });
  const { assignmentId } = await grantSynthetic(
    database,
    { kind: 'user', id: admin.id },
    TYPES.flatMap((recordType) => [
      { recordType, action: 'create' as const },
      { recordType, action: 'edit' as const },
    ]),
  );
  adminPreparer = { userId: admin.id, roleAssignmentId: assignmentId };
  disabler = await enrolledApprover('DISABLER');

  // The first reason list, decided with free text (DEC-104), then a role decided with a listed reason (POL-02.23).
  const reason = await as(admin.id, (c) =>
    access.prepareApprovalReason(c, adminPreparer, {
      code: `SYN-APPROVE-${String(randomInt(1_000_000))}`,
      kind: 'approve',
      text: 'SYNTHETIC approve reason',
      validFrom: today(),
    }),
  );
  if (reason.kind !== 'success') throw new Error(`reason not prepared: ${reason.refusal.code}`);
  const first = await as(disabler.id, (c) =>
    decideIn(c, disabler, {
      requestId: reason.answer.requestId,
      versionId: reason.answer.versionId,
      outcome: 'approve',
      reason: { kind: 'free-text', text: 'SYNTHETIC first list' },
    }),
  );
  if (first.kind !== 'success') throw new Error(`reason not approved: ${first.refusal.code}`);
  reasonId = reason.answer.reasonId;
  const role = await as(admin.id, (c) =>
    access.prepareRole(c, adminPreparer, {
      code: `SYN-ROLE-${String(randomInt(1_000_000))}`,
      name: 'SYNTHETIC role',
      permissions: [{ kind: 'action', recordType: 'access.role', action: 'view', selfService: false }],
      validFrom: today(),
    }),
  );
  if (role.kind !== 'success') throw new Error(`role not prepared: ${role.refusal.code}`);
  const roleDecided = await as(disabler.id, (c) =>
    decideIn(c, disabler, {
      requestId: role.answer.requestId,
      versionId: role.answer.versionId,
      outcome: 'approve',
      reason: { kind: 'listed', reasonId },
    }),
  );
  if (roleDecided.kind !== 'success') throw new Error(`role not approved: ${roleDecided.refusal.code}`);
  roleId = role.answer.roleId;
});

afterAll(async () => {
  await (router as OrganisationRouter | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('a decision and the disabling of its approver (code-house-rules 8.2; RR-325)', () => {
  it('PRD-INT-003 the disabling waits for a decision already relying on the approver, then commits after it', async () => {
    const approver = await enrolledApprover('APPROVER-FIRST');
    const request = await assignmentRequest();
    const disabling = await disablingOf(approver);

    const deciding = heldOpen(approver.id, (c) =>
      decideIn(c, approver, { ...request, outcome: 'approve', reason: { kind: 'listed', reasonId } }),
    );
    const decidingPid = await deciding.pid;
    const disabled = as(disabler.id, (c) =>
      decideIn(c, disabler, { ...disabling, outcome: 'approve', reason: { kind: 'listed', reasonId } }),
    );
    // The disabling waits for the decision's shared lock on the approver's user row.
    await waitUntilAnyWaitingForLock(database, [decidingPid]);
    deciding.commit();
    expect(await deciding.outcome).toMatchObject({ kind: 'success', answer: { outcome: 'Approved' } });
    expect(await disabled).toMatchObject({ kind: 'success', answer: { outcome: 'Approved' } });
    expect(await requestState(request.requestId)).toBe('Approved');
  });

  it('PRD-INT-003 access-and-approvals 2.1 a decision waits while its approver is being disabled, then is refused', async () => {
    const approver = await enrolledApprover('APPROVER-SECOND');
    const request = await assignmentRequest();
    const disabling = await disablingOf(approver);

    const disablingRun = heldOpen(disabler.id, (c) =>
      decideIn(c, disabler, { ...disabling, outcome: 'approve', reason: { kind: 'listed', reasonId } }),
    );
    const disablingPid = await disablingRun.pid;
    const deciding = as(approver.id, (c) =>
      decideIn(c, approver, { ...request, outcome: 'approve', reason: { kind: 'listed', reasonId } }),
    );
    // The decision waits for the disabling's exclusive lock on the approver's user row.
    await waitUntilAnyWaitingForLock(database, [disablingPid]);
    disablingRun.commit();
    expect(await disablingRun.outcome).toMatchObject({ kind: 'success', answer: { outcome: 'Approved' } });
    expect(await deciding).toEqual({
      kind: 'refusal',
      refusal: { kind: 'not-authorised', code: 'access.not-eligible', missing: [{ kind: 'user-state' }] },
      causedBySecret: false,
    });
    expect(await requestState(request.requestId)).toBe('Awaiting approval');
  });
});

describe('a preparing command holds its preparer’s authority (code-house-rules 8.2; RR-325)', () => {
  it('PRD-INT-001 rechecks under the step-0 locks that the preparer is Active and the same assignment still grants it', async () => {
    const need = { action: 'create' as const, recordType: 'access.role' };
    const hold = (user: SyntheticUser, assignmentId: string) =>
      as(user.id, (c) => access.holdAuthority(c, { kind: 'user', id: user.id }, assignmentId, need));
    expect(await hold(admin, adminPreparer.roleAssignmentId)).toBeUndefined();
    // Another assignment than the one the guard's Authorise returned: the authority changed, try again.
    const { assignmentId: other } = await grantSynthetic(database, { kind: 'user', id: disabler.id }, [need]);
    const { assignmentId: unrelated } = await grantSynthetic(database, { kind: 'user', id: admin.id }, [
      { recordType: 'access.role', action: 'view' },
    ]);
    expect(await hold(admin, unrelated)).toEqual({ kind: 'conflict', code: 'kernel.stale-version', missing: [] });
    expect(await hold(disabler, other)).toBeUndefined();
    // A preparer no longer Active is refused, naming the user state.
    const leaving = await enrolledApprover('LEAVING');
    const disabling = await disablingOf(leaving);
    expect(
      await as(disabler.id, (c) =>
        decideIn(c, disabler, { ...disabling, outcome: 'approve', reason: { kind: 'listed', reasonId } }),
      ),
    ).toMatchObject({ kind: 'success' });
    const { assignmentId: leavingAssignment } = await grantSynthetic(database, { kind: 'user', id: leaving.id }, [
      need,
    ]);
    expect(await hold(leaving, leavingAssignment)).toEqual({
      kind: 'not-authorised',
      code: 'access.not-authorised',
      missing: [{ kind: 'user-state' }],
    });
  });
});
