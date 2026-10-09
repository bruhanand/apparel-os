import type { FailedJob } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { readQuery } from '../api/query';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { ExceptionDrawer } from '../exceptions/ExceptionDrawer';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { ListRead, Th, Toolbar } from '../setup/parts';
import { useTimeZone } from '../shell/session';

/**
 * Setup › Operations view (code-house-rules 12.9; module-map 4.1 "Operations view"; PRD-SEC-013; S1-F08-T04): the
 * failed jobs as a simple list from the design language's table, each with its diagnostic evidence and a link to the
 * unfinished-operation exception raised for it, where one was (access-and-approvals 9.8 step 4; DEC-116). For
 * whoever holds view on `kernel.job`; who that is, is KDPS's (V-01). It refreshes live when a job fails (12.12).
 * Backup and recovery status join it in S1-F14.
 */
export function FailedJobsScreen() {
  const timeZone = useTimeZone();
  const query = useQuery(readQuery(api, 'listFailedJobs', {}));
  const [exceptionId, setExceptionId] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <h2 className="m-0 flex-1 text-h2 font-semibold">{t('operations.failed-jobs')}</h2>
        <Button
          label="setup.refresh"
          onClick={() => {
            void query.refetch();
          }}
        />
      </Toolbar>
      <ListRead query={query} what="operations.failed-jobs.what">
        {(list) => (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <AsOf asOf={list.asOf} timeZone={timeZone} />
            </div>
            {list.jobs.length === 0 ? (
              <EmptyState title="operations.failed-jobs.empty.title" body="operations.failed-jobs.empty.body" />
            ) : (
              <div className="overflow-x-auto rounded-card border border-border bg-surface">
                <table className="w-full border-collapse text-body">
                  <thead>
                    <tr>
                      <Th label="operations.job.kind" />
                      <Th label="operations.job.state" />
                      <Th label="operations.job.failed-at" />
                      <Th label="operations.job.attempts" />
                      <Th label="operations.job.outcome" />
                      <Th label="operations.job.event" />
                      <Th label="operations.job.reference" />
                      <Th label="operations.job.exception" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.jobs.map((job) => (
                      <FailedJobRow key={job.jobId} job={job} timeZone={timeZone} onOpen={setExceptionId} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </ListRead>
      {exceptionId !== null && (
        <ExceptionDrawer
          exceptionId={exceptionId}
          onClose={() => {
            setExceptionId(null);
          }}
        />
      )}
    </div>
  );
}

function FailedJobRow({
  job,
  timeZone,
  onOpen,
}: {
  job: FailedJob;
  timeZone: string;
  onOpen: (exceptionId: string) => void;
}) {
  return (
    <tr className="h-10 border-t border-border align-top hover:bg-hover">
      <td className="px-3 py-2 font-mono text-body-sm">{job.jobKind}</td>
      <td className="px-3 py-2">
        <StatusBadge state="failed" />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {job.failedAt === null ? t('operations.job.not-known') : formatDateTime(job.failedAt, timeZone)}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {t('operations.job.attempts-of', { made: job.attempts, allowed: job.attemptsAllowed })}
      </td>
      <td className="px-3 py-2">
        <span className="flex flex-col">
          <span>{t(`operations.outcome.${job.outcome}`)}</span>
          {job.errorName !== null && <span className="font-mono text-caption text-text-2">{job.errorName}</span>}
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-body-sm">{job.eventType ?? t('operations.job.no-event')}</td>
      <td className="px-3 py-2 font-mono text-caption text-text-2">{job.jobId}</td>
      <td className="px-3 py-2">
        {job.exception === null ? (
          <span className="text-text-2">{t('operations.job.no-exception')}</span>
        ) : (
          <button
            type="button"
            className="font-mono text-accent underline"
            onClick={() => {
              onOpen(job.exception?.exceptionId ?? '');
            }}
          >
            {job.exception.code}
          </button>
        )}
      </td>
    </tr>
  );
}
