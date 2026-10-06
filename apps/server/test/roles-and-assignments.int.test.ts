import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  errorEnvelopeSchema,
  permissionRegistry,
  type AssignmentScope,
  type PersonaId,
  type RecordTypeDeclaration,
  type RoleAssignmentDraft,
} from '@apparel-os/schemas';
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
import { Access, accessJobKinds, type Decider, type Preparer } from '../src/modules/access/index.js';
import { Audit } from '../src/modules/audit/index.js';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  syntheticTimezone,
  SYNTHETIC_ORIGIN,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic } from './support/grants.js';
import { capturingLogger } from './support/jobs.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl, sqlState } from './support/postgres.js';

// S1-F01-T11: roles, role assignments, scope, effective grants, Authorise and row-level security
// (access-and-approvals 4, 5, 7, 13.1, 15 tests 5a, 5b, 6, 9, 10, 11; code-house-rules 6.2, 7.3; DEC-112, CH-7;
// RR-202, CH-11; RR-242, RR-261, RR-281). Commands run as the runtime role through Organisation routing, as the
// application runs them (code-house-rules 10.1). The approvals of S1-F01-T13 do not exist yet, so a decision is made
// here by calling the effect that Decide calls, as a different SYNTHETIC user. Every value here is SYNTHETIC.

/** A SYNTHETIC record type with a subject person, for the self-service role only (access-and-approvals 5.4). */
const SELF_RECORD: RecordTypeDeclaration = {
  code: 'syn.self_record',
  actions: ['view'],
  scopeFacts: { legalEntity: false, place: false, brand: false },
  subject: true,
  fieldClasses: [],
};
const REGISTRY = [...permissionRegistry, SELF_RECORD];

const SCRATCH = `
  create schema syn;
  grant usage on schema syn to aos_runtime;
  create table syn.self_record (id uuid primary key, subject_id uuid not null);
  grant select, insert on syn.self_record to aos_runtime;
  alter table syn.self_record enable row level security;
  create policy row_scope on syn.self_record for all to aos_runtime
    using (access.row_visible('syn.self_record', null, null, null, null, null, subject_id))
    with check (access.row_visible('syn.self_record', null, null, null, null, null, subject_id));
`;

const all = { kind: 'all' } as const;
const empty = { kind: 'empty' } as const;
const EVERYWHERE: AssignmentScope = { kind: 'dimensions', legalEntity: all, place: all, brand: all };
const DAY = 86_400_000;

let world: SyntheticWorld;
let database: string;
let router: OrganisationRouter;
let routed: RoutedOrganisation;
const log = capturingLogger();
const audit = new Audit(log.logger);
const access = new Access({ audit, registry: REGISTRY });
let admin: SyntheticUser;
let approver: SyntheticUser;

beforeAll(async () => {
  world = await createSyntheticOrganisations('roles');
  database = world.organisations[0].database;
  await asOwner((client) => client.query(SCRATCH));
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    log.logger,
  );
  const found = await router.resolveForSignIn(world.organisations[0].code);
  if (!found.routed) throw new Error('not routed');
  routed = found.organisation;
  const keys = syntheticKeysEnvironment(world);
  admin = await writeSyntheticUser(database, routed.organisationCode, keys, { label: 'ADMIN' });
  approver = await writeSyntheticUser(database, routed.organisationCode, keys, { label: 'APPROVER' });
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

/** A business date `days` from today in the synthetic timezone (Etc/UTC). */
function dateIn(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
}

/** Runs a command as the actor, on a clock `days` ahead of now. */
function as<T>(actorId: string, work: (context: TransactionContext) => Promise<T>, days = 0): Promise<T> {
  const runner = new CommandRunner({
    clock: { now: () => new Date(Date.now() + days * DAY) },
    timezones: syntheticTimezone,
    logger: log.logger,
  });
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

async function newUser(label: string, personas: PersonaId[] = []): Promise<SyntheticUser> {
  return writeSyntheticUser(database, routed.organisationCode, syntheticKeysEnvironment(world), {
    label: `${label}${String(randomInt(1_000_000))}`,
    personas,
  });
}

/** The admin's grant to prepare roles and assignments, written directly; returns the preparer as Authorise found it. */
let adminPreparer: Preparer | undefined;
async function preparer(): Promise<Preparer> {
  if (adminPreparer === undefined) {
    const { assignmentId } = await grantSynthetic(database, { kind: 'user', id: admin.id }, [
      { recordType: 'access.role', action: 'create' },
      { recordType: 'access.role', action: 'edit' },
      { recordType: 'access.role_assignment', action: 'create' },
      { recordType: 'access.role_assignment', action: 'edit' },
    ]);
    adminPreparer = { userId: admin.id, roleAssignmentId: assignmentId };
  }
  return adminPreparer;
}

const decider = (): Decider => ({ actor: { kind: 'user', id: approver.id } });

/** Prepares and approves a role holding the permissions given, from today; returns its identifier. */
async function approvedRole(
  permissions: { recordType: string; action: string; selfService?: boolean }[],
  validFrom = dateIn(0),
): Promise<string> {
  const p = await preparer();
  const prepared = await as(admin.id, (c) =>
    access.prepareRole(c, p, {
      code: `SYN-ROLE-${String(randomInt(1_000_000_000))}`,
      name: 'SYNTHETIC role',
      permissions: permissions.map((each) => ({
        kind: 'action',
        recordType: each.recordType,
        action: each.action as 'view',
        selfService: each.selfService ?? false,
      })),
      validFrom,
    }),
  );
  if (prepared.kind !== 'success') throw new Error(`role not prepared: ${prepared.refusal.code}`);
  const approved = await as(approver.id, (c) => access.approveRoleVersion(c, decider(), prepared.answer.versionId));
  if (approved.kind !== 'success') throw new Error(`role not approved: ${approved.refusal.code}`);
  return prepared.answer.roleId;
}

function assignmentDraft(
  userId: string,
  roleId: string,
  options: { scope?: AssignmentScope; validFrom?: string; validTo?: string } = {},
): RoleAssignmentDraft {
  return {
    actor: { kind: 'user', userId },
    roleId,
    scope: options.scope ?? EVERYWHERE,
    validFrom: options.validFrom ?? dateIn(0),
    ...(options.validTo === undefined ? {} : { validTo: options.validTo }),
  };
}

async function prepareAssignment(draft: RoleAssignmentDraft) {
  const p = await preparer();
  return as(admin.id, (c) => access.prepareAssignment(c, p, draft));
}

async function approvedAssignment(draft: RoleAssignmentDraft): Promise<string> {
  const prepared = await prepareAssignment(draft);
  if (prepared.kind !== 'success') throw new Error(`assignment not prepared: ${prepared.refusal.code}`);
  const approved = await as(approver.id, (c) => access.approveAssignment(c, decider(), prepared.answer.assignmentId));
  if (approved.kind !== 'success') throw new Error(`assignment not approved: ${approved.refusal.code}`);
  return prepared.answer.assignmentId;
}

function authorise(actorId: string, action: 'view' | 'create' | 'edit', recordType: string, days = 0) {
  return as(actorId, (c) => access.authorise(c, { actorId, action, recordType }), days);
}

describe('role assignment dates (access-and-approvals 4.3; test 5a)', () => {
  it('PRD-ACS-005 PRD-MOD-010 DEC-105 refuses a role or an assignment version that starts on a past date', async () => {
    const p = await preparer();
    const role = await as(admin.id, (c) =>
      access.prepareRole(c, p, {
        code: 'SYN-PAST-ROLE',
        name: 'SYNTHETIC past',
        permissions: [],
        validFrom: dateIn(-1),
      }),
    );
    expect(role).toEqual({ kind: 'refusal', refusal: { kind: 'refused', code: 'access.starts-in-past', missing: [] } });
    const user = await newUser('PAST');
    const roleId = await approvedRole([{ recordType: 'access.role', action: 'view' }]);
    expect(await prepareAssignment(assignmentDraft(user.id, roleId, { validFrom: dateIn(-1) }))).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.starts-in-past' },
    });
  });

  it('PRD-MOD-010 refuses to approve an assignment whose start passed while it waited', async () => {
    const user = await newUser('WAITED');
    const roleId = await approvedRole([{ recordType: 'access.role', action: 'view' }]);
    const prepared = await prepareAssignment(assignmentDraft(user.id, roleId, { validFrom: dateIn(1) }));
    if (prepared.kind !== 'success') throw new Error('not prepared');
    const late = await as(approver.id, (c) => access.approveAssignment(c, decider(), prepared.answer.assignmentId), 2);
    expect(late).toMatchObject({ kind: 'refusal', refusal: { code: 'access.starts-in-past' } });
  });
});

describe('assignments in force together (access-and-approvals 4.3; DEC-112, CH-7; test 5b)', () => {
  it('PRD-MOD-010 DEC-112 refuses two approved assignments of one user, one role and one exact scope that overlap', async () => {
    const user = await newUser('OVERLAP');
    const roleId = await approvedRole([{ recordType: 'access.role', action: 'view' }]);
    // Two drafts, prepared before either is approved.
    const first = await prepareAssignment(assignmentDraft(user.id, roleId));
    const second = await prepareAssignment(assignmentDraft(user.id, roleId, { validFrom: dateIn(30) }));
    if (first.kind !== 'success' || second.kind !== 'success') throw new Error('not prepared');
    expect(await as(approver.id, (c) => access.approveAssignment(c, decider(), first.answer.assignmentId))).toEqual({
      kind: 'success',
      answer: { assignmentId: first.answer.assignmentId },
    });
    expect(
      await as(approver.id, (c) => access.approveAssignment(c, decider(), second.answer.assignmentId)),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.assignment-overlaps' } });
    // A third is refused when it is prepared.
    expect(await prepareAssignment(assignmentDraft(user.id, roleId, { validFrom: dateIn(400) }))).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.assignment-overlaps' },
    });
    // The exclusion constraint is the backstop, even for the owner (code-house-rules 7.3).
    expect(
      await sqlState(
        asOwner((c) =>
          c.query(`update access.role_assignment set decision = 'Approved' where id = $1`, [
            second.answer.assignmentId,
          ]),
        ),
      ),
    ).toBe('23P01');
  });

  it('PRD-ACS-004 DEC-112 lets two roles, or one role over two scopes, be in force together, each checked on its own', async () => {
    const user = await newUser('TWO');
    const viewer = await approvedRole([{ recordType: 'access.role', action: 'view' }]);
    const creator = await approvedRole([{ recordType: 'access.role', action: 'create' }]);
    const viewAssignment = await approvedAssignment(assignmentDraft(user.id, viewer));
    // The same role over another exact scope may be in force too.
    await approvedAssignment(assignmentDraft(user.id, viewer, { scope: { ...EVERYWHERE, brand: empty } }));
    // Another role, but with an empty dimension: it grants nothing (PRD-ACS-005).
    const narrow = await approvedAssignment(
      assignmentDraft(user.id, creator, { scope: { ...EVERYWHERE, brand: empty } }),
    );
    expect(await authorise(user.id, 'view', 'access.role')).toEqual({
      kind: 'allowed',
      roleAssignmentId: viewAssignment,
    });
    // The view of one assignment and the create of another never combine (PRD-ACS-004).
    expect(await authorise(user.id, 'create', 'access.role')).toEqual({
      kind: 'refused',
      refusal: {
        kind: 'not-authorised',
        code: 'access.not-authorised',
        missing: [{ kind: 'scope', dimension: 'brand', roleAssignmentId: narrow }],
      },
    });
  });
});

describe('personas and empty scope grant nothing (access-and-approvals 2.1, 5.1; tests 6 and 9)', () => {
  it('PRD-ACS-002 PRD-ACS-003 a persona alone grants nothing', async () => {
    const user = await newUser('PERSONA', ['P-ADM', 'P-AUD']);
    expect(await authorise(user.id, 'view', 'access.user')).toEqual({
      kind: 'refused',
      refusal: {
        kind: 'not-authorised',
        code: 'access.not-authorised',
        missing: [{ kind: 'permission', recordType: 'access.user', action: 'view' }],
      },
    });
    expect(await as(user.id, (c) => access.ownAccess(c, user.id))).toEqual({
      personasHeld: ['P-ADM', 'P-AUD'],
      grants: [],
    });
  });

  it('PRD-ACS-005 all members covers a Site, Store, brand and legal entity never seen before; an empty dimension grants nothing', async () => {
    const reader = await newUser('ALL');
    const roleId = await approvedRole([{ recordType: 'audit.access_record', action: 'view' }]);
    const assignmentId = await approvedAssignment(assignmentDraft(reader.id, roleId));
    const facts = {
      siteId: uuidv7(),
      storeId: uuidv7(),
      businessUnitId: uuidv7(),
      legalEntityId: uuidv7(),
      brandId: uuidv7(),
    };
    expect(
      await as(reader.id, (c) =>
        access.authorise(c, { actorId: reader.id, action: 'view', recordType: 'audit.access_record', facts }),
      ),
    ).toEqual({ kind: 'allowed', roleAssignmentId: assignmentId });

    const emptyReader = await newUser('EMPTY');
    await approvedAssignment(assignmentDraft(emptyReader.id, roleId, { scope: { ...EVERYWHERE, legalEntity: empty } }));
    expect(
      await as(emptyReader.id, (c) =>
        access.authorise(c, { actorId: emptyReader.id, action: 'view', recordType: 'audit.access_record', facts }),
      ),
    ).toMatchObject({ kind: 'refused', refusal: { missing: [{ kind: 'scope', dimension: 'legal-entity' }] } });
    // No effective grant comes from it, so row-level security shows it nothing either (7.2).
    expect(await as(emptyReader.id, (c) => access.ownAccess(c, emptyReader.id))).toMatchObject({ grants: [] });
  });

  it('PRD-ACS-005 refuses selected members until the scope contract of S1-F02 and S1-F03 exists', async () => {
    const user = await newUser('SELECTED');
    const roleId = await approvedRole([{ recordType: 'access.role', action: 'view' }]);
    const scope: AssignmentScope = {
      kind: 'dimensions',
      legalEntity: all,
      place: { kind: 'selected', members: [{ type: 'site', id: uuidv7() }] },
      brand: all,
    };
    expect(await prepareAssignment(assignmentDraft(user.id, roleId, { scope }))).toEqual({
      kind: 'refusal',
      refusal: {
        kind: 'unavailable',
        code: 'access.scope-members-not-available',
        missing: [{ kind: 'scope', dimension: 'place' }],
      },
    });
  });
});

describe('the self-service role (access-and-approvals 4.2, 5.4; test 10)', () => {
  it('PRD-ACS-022 DEC-100 refuses a role mixing self-service with other permissions, or self-service on a type with no subject', async () => {
    const p = await preparer();
    const mixed = await as(admin.id, (c) =>
      access.prepareRole(c, p, {
        code: 'SYN-MIXED',
        name: 'SYNTHETIC mixed',
        validFrom: dateIn(0),
        permissions: [
          { kind: 'action', recordType: 'syn.self_record', action: 'view', selfService: true },
          { kind: 'action', recordType: 'access.role', action: 'view', selfService: false },
        ],
      }),
    );
    expect(mixed).toMatchObject({ kind: 'refusal', refusal: { code: 'access.self-service-scope' } });
    const noSubject = await as(admin.id, (c) =>
      access.prepareRole(c, p, {
        code: 'SYN-NO-SUBJECT',
        name: 'SYNTHETIC no subject',
        validFrom: dateIn(0),
        permissions: [{ kind: 'action', recordType: 'access.role', action: 'view', selfService: true }],
      }),
    );
    expect(noSubject).toEqual({
      kind: 'refusal',
      refusal: {
        kind: 'refused',
        code: 'access.permission-not-declared',
        missing: [{ kind: 'permission', recordType: 'access.role', action: 'view' }],
      },
    });
  });

  it('PRD-ACS-022 gives the self-service role own-record scope only, and it reaches only its user’s records', async () => {
    const selfRole = await approvedRole([{ recordType: 'syn.self_record', action: 'view', selfService: true }]);
    const workRole = await approvedRole([{ recordType: 'access.role', action: 'view' }]);
    const user = await newUser('SELF');
    const other = await newUser('OTHER');
    expect(await prepareAssignment(assignmentDraft(user.id, selfRole))).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.self-service-scope' },
    });
    expect(
      await prepareAssignment(assignmentDraft(user.id, workRole, { scope: { kind: 'own-records' } })),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.self-service-scope' } });
    await approvedAssignment(assignmentDraft(user.id, selfRole, { scope: { kind: 'own-records' } }));

    const mine = uuidv7();
    await asOwner((c) =>
      c.query('insert into syn.self_record (id, subject_id) values ($1, $2), ($3, $4)', [
        mine,
        user.id,
        uuidv7(),
        other.id,
      ]),
    );
    const seen = await as(user.id, async (c) => (await c.tx.execute(sql`select id from syn.self_record`)).rows);
    expect(seen).toEqual([{ id: mine }]);
    expect(
      await as(user.id, (c) =>
        access.authorise(c, {
          actorId: user.id,
          action: 'view',
          recordType: 'syn.self_record',
          facts: { subjectId: other.id },
        }),
      ),
    ).toMatchObject({ kind: 'refused', refusal: { missing: [{ kind: 'scope', dimension: 'own-records' }] } });
  });
});

describe('row-level security over history (access-and-approvals 7.2; numbering-and-audit 4.5; RR-242; test 11)', () => {
  it('PRD-SEC-005 with no actor no audit row shows; with an actor only the history its grants cover', async () => {
    const p = await preparer();
    const prepared = await as(admin.id, (c) =>
      access.prepareRole(c, p, {
        code: 'SYN-HISTORY',
        name: 'SYNTHETIC history',
        permissions: [],
        validFrom: dateIn(0),
      }),
    );
    if (prepared.kind !== 'success') throw new Error('not prepared');
    const historian = await newUser('HISTORIAN');
    const auditOnly = await newUser('AUDITONLY');
    const roleOnly = await newUser('ROLEONLY');
    await grantSynthetic(database, { kind: 'user', id: historian.id }, [
      { recordType: 'audit.audit_record', action: 'view' },
      { recordType: 'access.role', action: 'view' },
    ]);
    await grantSynthetic(database, { kind: 'user', id: auditOnly.id }, [
      { recordType: 'audit.audit_record', action: 'view' },
    ]);
    await grantSynthetic(database, { kind: 'user', id: roleOnly.id }, [{ recordType: 'access.role', action: 'view' }]);

    const history = (actorId: string) =>
      as(actorId, (c) =>
        audit.readHistory(c, { of: 'record', module: 'access', type: 'role', id: prepared.answer.roleId }),
      );
    expect((await history(historian.id)).map((entry) => entry.operation)).toEqual(['prepare-role']);
    expect(await history(auditOnly.id)).toEqual([]);
    expect(await history(roleOnly.id)).toEqual([]);
    // With no actor set, no scoped row shows (code-house-rules 6.2, 6.3).
    const runner = new CommandRunner({
      clock: { now: () => new Date() },
      timezones: syntheticTimezone,
      logger: log.logger,
    });
    const noActor = await runner.read(
      {
        commandName: 'access.synthetic-test',
        organisation: routed,
        correlationId: newCorrelationId(),
        actor: { kind: 'no-actor', path: 'authenticate' },
      },
      async (c) =>
        (await c.tx.execute(sql`select count(*)::int as n from audit.audit_record`)).rows[0] as { n: number },
    );
    expect(noActor.n).toBe(0);
  });

  it('PRD-SEC-005 DEC-112 the access records of sign-ins are read Organisation-wide, by all-members scope only', async () => {
    const subject = await newUser('SIGNEDIN');
    await as(subject.id, (c) => audit.recordAccess(c, { kind: 'sign-in', outcome: 'succeeded', userId: subject.id }));
    const wide = await newUser('WIDE');
    const narrow = await newUser('NARROW');
    await grantSynthetic(database, { kind: 'user', id: wide.id }, [
      { recordType: 'audit.access_record', action: 'view' },
    ]);
    // A place scope that selects members, none of which a sign-in carries: a sign-in has no place (9.11).
    await grantSynthetic(
      database,
      { kind: 'user', id: narrow.id },
      [{ recordType: 'audit.access_record', action: 'view' }],
      { scope: { kind: 'dimensions', legalEntity: all, place: { kind: 'selected', members: [] }, brand: all } },
    );
    const signIns = (actorId: string) =>
      as(
        actorId,
        async (c) =>
          (
            await c.tx.execute<{ user_id: string }>(
              sql`select user_id from audit.access_record where kind = 'sign-in' and user_id = ${subject.id}`,
            )
          ).rows,
      );
    expect(await signIns(wide.id)).toEqual([{ user_id: subject.id }]);
    expect(await signIns(narrow.id)).toEqual([]);
  });
});

describe('withdrawing a Scheduled assignment (code-house-rules 7.3; RR-202, CH-11)', () => {
  it('PRD-ACS-005 POL-02.07 withdraws an approved assignment before its start, so it never takes effect and frees its dates', async () => {
    const user = await newUser('WITHDRAWN');
    const roleId = await approvedRole([{ recordType: 'access.role', action: 'view' }]);
    const assignmentId = await approvedAssignment(assignmentDraft(user.id, roleId, { validFrom: dateIn(1) }));
    const p = await preparer();
    const withdrawal = await as(admin.id, (c) =>
      access.prepareWithdrawal(c, p, assignmentId, { reason: 'SYNTHETIC reason' }),
    );
    if (withdrawal.kind !== 'success') throw new Error('withdrawal not prepared');
    expect(await as(approver.id, (c) => access.approveWithdrawal(c, decider(), withdrawal.answer.versionId))).toEqual({
      kind: 'success',
      answer: { assignmentId },
    });
    // Its history stays; it is never in force, so no grant comes from it when its start passes.
    expect(await authorise(user.id, 'view', 'access.role', 2)).toMatchObject({ kind: 'refused' });
    // The withdrawal is recorded once.
    expect(
      await sqlState(
        asOwner((c) => c.query('update access.role_assignment set withdrawal_id = null where id = $1', [assignmentId])),
      ),
    ).toBe('AO003');
    // The same actor, role and exact scope may be assigned again for those dates.
    await approvedAssignment(assignmentDraft(user.id, roleId, { validFrom: dateIn(1) }));
  });

  it('refuses to withdraw an assignment that has started, or that started while its withdrawal waited', async () => {
    const user = await newUser('STARTED');
    const roleId = await approvedRole([{ recordType: 'access.role', action: 'view' }]);
    const started = await approvedAssignment(assignmentDraft(user.id, roleId));
    const p = await preparer();
    expect(
      await as(admin.id, (c) => access.prepareWithdrawal(c, p, started, { reason: 'SYNTHETIC reason' })),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.not-withdrawable' } });
    const later = await approvedAssignment(
      assignmentDraft(user.id, roleId, { validFrom: dateIn(1), scope: { ...EVERYWHERE, place: empty } }),
    );
    const withdrawal = await as(admin.id, (c) => access.prepareWithdrawal(c, p, later, { reason: 'SYNTHETIC reason' }));
    if (withdrawal.kind !== 'success') throw new Error('withdrawal not prepared');
    expect(
      await as(approver.id, (c) => access.approveWithdrawal(c, decider(), withdrawal.answer.versionId), 2),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.not-withdrawable' } });
  });
});

describe('effective grants follow the dates (access-and-approvals 7.2)', () => {
  it('PRD-ACS-005 the scheduled job rebuilds the grants when a start or end date passes', async () => {
    const user = await newUser('DATED');
    const roleId = await approvedRole([{ recordType: 'access.role', action: 'view' }]);
    await approvedAssignment(assignmentDraft(user.id, roleId, { validFrom: dateIn(1), validTo: dateIn(2) }));
    const grants = (days: number) => as(user.id, (c) => access.ownAccess(c, user.id), days);
    expect((await grants(0)).grants).toEqual([]);
    const [job] = accessJobKinds;
    if (job === undefined) throw new Error('no job kind');
    // Tomorrow the assignment is in force; the day after it has ended.
    await as(user.id, (c) => job.run(c, { logger: log.logger }), 1);
    expect((await grants(1)).grants).toEqual([{ recordType: 'access.role', action: 'view' }]);
    await as(user.id, (c) => job.run(c, { logger: log.logger }), 2);
    expect((await grants(2)).grants).toEqual([]);
  });

  it('POL-02.01 a new role version takes effect from its start and ends the one it follows', async () => {
    const user = await newUser('VERSIONED');
    const roleId = await approvedRole([{ recordType: 'access.role', action: 'view' }]);
    await approvedAssignment(assignmentDraft(user.id, roleId));
    const p = await preparer();
    const next = await as(admin.id, (c) =>
      access.prepareRoleVersion(c, p, roleId, {
        name: 'SYNTHETIC role, second version',
        validFrom: dateIn(1),
        permissions: [{ kind: 'action', recordType: 'access.user', action: 'view', selfService: false }],
      }),
    );
    if (next.kind !== 'success') throw new Error('version not prepared');
    await as(approver.id, (c) => access.approveRoleVersion(c, decider(), next.answer.versionId));
    expect((await authorise(user.id, 'view', 'access.role')).kind).toBe('allowed');
    expect((await authorise(user.id, 'view', 'access.role', 1)).kind).toBe('refused');
    expect((await authorise(user.id, 'view', 'access.user', 1)).kind).toBe('allowed');
  });
});

describe('restricted fields (access-and-approvals 6; the Restrict-fields hook for S1-F03)', () => {
  it('PRD-ACS-004 PRD-ACS-008 grants a field class only through the assignment Authorise used', async () => {
    const user = await newUser('FIELDS');
    const p = await preparer();
    const prepared = await as(admin.id, (c) =>
      access.prepareRole(c, p, {
        code: `SYN-COST-${String(randomInt(1_000_000))}`,
        name: 'SYNTHETIC cost reader',
        validFrom: dateIn(0),
        permissions: [
          { kind: 'action', recordType: 'access.role', action: 'view', selfService: false },
          { kind: 'field-class', fieldClass: 'cost', access: 'view', selfService: false },
        ],
      }),
    );
    if (prepared.kind !== 'success') throw new Error('not prepared');
    await as(approver.id, (c) => access.approveRoleVersion(c, decider(), prepared.answer.versionId));
    const assignmentId = await approvedAssignment(assignmentDraft(user.id, prepared.answer.roleId));
    expect(
      await as(user.id, (c) =>
        access.restrictFields(
          c,
          { roleAssignmentId: assignmentId, actorId: user.id, fieldClasses: ['cost', 'margin'] },
          'view',
        ),
      ),
    ).toEqual({ granted: ['cost'], masked: ['margin'] });
    expect(
      await as(user.id, (c) =>
        access.authorise(c, {
          actorId: user.id,
          action: 'view',
          recordType: 'access.role',
          fieldClasses: [{ fieldClass: 'cost', use: 'edit' }],
        }),
      ),
    ).toMatchObject({ kind: 'refused', refusal: { missing: [{ kind: 'field-class', fieldClass: 'cost' }] } });
  });
});

describe('the routes (access-and-approvals 7.1; code-house-rules 12.1; RR-261, RR-281)', () => {
  let api: AccessTestApp;
  let keys: Record<string, string>;

  beforeAll(async () => {
    keys = syntheticKeysEnvironment(world);
    // SYNTHETIC sign-in settings: sign-in is unavailable without them (code-house-rules 12.14).
    await writeSyntheticSetting(database, 'access.sign-in-throttling', { failureLimit: 50, windowSeconds: 600 });
    await writeSyntheticSetting(database, 'access.password-rules', { minimumLength: 12 });
    api = await startAccessApp(world, keys);
  });

  afterAll(async () => {
    await (api as AccessTestApp | undefined)?.close();
  });

  async function signedIn(label: string, personas: PersonaId[] = []): Promise<{ user: SyntheticUser; cookie: string }> {
    const user = await writeSyntheticUser(database, routed.organisationCode, keys, {
      label: `${label}${String(randomInt(1_000_000))}`,
      enrolled: true,
      personas,
    });
    const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.9' },
      body: JSON.stringify({
        organisationCode: routed.organisationCode,
        login: user.login,
        password: user.password,
        totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0)),
      }),
    });
    const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    return { user, cookie };
  }

  function post(path: string, body: unknown, cookie: string, key: string = uuidv7()) {
    return fetch(`${api.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, cookie, 'idempotency-key': key },
      body: JSON.stringify(body),
    });
  }

  const roleBody = (code: string) => ({
    code,
    name: 'SYNTHETIC role',
    permissions: [{ kind: 'action', recordType: 'access.role', action: 'view', selfService: false }],
    validFrom: dateIn(0),
  });

  it('PRD-INT-001 PRD-UXP-003 refuses an action route to a user no assignment authorises, naming the missing permission', async () => {
    const { cookie } = await signedIn('NOGRANT');
    const response = await post('/api/access/roles', roleBody('SYN-REFUSED'), cookie);
    expect(response.status).toBe(403);
    expect(errorEnvelopeSchema.parse(await response.json()).error).toMatchObject({
      kind: 'not-authorised',
      code: 'access.not-authorised',
      missing: [{ kind: 'permission', recordType: 'access.role', action: 'create' }],
    });
  });

  it('PRD-ACS-001 PRD-INT-002 prepares a role through the assignment that grants it, once per idempotency key', async () => {
    const { user, cookie } = await signedIn('PREPARER');
    const { assignmentId } = await grantSynthetic(database, { kind: 'user', id: user.id }, [
      { recordType: 'access.role', action: 'create' },
    ]);
    const key = uuidv7();
    const body = roleBody(`SYN-ROUTE-${String(randomInt(1_000_000))}`);
    const first = await post('/api/access/roles', body, cookie, key);
    expect(first.status).toBe(200);
    const answer = (await first.json()) as { roleId: string; versionId: string };
    const again = await post('/api/access/roles', body, cookie, key);
    expect(await again.json()).toEqual(answer);
    const recorded = await asOwner(
      async (c) =>
        (
          await c.query<{ role_assignment_id: string }>(
            `select role_assignment_id from audit.audit_record where record_id = $1`,
            [answer.roleId],
          )
        ).rows,
    );
    // The audit record names the assignment Authorise used (access-and-approvals 7.1 step 3).
    expect(recorded).toEqual([{ role_assignment_id: assignmentId }]);
  });

  it('RR-261 RR-281 the session read gives the personas held, in order, and the effective grants', async () => {
    const { user, cookie } = await signedIn('SHELL', ['P-AUD', 'P-ADM']);
    await grantSynthetic(database, { kind: 'user', id: user.id }, [
      { recordType: 'audit.audit_record', action: 'view' },
      { recordType: 'access.role', action: 'view' },
    ]);
    const response = await fetch(`${api.baseUrl}/api/access/session`, { headers: { cookie } });
    expect(await response.json()).toMatchObject({
      userId: user.id,
      personasHeld: ['P-AUD', 'P-ADM'],
      grants: [
        { recordType: 'access.role', action: 'view' },
        { recordType: 'audit.audit_record', action: 'view' },
      ],
    });
  });
});
