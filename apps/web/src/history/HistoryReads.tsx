import type { AccessHistoryPage, AuditHistoryPage } from '@apparel-os/schemas';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from '../api';
import { ApiFailure, failureBody } from '../api/query';
import { Button } from '../components/Button';
import { EmptyState, ErrorState, LoadingState } from '../components/StandardStates';
import { UnavailableState } from '../components/UnavailableState';
import { AccessRecordTable } from './AccessRecordTable';
import { AsOf } from './AsOf';
import { useTimeZone } from '../shell/session';
import { HistoryTimeline } from './HistoryTimeline';
import { useSubjectLists } from '../approvals/use-subjects';

// The history reads on screen (numbering-and-audit 4.5, 5; code-house-rules 12.1 "Reads"; design-language 10.4,
// 10.13). Each reads page by page with the server's cursor, shows the time the rows were read (PRD-PRF-004), and a
// refusal names what is missing (PRD-UXP-003). RecordHistory is the History tab of a record's drawer (design-language
// 10.15): the screens of S1-F01-T16 place it there.

type Page = AuditHistoryPage | AccessHistoryPage;

function pageOrThrow<P extends Page>(
  result: { ok: true; data: P } | { ok: false; status: number; error: ConstructorParameters<typeof ApiFailure>[1] },
) {
  if (result.ok) return result.data;
  throw new ApiFailure(result.status, result.error);
}

function usePages<P extends Page>(key: readonly unknown[], read: (cursor: string | undefined) => Promise<P>) {
  return useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => read(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: P) => last.next ?? undefined,
  });
}

/** The standard states around pages of history, and Load more while the server says more rows follow. */
function Paged<P extends Page>({
  query,
  render,
}: {
  query: ReturnType<typeof usePages<P>>;
  /** Draws the rows, with the Organisation's timezone to show their times in (PRD-MOD-017; DEC-118). */
  render: (pages: readonly P[], timeZone: string) => ReactNode;
}) {
  const timeZone = useTimeZone();
  if (query.isPending) return <LoadingState rows={3} />;
  if (query.isError) {
    const body = failureBody(query.error);
    if (body?.kind === 'not-authorised' || body?.kind === 'unavailable') {
      return <UnavailableState missing={body.missing ?? []} />;
    }
    return (
      <ErrorState
        what="history.what"
        error={body}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }
  const pages = query.data.pages;
  const latest = pages.at(-1);
  if (pages.every((page) => page.entries.length === 0) || latest === undefined) {
    return <EmptyState title="history.empty.title" body="history.empty.body" />;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <AsOf asOf={latest.asOf} timeZone={timeZone} />
      </div>
      {render(pages, timeZone)}
      {query.hasNextPage && (
        <div>
          <Button
            label="history.load-more"
            disabled={query.isFetchingNextPage}
            onClick={() => {
              void query.fetchNextPage();
            }}
          />
        </div>
      )}
    </div>
  );
}

/** The history of one record, oldest first (numbering-and-audit 4.5). */
export function RecordHistory({ recordType, recordId }: { recordType: string; recordId: string }) {
  const lists = useSubjectLists();
  const query = usePages(['readRecordHistory', recordType, recordId], async (after) =>
    pageOrThrow(
      await api.call('readRecordHistory', {
        query: { recordType, recordId, ...(after === undefined ? {} : { after }) },
      }),
    ),
  );
  return (
    <Paged
      query={query}
      render={(pages, timeZone) => (
        <HistoryTimeline entries={pages.flatMap((p) => p.entries)} timeZone={timeZone} lists={lists} />
      )}
    />
  );
}

/** What one person or service identity changed, oldest first (numbering-and-audit 4.5). */
export function ActorHistory({ actorId }: { actorId: string }) {
  const lists = useSubjectLists();
  const query = usePages(['readActorHistory', actorId], async (after) =>
    pageOrThrow(await api.call('readActorHistory', { query: { actorId, ...(after === undefined ? {} : { after }) } })),
  );
  return (
    <Paged
      query={query}
      render={(pages, timeZone) => (
        <HistoryTimeline entries={pages.flatMap((p) => p.entries)} timeZone={timeZone} lists={lists} />
      )}
    />
  );
}

/** The access history report, newest first: sign-ins and the like, or sensitive access (numbering-and-audit 5). */
export function AccessHistory({ group, userId }: { group: 'access' | 'sensitive-access'; userId?: string }) {
  const name = group === 'access' ? 'readAccessHistory' : 'readSensitiveAccessHistory';
  const query = usePages([name, userId], async (before) =>
    pageOrThrow(
      await api.call(name, {
        query: { ...(userId === undefined ? {} : { userId }), ...(before === undefined ? {} : { before }) },
      }),
    ),
  );
  return (
    <Paged
      query={query}
      render={(pages, timeZone) => <AccessRecordTable entries={pages.flatMap((p) => p.entries)} timeZone={timeZone} />}
    />
  );
}
