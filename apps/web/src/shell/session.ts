import type { PersonaId } from '@apparel-os/schemas';
import { createContext, useContext } from 'react';
import type { Grant } from './screens';

/** The signed-in person as the shell needs them: no secret, no restricted value (access-and-approvals 3.3, 6). */
export interface ShellUser {
  /** The Organisation and the user, which own the input kept on the device across a session's end (3.3). */
  readonly organisationCode: string;
  readonly userId: string;
  readonly displayName: string;
  /** In the person's chosen order: the first sets the landing screen (design-language 10.18). */
  readonly personasHeld: readonly PersonaId[];
  /** Whether a role assignment is in force: with none, only "No access assigned" shows (DEC-118; RR-260). */
  readonly roleAssignmentInForce: boolean;
  /** The Organisation's timezone, in which every time on a screen is shown (PRD-MOD-017; DEC-118; RR-310). */
  readonly timeZone: string;
  /**
   * The idle-lock limit in force, in seconds, from the session read: the screen shows its lock once that long has passed
   * with no request of the session (access-and-approvals 3.3; PRD-ACS-017; S1-F01-T30).
   */
  readonly idleLockSeconds: number;
}

/**
 * The session as the shell shows it (access-and-approvals 3.3). `locked`: the idle limit passed; the page stays,
 * covered by the lock overlay, until the same user unlocks it (UnlockForm, S1-F01-T09). The sign-in screens
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

/**
 * The Organisation's timezone of the signed-in session, for formatting times (PRD-MOD-017; design-language 8;
 * code-house-rules 9). Screens that show times are reached only signed in; never the device's timezone.
 */
export function useTimeZone(): string {
  const { session } = useSession();
  if (session.state === 'signed-out') throw new Error('useTimeZone is used while signed out');
  return session.user.timeZone;
}
