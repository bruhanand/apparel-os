import { uuidv7 } from '@apparel-os/domain';
import type { PermissionAction } from '@apparel-os/schemas';
import {
  CommandRunner,
  newCorrelationId,
  OrganisationRouter,
  type RoutedOrganisation,
  type TransactionContext,
} from '../../src/kernel/index.js';
import { Access, type DecisionOutcome } from '../../src/modules/access/index.js';
// The access module's own key reader, so the fresh-code check opens the synthetic factor secrets (11.2).
import { OrganisationKeys } from '../../src/modules/access/domain/organisation-keys.js';
import { Audit } from '../../src/modules/audit/index.js';
// The module's own class, composed here as the application composes it (code-house-rules 11.2).
import { FilesImports } from '../../src/modules/files-imports/files-imports.js';
import {
  masterKinds,
  type LocationInUse,
  Organisation,
  organisationApprovals,
  organisationScopeMembers,
  recordTypeOf,
  type Prepared,
  type PreparedVersion,
  type Preparer,
} from '../../src/modules/organisation/index.js';
import { syntheticCode, syntheticName } from '../fixtures/synthetic.js';
import { codeFor, syntheticTimezone, writeSyntheticReason, writeSyntheticUser, type SyntheticUser } from './access.js';
import { grantSynthetic } from './grants.js';
import { capturingLogger } from './jobs.js';
import { connect, databaseUrl } from './postgres.js';

// The organisation structure through its real interfaces (code-house-rules 11.2; S1-F02-T01): `access` built with the
// approval rules and decision effects `organisation` declares, as the application composes it, and two SYNTHETIC
// people, a preparer and a different approver, each with a role assignment over every organisation type. Decisions
// take a fresh authenticator code, so the clock of these commands moves 30 seconds before each (access-and-approvals
// 3.3). Every value here is SYNTHETIC.

export interface StructureSetup {
  readonly access: Access;
  readonly organisation: Organisation;
  readonly preparer: SyntheticUser;
  readonly approver: SyntheticUser;
  readonly asPreparer: Preparer;
  /** Runs a command as the actor, on this setup's clock. */
  run<T>(actorId: string, work: (context: TransactionContext) => Promise<T>): Promise<T>;
  /** Prepares as the preparer. */
  prepare(
    work: (context: TransactionContext, preparer: Preparer) => Promise<Prepared<PreparedVersion>>,
  ): Promise<Prepared<PreparedVersion>>;
  /**
   * Decides a request, as the approver unless another user is named, with the approve or reject reason in force.
   * `hold` runs in the decision's transaction after Decide, while its locks are held (code-house-rules 10.3).
   */
  decide(
    requestId: string,
    versionId: string,
    outcome?: 'approve' | 'reject',
    by?: SyntheticUser,
    hold?: (context: TransactionContext) => Promise<void>,
  ): Promise<DecisionOutcome>;
  /** Another enrolled approver, holding view and approve on every organisation type. */
  anotherApprover(label: string): Promise<SyntheticUser>;
  /** Today under the synthetic timezone (Etc/UTC), on this setup's clock. */
  today(): string;
  /** The day so many days from today, on this setup's clock. */
  day(daysFromToday: number): string;
  /** Moves this setup's clock on, as days pass. */
  advanceDays(days: number): void;
  close(): Promise<void>;
}

const PREPARE: readonly PermissionAction[] = ['view', 'create', 'edit'];
const DAY_MS = 86_400_000;

/**
 * A structure setup in one synthetic Organisation's database: the two people, their grants over every organisation
 * type (the approver's view and approve only, so the approver can never be a preparer), and an approve and a reject
 * reason in force.
 */
export async function structureSetup(options: {
  readonly directory: string;
  readonly database: string;
  readonly organisationCode: string;
  readonly keysEnvironment: Record<string, string>;
  readonly label: string;
  /** The location-in-use implementation, as the composition root hands it over; none answers when left out. */
  readonly locationInUse?: LocationInUse;
}): Promise<StructureSetup> {
  const log = capturingLogger();
  const router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(options.directory, 'runtime'), poolMax: 4 },
    log.logger,
  );
  const found = await router.resolveForSignIn(options.organisationCode);
  if (!found.routed) throw new Error(`${options.organisationCode} is not routed`);
  const routed: RoutedOrganisation = found.organisation;
  const audit = new Audit(log.logger);
  const modules = organisationApprovals(audit, options.locationInUse);
  const access = new Access({
    audit,
    keys: OrganisationKeys.fromEnvironment(options.keysEnvironment),
    approvalRules: modules.rules,
    documentEffects: modules.effects,
    scopeMembers: [organisationScopeMembers],
  });
  const organisation = new Organisation({
    audit,
    access,
    files: new FilesImports(audit),
    locationInUse: options.locationInUse,
  });
  const write = (label: string) =>
    writeSyntheticUser(options.database, options.organisationCode, options.keysEnvironment, { label, enrolled: true });
  const preparer = await write(`${options.label}-PREPARER`);
  const approver = await write(`${options.label}-APPROVER`);
  const types = masterKinds.map(recordTypeOf);
  const { assignmentId } = await grantSynthetic(
    options.database,
    { kind: 'user', id: preparer.id },
    types.flatMap((recordType) => PREPARE.map((action) => ({ recordType, action }))),
  );
  const grantApprove = (user: SyntheticUser) =>
    grantSynthetic(
      options.database,
      { kind: 'user', id: user.id },
      types.flatMap((recordType) => [
        { recordType, action: 'view' as const },
        { recordType, action: 'approve' as const },
      ]),
    );
  await grantApprove(approver);
  const approveReason = await writeSyntheticReason(options.database, 'approve');
  const rejectReason = await writeSyntheticReason(options.database, 'reject');
  let offsetMs = 0;
  const now = () => new Date(Date.now() + offsetMs);
  const runner = new CommandRunner({ clock: { now }, timezones: syntheticTimezone, logger: log.logger });
  const run = <T>(actorId: string, work: (context: TransactionContext) => Promise<T>) =>
    runner.run(
      {
        commandName: 'organisation.synthetic-test',
        organisation: routed,
        correlationId: newCorrelationId(),
        actor: { kind: 'actor', actorId },
      },
      work,
    );
  const asPreparer: Preparer = { userId: preparer.id, roleAssignmentId: assignmentId };
  return {
    access,
    organisation,
    preparer,
    approver,
    asPreparer,
    run,
    prepare: (work) => run(preparer.id, (context) => work(context, asPreparer)),
    decide: (requestId, versionId, outcome = 'approve', by = approver, hold) => {
      offsetMs += 30_000;
      if (by.factorSecret === undefined) throw new Error('not enrolled');
      const totpCode = codeFor(by.factorSecret, 0, now());
      return run(by.id, async (context) => {
        const decided = await access.decide(
          context,
          { kind: 'user', id: by.id },
          {
            requestId,
            versionId,
            outcome,
            reason: { kind: 'listed', reasonId: outcome === 'approve' ? approveReason : rejectReason },
            totpCode,
          },
        );
        await hold?.(context);
        return decided;
      });
    },
    anotherApprover: async (label) => {
      const user = await write(`${options.label}-${label}`);
      await grantApprove(user);
      return user;
    },
    today: () => now().toISOString().slice(0, 10),
    day: (daysFromToday) => new Date(now().getTime() + daysFromToday * DAY_MS).toISOString().slice(0, 10),
    advanceDays: (days) => {
      offsetMs += days * DAY_MS;
    },
    close: () => router.close(),
  };
}

/** The answer of a preparation that must succeed. */
export function prepared(outcome: Prepared<PreparedVersion>): PreparedVersion {
  if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
  return outcome.answer;
}

/** A decision that must succeed. */
export function decided(outcome: DecisionOutcome): void {
  if (outcome.kind !== 'success') throw new Error(`Decision refused: ${outcome.refusal.code}`);
}

/** Prepares and approves a change, answering the record. */
export async function approved(
  setup: StructureSetup,
  work: (context: TransactionContext, preparer: Preparer) => Promise<Prepared<PreparedVersion>>,
): Promise<PreparedVersion> {
  const answer = prepared(await setup.prepare(work));
  decided(await setup.decide(answer.requestId, answer.versionId));
  return answer;
}

/** An approved SYNTHETIC Country, State, City and Area from today, each under the one before (3.6). */
export async function approvedGeography(setup: StructureSetup, label: string) {
  const validFrom = setup.today();
  const country = await approved(setup, (c, p) =>
    setup.organisation.prepareCountry(c, p, {
      code: syntheticCode(`${label}-IN`),
      name: syntheticName(`${label} Country`),
      validFrom,
    }),
  );
  const state = await approved(setup, (c, p) =>
    setup.organisation.prepareState(c, p, {
      countryId: country.recordId,
      code: syntheticCode(`${label}-ST`),
      name: syntheticName(`${label} State`),
      validFrom,
    }),
  );
  const city = await approved(setup, (c, p) =>
    setup.organisation.prepareCity(c, p, {
      stateId: state.recordId,
      code: syntheticCode(`${label}-CT`),
      name: syntheticName(`${label} City`),
      validFrom,
    }),
  );
  const area = await approved(setup, (c, p) =>
    setup.organisation.prepareArea(c, p, {
      cityId: city.recordId,
      code: syntheticCode(`${label}-AR`),
      name: syntheticName(`${label} Area`),
      validFrom,
    }),
  );
  return { country, state, city, area };
}

/**
 * SYNTHETIC Sites with the identifiers a test names, each Approved from 2000-01-01 with no end, in an area of a
 * SYNTHETIC geography: written as the migration role, as a fixture (code-house-rules 11.2), for a test that needs a Site
 * to exist without walking the structure's approvals (structure-and-masters 3.1).
 */
export async function writeSyntheticSites(database: string, siteIds: readonly string[]): Promise<void> {
  const client = await connect(database, 'migration');
  const id = () => uuidv7();
  const label = syntheticCode(`GEO-${id().slice(-8).toUpperCase()}`);
  const preparer = id();
  try {
    const [country, state, city, area] = [id(), id(), id(), id()];
    await client.query('insert into organisation.country (id, code) values ($1, $2)', [country, label]);
    await client.query('insert into organisation.state (id, country_id, code) values ($1, $2, $3)', [
      state,
      country,
      label,
    ]);
    await client.query('insert into organisation.city (id, state_id, code) values ($1, $2, $3)', [city, state, label]);
    await client.query('insert into organisation.area (id, city_id, code) values ($1, $2, $3)', [area, city, label]);
    for (const siteId of siteIds) {
      await client.query('insert into organisation.site (id, code) values ($1, $2)', [
        siteId,
        syntheticCode(`SITE-${siteId.slice(-8).toUpperCase()}`),
      ]);
      await client.query(
        `insert into organisation.site_version (id, site_id, name, physical_kind, area_id, addresses, status,
           valid_during, decision, prepared_by_user_id)
         values ($1, $2, $3, 'retail-site', $4, $5, 'Active', '[2000-01-01,)', 'Approved', $6)`,
        [id(), siteId, syntheticName(`Site ${siteId.slice(-8)}`), area, [syntheticName('Address')], preparer],
      );
    }
  } finally {
    await client.end();
  }
}
