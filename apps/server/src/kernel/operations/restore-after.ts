import { newCorrelationId } from '../command-runner/correlation.js';
import type { TransactionContext } from '../command-runner/transaction-context.js';
import { systemClock, type Clock } from '../time/clock.js';
import { asOwner, OperatorRefused, withConnection } from './operator-connection.js';
import { recoveryEventsOf, recoveryHoldOf, recoveryItemsOf } from './recovery.js';
import type { RaisableItem, RestoreRaiseStep, RestoreRun } from './restore-contract.js';
import {
  inSnapshot,
  inTierOrder,
  readSignedManifest,
  recordLast,
  recordResults,
  restoredObjects,
  withRestoredRun,
  type RestoreBackupStore,
  type RestoreFileStore,
  type RestoreKeys,
  type RestoreParticipation,
  type RestoreTargetDatabases,
  runChecks,
  type ResultEntry,
  type RestoredRun,
} from './restore.js';

// What the restore command does after a restore, while the Organisations it restored are held (backup-and-restore
// 4.3, 4.5, 5.1; product owner, 12 Oct 2026; POL-18.03, POL-18.04):
//
// - `restore --recheck <restore id>`: runs the checks of every Organisation the restore holds again, as the restore
//   ran them, after a failed check's cause was put right, such as an object put back into the file store. Its results
//   are a new check run; a failed check of an earlier run no longer blocks reopening when the latest run passes it.
//   The control totals are not compared again: the restore's own steps have written to the database since (5.2).
// - `restore --raise-gaps <restore id>`: once the exception-code series is reconciled, raises each recovery item, a
//   gap after the recovery point or a failure still standing, as an exception, through the participant that raises
//   them (`exceptions`), under the restore's internal service identity. One exception per item, never two: a second
//   run raises only what the first did not.
//
// Each is refused, with nothing written, when no Organisation is held by that restore.

export interface AfterRestoreOptions extends RestoreTargetDatabases, RestoreParticipation {
  readonly restoreId: string;
  readonly log: (message: string) => void;
  readonly clock?: Clock;
}

export interface RecheckOptions extends AfterRestoreOptions, RestoreKeys {
  readonly backupStore: RestoreBackupStore;
  readonly fileStore: RestoreFileStore;
}

export type AfterRestoreOutcome =
  | {
      readonly outcome: 'rechecked' | 'raised';
      readonly restoreId: string;
      readonly organisations: readonly {
        readonly organisationCode: string;
        /** Rechecked: the checks that failed in this run. Raised: the items raised now. */
        readonly count: number;
        /** Raised: why an item could not be raised, as refusal codes; empty when every one was. */
        readonly refusals: readonly string[];
      }[];
    }
  | { readonly outcome: 'refused'; readonly reason: string };

/** One Organisation the restore holds, as the target's directory names it. */
interface HeldOrganisation {
  readonly organisationCode: string;
  readonly organisationId: string;
  readonly databaseName: string;
  readonly backupId: string;
  readonly recoveryPoint: Date;
  readonly checkRun: number;
}

function refused(reason: string): AfterRestoreOutcome {
  return { outcome: 'refused', reason: `Refused, nothing written: ${reason}` };
}

/** Every Organisation of the target that the restore restored and still holds, with its latest check run. */
async function heldBy(options: AfterRestoreOptions): Promise<HeldOrganisation[]> {
  const entries = await asOwner(
    options.directoryConnectionString,
    'Refused',
    async (client) =>
      (
        await client.query<{ id: string; organisation_code: string; database_name: string }>(
          'select id::text as id, organisation_code, database_name from kernel.directory_entry order by organisation_code collate "C"',
        )
      ).rows,
  );
  const held: HeldOrganisation[] = [];
  for (const entry of entries) {
    const found = await withConnection(options.organisationConnectionString(entry.database_name), async (client) => {
      const hold = await client.query<{ restore_id: string }>('select restore_id::text from kernel.recovery_hold');
      if (hold.rows[0]?.restore_id !== options.restoreId) return undefined;
      const facts = await client.query<{ backup_id: string; recovery_point: Date; run: number | null }>(
        `select backup_id::text, recovery_point,
                (select max(check_run) from kernel.recovery_event where restore_id = $1) as run
           from kernel.recovery_event where restore_id = $1 and kind = 'restored'`,
        [options.restoreId],
      );
      return facts.rows[0];
    });
    if (found === undefined) continue;
    held.push({
      organisationCode: entry.organisation_code,
      organisationId: entry.id,
      databaseName: entry.database_name,
      backupId: found.backup_id,
      recoveryPoint: new Date(found.recovery_point),
      checkRun: found.run ?? 1,
    });
  }
  return held;
}

/**
 * Runs the checks of every Organisation the restore holds again (5.1; product owner, 12 Oct 2026): the backup's
 * signature and manifest are read again with the keys given, for the seal the chain must end at; the results are
 * recorded as the next check run, and `audit`'s step records each as an audit record.
 */
export async function recheckRestore(options: RecheckOptions): Promise<AfterRestoreOutcome> {
  const clock = options.clock ?? systemClock;
  let held: HeldOrganisation[];
  try {
    held = await heldBy(options);
  } catch (error) {
    if (error instanceof OperatorRefused) return refused(error.message);
    throw error;
  }
  if (held.length === 0) return refused(`no Organisation of this target is held by restore ${options.restoreId}`);
  const answered = [];
  for (const organisation of held) {
    let manifest;
    try {
      manifest = await readSignedManifest(options.backupStore, options, organisation.backupId);
    } catch (error) {
      if (error instanceof OperatorRefused) return refused(error.message);
      throw error;
    }
    const part = manifest.organisations.find((each) => each.organisationCode === organisation.organisationCode);
    if (part === undefined) return refused(`the backup holds no Organisation ${organisation.organisationCode}`);
    const checkRun = organisation.checkRun + 1;
    const migration = options.organisationConnectionString(organisation.databaseName);
    const failed = await withRestoredRun(options, options, organisation, clock, async (restored) => {
      const run: RestoreRun = {
        restoreId: options.restoreId,
        backupId: organisation.backupId,
        organisationId: organisation.organisationId,
        organisationCode: organisation.organisationCode,
        recoveryPoint: organisation.recoveryPoint,
        objects: restoredObjects(options.fileStore),
        recorded: [],
      };
      const checked = await inSnapshot(migration, organisation.organisationCode, (context) =>
        runChecks(context, options.registry, options.steps, run, part.latestSeal),
      );
      // The gaps were listed by the restore; a run of the checks again lists none.
      const results: ResultEntry[] = checked.results.map((result) => ({ kind: 'check', result }));
      const recorded = await recordResults(migration, options.restoreId, results, [], clock.now(), checkRun);
      await recordLast(restored, options, migration, { ...run, recorded }, results, clock, checkRun);
      return results.filter((entry) => !entry.result.passed).length;
    });
    options.log(
      `Restore ${options.restoreId}, ${organisation.organisationCode}: check run ${String(checkRun)}, ${String(failed)} failed`,
    );
    answered.push({ organisationCode: organisation.organisationCode, count: failed, refusals: [] });
  }
  return { outcome: 'rechecked', restoreId: options.restoreId, organisations: answered };
}

/**
 * Raises each recovery item of every Organisation the restore holds as an exception (4.5; product owner, 12 Oct
 * 2026), once each, in a command of its own under the restore's internal service identity: refused for an item while
 * the exception-code series is paused, naming it, so the series is reconciled first.
 */
export async function raiseRecoveryGaps(options: AfterRestoreOptions): Promise<AfterRestoreOutcome> {
  const clock = options.clock ?? systemClock;
  const raisers = inTierOrder(options.steps).filter((step): step is RestoreRaiseStep => step.kind === 'raise');
  const [raiser] = raisers;
  if (raiser === undefined || raisers.length !== 1) {
    throw new Error('Exactly one restore participant raises recovery items as exceptions');
  }
  let held: HeldOrganisation[];
  try {
    held = await heldBy(options);
  } catch (error) {
    if (error instanceof OperatorRefused) return refused(error.message);
    throw error;
  }
  if (held.length === 0) return refused(`no Organisation of this target is held by restore ${options.restoreId}`);
  const answered = [];
  for (const organisation of held) {
    const outcome = await withRestoredRun(options, options, organisation, clock, async (restored) => {
      const items = await restored.runner.read(readRequest(restored, 'kernel.read-recovery-items'), (context) =>
        itemsToRaise(context, options.restoreId),
      );
      let raised = 0;
      const refusals = new Set<string>();
      for (const item of items) {
        const answer = await raiseOne(restored, options, raiser, item);
        if (answer === 'raised') raised += 1;
        else refusals.add(answer);
      }
      return { raised, refusals: [...refusals].sort() };
    });
    options.log(
      `Restore ${options.restoreId}, ${organisation.organisationCode}: ${String(outcome.raised)} recovery item(s) raised as exceptions${outcome.refusals.length === 0 ? '' : `; refused: ${outcome.refusals.join(', ')}`}`,
    );
    answered.push({
      organisationCode: organisation.organisationCode,
      count: outcome.raised,
      refusals: outcome.refusals,
    });
  }
  return { outcome: 'raised', restoreId: options.restoreId, organisations: answered };
}

function readRequest(restored: RestoredRun, commandName: string) {
  if (restored.actorId === undefined) throw new OperatorRefused("the restore's service identity is not enabled");
  return {
    commandName,
    organisation: restored.organisation,
    correlationId: newCorrelationId(),
    actor: { kind: 'actor', actorId: restored.actorId } as const,
  };
}

/** The recovery items not yet raised, while the Organisation is held by this restore. */
async function itemsToRaise(context: TransactionContext, restoreId: string): Promise<RaisableItem[]> {
  const hold = await recoveryHoldOf(context);
  if (hold?.restoreId !== restoreId) return [];
  const events = new Map((await recoveryEventsOf(context, restoreId)).map((event) => [event.id, event]));
  return (await recoveryItemsOf(context, restoreId))
    .filter((item) => item.exceptionId === null)
    .map((item) => ({
      restoreId,
      eventId: item.eventId,
      kind: item.kind,
      unit: item.unit,
      name: item.name,
      subject: item.subject,
      subjectAt: events.get(item.eventId)?.subjectAt ?? null,
    }));
}

/** Raises one item in a command of its own under the restore's identity, which must hold what the step declares. */
async function raiseOne(
  restored: RestoredRun,
  options: AfterRestoreOptions,
  raiser: RestoreRaiseStep,
  item: RaisableItem,
): Promise<string> {
  const actorId = restored.actorId;
  if (actorId === undefined) return 'kernel.restore-identity-not-enabled';
  return restored.runner.run(
    {
      commandName: raiser.commandName,
      organisation: restored.organisation,
      correlationId: newCorrelationId(),
      actor: { kind: 'actor', actorId },
    },
    async (context) => {
      const held = await options.identities.hold(context, actorId, raiser.authorises);
      if (held.kind !== 'held') return 'access.not-authorised';
      const answer = await raiser.run(context, item);
      return answer.kind === 'raised' ? 'raised' : answer.refusal.code;
    },
  );
}
