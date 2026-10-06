import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StatusBadge } from '../components/StatusBadge';
import { t } from '../messages/catalogue';
import { stateIdOf } from './states';

/**
 * The right drawer (design-language 10.15): a modal dialog over a scrim, full height under the top bar, 420 px wide
 * (full screen on a phone), with the record's mono reference, title, one status badge and a close button; the tabs
 * Details · History (RR-312: the record's history is read here, so nobody types an identifier); a scrolling body of
 * solid cards; and an optional footer. Esc closes it, and focus goes back to the control that opened it. Evidence
 * arrives with stored files (S1-F06).
 */
export function RecordDrawer({
  reference,
  title,
  state,
  onClose,
  details,
  history,
  footer,
}: {
  reference?: string;
  title: string;
  state?: string;
  onClose: () => void;
  details: ReactNode;
  history?: ReactNode;
  footer?: ReactNode;
}) {
  const [tab, setTab] = useState<'details' | 'history'>('details');
  const heading = useRef<HTMLHeadingElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    heading.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, []);
  return (
    <div className="fixed inset-0 top-14 z-40 flex justify-end bg-scrim">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="glass flex h-full w-full flex-col border-l sm:w-[420px]"
      >
        <header className="flex items-start gap-2 border-b border-border p-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {reference !== undefined && <span className="font-mono text-body-sm text-text-2">{reference}</span>}
            <h2 id="drawer-title" ref={heading} tabIndex={-1} className="text-h2 font-semibold">
              {title}
            </h2>
            {state !== undefined && <StatusBadge state={stateIdOf(state)} />}
          </div>
          <button
            type="button"
            aria-label={t('drawer.close')}
            className="h-9 w-9 rounded-control text-h3 text-text-2 hover:bg-hover"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {history !== undefined && (
          <div role="tablist" aria-label={t('drawer.tabs')} className="flex gap-2 border-b border-border px-4">
            {(['details', 'history'] as const).map((each) => (
              <button
                key={each}
                type="button"
                role="tab"
                id={`drawer-tab-${each}`}
                aria-selected={tab === each}
                aria-controls="drawer-panel"
                className={
                  tab === each
                    ? 'h-9 border-b-2 border-accent px-3 font-semibold text-text'
                    : 'h-9 px-3 text-text-2 hover:text-accent'
                }
                onClick={() => {
                  setTab(each);
                }}
              >
                {t(`drawer.tab.${each}`)}
              </button>
            ))}
          </div>
        )}
        <div
          id="drawer-panel"
          role={history === undefined ? undefined : 'tabpanel'}
          aria-labelledby={history === undefined ? undefined : `drawer-tab-${tab}`}
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
        >
          {tab === 'details' || history === undefined ? details : history}
        </div>
        {footer !== undefined && (
          <footer className="flex justify-end gap-2 border-t border-border p-4">{footer}</footer>
        )}
      </div>
    </div>
  );
}
