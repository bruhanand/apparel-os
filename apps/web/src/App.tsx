import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { createQueryClient } from './api/query';
import { router } from './router';
import { SessionContext, type ShellSession } from './shell/session';

/**
 * The web app: the session the shell shows, the query cache and the router. The cache lives in memory only and is
 * cleared when the person is signed out (code-house-rules 12.1). The sign-in screens set the session (S1-F01-T15).
 */
export function App() {
  const [session, setSessionState] = useState<ShellSession>({ state: 'signed-out' });
  const [queryClient] = useState(() => {
    const client = createQueryClient((refused) => {
      if (refused === 'locked') {
        // The page stays, inert, under the lock overlay, with its unsaved input (access-and-approvals 3.3).
        setSessionState((current) => (current.state === 'active' ? { ...current, state: 'locked' } : current));
        return;
      }
      client.clear();
      setSessionState({ state: 'signed-out' });
    });
    return client;
  });
  const setSession = useCallback(
    (next: ShellSession) => {
      if (next.state === 'signed-out') queryClient.clear();
      setSessionState(next);
    },
    [queryClient],
  );
  const control = useMemo(() => ({ session, setSession }), [session, setSession]);
  return (
    <QueryClientProvider client={queryClient}>
      <SessionContext value={control}>
        <RouterProvider router={router} />
      </SessionContext>
    </QueryClientProvider>
  );
}
