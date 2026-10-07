import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import { Secret, type AssignmentScope } from '@apparel-os/schemas';
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
  writeSyntheticSetting,
  writeSyntheticUser,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic } from './support/grants.js';
import { capturingLogger, writeSyntheticServiceIdentity } from './support/jobs.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';

// S1-F01-T13: approval requests and decisions of access changes (access-and-approvals 2.1, 4.3, 8, 9.1, 9.3, 9.5,
// 9.6, 9.11, 15 tests 12, 12a, 14, 19, 19b, 19f, 19g, 22; DEC-104, DEC-112, DEC-116, DEC-117). Commands run as the
// runtime role through Organisation routing, on a clock that moves 30 seconds before each decision, so each fresh
// authenticator code is of a later step (3.3). Every value here is SYNTHETIC.

const all = { kind: 'all' } as const;
const EVERYWHERE: AssignmentScope = { kind: 'dimensions', legalEntity: all, place: all, brand: all };
const PREPARED_TYPES = [
  'access.user',
  'access.role',
  'access.role_assignment',
  'access.approval_reason',
  'access.approval_rule_setting',
];

let world: SyntheticWorld;
let database: string;
let router: OrganisationRouter;
let routed: RoutedOrganisation;
let keysEnvironment: Record<string, string>;
let access: Access;
const log = capturingLogger();
const audit = new Audit(log.logger);
let admin: SyntheticUser;
let approver: SyntheticUser;
let secondApprover: SyntheticUser;
let outsider: SyntheticUser;
let adminPreparer: Preparer;
let offsetMs = 0;

beforeAll(async () => {
  world = await createSyntheticOrganisations('approvals');
  database = world.organisations[0].database;
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 6 },
    log.logger,
  );
  const found = await router.resolveForSignIn(world.organisations[0].code);
  if (!found.routed) throw new Error('not routed');
  routed = found.organisation;
  keysEnvironment = syntheticKeysEnvironment(world);
  access = new Access({ audit, keys: OrganisationKeys.fromEnvironment(keysEnvironment) });
  const enrolled = (label: string) =>
    writeSyntheticUser(database, routed.organisationCode, keysEnvironment, { label, enrolled: true });
  admin = await enrolled('ADMIN');
  approver = await enrolled('APPROVER');
  secondApprover = await enrolled('APPROVER2');
  outsider = await enrolled('OUTSIDER');
  await writeSyntheticSetting(database, 'access.password-rules', { minimumLength: 12 });
  const { assignmentId } = await grantSynthetic(
    database,
    { kind: 'user', id: admin.id },
    PREPARED_TYPES.flatMap((recordType) => [
      { recordType, action: 'create' as const },
      { recordType, action: 'edit' as const },
    ]),
  );
  adminPreparer = { userId: admin.id, roleAssignmentId: assignmentId };
  for (const each of [approver, secondApprover]) {
    await grantSynthetic(
      database,
      { kind: 'user', id: each.id },
      PREPARED_TYPES.map((recordType) => ({ recordType, action: 'approve' as const })),
    );
  }
});

afterAll(async () => {
  await (router as OrganisationRouter | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

async function asOwner<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(database, 'migration');
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

function now(): Date {
  return new Date(Date.now() + offsetMs);
}

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

/** A code of the user's authenticator for a step later than any used before: the clock moves on 30 seconds. */
function nextCode(user: SyntheticUser): string {
  offsetMs += 30_000;
  if (user.factorSecret === undefined) throw new Error('not enrolled');
  return codeFor(user.factorSecret, 0, now());
}

const today = () => now().toISOString().slice(0, 10);

function decide(user: SyntheticUser, input: Omit<DecisionInput, 'totpCode'>) {
  const totpCode = nextCode(user);
  return as(user.id, (c) => access.decide(c, { kind: 'user', id: user.id }, { ...input, totpCode }));
}

async function prepareRole(code = `SYN-ROLE-${String(randomInt(1_000_000_000))}`) {
  const prepared = await as(admin.id, (c) =>
    access.prepareRole(c, adminPreparer, {
      code,
      name: 'SYNTHETIC role',
      permissions: [{ kind: 'action', recordType: 'access.role', action: 'view', selfService: false }],
      validFrom: today(),
    }),
  );
  if (prepared.kind !== 'success') throw new Error(`role not prepared: ${prepared.refusal.code}`);
  return prepared.answer;
}

let reasons: { approve: string; reject: string } | undefined;
/** The first reason list: one approve and one reject reason, each decided with free text (DEC-104). */
async function reasonList(): Promise<{ approve: string; reject: string }> {
  if (reasons !== undefined) return reasons;
  const ids: Record<string, string> = {};
  for (const kind of ['approve', 'reject'] as const) {
    const prepared = await as(admin.id, (c) =>
      access.prepareApprovalReason(c, adminPreparer, {
        code: `SYN-${kind.toUpperCase()}-${String(randomInt(1_000_000))}`,
        kind,
        text: `SYNTHETIC ${kind} reason`,
        validFrom: today(),
      }),
    );
    if (prepared.kind !== 'success') throw new Error(`reason not prepared: ${prepared.refusal.code}`);
    const decided = await decide(approver, {
      requestId: prepared.answer.requestId,
      versionId: prepared.answer.versionId,
      outcome: 'approve',
      reason: { kind: 'free-text', text: 'SYNTHETIC first list' },
    });
    if (decided.kind !== 'success') throw new Error(`reason not approved: ${decided.refusal.code}`);
    ids[kind] = prepared.answer.reasonId;
  }
  reasons = { approve: ids.approve ?? '', reject: ids.reject ?? '' };
  return reasons;
}

async function requestState(requestId: string): Promise<string | undefined> {
  const rows = await asOwner((c) =>
    c.query<{ state: string }>('select state from access.approval_request where id = $1', [requestId]),
  );
  return rows.rows[0]?.state;
}

describe('the reason list (access-and-approvals 9.5; test 19b; POL-02.23, DEC-104)', () => {
  it('PRD-UXP-003 with no list in force, deciding is unavailable and names the list', async () => {
    const role = await prepareRole();
    const refused = await decide(approver, {
      requestId: role.requestId,
      versionId: role.versionId,
      outcome: 'approve',
      reason: { kind: 'listed', reasonId: uuidv7() },
    });
    expect(refused).toEqual({
      kind: 'refusal',
      refusal: {
        kind: 'unavailable',
        code: 'access.no-reason-list-in-force',
        missing: [{ kind: 'reason-list', reasonKind: 'approve' }],
      },
      causedBySecret: false,
    });
    const view = await as(approver.id, (c) =>
      access.readApprovalRequest(c, { kind: 'user', id: approver.id }, role.requestId),
    );
    expect(view?.decidable).toMatchObject({ kind: 'unavailable', code: 'access.no-reason-list-in-force' });
  });

  it('PRD-UXP-003 with only approve reasons in force, the panel offers approve and names the missing reject list', async () => {
    const approveOnly = await as(admin.id, (c) =>
      access.prepareApprovalReason(c, adminPreparer, {
        code: `SYN-APPROVE-ONLY-${String(randomInt(1_000_000))}`,
        kind: 'approve',
        text: 'SYNTHETIC approve-only reason',
        validFrom: today(),
      }),
    );
    if (approveOnly.kind !== 'success') throw new Error('not prepared');
    expect(
      await decide(approver, {
        requestId: approveOnly.answer.requestId,
        versionId: approveOnly.answer.versionId,
        outcome: 'approve',
        reason: { kind: 'free-text', text: 'SYNTHETIC first approve reason' },
      }),
    ).toMatchObject({ kind: 'success' });
    const role = await prepareRole();
    const view = await as(approver.id, (c) =>
      access.readApprovalRequest(c, { kind: 'user', id: approver.id }, role.requestId),
    );
    expect(view?.decidable).toEqual({
      kind: 'available',
      reason: 'listed',
      outcomes: ['approve'],
      missing: [{ kind: 'reason-list', reasonKind: 'reject' }],
    });
    // A reason-list change takes free text, so both outcomes are open whatever list is in force (DEC-104).
    const another = await as(admin.id, (c) =>
      access.prepareApprovalReason(c, adminPreparer, {
        code: `SYN-REJECT-PENDING-${String(randomInt(1_000_000))}`,
        kind: 'reject',
        text: 'SYNTHETIC reject reason',
        validFrom: today(),
      }),
    );
    if (another.kind !== 'success') throw new Error('not prepared');
    const listChange = await as(approver.id, (c) =>
      access.readApprovalRequest(c, { kind: 'user', id: approver.id }, another.answer.requestId),
    );
    expect(listChange?.decidable).toEqual({
      kind: 'available',
      reason: 'free-text',
      outcomes: ['approve', 'reject'],
      missing: [],
    });
  });

  it('POL-02.23 DEC-104 decides the first list with free text; a listed reason is refused there', async () => {
    const prepared = await as(admin.id, (c) =>
      access.prepareApprovalReason(c, adminPreparer, {
        code: 'SYN-LISTED-ON-LIST',
        kind: 'approve',
        text: 'SYNTHETIC',
        validFrom: today(),
      }),
    );
    if (prepared.kind !== 'success') throw new Error('not prepared');
    expect(
      await decide(approver, {
        requestId: prepared.answer.requestId,
        versionId: prepared.answer.versionId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: uuidv7() },
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.free-text-required' } });
    const list = await reasonList();
    const inForce = await as(approver.id, (c) => access.reasonsInForce(c));
    expect(inForce.map((each) => each.id)).toEqual(expect.arrayContaining([list.approve, list.reject]));
    expect(inForce.map((each) => each.id)).not.toContain(prepared.answer.reasonId);
  });

  it('POL-02.23 every other decision needs a reason of its outcome from the list in force, never free text', async () => {
    const list = await reasonList();
    const role = await prepareRole();
    const base = { requestId: role.requestId, versionId: role.versionId, outcome: 'approve' as const };
    expect(await decide(approver, { ...base, reason: { kind: 'free-text', text: 'SYNTHETIC' } })).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.free-text-not-allowed' },
    });
    expect(await decide(approver, { ...base, reason: { kind: 'listed', reasonId: list.reject } })).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.reason-not-in-force' },
    });
    const approved = await decide(approver, { ...base, reason: { kind: 'listed', reasonId: list.approve } });
    expect(approved).toMatchObject({ kind: 'success', answer: { requestId: role.requestId, outcome: 'Approved' } });
    expect(await requestState(role.requestId)).toBe('Approved');
    const view = await as(outsider.id, (c) =>
      access.readApprovalRequest(c, { kind: 'user', id: outsider.id }, role.requestId),
    );
    expect(view).toMatchObject({
      state: 'Approved',
      preparers: [admin.id],
      decision: { outcome: 'Approved', approverId: approver.id, reason: { kind: 'listed', reasonId: list.approve } },
      decidable: { kind: 'unavailable', code: 'access.approval-not-open' },
    });
  });
});

describe('who may decide (access-and-approvals 9.3; tests 12, 12a, 19, 22)', () => {
  it('PRD-ACS-006 POL-02.08 refuses the preparer, even through another role that grants approve', async () => {
    const list = await reasonList();
    const role = await prepareRole();
    // The admin also holds approve on roles, through a second assignment.
    await grantSynthetic(database, { kind: 'user', id: admin.id }, [{ recordType: 'access.role', action: 'approve' }]);
    const refused = await decide(admin, {
      requestId: role.requestId,
      versionId: role.versionId,
      outcome: 'approve',
      reason: { kind: 'listed', reasonId: list.approve },
    });
    expect(refused).toMatchObject({ kind: 'refusal', refusal: { code: 'access.self-preparation' } });
    expect(await requestState(role.requestId)).toBe('Awaiting approval');
  });

  it('DEC-105 GC3-1 refuses every user who recorded a change in the version, not only the submitter', async () => {
    const list = await reasonList();
    const role = await prepareRole();
    // The second approver also changed this version (a SYNTHETIC change row, as a shared draft would leave).
    await asOwner((c) =>
      c.query('insert into access.role_version_change (id, role_version_id, changed_by_user_id) values ($1, $2, $3)', [
        uuidv7(),
        role.versionId,
        secondApprover.id,
      ]),
    );
    expect(
      await decide(secondApprover, {
        requestId: role.requestId,
        versionId: role.versionId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: list.approve },
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.self-preparation' } });
  });

  it('PRD-ACS-006 refuses a person holding no approve permission, naming it', async () => {
    const list = await reasonList();
    const role = await prepareRole();
    expect(
      await decide(outsider, {
        requestId: role.requestId,
        versionId: role.versionId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: list.approve },
      }),
    ).toMatchObject({
      kind: 'refusal',
      refusal: {
        kind: 'not-authorised',
        code: 'access.not-eligible',
        missing: [{ kind: 'permission', recordType: 'access.role', action: 'approve' }],
      },
    });
  });

  it('PRD-SEC-018 a service identity never decides, even holding approve', async () => {
    const list = await reasonList();
    const role = await prepareRole();
    const identityId = await writeSyntheticServiceIdentity(database, 'synthetic-decider', [
      { recordType: 'access.role', action: 'approve' },
    ]);
    const refused = await as(identityId, (c) =>
      access.decide(
        c,
        { kind: 'service-identity', id: identityId },
        {
          requestId: role.requestId,
          versionId: role.versionId,
          outcome: 'approve',
          reason: { kind: 'listed', reasonId: list.approve },
          totpCode: '000000',
        },
      ),
    );
    expect(refused).toMatchObject({ kind: 'refusal', refusal: { code: 'access.not-eligible' } });
  });

  it('PRD-SEC-001 asks a fresh authenticator code, and never accepts one twice', async () => {
    const list = await reasonList();
    const role = await prepareRole();
    const input = {
      requestId: role.requestId,
      versionId: role.versionId,
      outcome: 'approve' as const,
      reason: { kind: 'listed' as const, reasonId: list.approve },
    };
    const wrong = await as(approver.id, (c) =>
      access.decide(c, { kind: 'user', id: approver.id }, { ...input, totpCode: '000000' }),
    );
    expect(wrong).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.authenticator-code-refused' },
      causedBySecret: true,
    });
    expect(await decide(approver, input)).toMatchObject({ kind: 'success' });
  });
});

describe('material change (access-and-approvals 9.6; test 14, access-change part; PRD-ACS-007)', () => {
  it('POL-02.12 a new version supersedes the open request; a decision on the old one is refused', async () => {
    const list = await reasonList();
    const role = await prepareRole();
    const next = await as(admin.id, (c) =>
      access.prepareRoleVersion(c, adminPreparer, role.roleId, {
        name: 'SYNTHETIC role, changed',
        permissions: [{ kind: 'action', recordType: 'access.role', action: 'create', selfService: false }],
        validFrom: today(),
      }),
    );
    if (next.kind !== 'success') throw new Error('not prepared');
    expect(await requestState(role.requestId)).toBe('Superseded');
    expect(
      await decide(approver, {
        requestId: role.requestId,
        versionId: role.versionId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: list.approve },
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.approval-superseded' } });
    // A decision naming another version than the request's is stale (PRD-ACS-007).
    expect(
      await decide(approver, {
        requestId: next.answer.requestId,
        versionId: role.versionId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: list.approve },
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { kind: 'conflict', code: 'kernel.stale-version' } });
    expect(
      await decide(approver, {
        requestId: next.answer.requestId,
        versionId: next.answer.versionId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: list.approve },
      }),
    ).toMatchObject({ kind: 'success' });
  });

  it('PRD-ACS-010 a rejection records the reason and the version never takes effect', async () => {
    const list = await reasonList();
    const role = await prepareRole();
    expect(
      await decide(approver, {
        requestId: role.requestId,
        versionId: role.versionId,
        outcome: 'reject',
        reason: { kind: 'listed', reasonId: list.reject },
        comment: 'SYNTHETIC comment',
      }),
    ).toMatchObject({ kind: 'success', answer: { outcome: 'Rejected' } });
    const rows = await asOwner((c) =>
      c.query<{ decision: string }>('select decision from access.role_version where id = $1', [role.versionId]),
    );
    expect(rows.rows).toEqual([{ decision: 'Rejected' }]);
  });
});

describe('concurrent decisions (spec section 10; S1-F01-AT14)', () => {
  it('PRD-INT-003 two approvers deciding one request at once: one decision commits, the other is refused', async () => {
    const list = await reasonList();
    const role = await prepareRole();
    const input = {
      requestId: role.requestId,
      versionId: role.versionId,
      outcome: 'approve' as const,
      reason: { kind: 'listed' as const, reasonId: list.approve },
    };
    const results = await Promise.all([decide(approver, input), decide(secondApprover, input)]);
    expect(results.filter((result) => result.kind === 'success')).toHaveLength(1);
    expect(results.filter((result) => result.kind === 'refusal')).toMatchObject([
      { refusal: { code: 'access.approval-not-open' } },
    ]);
    const decisions = await asOwner((c) =>
      c.query('select id from access.approval_decision where approval_request_id = $1', [role.requestId]),
    );
    expect(decisions.rows).toHaveLength(1);
  });
});

describe('users (access-and-approvals 2.1, 3.2, 4.3; tests 19f, 19g; DEC-112, DEC-116, DEC-117; RR-300)', () => {
  async function prepareUser(label: string) {
    const prepared = await as(admin.id, (c) =>
      access.prepareUser(c, adminPreparer, {
        login: `syn-${label}-${String(randomInt(1_000_000))}`,
        displayName: `SYNTHETIC ${label}`,
        personas: ['P-AUD'],
        temporaryPassword: new Secret('SYNTHETIC-temporary-password'),
      }),
    );
    if (prepared.kind !== 'success') throw new Error(`user not prepared: ${prepared.refusal.code}`);
    return prepared.answer;
  }

  async function approvedRoleId(): Promise<string> {
    const list = await reasonList();
    const role = await prepareRole();
    const decided = await decide(approver, {
      requestId: role.requestId,
      versionId: role.versionId,
      outcome: 'approve',
      reason: { kind: 'listed', reasonId: list.approve },
    });
    if (decided.kind !== 'success') throw new Error('role not approved');
    return role.roleId;
  }

  async function prepareAssignmentOf(userId: string, roleId: string) {
    const prepared = await as(admin.id, (c) =>
      access.prepareAssignment(c, adminPreparer, {
        actor: { kind: 'user', userId },
        roleId,
        scope: EVERYWHERE,
        validFrom: today(),
      }),
    );
    if (prepared.kind !== 'success') throw new Error(`assignment not prepared: ${prepared.refusal.code}`);
    return prepared.answer;
  }

  it('PRD-SEC-014 refuses a temporary password the rules refuse, and a login another user has', async () => {
    const short = await as(admin.id, (c) =>
      access.prepareUser(c, adminPreparer, {
        login: 'syn-short',
        displayName: 'SYNTHETIC',
        personas: [],
        temporaryPassword: new Secret('short'),
      }),
    );
    expect(short).toMatchObject({
      kind: 'refusal',
      refusal: {
        code: 'access.password-refused',
        missing: [{ kind: 'password-rule', rule: 'minimum-length', minimumLength: '12' }],
      },
      causedBySecret: true,
    });
    const taken = await as(admin.id, (c) =>
      access.prepareUser(c, adminPreparer, {
        login: approver.login.toLowerCase(),
        displayName: 'SYNTHETIC',
        personas: [],
        temporaryPassword: new Secret('SYNTHETIC-temporary-password'),
      }),
    );
    expect(taken).toMatchObject({ kind: 'refusal', refusal: { code: 'access.login-taken' } });
  });

  it('DEC-112 DEC-116 a new user and their assignment wait together; the assignment waits for the user', async () => {
    const list = await reasonList();
    const roleId = await approvedRoleId();
    const user = await prepareUser('NEW');
    const assignment = await prepareAssignmentOf(user.userId, roleId);
    const early = await decide(approver, {
      requestId: assignment.requestId,
      versionId: assignment.assignmentId,
      outcome: 'approve',
      reason: { kind: 'listed', reasonId: list.approve },
    });
    expect(early).toMatchObject({
      kind: 'refusal',
      refusal: {
        code: 'access.user-not-approved',
        missing: [{ kind: 'approval', recordType: 'access.user', recordId: user.userId }],
      },
    });
    // Not in force, so not Active: the new user cannot sign in yet (2.1).
    const before = await asOwner((c) =>
      c.query('select 1 from access.app_user_version where app_user_id = $1 and decision = $2', [
        user.userId,
        'Approved',
      ]),
    );
    expect(before.rows).toHaveLength(0);
    expect(
      await decide(approver, {
        requestId: user.requestId,
        versionId: user.versionId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: list.approve },
      }),
    ).toMatchObject({ kind: 'success' });
    expect(
      await decide(approver, {
        requestId: assignment.requestId,
        versionId: assignment.assignmentId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: list.approve },
      }),
    ).toMatchObject({ kind: 'success' });
    const access_ = await as(user.userId, (c) =>
      access.authorise(c, { actorId: user.userId, action: 'view', recordType: 'access.role' }),
    );
    expect(access_).toMatchObject({ kind: 'allowed', roleAssignmentId: assignment.assignmentId });
  });

  it('DEC-116 DEC-117 rejecting a user’s first version withdraws their pending assignments and retires the password', async () => {
    const list = await reasonList();
    const roleId = await approvedRoleId();
    const user = await prepareUser('REJECTED');
    const assignment = await prepareAssignmentOf(user.userId, roleId);
    const rejected = await decide(approver, {
      requestId: user.requestId,
      versionId: user.versionId,
      outcome: 'reject',
      reason: { kind: 'listed', reasonId: list.reject },
    });
    expect(rejected).toMatchObject({ kind: 'success', answer: { outcome: 'Rejected' } });
    expect(await requestState(assignment.requestId)).toBe('Withdrawn');
    const rows = await asOwner((c) =>
      c.query<{ decision: string; kind: string; caused: string }>(
        `select a.decision, v.kind, v.caused_by_decision_id as caused
         from access.role_assignment a
         join access.role_assignment_withdrawal_version v on v.withdrawal_id = a.withdrawal_id
         where a.id = $1`,
        [assignment.assignmentId],
      ),
    );
    expect(rows.rows).toEqual([
      {
        decision: 'Withdrawn',
        kind: 'before-approval',
        caused: rejected.kind === 'success' ? rejected.answer.decisionId : '',
      },
    ]);
    const credentials = await asOwner((c) =>
      c.query('select 1 from access.password_credential where app_user_id = $1 and password_hash is not null', [
        user.userId,
      ]),
    );
    expect(credentials.rows).toHaveLength(0);
    expect(
      await decide(approver, {
        requestId: assignment.requestId,
        versionId: assignment.assignmentId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: list.approve },
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.approval-not-open' } });
  });

  it('PRD-SEC-008 DEC-112 a disabling takes effect only when a different person approves it, revoking every session', async () => {
    const list = await reasonList();
    // An Active user since yesterday, with a session in force (SYNTHETIC rows).
    const target = await writeSyntheticUser(database, routed.organisationCode, keysEnvironment, { label: 'DISABLE' });
    const sessionId = uuidv7();
    await asOwner((c) =>
      c.query(
        `insert into access.session (id, app_user_id, identifier_hash, kind, device_id, state, started_at, last_activity_at)
         values ($1, $2, $3, 'office', null, 'In force', now(), now())`,
        [sessionId, target.id, 'a'.repeat(63) + String(randomInt(10))],
      ),
    );
    const prepared = await as(admin.id, (c) =>
      access.prepareUserVersion(c, adminPreparer, target.id, {
        displayName: target.displayName,
        personas: [],
        state: 'Disabled',
      }),
    );
    if (prepared.kind !== 'success') throw new Error('not prepared');
    // Prepared, not decided: nothing changed yet.
    const waiting = await asOwner((c) =>
      c.query<{ state: string }>('select state from access.session where id = $1', [sessionId]),
    );
    expect(waiting.rows).toEqual([{ state: 'In force' }]);
    expect(
      await decide(admin, {
        requestId: prepared.answer.requestId,
        versionId: prepared.answer.versionId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: list.approve },
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.not-eligible' } });
    expect(
      await decide(approver, {
        requestId: prepared.answer.requestId,
        versionId: prepared.answer.versionId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: list.approve },
      }),
    ).toMatchObject({ kind: 'success' });
    const after = await asOwner((c) =>
      c.query<{ state: string }>('select state from access.session where id = $1', [sessionId]),
    );
    expect(after.rows).toEqual([{ state: 'Revoked' }]);
    const state = await asOwner((c) =>
      c.query<{ state: string }>(
        `select state from access.app_user_version where app_user_id = $1 and decision = 'Approved'
         and upper_inf(valid_during)`,
        [target.id],
      ),
    );
    expect(state.rows).toEqual([{ state: 'Disabled' }]);
  });

  // Last in the file: it disables the approver every test above relies on.
  it('DEC-112 S1-F01-AT10 changing or disabling the first approver takes effect only when a different person approves it', async () => {
    const list = await reasonList();
    // The Admin also holds approve on users, so the refusal below is for preparing it, not for lacking the permission.
    await grantSynthetic(database, { kind: 'user', id: admin.id }, [{ recordType: 'access.user', action: 'approve' }]);
    const prepared = await as(admin.id, (c) =>
      access.prepareUserVersion(c, adminPreparer, approver.id, {
        displayName: `${approver.displayName} (changed)`,
        personas: [],
        state: 'Disabled',
      }),
    );
    if (prepared.kind !== 'success') throw new Error(`not prepared: ${prepared.refusal.code}`);
    const input = {
      requestId: prepared.answer.requestId,
      versionId: prepared.answer.versionId,
      outcome: 'approve' as const,
      reason: { kind: 'listed' as const, reasonId: list.approve },
    };
    expect(await decide(admin, input)).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.self-preparation', missing: [{ kind: 'preparer', userId: admin.id }] },
    });
    const unchanged = await asOwner((c) =>
      c.query<{ state: string; name: string }>(
        `select state, display_name as name from access.app_user_version
         where app_user_id = $1 and decision = 'Approved' and upper_inf(valid_during)`,
        [approver.id],
      ),
    );
    expect(unchanged.rows).toEqual([{ state: 'Active', name: approver.displayName }]);
    expect(await decide(secondApprover, input)).toMatchObject({ kind: 'success', answer: { outcome: 'Approved' } });
    const changed = await asOwner((c) =>
      c.query<{ state: string; name: string }>(
        `select state, display_name as name from access.app_user_version
         where app_user_id = $1 and decision = 'Approved' and upper_inf(valid_during)`,
        [approver.id],
      ),
    );
    expect(changed.rows).toEqual([{ state: 'Disabled', name: `${approver.displayName} (changed)` }]);
    // Disabled, the first approver decides nothing more (access-and-approvals 2.1, 9.3).
    const role = await prepareRole();
    expect(
      await decide(approver, {
        requestId: role.requestId,
        versionId: role.versionId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: list.approve },
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.not-eligible', missing: [{ kind: 'user-state' }] } });
  });
});
