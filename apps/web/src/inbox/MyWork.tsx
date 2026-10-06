import type { MyWork, WorkItem } from '@apparel-os/schemas';
import { cn } from '@apparel-os/ui';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { formatPaise } from '../setup/format';
import { stateIdOf } from '../setup/states';

// My work (access-and-approvals 11.2; module-map 4.8; design-language 10.5, 10.13): every signed-in person's own list,
// in the order the server gives, by due time, then exposure, Unknown above known (PRD-ACS-009, PRD-MOD-015). It is
// read when opened and refreshed on demand only: no screen polls (RR-301).

/** The counter's state (design-language 10.5): zero, a count, or the number overdue. */
export type MyWorkCount =
  | { readonly kind: 'zero' }
  | { readonly kind: 'count'; readonly count: number }
  | { readonly kind: 'overdue'; readonly count: number };

/** The counter of the open items, and of those past their due time when the list was read. */
export function myWorkCount(work: MyWork): MyWorkCount {
  const overdue = work.items.filter((item) => item.due.kind === 'at' && item.due.at < work.asOf).length;
  if (overdue > 0) return { kind: 'overdue', count: overdue };
  return work.items.length === 0 ? { kind: 'zero' } : { kind: 'count', count: work.items.length };
}

/** "My work" with its pill (design-language 10.5): plain 0, a count up to 99+, or "! n overdue" in Attention. */
export function MyWorkCounter({ count }: { count: MyWorkCount }) {
  return (
    <span className="inline-flex items-center gap-2 text-body-sm font-medium">
      <span>{t('my-work.label')}</span>
      {count.kind === 'zero' ? (
        <span className="text-text-3">{t('my-work.zero')}</span>
      ) : (
        <span
          className={cn(
            'inline-flex h-5 min-w-6 items-center justify-center rounded-full px-2 text-caption font-semibold',
            count.kind === 'overdue' ? 'bg-w-bg text-w-fg' : 'bg-accent text-on-accent',
          )}
        >
          {count.kind === 'overdue'
            ? t('my-work.overdue', { count: count.count })
            : count.count > 99
              ? t('my-work.many')
              : t('my-work.count', { count: count.count })}
        </span>
      )}
    </span>
  );
}

function dueText(item: WorkItem): string {
  return item.due.kind === 'none' ? t('my-work.no-due') : t('my-work.due', { time: formatDateTime(item.due.at) });
}

function exposureText(item: WorkItem): string {
  switch (item.exposure.kind) {
    case 'none':
      return t('my-work.no-value');
    case 'unknown':
      return t('my-work.unknown-value');
    case 'known':
      return formatPaise(item.exposure.amount);
  }
}

/** The list: each item's kind, state, due time, exposure and next action (PRD-UXP-003), or why it is empty. */
export function MyWorkList({ work, onOpen }: { work: MyWork; onOpen: (item: WorkItem) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <AsOf asOf={work.asOf} />
      </div>
      {work.items.length === 0 ? (
        <EmptyState title="my-work.empty.title" body="my-work.empty.body" />
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0">
          {work.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-4 py-3"
            >
              <span className="font-semibold">{t(`my-work.kind.${item.kind}`)}</span>
              <StatusBadge state={stateIdOf(item.state)} />
              <span className="text-body-sm text-text-2">{dueText(item)}</span>
              <span className="text-body-sm tabular-nums text-text-2">{exposureText(item)}</span>
              <span className="flex-1" />
              {item.nextAction === 'access.decide-approval' && (
                <button
                  type="button"
                  className="h-9 rounded-control px-3 font-semibold text-accent hover:bg-tint"
                  onClick={() => {
                    onOpen(item);
                  }}
                >
                  {t('my-work.open-decide')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
