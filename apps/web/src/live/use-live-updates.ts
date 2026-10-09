import type { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ShellSession } from '../shell/session';
import { followStream, keyIsStale, LIVE_PATH } from './invalidation';

/**
 * Follows the session's live-update stream while it is active (code-house-rules 12.12; deployment.md section 5): one
 * EventSource per signed-in page. Each message marks the reads of its record stale, and the screens showing them read
 * again through the owning routes; a resync, and every open of the stream, reads everything on screen again
 * (`followStream`). The browser reconnects by itself. A locked session's stream is closed by the server and opened
 * here again after the unlock. The stream is no request of the session, so it keeps no session from locking
 * (access-and-approvals 3.3).
 */
export function useLiveUpdates(session: ShellSession, queryClient: QueryClient): void {
  const active = session.state === 'active';
  useEffect(() => {
    if (!active || typeof EventSource === 'undefined') return undefined;
    const source = new EventSource(LIVE_PATH);
    followStream(source, (stale) => {
      void queryClient.invalidateQueries({ predicate: (query) => keyIsStale(stale, query.queryKey) });
    });
    return () => {
      source.close();
    };
  }, [active, queryClient]);
}
