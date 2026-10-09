import { permissionRegistry, registryByCode, type RecordTypeDeclaration } from '@apparel-os/schemas';
import { drizzle } from 'drizzle-orm/node-postgres';
import { inArray } from 'drizzle-orm';
import { Client } from 'pg';
import {
  CommandRunner,
  CommandTimedOut,
  connectionToDatabase,
  createDb,
  findDatabaseName,
  newCorrelationId,
  sqlStateOf,
  systemClock,
  type Clock,
  type StructuredLogger,
  type TransactionContext,
} from '../../../kernel/index.js';
import { Audit, type AuditInterface } from '../../audit/index.js';
import { configurationTimezoneSource } from '../../configuration/index.js';
import {
  writeHolders,
  writeInternalIdentity,
  type Holder,
  type RecordAudit,
  type ServiceIdentityGrant,
} from '../commands/setup.js';
import { serviceIdentity, setupRecord } from '../db/schema.js';
import { SETUP_IDENTITY } from '../domain/first-roles.js';
import { assignmentsInForce } from '../queries/assignments.js';
import { authenticateInternalIdentity, serviceIdentityActiveOn } from '../queries/service-identities.js';

/** What the command needs (access-and-approvals 9.11a; RR-331). */
export interface AddServiceIdentitiesOptions {
  /** The directory database as the runtime role (AOS_RUNTIME_DATABASE_URL), pointed at the Organisation's database. */
  readonly runtimeConnectionString: string;
  readonly organisationCode: string;
  /** The internal service identities the worker's registry needs now, each with what its steps declare (RR-290). */
  readonly serviceIdentities: readonly ServiceIdentityGrant[];
  /** The service log. Never given a secret or a connection string. */
  readonly logger: StructuredLogger;
  readonly clock?: Clock;
  /** The permission registry; the declared one unless a test gives another. */
  readonly registry?: readonly RecordTypeDeclaration[];
}

/** An existing identity the registry needs, whose grants in force today are not exactly what its steps declare. */
export interface DifferingIdentity {
  readonly code: string;
  /** What its assignments in force today grant, as `recordType action`, sorted; empty when it is not Active today. */
  readonly holds: readonly string[];
  /** What the registry's steps declare for it, the same way. */
  readonly needs: readonly string[];
  /** Present, and false, when the identity is not Active today. */
  readonly active?: false;
}

export type AddServiceIdentitiesOutcome =
  | { readonly outcome: 'added'; readonly organisationCode: string; readonly added: readonly string[] }
  | { readonly outcome: 'unchanged'; readonly organisationCode: string }
  | {
      readonly outcome: 'refused';
      readonly organisationCode: string;
      readonly reason: 'organisation-not-found' | 'organisation-not-ready';
    }
  | {
      readonly outcome: 'refused';
      readonly organisationCode: string;
      readonly reason: 'grants-differ';
      readonly differing: readonly DifferingIdentity[];
    }
  | {
      readonly outcome: 'refused';
      readonly organisationCode: string;
      readonly reason: 'not-declared';
      readonly identities: readonly string[];
    };

type Refusal = Extract<AddServiceIdentitiesOutcome, { outcome: 'refused' }>;
/** A refusal without its Organisation code, which the command adds. */
type WithoutCode<T> = T extends unknown ? Omit<T, 'organisationCode'> : never;
type RefusalBody = WithoutCode<Refusal>;

class Refused extends Error {
  constructor(readonly refusal: Refusal) {
    super(refusal.reason);
  }
}

const CONTEXT = 'AddServiceIdentities';
/** How many times a run reads the state again after losing a race to another run (9.11a "Two runs at once"). */
const MAX_ATTEMPTS = 4;
/** The SQLSTATEs of losing a race to another run: a unique row written first, or a lock limit (CH-3). */
const RACE_STATES = new Set(['23505', '23P01', '55P03']);

/**
 * Gives one existing Organisation every internal service identity the worker's registry needs and it lacks
 * (access-and-approvals 2.3, 9.11a; PRD-SEC-018; RR-331; product owner, 9 Oct 2026): an operator command like the
 * setup step, never an API route. Each new identity is written as the setup step writes it: Approved and Active from
 * today, with a role holding exactly the actions its steps declare and one all-members assignment, an audit record of
 * each naming the `setup` identity as actor, and a permission-change access record for the assignment, in one
 * transaction as the runtime role under the `setup` identity, so row-level security and the guards apply.
 *
 * It never changes an identity that exists: if one the registry needs holds other grants today, or is not Active, the
 * whole run is refused, naming each such identity, and nothing is written. A run with nothing to add is `unchanged`
 * and writes nothing. It refuses a code the directory does not list, and an Organisation whose setup is not finished
 * (no `setup` identity in force, no timezone or no setup record). Two runs at once: the loser of the unique code reads
 * the state again, and answers `unchanged`.
 */
export async function runAddServiceIdentities(
  options: AddServiceIdentitiesOptions,
): Promise<AddServiceIdentitiesOutcome> {
  const registry = registryByCode(options.registry ?? permissionRegistry);
  for (let attempt = 1; ; attempt += 1) {
    try {
      const outcome = await attemptOnce(options, registry);
      options.logger.structured(
        'info',
        {
          organisationCode: options.organisationCode,
          outcome: outcome.outcome,
          ...(outcome.outcome === 'added' ? { added: [...outcome.added] } : {}),
        },
        outcome.outcome === 'added'
          ? 'The command added the service identities the worker needs'
          : 'The Organisation already has every service identity the worker needs; nothing was written',
        CONTEXT,
      );
      return outcome;
    } catch (error) {
      if (error instanceof Refused) {
        options.logger.structured(
          'warn',
          { organisationCode: options.organisationCode, reason: error.refusal.reason },
          'The command was refused; nothing was written',
          CONTEXT,
        );
        return error.refusal;
      }
      const lostRace = error instanceof CommandTimedOut || RACE_STATES.has(sqlStateOf(error) ?? '');
      if (!lostRace || attempt >= MAX_ATTEMPTS) throw error;
      options.logger.structured(
        'info',
        { organisationCode: options.organisationCode, attempt, sqlState: sqlStateOf(error) },
        'The command met another run; reading the state again',
        CONTEXT,
      );
    }
  }
}

/** The identities the step cannot write: `setup`, a code given twice, or a permission the registry does not declare. */
function undeclared(
  identities: readonly ServiceIdentityGrant[],
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
): string[] {
  const seen = new Set<string>();
  const refused = new Set<string>();
  for (const identity of identities) {
    if (identity.code === SETUP_IDENTITY || seen.has(identity.code)) refused.add(identity.code);
    seen.add(identity.code);
    for (const authority of identity.authorities) {
      if (registry.get(authority.recordType)?.actions.includes(authority.action) !== true) refused.add(identity.code);
    }
  }
  return [...refused];
}

async function attemptOnce(
  options: AddServiceIdentitiesOptions,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
): Promise<AddServiceIdentitiesOutcome> {
  const organisationCode = options.organisationCode;
  const refuse = (refusal: RefusalBody): never => {
    throw new Refused({ ...refusal, organisationCode });
  };
  const notDeclared = undeclared(options.serviceIdentities, registry);
  if (notDeclared.length > 0) refuse({ outcome: 'refused', reason: 'not-declared', identities: notDeclared });
  const connectionTo = connectionToDatabase(options.runtimeConnectionString);
  if (connectionTo === undefined) {
    throw new Error('The connection string must have the form postgres://<user>:<password>@<host>:<port>/<database>');
  }
  const directory = new Client({ connectionString: options.runtimeConnectionString });
  await directory.connect();
  let databaseName: string | undefined;
  try {
    databaseName = await findDatabaseName(drizzle({ client: directory }), organisationCode);
  } finally {
    await directory.end();
  }
  if (databaseName === undefined) return refuse({ outcome: 'refused', reason: 'organisation-not-found' });

  const handle = createDb(connectionTo(databaseName), { max: 1 });
  try {
    const runner = new CommandRunner({
      clock: options.clock ?? systemClock,
      timezones: configurationTimezoneSource,
      logger: options.logger,
    });
    const organisation = { organisationCode, databaseName, db: handle.db };
    // Authenticate the `setup` identity first, on the no-actor path of the setup step (code-house-rules 6.3).
    const setup = await runner.read(
      {
        commandName: 'access.authenticate-setup-identity',
        organisation,
        correlationId: newCorrelationId(),
        actor: { kind: 'no-actor', path: 'setup' },
      },
      (context) => authenticateInternalIdentity(context, SETUP_IDENTITY),
    );
    if (setup === undefined) return refuse({ outcome: 'refused', reason: 'organisation-not-ready' });
    return await runner.run(
      {
        commandName: 'access.add-service-identities',
        organisation,
        correlationId: newCorrelationId(),
        actor: { kind: 'actor', actorId: setup.serviceIdentityId },
      },
      (context) => addIn(context, new Audit(options.logger), registry, setup.serviceIdentityId, options, refuse),
    );
  } finally {
    await handle.close();
  }
}

/** What a list of authorities reads as, `recordType action`, sorted and without repeats. */
function asText(authorities: readonly { readonly recordType: string; readonly action: string }[]): string[] {
  return [...new Set(authorities.map((each) => `${each.recordType} ${each.action}`))].sort();
}

async function addIn(
  context: TransactionContext,
  audit: AuditInterface,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
  setupIdentityId: string,
  options: AddServiceIdentitiesOptions,
  refuse: (refusal: RefusalBody) => never,
): Promise<AddServiceIdentitiesOutcome> {
  const today = await context.businessDate();
  if (today.kind === 'not-set') return refuse({ outcome: 'refused', reason: 'organisation-not-ready' });
  if ((await authenticateInternalIdentity(context, SETUP_IDENTITY)) === undefined) {
    return refuse({ outcome: 'refused', reason: 'organisation-not-ready' });
  }
  const [finished] = await context.tx.select({ id: setupRecord.id }).from(setupRecord);
  if (finished === undefined) return refuse({ outcome: 'refused', reason: 'organisation-not-ready' });

  const codes = options.serviceIdentities.map((each) => each.code);
  const existing =
    codes.length === 0
      ? []
      : await context.tx
          .select({ id: serviceIdentity.id, code: serviceIdentity.code })
          .from(serviceIdentity)
          .where(inArray(serviceIdentity.code, codes));
  const differing: DifferingIdentity[] = [];
  for (const identity of options.serviceIdentities) {
    const found = existing.find((each) => each.code === identity.code);
    if (found === undefined) continue;
    const needs = asText(identity.authorities);
    if (!(await serviceIdentityActiveOn(context, found.id, today.date))) {
      differing.push({ code: identity.code, holds: [], needs, active: false });
      continue;
    }
    const held = (await assignmentsInForce(context, today.date, found.id)).flatMap((assignment) =>
      assignment.permissions.map((permission) =>
        permission.kind === 'action'
          ? { recordType: permission.recordType, action: permission.action }
          : { recordType: permission.kind, action: JSON.stringify(permission) },
      ),
    );
    const holds = asText(held);
    if (holds.join('\n') !== needs.join('\n')) differing.push({ code: identity.code, holds, needs });
  }
  if (differing.length > 0) return refuse({ outcome: 'refused', reason: 'grants-differ', differing });

  const missing = options.serviceIdentities.filter((identity) => !existing.some((each) => each.code === identity.code));
  if (missing.length === 0) return { outcome: 'unchanged', organisationCode: options.organisationCode };

  const record: RecordAudit = async (entry) =>
    audit.record(context, {
      actor: { kind: 'service-identity', id: setupIdentityId },
      ...entry,
      operation: 'add-service-identities',
      source: { kind: 'operator-command' },
    });
  const holders: Holder[] = [];
  for (const identity of missing) {
    holders.push(await writeInternalIdentity(context, record, identity, `[${today.date},)`));
  }
  await writeHolders(context, audit, record, registry, holders, today.date);
  return { outcome: 'added', organisationCode: options.organisationCode, added: missing.map((each) => each.code) };
}
