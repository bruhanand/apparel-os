import { buffer } from 'node:stream/consumers';
import { CommandRunner } from '../command-runner/command-runner.js';
import { newCorrelationId } from '../command-runner/correlation.js';
import type { TransactionContext } from '../command-runner/transaction-context.js';
import { createDb } from '../db/create-db.js';
import type { JobIdentities } from '../jobs/contracts.js';
import type { StructuredLogger } from '../logging/pino-logger.service.js';
import { systemClock, type Clock } from '../time/clock.js';
import type { OrganisationTimezoneSource } from '../time/organisation-timezone.js';
import {
  DRILL_RECORD_FORMAT,
  measuredTimes,
  type DrillOrganisation,
  type DrillReconciliation,
  type DrillRecord,
  type DrillValidation,
} from './drill-record.js';
import { recoveryEventsOf, recoveryHoldOf, recoveryItemsOf } from './recovery.js';
import { RESTORE_IDENTITY } from './restore-contract.js';
import { keepDrillRecord, type RestoreBackupStore } from './restore.js';

// The drill record brought up to date after the restore (backup-and-restore section 6; S1-F14-T03): each series
// reconciled with its skip and reason, the validations and the reopening with their times, and the measured recovery
// time once every restored Organisation has reopened. Read from the restored databases as the runtime role, under the
// restore's internal service identity, and kept as the next version beside the backup; no version is overwritten.

/** What the modules above `kernel` hold of a restore: the validations (`configuration`) and series (`numbering`). */
export interface OrganisationRecoveryFacts {
  readonly validations: readonly DrillValidation[];
  readonly seriesReconciled: readonly DrillReconciliation[];
  readonly seriesToReconcile: number;
}

export interface DrillRecordRefreshOptions {
  readonly restoreId: string;
  readonly backupStore: RestoreBackupStore;
  /** A database on the target's server as the runtime role, by name. Never logged. */
  readonly runtimeConnectionString: (databaseName: string) => string;
  readonly identities: JobIdentities;
  readonly timezones: OrganisationTimezoneSource;
  readonly logger: StructuredLogger;
  readonly organisationFacts: (context: TransactionContext, restoreId: string) => Promise<OrganisationRecoveryFacts>;
  readonly clock?: Clock;
}

export type DrillRecordRefreshOutcome =
  | {
      readonly outcome: 'written';
      readonly json: string;
      readonly text: string;
      readonly result: DrillRecord['result'];
    }
  | { readonly outcome: 'refused'; readonly reason: string };

/** Writes the next version of a restore's drill record from the restored databases. */
export async function refreshDrillRecord(options: DrillRecordRefreshOptions): Promise<DrillRecordRefreshOutcome> {
  const clock = options.clock ?? systemClock;
  const marker = `/restores/${options.restoreId}/drill-record-`;
  const versions = (await options.backupStore.list('backups/'))
    .filter((name) => name.includes(marker) && name.endsWith('.json'))
    .map((name) => ({ name, version: Number(name.slice(name.lastIndexOf('-') + 1, -'.json'.length)) }))
    .filter((each) => Number.isSafeInteger(each.version))
    .sort((a, b) => b.version - a.version);
  const latest = versions[0];
  if (latest === undefined) {
    return { outcome: 'refused', reason: `No drill record of restore ${options.restoreId} is in the backup store` };
  }
  const previous = JSON.parse(
    (await buffer(await options.backupStore.get(latest.name))).toString('utf8'),
  ) as DrillRecord;
  if ((previous.format as string) !== DRILL_RECORD_FORMAT) {
    return { outcome: 'refused', reason: 'The drill record is of a format this code does not read' };
  }
  const organisations: DrillOrganisation[] = [];
  for (const organisation of previous.organisations) {
    organisations.push(await refreshed(options, clock, organisation));
  }
  const base = {
    ...previous,
    version: previous.version + 1,
    writtenAt: clock.now().toISOString(),
    organisations,
  };
  const reopened = organisations.every((organisation) => organisation.reopened !== null);
  const record: DrillRecord = {
    ...base,
    result:
      previous.result === 'failed'
        ? 'failed'
        : reopened
          ? 'reopened'
          : organisations.some((organisation) =>
                organisation.recoveryItems.some((item) => item.kind === 'failure' && item.settlement === null),
              )
            ? 'held-with-failed-checks'
            : 'held',
    measured: measuredTimes(base),
  };
  const backupId = previous.backup.backupId;
  const names = await keepDrillRecord(options.backupStore, record, backupId);
  return { outcome: 'written', ...names, result: record.result };
}

async function refreshed(
  options: DrillRecordRefreshOptions,
  clock: Clock,
  organisation: DrillOrganisation,
): Promise<DrillOrganisation> {
  const handle = createDb(options.runtimeConnectionString(organisation.databaseTo), { max: 1 });
  try {
    const runner = new CommandRunner({ clock, timezones: options.timezones, logger: options.logger });
    const routed = {
      organisationCode: organisation.organisationCode,
      organisationId: organisation.organisationId,
      databaseName: organisation.databaseTo,
      db: handle.db,
    };
    const actorId = await runner.read(
      {
        commandName: 'kernel.authenticate-restore',
        organisation: routed,
        correlationId: newCorrelationId(),
        actor: { kind: 'no-actor', path: 'authenticate' },
      },
      (context) => options.identities.authenticate(context, RESTORE_IDENTITY),
    );
    if (actorId === undefined) return organisation;
    return await runner.read(
      {
        commandName: 'kernel.read-drill-record',
        organisation: routed,
        correlationId: newCorrelationId(),
        actor: { kind: 'actor', actorId },
      },
      async (context) => {
        const events = await recoveryEventsOf(context, options.restoreId);
        const lifted = events.find((event) => event.kind === 'hold-lifted');
        const hold = await recoveryHoldOf(context);
        const facts = await options.organisationFacts(context, options.restoreId);
        const rechecks = events
          .filter((event) => (event.kind === 'check' || event.kind === 'step') && (event.checkRun ?? 1) > 1)
          .map((event) => ({
            unit: event.unit ?? '',
            check: event.name ?? '',
            passed: event.passed === true,
            checked: event.checked ?? 0,
            failed: event.failed ?? 0,
            ...(event.subject === null ? {} : { subject: event.subject }),
            run: event.checkRun ?? 1,
          }));
        const items = await recoveryItemsOf(context, options.restoreId);
        return {
          ...organisation,
          checks: [...organisation.checks.filter((check) => (check.run ?? 1) === 1), ...rechecks],
          recoveryItems: items.map((item) => ({
            eventId: item.eventId,
            kind: item.kind,
            unit: item.unit,
            name: item.name,
            subject: item.subject,
            exceptionId: item.exceptionId,
            settlement: item.settlement,
          })),
          seriesToReconcile: facts.seriesToReconcile,
          seriesReconciled: facts.seriesReconciled,
          validations: facts.validations,
          reopened:
            lifted === undefined ? null : { at: lifted.occurredAt.toISOString(), byUserId: lifted.actorId ?? '' },
          held: hold?.restoreId === options.restoreId,
        };
      },
    );
  } finally {
    await handle.close();
  }
}
