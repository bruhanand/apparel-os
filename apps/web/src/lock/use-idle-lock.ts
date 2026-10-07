import { useEffect } from 'react';
import type { ShellSession } from '../shell/session';
import { startIdleLock } from './idle-lock';

/**
 * Shows the lock when the idle limit passes while the session is active (access-and-approvals 3.3; PRD-ACS-017;
 * S1-F01-T30): the same lock the server's `access.session-locked` answer shows, with the page kept under it and each
 * form dropping its secret fields. The limit comes from the session read. A tab coming back to the front or regaining
 * focus checks at once, since a background tab's timer may run late or not at all. Nothing is sent; see idle-lock.ts.
 */
export function useIdleLock(session: ShellSession, lock: () => void): void {
  const idleLockSeconds = session.state === 'active' ? session.user.idleLockSeconds : undefined;
  useEffect(() => {
    if (idleLockSeconds === undefined) return undefined;
    const timer = startIdleLock({ idleLockSeconds, onIdle: lock });
    const wake = () => {
      if (document.visibilityState === 'visible') timer.check();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      timer.stop();
    };
  }, [idleLockSeconds, lock]);
}
