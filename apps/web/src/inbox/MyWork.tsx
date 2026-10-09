import type { MyWork, WorkItem } from '@apparel-os/schemas';
import type { ApprovalSubject } from '../approvals/subject';
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

function dueText(item: WorkItem, timeZone: string): string {
  return item.due.kind === 'none'
    ? t('my-work.no-due')
    : t('my-work.due', { time: formatDateTime(item.due.at, timeZone) });
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

/**
 * The list: each item's subject (what it is for, who prepared it and when; access-and-approvals 11.2, visual review
 * finding 3), state, due time, exposure and next action (PRD-UXP-003), or why it is empty. An item with no subject
 * read yet, or none the reader may read, shows its kind.
 */
export function MyWorkList({
  work,
  onOpen,
  timeZone,
  subjects = new Map(),
  selection,
}: {
  work: MyWork;
  onOpen: (item: WorkItem) => void;
  /** The Organisation's timezone (PRD-MOD-017; DEC-118). */
  timeZone: string;
  /** The subject of each approval item, by item identifier. */
  subjects?: ReadonlyMap<string, ApprovalSubject>;
  /**
   * Selection for bulk approval (access-and-approvals 9.9; design-language 10.9 "Selection"): which items may be
   * selected, those whose action type is on the allowlist; which are; and how to toggle one.
   */
  selection?: {
    readonly selectable: (item: WorkItem) => boolean;
    readonly selected: ReadonlySet<string>;
    readonly toggle: (item: WorkItem) => void;
  };
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <AsOf asOf={work.asOf} timeZone={timeZone} />
      </div>
      {work.items.length === 0 ? (
        <EmptyState title="my-work.empty.title" body="my-work.empty.body" />
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0">
          {work.items.map((item) => {
            const subject = subjects.get(item.id);
            const toggle = selection?.selectable(item) === true ? selection.toggle : undefined;
            const selected = selection?.selected.has(item.id) === true;
            return (
              <li
                key={item.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-card border border-border px-4 py-3',
                  selected ? 'bg-tint' : 'bg-surface',
                )}
              >
                {toggle !== undefined && (
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    aria-label={t('bulk.select', {
                      name: subject?.name ?? subject?.title ?? t(`my-work.kind.${item.kind}`),
                    })}
                    checked={selected}
                    onChange={() => {
                      toggle(item);
                    }}
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{subject?.title ?? t(`my-work.kind.${item.kind}`)}</span>
                    {subject?.name !== null && subject?.name !== undefined && (
                      <span className="text-body">{subject.name}</span>
                    )}
                    <StatusBadge state={stateIdOf(item.state)} />
                    {item.due.kind === 'at' && item.due.at < work.asOf && <StatusBadge state="overdue" />}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-body-sm text-text-2">
                    {subject !== undefined && (
                      <span>
                        {t('approval.prepared-by', {
                          names: subject.preparedBy,
                          time: formatDateTime(subject.requestedAt, timeZone),
                        })}
                      </span>
                    )}
                    <span>{dueText(item, timeZone)}</span>
                    <span className="tabular-nums">{exposureText(item)}</span>
                  </div>
                </div>
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
                {item.nextAction === 'exceptions.open-exception' && (
                  <button
                    type="button"
                    className="h-9 rounded-control px-3 font-semibold text-accent hover:bg-tint"
                    onClick={() => {
                      onOpen(item);
                    }}
                  >
                    {t('my-work.open-exception')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
