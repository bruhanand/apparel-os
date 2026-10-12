import type { DeploymentEnvironmentName } from '../environment/deployment-environment.js';

// The restore drill record (backup-and-restore section 6; POL-18.03, PRD-SEC-012, PRD-SEC-014; S1-F14-T03). Every
// restore, drill or real, writes one: who conducted it and why, the backup and its recovery point, each step with its
// start and end time, each check with its result and counts, each recovery gap and how it was settled, each series
// reconciled with its skip and reason, the key versions used and that each came from its kept copy, the validations
// and the reopening with their times, and the measured times. It holds no record data, no restricted value and no
// secret: identifiers, counts, names of checks, times, and the words people typed for the purpose and the reasons.
//
// The restore command writes its first version, as a structured file and a readable text, beside the backup in the
// backup store (`backups/<backup id>/restores/<restore id>/drill-record-<n>.json` and `.txt`), and prints where. Each
// later run of the command with `--drill-record <restore id>`, after a reconciliation, a validation or the reopening,
// writes the next version from the restored databases; the backup store never overwrites an object (8.4).

export const DRILL_RECORD_FORMAT = 'drill-record/1';

/** Why the restore was run (section 6): a drill, or a real restore with its cause and when the failure was declared. */
export type DrillPurpose =
  | { readonly kind: 'drill'; readonly note: string }
  | { readonly kind: 'real'; readonly cause: string; readonly declaredAt: string };

/** One step of 4.2 with its start and end time. */
export interface DrillStep {
  readonly step: string;
  /** The Organisation the step was for, or null for one of the whole restore. */
  readonly organisationCode: string | null;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly outcome: 'done' | 'failed';
}

/** A key version the restore used, by identifier, and that it came from the custodian's kept copy (2.3, 2.4). */
export interface DrillKeyVersion {
  readonly purpose: 'backup' | 'organisation-data';
  readonly organisationCode: string | null;
  readonly identifier: string;
  readonly fromKeptCopy: boolean;
  readonly matchedIdentifier: boolean;
}

export interface DrillCheck {
  readonly unit: string;
  readonly check: string;
  readonly passed: boolean;
  readonly checked: number;
  readonly failed: number;
  readonly subject?: string;
}

export interface DrillGap {
  readonly unit: string;
  readonly name: string;
  readonly subject: string;
  readonly subjectAt: string | null;
  /** Stored after the recovery point, or at an unknown time: work the restore may have lost (4.5). */
  readonly afterRecoveryPoint: boolean;
}

export interface DrillReconciliation {
  readonly seriesId: string;
  readonly restoredHighest: number;
  readonly evidenceHighest: number | null;
  /** The numbers skipped, `from` to `to` inclusive; null when none was. */
  readonly skipped: { readonly from: number; readonly to: number } | null;
  readonly reason: string;
  readonly reconciledAt: string;
}

export interface DrillValidation {
  readonly validates: 'operations' | 'accounts';
  readonly compared: readonly string[];
  readonly byUserId: string;
  readonly at: string;
}

export interface DrillOrganisation {
  readonly organisationCode: string;
  readonly organisationId: string;
  readonly recoveryPoint: string;
  /** The database the backup was taken from, and the one the target directory now names (4.2 step 4). */
  readonly databaseFrom: string;
  readonly databaseTo: string;
  readonly checks: readonly DrillCheck[];
  readonly gaps: readonly DrillGap[];
  /** How the gaps were settled, once reopened: the reopening confirms it (4.3, 4.5). */
  readonly gapsSettled: string | null;
  readonly seriesToReconcile: number;
  readonly seriesReconciled: readonly DrillReconciliation[];
  readonly validations: readonly DrillValidation[];
  readonly reopened: { readonly at: string; readonly byUserId: string } | null;
  readonly held: boolean;
}

export interface DrillRecord {
  readonly format: typeof DRILL_RECORD_FORMAT;
  readonly version: number;
  readonly writtenAt: string;
  readonly restoreId: string;
  readonly environment: DeploymentEnvironmentName;
  readonly purpose: DrillPurpose;
  readonly conductedBy: string;
  readonly restoreStartedAt: string;
  readonly backup: {
    readonly backupId: string;
    readonly takenAt: string;
    readonly codeCommit: string | null;
    readonly backupKeyVersion: string;
  };
  readonly steps: readonly DrillStep[];
  readonly keyVersions: readonly DrillKeyVersion[];
  readonly organisations: readonly DrillOrganisation[];
  /** Every check passed and every restored Organisation is held, or reopened; or a check failed and it stays held. */
  readonly result: 'held' | 'held-with-failed-checks' | 'reopened' | 'failed';
  /**
   * Recovery time: from the start of the restore, or for a real failure from when it was declared, to the last
   * reopening; data lost: from the earliest recovery point to when the failure was declared (section 6). Measured,
   * never promised, on the test setup; null while not known.
   */
  readonly measured: { readonly recoveryTimeSeconds: number | null; readonly dataLostSeconds: number | null };
}

/** Where a version of a drill record is kept beside its backup. */
export function drillRecordNames(backupId: string, restoreId: string, version: number): { json: string; text: string } {
  const base = `backups/${backupId}/restores/${restoreId}/drill-record-${String(version)}`;
  return { json: `${base}.json`, text: `${base}.txt` };
}

/** The measured times (section 6), from what the record holds. */
export function measuredTimes(record: Omit<DrillRecord, 'measured' | 'result'>): DrillRecord['measured'] {
  const reopenings = record.organisations.map((organisation) => organisation.reopened);
  const allReopened = reopenings.length > 0 && reopenings.every((reopened) => reopened !== null);
  const start = record.purpose.kind === 'real' ? record.purpose.declaredAt : record.restoreStartedAt;
  const lastReopening = allReopened ? Math.max(...reopenings.map((reopened) => Date.parse(reopened.at))) : undefined;
  const earliestPoint = Math.min(...record.organisations.map((organisation) => Date.parse(organisation.recoveryPoint)));
  return {
    recoveryTimeSeconds: lastReopening === undefined ? null : Math.round((lastReopening - Date.parse(start)) / 1000),
    dataLostSeconds:
      record.purpose.kind === 'real' && Number.isFinite(earliestPoint)
        ? Math.round((Date.parse(record.purpose.declaredAt) - earliestPoint) / 1000)
        : null,
  };
}

/** The readable text of a drill record, for the person who conducted it. */
export function drillRecordText(record: DrillRecord): string {
  const lines: string[] = [];
  const add = (line = ''): void => {
    lines.push(line);
  };
  add(`Restore drill record, version ${String(record.version)}, written ${record.writtenAt}`);
  add(`Restore ${record.restoreId} in environment ${record.environment}`);
  add(
    record.purpose.kind === 'drill'
      ? `Purpose: a drill. ${record.purpose.note}`
      : `Purpose: a real restore. Cause: ${record.purpose.cause}. Failure declared at ${record.purpose.declaredAt}`,
  );
  add(`Conducted by: ${record.conductedBy}`);
  add(`Started: ${record.restoreStartedAt}`);
  add(
    `Backup: ${record.backup.backupId}, taken ${record.backup.takenAt}, code ${record.backup.codeCommit ?? 'not named'}`,
  );
  add(`Result: ${record.result}`);
  add(
    `Recovery time: ${record.measured.recoveryTimeSeconds === null ? 'not known yet' : `${String(record.measured.recoveryTimeSeconds)} s`}; data lost: ${record.measured.dataLostSeconds === null ? 'not measured (a drill)' : `${String(record.measured.dataLostSeconds)} s`}`,
  );
  add();
  add('Key versions used');
  for (const key of record.keyVersions) {
    add(
      `  ${key.purpose}${key.organisationCode === null ? '' : ` of ${key.organisationCode}`}: ${key.identifier}, from the kept copy: ${key.fromKeptCopy ? 'yes' : 'NO'}, matched its identifier: ${key.matchedIdentifier ? 'yes' : 'NO'}`,
    );
  }
  add();
  add('Steps');
  for (const step of record.steps) {
    add(
      `  ${step.startedAt} to ${step.endedAt}  ${step.outcome === 'done' ? 'done  ' : 'FAILED'}  ${step.step}${step.organisationCode === null ? '' : ` (${step.organisationCode})`}`,
    );
  }
  for (const organisation of record.organisations) {
    add();
    add(`Organisation ${organisation.organisationCode} (${organisation.organisationId})`);
    add(`  Recovery point: ${organisation.recoveryPoint}`);
    add(`  Database: ${organisation.databaseFrom} in the backup, ${organisation.databaseTo} in the target`);
    add(`  ${organisation.held ? 'Held' : 'Reopened'}`);
    add('  Checks');
    for (const check of organisation.checks) {
      add(
        `    ${check.passed ? 'passed' : 'FAILED'}  ${check.unit}: ${check.check}${check.subject === undefined ? '' : ` [${check.subject}]`} (${String(check.checked)} checked, ${String(check.failed)} failed)`,
      );
    }
    add(`  Recovery gaps: ${organisation.gaps.length === 0 ? 'none' : ''}`);
    for (const gap of organisation.gaps) {
      add(
        `    ${gap.unit}: ${gap.name} ${gap.subject}, stored ${gap.subjectAt ?? 'at a time not known'}${gap.afterRecoveryPoint ? ', after the recovery point' : ''}`,
      );
    }
    if (organisation.gapsSettled !== null) add(`    Settled: ${organisation.gapsSettled}`);
    add(
      `  Series reconciled: ${String(organisation.seriesReconciled.length)} of ${String(organisation.seriesToReconcile + organisation.seriesReconciled.length)}`,
    );
    for (const series of organisation.seriesReconciled) {
      add(
        `    ${series.seriesId} at ${series.reconciledAt}: restored highest ${String(series.restoredHighest)}, evidence ${series.evidenceHighest === null ? 'none issued' : String(series.evidenceHighest)}, skipped ${series.skipped === null ? 'nothing' : `${String(series.skipped.from)} to ${String(series.skipped.to)}`}; reason: ${series.reason}`,
      );
    }
    add('  Validations');
    for (const validation of organisation.validations) {
      add(
        `    ${validation.validates} by ${validation.byUserId} at ${validation.at}: compared ${validation.compared.join(', ')}`,
      );
    }
    add(
      `  Reopened: ${organisation.reopened === null ? 'not yet' : `${organisation.reopened.at} by ${organisation.reopened.byUserId}`}`,
    );
  }
  add();
  return lines.join('\n');
}
