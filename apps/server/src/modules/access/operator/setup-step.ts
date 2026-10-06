import { uuidv7 } from '@apparel-os/domain';
import {
  permissionRegistry,
  registryByCode,
  type RecordTypeDeclaration,
  type SetupOutcome,
  type SetupRequest,
} from '@apparel-os/schemas';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import {
  CommandRunner,
  CommandTimedOut,
  connectionToDatabase,
  createDb,
  findDirectoryEntries,
  migrateDatabase,
  migrationSetFolder,
  newCorrelationId,
  registerInDirectory,
  sqlStateOf,
  systemClock,
  type Clock,
  type StructuredLogger,
} from '../../../kernel/index.js';
import { Audit } from '../../audit/index.js';
import { configurationTimezoneSource } from '../../configuration/index.js';
import { writeSetup, type ServiceIdentityGrant } from '../commands/setup.js';
import { SETUP_IDENTITY } from '../domain/first-roles.js';
import { hashPassword, verifyPassword } from '../domain/password-hash.js';
import { SETUP_FINGERPRINT_VERSION, setupFingerprint } from '../domain/setup-fingerprint.js';
import { meetsPasswordRules } from '../domain/sign-in-rules.js';

/** What the setup step needs (access-and-approvals 9.11; code-house-rules 4.3, 5.1; CH-1). */
export interface SetupStepOptions {
  /** The directory database as the migration role, which creates, migrates and registers (AOS_MIGRATION_DATABASE_URL). */
  readonly migrationConnectionString: string;
  /** The directory database as the runtime role, pointed at the new database for the transaction (AOS_RUNTIME_DATABASE_URL). */
  readonly runtimeConnectionString: string;
  readonly request: SetupRequest;
  /** The internal service identities the worker runs as, each with what its steps declare (RR-271, RR-290). */
  readonly serviceIdentities: readonly ServiceIdentityGrant[];
  /** The service log. Never given a secret, a connection string or a refused rerun's Organisation code. */
  readonly logger: StructuredLogger;
  readonly clock?: Clock;
  /** The permission registry; the declared one unless a test gives another. */
  readonly registry?: readonly RecordTypeDeclaration[];
}

/**
 * The request cannot be set up as given, before anything is read or written: a temporary password the password rules
 * refuse, or a service identity list the step cannot write. Its message names no value supplied (PRD-SEC-014).
 */
export class SetupRequestRefused extends Error {}

/** How many times a run reads the state again after losing a race to another run (9.11 "Two runs at once"). */
const MAX_ATTEMPTS = 4;
const CONTEXT = 'Setup';

/** The SQLSTATEs of losing a race to another run: the database, a unique or exclusive row, or a lock (9.11; CH-3). */
const RACE_STATES = new Set(['42P04', '23505', '23P01', '55P03']);

type OrganisationState =
  | { readonly kind: 'absent' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'user-without-record' }
  | {
      readonly kind: 'record';
      readonly fingerprint: string;
      readonly version: string;
      readonly hashes: readonly (string | undefined)[];
    };

/** Which row of the state table (9.11) refused a rerun, for the one service-log line that keeps it. */
type RefusedBy =
  | 'finished'
  | 'database-of-another-organisation'
  | 'fingerprint-version'
  | 'conflicting-request'
  | 'user-without-setup-record';

class Refused extends Error {
  constructor(
    readonly reason: 'duplicate' | 'conflict' | 'fingerprint-version',
    readonly refusedBy: RefusedBy,
  ) {
    super(reason);
  }
}

/**
 * The setup step of a new Organisation (access-and-approvals 9.11; PRD-ACS-023, DEC-101, DEC-112; CH-1): an operator
 * command, never an API route. It reads the directory first, then the Organisation's database, and the two give the
 * state of the 9.11 table:
 *
 * - the directory lists the code: refused as a duplicate before anything else is read, no password checked;
 * - the directory lists the database name under another code: refused as a conflict, so the step never writes into
 *   another Organisation's database (DEC-093);
 * - no database, or one with no setup record and no user: it creates the database if missing (as the migration
 *   role, which owns it), migrates it, writes the one transaction as the runtime role under the `setup` identity,
 *   then registers the code: created;
 * - a setup record and an identical request (the same fingerprint, and each temporary password verifying against the
 *   Argon2 credential the first run wrote for that login): it migrates the database, writes nothing else in it, and
 *   registers the code: completed;
 * - a setup record of another canonical-form version: refused as a change of version, fingerprints never compared;
 * - a setup record and any other request, or a user and no setup record: refused as a conflict, nothing written.
 *
 * A run that loses a race to another (the database created first, a unique row or the directory entry written first,
 * a lock limit reached) reads the state again from the start, and never takes a failure or a timeout as success. A
 * refusal says nothing of which user or field differs, and keeps one service-log line: the refused request's
 * fingerprint, its canonical-form version and which row refused it, never the code or a secret (PRD-INT-002,
 * PRD-SEC-014; code-house-rules 12.11).
 */
export async function runSetupStep(options: SetupStepOptions): Promise<SetupOutcome> {
  const { request } = options;
  const registry = registryByCode(options.registry ?? permissionRegistry);
  checkRequest(options, registry);
  const migrationTo = connectionToDatabase(options.migrationConnectionString);
  const runtimeTo = connectionToDatabase(options.runtimeConnectionString);
  if (migrationTo === undefined || runtimeTo === undefined) {
    throw new SetupRequestRefused(
      'The connection strings must have the form postgres://<user>:<password>@<host>:<port>/<database>',
    );
  }
  const fingerprint = setupFingerprint(request);
  for (let attempt = 1; ; attempt += 1) {
    try {
      const outcome = await attemptOnce(options, registry, fingerprint, migrationTo, runtimeTo);
      options.logger.structured(
        'info',
        { fingerprint, canonicalFormVersion: SETUP_FINGERPRINT_VERSION, outcome: outcome.outcome },
        `The setup step ${outcome.outcome} the Organisation`,
        CONTEXT,
      );
      return outcome;
    } catch (error) {
      if (error instanceof Refused) {
        options.logger.structured(
          'warn',
          { fingerprint, canonicalFormVersion: SETUP_FINGERPRINT_VERSION, refusedBy: error.refusedBy },
          'The setup step refused a rerun; nothing was written',
          CONTEXT,
        );
        return { outcome: 'refused', reason: error.reason, organisationCode: request.organisationCode };
      }
      const lostRace = error instanceof CommandTimedOut || RACE_STATES.has(sqlStateOf(error) ?? '');
      if (!lostRace || attempt >= MAX_ATTEMPTS) throw error;
      options.logger.structured(
        'info',
        { fingerprint, attempt, sqlState: sqlStateOf(error) },
        'The setup step met another run; reading the state again',
        CONTEXT,
      );
    }
  }
}

/** Checks the request before anything is read: the password rules (3.2; GC3-5) and the identities to write. */
function checkRequest(options: SetupStepOptions, registry: ReadonlyMap<string, RecordTypeDeclaration>): void {
  const { request } = options;
  for (const [who, user] of [
    ['first Admin', request.firstAdmin],
    ['first approver', request.firstApprover],
  ] as const) {
    if (!meetsPasswordRules(request.settings.passwordRules, user.temporaryPassword)) {
      throw new SetupRequestRefused(`The ${who}'s temporary password does not meet the password rules of the request`);
    }
  }
  const codes = options.serviceIdentities.map((identity) => identity.code);
  if (codes.includes(SETUP_IDENTITY) || new Set(codes).size !== codes.length) {
    throw new SetupRequestRefused('Each service identity is written once, and `setup` only by the step itself');
  }
  for (const identity of options.serviceIdentities) {
    for (const authority of identity.authorities) {
      if (registry.get(authority.recordType)?.actions.includes(authority.action) !== true) {
        throw new SetupRequestRefused(
          `Service identity ${identity.code} declares ${authority.action} on ${authority.recordType}, which the permission registry does not declare`,
        );
      }
    }
  }
}

async function attemptOnce(
  options: SetupStepOptions,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
  fingerprint: string,
  migrationTo: (database: string) => string,
  runtimeTo: (database: string) => string,
): Promise<SetupOutcome> {
  const { request } = options;
  const code = request.organisationCode;
  const database = request.databaseName;

  const listed = await withClient(options.migrationConnectionString, (client) =>
    findDirectoryEntries(drizzle({ client }), { organisationCode: code, databaseName: database }),
  );
  if (listed.some((entry) => entry.organisationCode === code)) throw new Refused('duplicate', 'finished');
  if (listed.length > 0) throw new Refused('conflict', 'database-of-another-organisation');

  const state = await readState(migrationTo(database), [request.firstAdmin.login, request.firstApprover.login]);
  if (state.kind === 'user-without-record') throw new Refused('conflict', 'user-without-setup-record');
  if (state.kind === 'record') {
    if (state.version !== SETUP_FINGERPRINT_VERSION) throw new Refused('fingerprint-version', 'fingerprint-version');
    if (state.fingerprint !== fingerprint) throw new Refused('conflict', 'conflicting-request');
    const [adminHash, approverHash] = state.hashes;
    // Both passwords are checked before the step answers, so the answer does not say which one differs.
    const adminVerifies =
      adminHash !== undefined && (await verifyPassword(adminHash, request.firstAdmin.temporaryPassword));
    const approverVerifies =
      approverHash !== undefined && (await verifyPassword(approverHash, request.firstApprover.temporaryPassword));
    if (!adminVerifies || !approverVerifies) throw new Refused('conflict', 'conflicting-request');
    await migrate(migrationTo(database));
    await register(options.migrationConnectionString, code, database);
    return { outcome: 'completed', organisationCode: code };
  }

  if (state.kind === 'absent') {
    await withClient(options.migrationConnectionString, async (client) => {
      // Made by aos_migration, which so owns it (code-house-rules 5.1). Losing the race is 42P04: read again.
      await client.query(`create database ${client.escapeIdentifier(database)}`);
    });
  }
  await migrate(migrationTo(database));
  // Slow work before the transaction (code-house-rules 8.1): the Argon2id hashes of the two temporary passwords.
  const [adminHash, approverHash] = await Promise.all([
    hashPassword(request.firstAdmin.temporaryPassword),
    hashPassword(request.firstApprover.temporaryPassword),
  ]);
  const handle = createDb(runtimeTo(database), { max: 1 });
  try {
    const runner = new CommandRunner({
      clock: options.clock ?? systemClock,
      timezones: configurationTimezoneSource,
      logger: options.logger,
    });
    const setupIdentityId = uuidv7();
    await runner.run(
      {
        commandName: 'access.set-up-organisation',
        organisation: { organisationCode: code, databaseName: database, db: handle.db },
        correlationId: newCorrelationId(),
        actor: { kind: 'actor', actorId: setupIdentityId },
      },
      (context) =>
        writeSetup(context, new Audit(options.logger), registry, {
          organisationCode: code,
          fingerprint,
          canonicalFormVersion: SETUP_FINGERPRINT_VERSION,
          setupIdentityId,
          firstAdmin: { ...userOf(request.firstAdmin), passwordHash: adminHash },
          firstApprover: { ...userOf(request.firstApprover), passwordHash: approverHash },
          settings: request.settings,
          serviceIdentities: options.serviceIdentities,
        }),
    );
  } finally {
    await handle.close();
  }
  await register(options.migrationConnectionString, code, database);
  return { outcome: 'created', organisationCode: code };
}

function userOf(user: SetupRequest['firstAdmin']) {
  return { login: user.login, displayName: user.displayName, personas: user.personas };
}

/**
 * The Organisation database's state, read as the migration role, its owner, before anything is migrated or written,
 * so a conflicting database is left as it was: absent; empty (no setup record and no user, migrated or not); a user
 * but no setup record; or the setup record with the current credential hash of each login (3.2, 13.1).
 */
async function readState(connectionString: string, logins: readonly string[]): Promise<OrganisationState> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
  } catch (error) {
    if (sqlStateOf(error) === '3D000') return { kind: 'absent' };
    throw error;
  }
  try {
    const tables = await client.query<{ users: boolean; records: boolean }>(
      `select pg_catalog.to_regclass('access.app_user') is not null as users,
              pg_catalog.to_regclass('access.setup_record') is not null as records`,
    );
    const present = tables.rows[0];
    if (present?.records === true) {
      const record = await client.query<{ fingerprint: string; canonical_form_version: string }>(
        'select fingerprint, canonical_form_version from access.setup_record',
      );
      const row = record.rows[0];
      if (row !== undefined) {
        const hashes: (string | undefined)[] = [];
        for (const login of logins) {
          const found = await client.query<{ password_hash: string }>(
            `select c.password_hash from access.password_credential c join access.app_user u on u.id = c.app_user_id
             where pg_catalog.lower(u.login) = pg_catalog.lower($1) and c.replaced_at is null`,
            [login],
          );
          hashes.push(found.rows[0]?.password_hash);
        }
        return { kind: 'record', fingerprint: row.fingerprint, version: row.canonical_form_version, hashes };
      }
    }
    if (present?.users === true) {
      const users = await client.query('select 1 from access.app_user limit 1');
      if (users.rowCount !== 0) return { kind: 'user-without-record' };
    }
    return { kind: 'empty' };
  } finally {
    await client.end();
  }
}

async function migrate(connectionString: string): Promise<void> {
  await migrateDatabase({ connectionString, folder: migrationSetFolder('organisation') });
}

async function register(directory: string, organisationCode: string, databaseName: string): Promise<void> {
  await withClient(directory, (client) => registerInDirectory(drizzle({ client }), { organisationCode, databaseName }));
}

async function withClient<T>(connectionString: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}
