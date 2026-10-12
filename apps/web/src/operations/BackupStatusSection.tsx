import type { BackupEntry } from '@apparel-os/schemas';
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
 * The operations view's backup status (backup-and-restore 3.2 step 8, 10.2; module-map 4.1; PRD-SEC-013;
 * S1-F14-T02): the last complete backup of the Organisation, and the latest backups, complete or failed, with what a
 * failed one found. Shown only to whoever holds view on `kernel.backup_record`; who that is, is KDPS's (V-01).
 * Identifiers, times and kinds only: no record data and no key. A backup is taken by the operator command, never here.
 */
export function BackupStatusSection() {
  const granted = useGranted('kernel.backup_record', 'view');
  if (!granted) return null;
  return <BackupStatusList />;
}

function BackupStatusList() {
  const timeZone = useTimeZone();
  const query = useQuery(readQuery(api, 'listBackups', {}));
  return (
    <section className="flex flex-col gap-3" aria-labelledby="backup-status-title">
      <Toolbar>
        <h2 id="backup-status-title" className="m-0 flex-1 text-h2 font-semibold">
          {t('operations.backups')}
        </h2>
        <Button
          label="setup.refresh"
          onClick={() => {
            void query.refetch();
          }}
        />
      </Toolbar>
      <ListRead query={query} what="operations.backups.what">
        {(status) => (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="m-0 text-body">
                {status.lastComplete === null
                  ? t('operations.backups.none-complete')
                  : t('operations.backups.last-complete', {
                      at: formatDateTime(status.lastComplete.snapshotAt, timeZone),
                    })}
              </p>
              <AsOf asOf={status.asOf} timeZone={timeZone} />
            </div>
            {status.backups.length === 0 ? (
              <EmptyState title="operations.backups.empty.title" body="operations.backups.empty.body" />
            ) : (
              <div className="overflow-x-auto rounded-card border border-border bg-surface">
                <table className="w-full border-collapse text-body">
                  <thead>
                    <tr>
                      <Th label="operations.backup.state" />
                      <Th label="operations.backup.snapshot-at" />
                      <Th label="operations.backup.finished-at" />
                      <Th label="operations.backup.failures" />
                      <Th label="operations.backup.reference" />
                    </tr>
                  </thead>
                  <tbody>
                    {status.backups.map((entry) => (
                      <BackupRow key={entry.backupId} entry={entry} timeZone={timeZone} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </ListRead>
    </section>
  );
}

function BackupRow({ entry, timeZone }: { entry: BackupEntry; timeZone: string }) {
  return (
    <tr className="h-10 border-t border-border align-top hover:bg-hover">
      <td className="px-3 py-2">
        <StatusBadge state={entry.result === 'complete' ? 'completed' : 'failed'} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(entry.snapshotAt, timeZone)}</td>
      <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(entry.finishedAt, timeZone)}</td>
      <td className="px-3 py-2">
        {entry.failures.length === 0 ? (
          <span className="text-text-2">{t('operations.backup.no-failures')}</span>
        ) : (
          <span className="flex flex-col">
            {entry.failures.map((kind) => (
              <span key={kind}>{t(`operations.backup.failure.${kind}`)}</span>
            ))}
          </span>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-caption text-text-2">{entry.backupId}</td>
    </tr>
  );
}
