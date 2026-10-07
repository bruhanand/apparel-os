import type { CallInput, ErrorBody, routes } from '@apparel-os/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api } from '../api';
import { keyToResend } from '../sign-in/resend';
import { useSession } from '../shell/session';
import { sessionRefusal } from './query';

// One submission of a command from a screen (code-house-rules 12.2, 12.4; access-and-approvals 3.3; S1-F01-T16).

type Table = typeof routes;
export type CommandName = Extract<
  { [K in keyof Table]: Table[K] extends { command: true } ? K : never }[keyof Table],
  string
>;

export type SubmissionState =
  | { readonly kind: 'ready' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'done' }
  /** Refused, with the envelope; null when no answer came. */
  | { readonly kind: 'refused'; readonly refusal: ErrorBody | null };

/**
 * The state a refusal leaves: none shown on the screen when it only says the session is locked or over, since the
 * lock overlay or sign-in says that and a lock is not an error (access-and-approvals 3.3; design-language 10.12);
 * otherwise the refusal with its envelope.
 */
export function stateAfterRefusal(refusal: ErrorBody): SubmissionState {
  return sessionRefusal(refusal) === null ? { kind: 'refused', refusal } : { kind: 'ready' };
}

/**
 * Submits a command under an idempotency key kept until the outcome is known: after a lost answer, `timed-out`,
 * `kernel.outcome-unknown` or `kernel.request-in-progress` the next press resends the same key, so the command never
 * takes effect twice (code-house-rules 12.4; PRD-INT-002); any other answer ends the submission. A session the server
 * says is locked or over goes to the lock screen or to sign-in, the screen's input kept (access-and-approvals 3.3). On
 * success the reads named in `invalidates` are read again.
 */
export function useSubmission<K extends CommandName>(name: K, invalidates: readonly (keyof Table)[]) {
  const key = useRef<string | undefined>(undefined);
  const [state, setState] = useState<SubmissionState>({ kind: 'ready' });
  const { session, setSession } = useSession();
  const queryClient = useQueryClient();
  const submit = async (input: Omit<CallInput<Table[K]>, 'idempotencyKey'>) => {
    key.current ??= crypto.randomUUID();
    setState({ kind: 'pending' });
    let result;
    try {
      result = await api.call(name, { ...input, idempotencyKey: key.current } as CallInput<Table[K]>);
    } catch {
      // No answer: the key is kept, so pressing again sends the same submission.
      setState({ kind: 'refused', refusal: null });
      return undefined;
    }
    key.current = keyToResend(result);
    if (result.ok) {
      setState({ kind: 'done' });
      for (const read of invalidates) void queryClient.invalidateQueries({ queryKey: [read] });
      return result.data;
    }
    const refused = sessionRefusal(result.error);
    if (refused !== null && session.state !== 'signed-out') {
      setSession(refused === 'locked' ? { ...session, state: 'locked' } : { state: 'signed-out' });
    }
    setState(stateAfterRefusal(result.error));
    return undefined;
  };
  return {
    state,
    submit,
    reset: () => {
      setState({ kind: 'ready' });
    },
  };
}
