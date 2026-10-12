import type { RecoveryStatus } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { readQuery } from '../api/query';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { ListRead, Th, Toolbar, useGranted } from '../setup/parts';
import { useTimeZone } from '../shell/session';

/**
 * The operations view's recovery status (backup-and-restore 4.2 step 8, 4.3, 4.5, 5.3; module-map 4.1; PRD-SEC-013;
 * S1-F14-T03): whether the Organisation is held after a restore, and of its latest restore the backup and recovery
 * point, every check with its result, the gaps found, the series waiting to be reconciled, the validations recorded,
 * and what still blocks reopening. Shown only to whoever holds view on `kernel.recovery_event`; who that is, is
 * KDPS's (V-01). Counts, names, identifiers and times only. A restore is run by the operator command, never here; the
 * recovery commands are API routes for now.
 */
export function RecoveryStatusSection() {
  const granted = useGranted('kernel.recovery_event', 'view');
  if (!granted) return null;
  return <RecoveryStatusRead />;
}

function RecoveryStatusRead() {
  const timeZone = useTimeZone();
  const query = useQuery(readQuery(api, 'readRecoveryStatus', {}));
  return (
    <section className="flex flex-col gap-3" aria-labelledby="recovery-status-title">
      <Toolbar>
        <h2 id="recovery-status-title" className="m-0 flex-1 text-h2 font-semibold">
          {t('operations.recovery')}
        </h2>
        <Button
          label="setup.refresh"
          onClick={() => {
            void query.refetch();
          }}
        />
      </Toolbar>
      <ListRead query={query} what="operations.recovery.what">
        {(status) => (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <AsOf asOf={status.asOf} timeZone={timeZone} />
            </div>
            {status.restore === null ? (
              <EmptyState title="operations.recovery.empty.title" body="operations.recovery.empty.body" />
            ) : (
              <Restore status={status} restore={status.restore} timeZone={timeZone} />
            )}
          </div>
        )}
      </ListRead>
    </section>
  );
}

function Restore({
  status,
  restore,
  timeZone,
}: {
  status: RecoveryStatus;
  restore: NonNullable<RecoveryStatus['restore']>;
  timeZone: string;
}) {
  const failed = restore.checks.filter((check) => !check.passed);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge state={status.held ? 'held' : 'live'} />
        <p className="m-0 text-body">
          {t('operations.recovery.summary', {
            point: formatDateTime(restore.recoveryPoint, timeZone),
            at: formatDateTime(restore.restoredAt, timeZone),
          })}
        </p>
      </div>
      {restore.reopenedAt !== null && (
        <p className="m-0 text-body">
          {t('operations.recovery.reopened', { at: formatDateTime(restore.reopenedAt, timeZone) })}
        </p>
      )}
      <p className="m-0 text-body">
        {failed.length === 0
          ? t('operations.recovery.checks-passed', { count: String(restore.checks.length) })
          : t('operations.recovery.checks-failed', {
              failed: String(failed.length),
              count: String(restore.checks.length),
            })}
      </p>
      {failed.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr>
                <Th label="operations.recovery.check.unit" />
                <Th label="operations.recovery.check.name" />
                <Th label="operations.recovery.check.counts" />
                <Th label="operations.recovery.check.subject" />
              </tr>
            </thead>
            <tbody>
              {failed.map((check, index) => (
                <tr
                  key={`${check.unit} ${check.check} ${String(index)}`}
                  className="h-10 border-t border-border align-top"
                >
                  <td className="px-3 py-2">{check.unit}</td>
                  <td className="px-3 py-2">{check.check}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {t('operations.recovery.check.failed-of', {
                      failed: String(check.failed),
                      checked: String(check.checked),
                    })}
                  </td>
                  <td className="px-3 py-2 font-mono text-caption text-text-2">{check.subject ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="m-0 text-body">
        {t('operations.recovery.gaps', {
          count: String(restore.gaps.length),
          after: String(restore.gaps.filter((gap) => gap.afterRecoveryPoint).length),
        })}
      </p>
      <p className="m-0 text-body">
        {t('operations.recovery.series', { count: String(restore.seriesToReconcile.length) })}
      </p>
      <p className="m-0 text-body">
        {t('operations.recovery.validations', {
          recorded:
            restore.validations.map((each) => t(`operations.recovery.validates.${each.validates}`)).join(', ') ||
            t('operations.recovery.none'),
        })}
      </p>
      {status.held && (
        <p className="m-0 text-body">
          {restore.blocking.length === 0
            ? t('operations.recovery.may-reopen')
            : t('operations.recovery.blocked', { count: String(restore.blocking.length) })}
        </p>
      )}
      <p className="m-0 font-mono text-caption text-text-2">{restore.restoreId}</p>
    </div>
  );
}
