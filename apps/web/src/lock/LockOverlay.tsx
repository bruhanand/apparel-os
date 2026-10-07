import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../messages/catalogue';

/**
 * The lock overlay (access-and-approvals 3.3; PRD-ACS-017, PRD-UXP-003): a modal dialog over the scrim while the
 * session is locked. The page underneath stays mounted and inert, so its unsaved input is kept; forms drop their
 * secret and restricted fields when the lock starts (useLockAwareForm, keptInput). The unlock form is its child
 * (S1-F01-T09). Focus moves into it (design-language 9). It sits above every other overlay, an open drawer included,
 * and starts under the environment banner, which stays visible (design-language 5 "As built").
 */
export function LockOverlay({ children }: { children?: ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus();
  }, []);
  return (
    <div
      className="fixed inset-x-0 bottom-0 top-[var(--banner-h)] z-50 flex items-center justify-center bg-scrim p-4"
      data-testid="lock-overlay"
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lock-title"
        tabIndex={-1}
        className="glass flex w-full max-w-md flex-col gap-3 rounded-dialog border p-5 shadow-e3"
      >
        <div className="flex flex-col gap-2 rounded-card bg-surface p-4">
          <h2 id="lock-title" className="text-h2 font-semibold">
            {t('lock.title')}
          </h2>
          <p className="text-body text-text-2">{t('lock.body')}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
