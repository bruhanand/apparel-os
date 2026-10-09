import type { WorkItem } from '@apparel-os/schemas';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { approvalSubject } from '../approvals/subject';
import { ExceptionDrawer } from '../exceptions/ExceptionDrawer';
import {
  approvalRead,
  subjectReads,
  useApprovalRequests,
  useApprovalSubjects,
  useSubjectLists,
} from '../approvals/use-subjects';
import { Button } from '../components/Button';
import { t } from '../messages/catalogue';
import { GrantedButton, ListRead, Toolbar } from '../setup/parts';
import { BulkBar } from './BulkApproval';
import { StandInDrawer } from './StandInDrawer';
import { RecordDrawer } from '../setup/RecordDrawer';
import { useSession, useTimeZone } from '../shell/session';
import { myWorkCount, MyWorkCounter, MyWorkList } from './MyWork';

/** The read of My work, shared by the screen and the counter, so a refresh updates both. */
const myWorkRead = () => readQuery(api, 'listMyWork', {});

/**
 * Home › My work (access-and-approvals 11.2; spec section 6 "My work"): loading, empty, the list in the server's order,
 * error, and the time it was read (PRD-PRF-004). Opening an approval opens its panel in the drawer, and an exception
 * its record (access-and-approvals 12, 14); acting runs the owner's operation with its own checks (module-map 4.8).
 */
export function MyWorkScreen() {
  const query = useQuery(myWorkRead());
  const timeZone = useTimeZone();
  const [open, setOpen] = useState<WorkItem | null>(null);
  const [delegating, setDelegating] = useState(false);
  const items = query.data?.items ?? [];
  const subjects = useApprovalSubjects(items);
  const requests = useApprovalRequests(items);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const queryClient = useQueryClient();
  // Selectable for bulk approval: an open approval whose action type is on the allowlist (9.9; POL-02.19). The server
  // decides each one on its own; one the reader may not decide is left for individual review with its reason.
  const selectable = (item: WorkItem) => {
    const view = requests.get(item.id);
    return view !== undefined && view.bulkAllowed && view.state === 'Awaiting approval';
  };
  const chosen = items.filter((item) => selected.has(item.id) && selectable(item));
  const chosenViews = chosen.flatMap((item) => {
    const view = requests.get(item.id);
    return view === undefined ? [] : [view];
  });
  const labels = new Map(
    chosen.flatMap((item) => {
      const view = requests.get(item.id);
      const subject = subjects.get(item.id);
      return view === undefined || subject === undefined ? [] : [[view.id, subject.name ?? subject.title] as const];
    }),
  );
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="standin.delegate"
          recordType="access.stand_in_grant"
          action="create"
          onClick={() => {
            setDelegating(true);
          }}
        />
        <span className="flex-1" />
        <Button
          label="my-work.refresh"
          onClick={() => {
            // The names on the rows are read again too, so a record prepared since is named (visual review).
            for (const read of subjectReads) void queryClient.invalidateQueries({ queryKey: [read] });
            void query.refetch();
          }}
        />
      </Toolbar>
      <BulkBar
        selected={chosenViews}
        labels={labels}
        onClear={() => {
          setSelected(new Set());
        }}
      />
      <ListRead query={query} what="my-work.what">
        {(work) => (
          <MyWorkList
            work={work}
            onOpen={setOpen}
            timeZone={timeZone}
            subjects={subjects}
            selection={{
              selectable,
              selected,
              toggle: (item) => {
                setSelected((before) => {
                  const after = new Set(before);
                  if (after.has(item.id)) after.delete(item.id);
                  else after.add(item.id);
                  return after;
                });
              },
            }}
          />
        )}
      </ListRead>
      {delegating && (
        <StandInDrawer
          onClose={() => {
            setDelegating(false);
          }}
        />
      )}
      {open !== null && open.kind === 'exception' && (
        <ExceptionDrawer
          exceptionId={open.owner.recordId}
          onClose={() => {
            setOpen(null);
            void query.refetch();
          }}
        />
      )}
      {open !== null && open.kind !== 'exception' && (
        <ApprovalDrawer
          item={open}
          onClose={() => {
            setOpen(null);
            void query.refetch();
          }}
        />
      )}
    </div>
  );
}

/** The state a drawer's header shows: the request's own, as last read, over the item's from when the list was read. */
export function drawerState(item: WorkItem, request: { readonly state: string } | undefined): string {
  return request?.state ?? item.state;
}

/**
 * The drawer of one approval: its header names the record and shows the request's state from the same read as the
 * panel, so it changes with the decision (design-language 10.15; visual review finding 4).
 */
function ApprovalDrawer({ item, onClose }: { item: WorkItem; onClose: () => void }) {
  const request = useQuery(approvalRead(item.owner.recordId));
  const lists = useSubjectLists();
  // Named from its own read, so the title stays once the decision takes the item out of My work.
  const name = request.data === undefined ? null : approvalSubject(request.data, lists).name;
  return (
    <RecordDrawer
      title={name ?? t(`my-work.kind.${item.kind}`)}
      state={drawerState(item, request.data)}
      onClose={onClose}
      details={<ApprovalPanel requestId={item.owner.recordId} />}
    />
  );
}

/**
 * The My work counter of the top bar (design-language 10.5). It reads My work once when the shell opens and again
 * whenever the list is refreshed; it never polls, so it keeps no session from locking (RR-301).
 */
export function MyWorkCount() {
  const { session } = useSession();
  const query = useQuery({ ...myWorkRead(), enabled: session.state === 'active' });
  // Until the list is read the count is not known, so no number is shown (PRD-MOD-015).
  if (query.data === undefined) return <span className="text-body-sm font-medium">{t('my-work.label')}</span>;
  return <MyWorkCounter count={myWorkCount(query.data)} />;
}
