import type { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ShellSession } from '../shell/session';
import { FOLLOWED_TYPES, keyIsStale, LIVE_PATH, parseMessage, staleReads } from './invalidation';

/**
 * Follows the session's live-update stream while it is active (code-house-rules 12.12; deployment.md section 5): one
 * EventSource per signed-in page. Each message marks the reads of its record stale, and the screens showing them read
 * again through the owning routes; a resync reads everything on screen again. The browser reconnects by itself with
 * `Last-Event-ID`. A locked session's stream is closed by the server and opened here again after the unlock. The
 * stream is no request of the session, so it keeps no session from locking (access-and-approvals 3.3).
 */
export function useLiveUpdates(session: ShellSession, queryClient: QueryClient): void {
  const active = session.state === 'active';
  useEffect(() => {
    if (!active || typeof EventSource === 'undefined') return undefined;
    const source = new EventSource(LIVE_PATH);
    const onMessage = (event: MessageEvent<string>) => {
      const message = parseMessage(event.data);
      if (message === null) return;
      const stale = staleReads(message);
      void queryClient.invalidateQueries({ predicate: (query) => keyIsStale(stale, query.queryKey) });
    };
    for (const type of FOLLOWED_TYPES) source.addEventListener(type, onMessage);
    source.onerror = () => {
      // Closed for good, as when the session ended or locked: My work, read again, tells the shell which.
      if (source.readyState === EventSource.CLOSED) void queryClient.invalidateQueries({ queryKey: ['listMyWork'] });
    };
    return () => {
      source.close();
    };
  }, [active, queryClient]);
}
