import type { WorkItem } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { approvalRead, useApprovalSubjects } from '../approvals/use-subjects';
import { Button } from '../components/Button';
import { t } from '../messages/catalogue';
import { ListRead, Toolbar } from '../setup/parts';
import { RecordDrawer } from '../setup/RecordDrawer';
import { useSession, useTimeZone } from '../shell/session';
import { myWorkCount, MyWorkCounter, MyWorkList } from './MyWork';

/** The read of My work, shared by the screen and the counter, so a refresh updates both. */
const myWorkRead = () => readQuery(api, 'listMyWork', {});

/**
 * Home › My work (access-and-approvals 11.2; spec section 6 "My work"): loading, empty, the list in the server's order,
 * error, and the time it was read (PRD-PRF-004). Opening an approval opens its panel in the drawer; acting runs the
 * owner's operation with its own checks (module-map 4.8).
 */
export function MyWorkScreen() {
  const query = useQuery(myWorkRead());
  const timeZone = useTimeZone();
  const [open, setOpen] = useState<WorkItem | null>(null);
  const subjects = useApprovalSubjects(query.data?.items ?? []);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <span className="flex-1" />
        <Button
          label="my-work.refresh"
          onClick={() => {
            void query.refetch();
          }}
        />
      </Toolbar>
      <ListRead query={query} what="my-work.what">
        {(work) => <MyWorkList work={work} onOpen={setOpen} timeZone={timeZone} subjects={subjects} />}
      </ListRead>
      {open !== null && (
        <ApprovalDrawer
          item={open}
          title={subjects.get(open.id)?.name ?? t(`my-work.kind.${open.kind}`)}
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
function ApprovalDrawer({ item, title, onClose }: { item: WorkItem; title: string; onClose: () => void }) {
  const request = useQuery(approvalRead(item.owner.recordId));
  return (
    <RecordDrawer
      title={title}
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
