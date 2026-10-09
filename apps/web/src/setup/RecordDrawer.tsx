import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, type ButtonVariant } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { t, type MessageId } from '../messages/catalogue';
import { stateIdOf } from './states';

/** What a drawer offers the forms inside it: its footer, once mounted, and the way to close it (S1-F01-T33). */
interface DrawerSlots {
  readonly footer: HTMLElement | null;
  readonly close: () => void;
}
const DrawerSlotsContext = createContext<DrawerSlots | null>(null);

/**
 * The actions of a form that sits in a right drawer: Cancel, which closes the drawer, and the one primary button,
 * which submits the form by its `form` attribute. They are drawn in the drawer's fixed footer, outside the scrolling
 * body, so they stay in view however long the form is and the body never scrolls them under a sticky bar
 * (design-language 1 rule 6, 10.15 "Footer: secondary + one primary"; S1-F01-T33). The button's state stays with the
 * form that draws it. Outside a drawer, or before the footer mounts, the actions show in the form itself.
 */
export function FormActions({
  form,
  label = 'setup.request-approval',
  variant = 'primary',
  pending,
}: {
  form: string;
  label?: MessageId;
  variant?: ButtonVariant;
  pending: boolean;
}) {
  const slots = useContext(DrawerSlotsContext);
  const actions = (
    <>
      {slots !== null && <Button label="action.cancel" onClick={slots.close} />}
      <Button type="submit" form={form} variant={variant} label={label} disabled={pending} />
    </>
  );
  if (slots === null) return <div className="flex justify-end gap-2">{actions}</div>;
  return slots.footer === null ? null : createPortal(actions, slots.footer);
}

/**
 * The right drawer (design-language 10.15): a modal dialog over a scrim, full height under the top bar, 420 px wide
 * (the scrim starts under the environment banner and covers the top bar, which a modal drawer makes unusable)
 * (full screen on a phone), with the record's mono reference, title, one status badge and a close button; the tabs
 * Details · History (RR-312: the record's history is read here, so nobody types an identifier); a scrolling body of
 * solid cards; and a footer outside the scrolling body, which holds `footer` and the actions of any form in the body
 * (FormActions). Esc closes it, and focus goes back to the control that opened it. A record that takes evidence files
 * adds the tab Evidence n between them (10.15 "Tabs: Details · Evidence n · History"; S1-F08-T03).
 */
export function RecordDrawer({
  reference,
  title,
  state,
  onClose,
  details,
  history,
  evidence,
  footer,
}: {
  reference?: string;
  title: string;
  state?: string;
  onClose: () => void;
  details: ReactNode;
  history?: ReactNode;
  /** The record's evidence files, with how many there are, shown in their own tab. */
  evidence?: { readonly count: number; readonly content: ReactNode };
  footer?: ReactNode;
}) {
  const [tab, setTab] = useState<'details' | 'evidence' | 'history'>('details');
  const tabs = [
    'details' as const,
    ...(evidence === undefined ? [] : ['evidence' as const]),
    ...(history === undefined ? [] : ['history' as const]),
  ];
  const shown = tabs.includes(tab) ? tab : 'details';
  const [footerElement, setFooterElement] = useState<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const slots = useMemo<DrawerSlots>(
    () => ({
      footer: footerElement,
      close: () => {
        close.current();
      },
    }),
    [footerElement],
  );
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
    <DrawerSlotsContext value={slots}>
      <div
        className="fixed inset-x-0 bottom-0 top-[var(--banner-h)] z-40 flex justify-end bg-scrim"
        data-testid="drawer-scrim"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-title"
          className="glass mt-14 flex min-h-0 w-full flex-col border-l sm:w-[420px]"
        >
          <header data-testid="drawer-header" className="flex items-start gap-2 border-b border-border p-4">
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
          {tabs.length > 1 && (
            <div role="tablist" aria-label={t('drawer.tabs')} className="flex gap-2 border-b border-border px-4">
              {tabs.map((each) => (
                <button
                  key={each}
                  type="button"
                  role="tab"
                  id={`drawer-tab-${each}`}
                  aria-selected={shown === each}
                  aria-controls="drawer-panel"
                  className={
                    shown === each
                      ? 'h-9 border-b-2 border-accent px-3 font-semibold text-text'
                      : 'h-9 px-3 text-text-2 hover:text-accent'
                  }
                  onClick={() => {
                    setTab(each);
                  }}
                >
                  {each === 'evidence'
                    ? t('drawer.tab.evidence', { count: evidence?.count ?? 0 })
                    : t(`drawer.tab.${each}`)}
                </button>
              ))}
            </div>
          )}
          <div
            id="drawer-panel"
            role={tabs.length > 1 ? 'tabpanel' : undefined}
            aria-labelledby={tabs.length > 1 ? `drawer-tab-${shown}` : undefined}
            className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
          >
            {shown === 'details' ? details : shown === 'evidence' ? evidence?.content : history}
          </div>
          <footer
            ref={setFooterElement}
            data-testid="drawer-footer"
            className="flex justify-end gap-2 border-t border-border p-4 empty:hidden"
          >
            {footer}
          </footer>
        </div>
      </div>
    </DrawerSlotsContext>
  );
}
