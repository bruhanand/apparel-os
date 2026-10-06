import { useState } from 'react';
import { api } from '../api';
import { Button } from '../components/Button';
import type { MessageId } from '../messages/catalogue';
import { useSession } from '../shell/session';

/**
 * Signs out (access-and-approvals 3.3): the server ends the session and clears its cookie, and the shell shows the
 * sign-in screens, its query cache cleared. Whatever the server answers, the page signs out: a session it no longer
 * knows is over anyway (code-house-rules 12.1).
 */
export function SignOutButton({ label = 'shell.sign-out' }: { label?: MessageId }) {
  const { setSession } = useSession();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    try {
      await api.call('signOut', { body: {} });
    } catch {
      // No answer: the page signs out all the same.
    }
    setSession({ state: 'signed-out' });
  };
  return <Button label={label} variant="ghost" disabled={busy} onClick={() => void signOut()} />;
}
