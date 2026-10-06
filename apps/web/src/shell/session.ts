import type { PersonaId } from '@apparel-os/schemas';
import { createContext, useContext } from 'react';
import type { Grant } from './screens';

/** The signed-in person as the shell needs them: no secret, no restricted value (access-and-approvals 3.3, 6). */
export interface ShellUser {
  readonly displayName: string;
  /** In the person's chosen order: the first sets the landing screen (design-language 10.18). */
  readonly personasHeld: readonly PersonaId[];
}

/**
 * The session as the shell shows it (access-and-approvals 3.3). `locked`: the idle limit passed; the page stays,
 * covered by the lock overlay, until the same user unlocks it (S1-F01-T09 builds the unlock). The sign-in screens
 * (S1-F01-T15) and the read of the person's effective grants (S1-F01-T11) set it.
 */
export type ShellSession =
  | { readonly state: 'signed-out' }
  | { readonly state: 'active' | 'locked'; readonly user: ShellUser; readonly grants: readonly Grant[] };

export interface SessionControl {
  readonly session: ShellSession;
  readonly setSession: (session: ShellSession) => void;
}

export const SessionContext = createContext<SessionControl | null>(null);

export function useSession(): SessionControl {
  const control = useContext(SessionContext);
  if (control === null) throw new Error('useSession is used outside the SessionContext provider');
  return control;
}
