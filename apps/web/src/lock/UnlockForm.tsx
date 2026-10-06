import { routes, type ErrorBody } from '@apparel-os/schemas';
import { useForm } from 'react-hook-form';
import { useRef, useState } from 'react';
import { api } from '../api';
import { Button } from '../components/Button';
import { describedBy, FormField } from '../forms/FormField';
import { routeResolver } from '../forms/use-route-form';
import { useSession } from '../shell/session';
import { RefusalBanner } from '../sign-in/RefusalBanner';
import { keyToResend } from '../sign-in/resend';
import { SignOutButton } from './SignOutButton';

/** What an unlock press comes to (access-and-approvals 3.3; RR-264). */
export type UnlockOutcome =
  | { readonly kind: 'unlocked' }
  /** The session ended or was revoked meanwhile: the person signs in again. */
  | { readonly kind: 'ended' }
  /** A wrong password, a slowed attempt or a missing setting: shown as the server gave it (3.1). */
  | { readonly kind: 'refused'; readonly refusal: ErrorBody };

export function outcomeOfUnlock(
  result: { readonly ok: true } | { readonly ok: false; readonly error: ErrorBody },
): UnlockOutcome {
  if (result.ok) return { kind: 'unlocked' };
  const code = result.error.code;
  if (code === 'access.not-signed-in' || code === 'access.session-not-found') return { kind: 'ended' };
  return { kind: 'refused', refusal: result.error };
}

const control =
  'h-9 rounded-control border border-control bg-surface px-3 text-body text-text focus:border-accent ' +
  'aria-[invalid=true]:border-[1.5px] aria-[invalid=true]:border-d-fg';

/**
 * The unlock form of the lock screen (access-and-approvals 3.3; PRD-ACS-017; design-language 10.7): the same user's
 * password, nothing else. The page under the overlay keeps its work; on success the overlay goes and the page is live
 * again. A wrong password gets the one sign-in refusal (3.1). Someone else at the device signs out instead and signs
 * in with a session of their own.
 */
export function UnlockForm() {
  const { session, setSession } = useSession();
  const form = useForm({ resolver: routeResolver(routes.unlockSession), mode: 'onBlur' });
  const [refusal, setRefusal] = useState<ErrorBody | null | undefined>(undefined);
  const key = useRef<string | undefined>(undefined);
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async (body) => {
    try {
      const result = await api.call('unlockSession', { body, idempotencyKey: key.current });
      key.current = keyToResend(result);
      const outcome = outcomeOfUnlock(result);
      if (outcome.kind === 'unlocked') {
        if (session.state === 'locked') setSession({ ...session, state: 'active' });
        return;
      }
      if (outcome.kind === 'ended') {
        setSession({ state: 'signed-out' });
        return;
      }
      setRefusal(outcome.refusal);
    } catch {
      setRefusal(null);
    }
    // Nothing typed into the password outlives a refused attempt (PRD-SEC-006).
    form.resetField('password');
  });
  return (
    <div className="flex flex-col gap-3">
      {refusal !== undefined && <RefusalBanner refusal={refusal} />}
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <FormField id="unlock-password" label="lock.password" required error={errors.password}>
          <input
            id="unlock-password"
            className={control}
            autoComplete="current-password"
            type="password"
            {...describedBy('unlock-password', { invalid: errors.password !== undefined, help: false })}
            {...form.register('password')}
          />
        </FormField>
        <div className="flex flex-wrap gap-2">
          <Button label="lock.unlock" variant="primary" type="submit" disabled={isSubmitting} />
          <SignOutButton label="lock.sign-out" />
        </div>
      </form>
    </div>
  );
}
