import { randomBytes } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import { routes, setupRequestSchema } from '@apparel-os/schemas';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CommandRunner,
  IdempotencyHelper,
  OrganisationRouter,
  registerInDirectory,
  restrictedValueCipherNotConfigured,
  secretCheckNotImplemented,
  Worker,
  type JobKindDefinition,
  type JobRegistry,
} from '../src/kernel/index.js';
import { runAddServiceIdentities, runSetupStep, type ServiceIdentityGrant } from '../src/modules/access/index.js';
// The access module's JobIdentities, as AccessJobIdentitiesModule provides it to the worker (RR-273).
import { jobIdentities } from '../src/modules/access/commands/job-identities.js';
import { exceptionsConsumers, exceptionsJobKinds } from '../src/modules/exceptions/index.js';
import { serviceIdentitiesOf } from '../src/setup-organisation.js';
import { jobRegistry } from '../src/worker.module.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { syntheticWorkerSettings } from './fixtures/worker-settings.js';
import { syntheticTimezone } from './support/access.js';
import { capturingLogger } from './support/jobs.js';
import { connect, createTestDatabase, databaseUrl, dropDatabase } from './support/postgres.js';

// RR-331: an existing Organisation gains the service identities the worker's registry now needs and it lacks
// (access-and-approvals 2.3, 9.11a; PRD-SEC-018, PRD-ACS-023; code-house-rules 4.3, 5.1), on real PostgreSQL. An
// Organisation is set up with an older registry, one without the exceptions job and consumer of S1-F08-T02, as the
// synthetic Organisations on `dev` were. Every value is SYNTHETIC; none is a default.

let directory: string;
const created: string[] = [];
const log = capturingLogger();

beforeAll(async () => {
  directory = await createTestDatabase('directory', 'addsi_dir');
});

afterAll(async () => {
  for (const name of created.splice(0)) await dropDatabase(name);
  if ((directory as string | undefined) !== undefined) await dropDatabase(directory);
});

/** The registry as it stood before S1-F08-T02 added the exceptions job and consumer. */
const olderRegistry: JobRegistry = {
  events: jobRegistry.events,
  consumers: jobRegistry.consumers.filter((each) => !exceptionsConsumers.includes(each)),
  jobKinds: jobRegistry.jobKinds.filter((each) => !exceptionsJobKinds.includes(each)),
};

const escalateOverdue: JobKindDefinition = (() => {
  const found = exceptionsJobKinds.find((each) => each.name === 'exceptions.escalate-overdue');
  if (found === undefined) throw new Error('The registry has no exceptions.escalate-overdue');
  return found;
})();

/** Sets up a fresh SYNTHETIC Organisation with the service identities given, as the setup step writes them. */
async function setUp(serviceIdentities: readonly ServiceIdentityGrant[]): Promise<{ code: string; database: string }> {
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  const database = `syn_addsi_${suffix.toLowerCase()}`;
  created.push(database);
  const code = syntheticCode(`ORG-ADDSI-${suffix}`);
  const outcome = await runSetupStep({
    migrationConnectionString: databaseUrl(directory, 'migration'),
    runtimeConnectionString: databaseUrl(directory, 'runtime'),
    request: setupRequestSchema.parse({
      organisationCode: code,
      databaseName: database,
      firstAdmin: {
        login: syntheticCode('ADMIN').toLowerCase(),
        displayName: syntheticName('Admin'),
        personas: ['P-ADM'],
        temporaryPassword: 'SYNTHETIC-admin-temporary-1',
      },
      firstApprover: {
        login: syntheticCode('APPROVER').toLowerCase(),
        displayName: syntheticName('Approver'),
        personas: ['P-OWN'],
        temporaryPassword: 'SYNTHETIC-approver-temporary-1',
      },
      settings: {
        origin: 'synthetic',
        timezone: 'Asia/Kolkata',
        passwordRules: { minimumLength: 12 },
        signInThrottling: { failureLimit: 5, windowSeconds: 600 },
        officeSessionLimits: { idleLockSeconds: 1800, absoluteSeconds: 28_800 },
      },
    }),
    serviceIdentities,
    logger: log.logger,
  });
  expect(outcome.outcome).toBe('created');
  return { code, database };
}

function add(organisationCode: string, serviceIdentities = serviceIdentitiesOf(jobRegistry)) {
  return runAddServiceIdentities({
    runtimeConnectionString: databaseUrl(directory, 'runtime'),
    organisationCode,
    serviceIdentities,
    logger: log.logger,
  });
}

async function rows<T extends object>(database: string, text: string, values: unknown[] = []): Promise<T[]> {
  const client = await connect(database, 'migration');
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

/** Each service identity with what its Approved assignments grant, as `recordType action`, sorted. */
async function identities(database: string): Promise<{ code: string; permissions: string | null }[]> {
  return rows(
    database,
    `select s.code, (select string_agg(p.record_type || ' ' || p.action, ',' order by p.record_type, p.action)
                     from access.role_assignment a join access.role_version v on v.role_id = a.role_id
                     join access.role_permission p on p.role_version_id = v.id
                     where a.service_identity_id = s.id and a.decision = 'Approved') as permissions
     from access.service_identity s order by s.code`,
  );
}

/** Every row count the command writes, to show a refused or unchanged run writes nothing. */
async function footprint(database: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of [
    'access.service_identity',
    'access.service_identity_version',
    'access.role',
    'access.role_assignment',
    'access.effective_grant',
    'audit.audit_record',
    'audit.access_record',
  ]) {
    const [row] = await rows<{ count: string }>(database, `select count(*)::text as count from ${table}`);
    counts[table] = Number(row?.count);
  }
  return counts;
}

/** A worker over the test directory that runs the escalation of overdue exceptions, as `dev`'s does. */
async function runEscalation(organisationCode: string) {
  const router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(directory, 'runtime'), poolMax: 4 },
    log.logger,
  );
  const runner = new CommandRunner({
    clock: { now: () => new Date() },
    timezones: syntheticTimezone,
    logger: log.logger,
  });
  const registry: JobRegistry = { events: jobRegistry.events, consumers: [], jobKinds: [escalateOverdue] };
  const worker = new Worker({
    router,
    runner,
    helper: new IdempotencyHelper({
      runner,
      logger: log.logger,
      secretCheck: secretCheckNotImplemented,
      cipher: restrictedValueCipherNotConfigured,
    }),
    identities: jobIdentities(),
    logger: log.logger,
    registry,
    settings: syntheticWorkerSettings(registry, { fast: true }),
  });
  try {
    await worker.open();
    return await worker.runJobKind(organisationCode, escalateOverdue, uuidv7());
  } finally {
    await worker.stop();
    await router.close();
  }
}

describe('an Organisation set up with an older registry (RR-331; access-and-approvals 9.11a)', () => {
  let organisation: { code: string; database: string };

  beforeAll(async () => {
    organisation = await setUp(serviceIdentitiesOf(olderRegistry));
  });

  it('RR-331 the worker refuses the escalation of overdue exceptions until the identity is added', async () => {
    expect(await runEscalation(organisation.code)).toEqual({
      status: 'deadletter',
      output: { outcome: 'identity-not-enabled', serviceIdentity: 'exceptions' },
    });
  });

  it('PRD-SEC-018 RR-331 adds the missing identity with exactly what its steps declare; the worker then runs the step', async () => {
    const before = await identities(organisation.database);
    expect(before.map((each) => each.code)).not.toContain('exceptions');

    expect(await add(organisation.code)).toEqual({
      outcome: 'added',
      organisationCode: organisation.code,
      added: ['exceptions'],
    });
    expect(await identities(organisation.database)).toEqual(
      [...before, { code: 'exceptions', permissions: 'exceptions.exception create,exceptions.exception edit' }].sort(
        (a, b) => a.code.localeCompare(b.code),
      ),
    );
    expect(await runEscalation(organisation.code)).toEqual({
      status: 'completed',
      output: { outcome: 'done', replayed: false },
    });
  });

  it('PRD-SEC-007 audits the identity, its role and its assignment under the setup identity, with a permission-change record', async () => {
    const [setup] = await rows<{ id: string }>(
      organisation.database,
      "select id from access.service_identity where code = 'setup'",
    );
    const audited = await rows<{ record_type: string; actor_kind: string; actor_id: string; source_kind: string }>(
      organisation.database,
      `select record_type, actor_kind, actor_id, source_kind from audit.audit_record
       where operation = 'add-service-identities' order by record_type`,
    );
    expect(audited).toEqual(
      ['role', 'role_assignment', 'service_identity'].map((recordType) => ({
        record_type: recordType,
        actor_kind: 'service-identity',
        actor_id: setup?.id,
        source_kind: 'operator-command',
      })),
    );
    const access = await rows<{ kind: string; outcome: string }>(
      organisation.database,
      `select a.kind, a.outcome from audit.access_record a join audit.audit_record r on r.id = a.audit_record_id
       where r.operation = 'add-service-identities'`,
    );
    expect(access).toEqual([{ kind: 'permission-changed', outcome: 'succeeded' }]);
  });

  it('RR-331 run again it changes nothing and says so', async () => {
    const before = await footprint(organisation.database);
    expect(await add(organisation.code)).toEqual({ outcome: 'unchanged', organisationCode: organisation.code });
    expect(await footprint(organisation.database)).toEqual(before);
  });

  it('RR-331 two runs at once add the identity once', async () => {
    const other = await setUp(serviceIdentitiesOf(olderRegistry));
    const outcomes = await Promise.all([add(other.code), add(other.code)]);
    expect(outcomes.map((each) => each.outcome).sort()).toEqual(['added', 'unchanged']);
    const exceptions = (await identities(other.database)).filter((each) => each.code === 'exceptions');
    expect(exceptions).toHaveLength(1);
  });
});

describe('refusals (RR-331; access-and-approvals 9.11a)', () => {
  it('there is no API route to the command (code-house-rules 4.3; CH-1)', () => {
    const paths = Object.values(routes).map((route) => route.path);
    expect(paths.filter((path) => /service-identit/i.test(path))).toEqual([]);
  });

  it('refuses an Organisation the directory does not list; nothing is written', async () => {
    expect(await add(syntheticCode('ORG-ADDSI-UNKNOWN'))).toEqual({
      outcome: 'refused',
      organisationCode: syntheticCode('ORG-ADDSI-UNKNOWN'),
      reason: 'organisation-not-found',
    });
  });

  it('refuses an Organisation whose setup is not finished; nothing is written', async () => {
    const database = await createTestDatabase('organisation', 'addsi_unfinished');
    created.push(database);
    const code = syntheticCode(`ORG-ADDSI-UNFINISHED-${randomBytes(2).toString('hex').toUpperCase()}`);
    const owner = await connect(directory, 'migration');
    try {
      await registerInDirectory(drizzle({ client: owner }), { organisationCode: code, databaseName: database });
    } finally {
      await owner.end();
    }
    const before = await footprint(database);
    expect(await add(code)).toEqual({ outcome: 'refused', organisationCode: code, reason: 'organisation-not-ready' });
    expect(await footprint(database)).toEqual(before);
  });

  it('never changes an existing identity: one whose grants differ is refused and named; nothing is written', async () => {
    // SYNTHETIC: `exceptions` set up holding create only, and `inbox` missing, as no real registry stood.
    const narrower = serviceIdentitiesOf(olderRegistry).concat({
      code: 'exceptions',
      authorities: [{ action: 'create', recordType: 'exceptions.exception' }],
    });
    const organisation = await setUp(narrower.filter((each) => each.code !== 'inbox'));
    const before = await footprint(organisation.database);
    expect(await add(organisation.code)).toEqual({
      outcome: 'refused',
      organisationCode: organisation.code,
      reason: 'grants-differ',
      differing: [
        {
          code: 'exceptions',
          holds: ['exceptions.exception create'],
          needs: ['exceptions.exception create', 'exceptions.exception edit'],
        },
      ],
    });
    expect(await footprint(organisation.database)).toEqual(before);
  });

  it('refuses an identity list the permission registry cannot grant, or one that names `setup`', async () => {
    const organisation = await setUp(serviceIdentitiesOf(olderRegistry));
    const before = await footprint(organisation.database);
    expect(
      await add(organisation.code, [
        { code: 'synthetic-undeclared', authorities: [{ action: 'approve', recordType: 'kernel.outbox_event' }] },
      ]),
    ).toEqual({
      outcome: 'refused',
      organisationCode: organisation.code,
      reason: 'not-declared',
      identities: ['synthetic-undeclared'],
    });
    expect(await add(organisation.code, [{ code: 'setup', authorities: [] }])).toEqual({
      outcome: 'refused',
      organisationCode: organisation.code,
      reason: 'not-declared',
      identities: ['setup'],
    });
    expect(await footprint(organisation.database)).toEqual(before);
  });
});
