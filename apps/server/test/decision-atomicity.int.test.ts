import { randomInt } from 'node:crypto';
import type { AssignmentScope } from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
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
import { backendPid, terminateBackend } from './support/transactions.js';

// S1-F01-T20: the decision and everything it causes commit together or not at all (spec sections 9 and 10, "The
// database fails during Decide"; S1-F01-AT15; numbering-and-audit 7 test 8; module-map 6.2 flow A). A decision on a
// role assignment writes the decision, makes the assignment take effect, rebuilds the actor's effective grants, and
// writes audit, a permission-change access record and outbox rows; a database failure after all of that, before the
// commit, leaves none of it, and the request stays open for a decision that then commits once. Commands run as the
// runtime role through Organisation routing. Every value is SYNTHETIC.

const all = { kind: 'all' } as const;
const EVERYWHERE: AssignmentScope = { kind: 'dimensions', legalEntity: all, place: all, brand: all };

let world: SyntheticWorld;
let database: string;
let router: OrganisationRouter;
let routed: RoutedOrganisation;
let access: Access;
const log = capturingLogger();
let admin: SyntheticUser;
let approver: SyntheticUser;
let grantee: SyntheticUser;
let adminPreparer: Preparer;
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

function decideIn(context: TransactionContext, input: Omit<DecisionInput, 'totpCode'>) {
  return access.decide(context, { kind: 'user', id: approver.id }, { ...input, totpCode: nextCode(approver) });
}

async function rows<T extends object>(text: string, values: unknown[] = []): Promise<T[]> {
  const client: Client = await connect(database, 'migration');
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

/** What a decision on the request writes, read as the owner (spec section 9, "Decide"). */
async function footprint(requestId: string, assignmentId: string) {
  const [counts] = await rows<Record<string, string>>(
    `select
       (select count(*) from access.approval_decision where approval_request_id = $1)::text as decisions,
       (select state from access.approval_request where id = $1) as request_state,
       (select decision from access.role_assignment where id = $2) as assignment_decision,
       (select count(*) from access.effective_grant where role_assignment_id = $2)::text as grants,
       (select count(*) from audit.audit_record)::text as audit_records,
       (select count(*) from audit.access_record)::text as access_records,
       (select count(*) from kernel.outbox_event)::text as outbox_events,
       (select count(*) from kernel.outbox_event where subject_record_id = any(array[$1, $2]::uuid[]))::text as own_events`,
    [requestId, assignmentId],
  );
  return counts;
}

let reasonId: string;
let roleId: string;

beforeAll(async () => {
  world = await createSyntheticOrganisations('atomic');
  database = world.organisations[0].database;
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    log.logger,
  );
  const found = await router.resolveForSignIn(world.organisations[0].code);
  if (!found.routed) throw new Error('not routed');
  routed = found.organisation;
  const keys = syntheticKeysEnvironment(world);
  access = new Access({ audit: new Audit(log.logger), keys: OrganisationKeys.fromEnvironment(keys) });
  const enrolled = (label: string) =>
    writeSyntheticUser(database, routed.organisationCode, keys, { label, enrolled: true });
  admin = await enrolled('ADMIN');
  approver = await enrolled('APPROVER');
  grantee = await enrolled('GRANTEE');
  const types = ['access.role', 'access.role_assignment', 'access.approval_reason'];
  const { assignmentId } = await grantSynthetic(
    database,
    { kind: 'user', id: admin.id },
    types.map((recordType) => ({ recordType, action: 'create' as const })),
  );
  adminPreparer = { userId: admin.id, roleAssignmentId: assignmentId };
  await grantSynthetic(
    database,
    { kind: 'user', id: approver.id },
    types.map((recordType) => ({ recordType, action: 'approve' as const })),
  );

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
  const first = await as(approver.id, (c) =>
    decideIn(c, {
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
  const roleDecided = await as(approver.id, (c) =>
    decideIn(c, {
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

describe('a database failure during Decide (spec section 10; S1-F01-AT15)', () => {
  it('PRD-INT-004 PRD-MOD-006 leaves no decision, no effective version, no grant, no audit and no outbox row; the request stays open', async () => {
    const prepared = await as(admin.id, (c) =>
      access.prepareAssignment(c, adminPreparer, {
        actor: { kind: 'user', userId: grantee.id },
        roleId,
        scope: EVERYWHERE,
        validFrom: today(),
      }),
    );
    if (prepared.kind !== 'success') throw new Error(`assignment not prepared: ${prepared.refusal.code}`);
    const { requestId, assignmentId } = prepared.answer;
    const input = {
      requestId,
      versionId: assignmentId,
      outcome: 'approve' as const,
      reason: { kind: 'listed' as const, reasonId },
    };
    const before = await footprint(requestId, assignmentId);
    expect(before).toMatchObject({
      decisions: '0',
      request_state: 'Awaiting approval',
      assignment_decision: 'Awaiting approval',
      grants: '0',
    });

    // (a) A statement fails after the decision's writes, in the decision's own transaction.
    await expect(
      as(approver.id, async (c) => {
        const decided = await decideIn(c, input);
        expect(decided).toMatchObject({ kind: 'success', answer: { outcome: 'Approved' } });
        await c.tx.execute(sql`select 1 / 0`);
      }),
    ).rejects.toThrow();
    expect(await footprint(requestId, assignmentId)).toEqual(before);

    // (b) The connection is lost after the decision's writes, before COMMIT.
    await expect(
      as(approver.id, async (c) => {
        const decided = await decideIn(c, input);
        expect(decided).toMatchObject({ kind: 'success' });
        await terminateBackend(database, await backendPid(c));
      }),
    ).rejects.toThrow();
    expect(await footprint(requestId, assignmentId)).toEqual(before);

    // The request is still open: the next decision commits, with everything it causes, once.
    const committed = await as(approver.id, (c) => decideIn(c, input));
    expect(committed).toMatchObject({ kind: 'success', answer: { outcome: 'Approved' } });
    const after = await footprint(requestId, assignmentId);
    expect(after).toMatchObject({
      decisions: '1',
      request_state: 'Approved',
      assignment_decision: 'Approved',
    });
    expect(Number(after?.grants)).toBeGreaterThan(0);
    expect(Number(after?.audit_records)).toBeGreaterThan(Number(before?.audit_records));
    expect(Number(after?.access_records)).toBeGreaterThan(Number(before?.access_records));
    const events = await rows<{ event_type: string }>(
      'select event_type from kernel.outbox_event where subject_record_id = any($1::uuid[]) order by 1',
      [[requestId, assignmentId]],
    );
    expect(events.map((event) => event.event_type)).toEqual(
      expect.arrayContaining(['access.approval-decided', 'access.assignment-changed']),
    );
    const permissionChanges = await rows(
      `select a.id from audit.access_record a where a.kind = 'permission-changed' and a.user_id = $1`,
      [grantee.id],
    );
    expect(permissionChanges.length).toBeGreaterThan(0);
    // The history of the assignment and of the request keeps the reason the approver gave and the version decided:
    // an assignment is its own version (PRD-ACS-013; numbering-and-audit 4.2 "Reason"; code-house-rules 7.3; spec
    // section 5 step 7).
    const reasons = await rows<{ operation: string; reason: string | null; version: string | null }>(
      `select operation, reason, record_version_id as version from audit.audit_record
       where record_id = any($1::uuid[])
         and operation in ('prepare-role-assignment', 'approve-role-assignment', 'decide-approval-request') order by 1`,
      [[requestId, assignmentId]],
    );
    expect(reasons).toEqual([
      { operation: 'approve-role-assignment', reason: 'SYNTHETIC approve reason', version: assignmentId },
      { operation: 'decide-approval-request', reason: 'SYNTHETIC approve reason', version: assignmentId },
      { operation: 'prepare-role-assignment', reason: null, version: assignmentId },
    ]);
  });
});
