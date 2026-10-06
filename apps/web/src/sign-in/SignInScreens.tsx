import { routes, type ErrorBody, type Secret } from '@apparel-os/schemas';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FieldError } from 'react-hook-form';
import { api } from '../api';
import { Button } from '../components/Button';
import { LoadingState } from '../components/StandardStates';
import { describedBy, FormField } from '../forms/FormField';
import { useRouteForm } from '../forms/use-route-form';
import { t, type MessageId } from '../messages/catalogue';
import { useSession } from '../shell/session';
import { EnrolmentSecret } from './EnrolmentSecret';
import { stageAfterSignIn, stageOfSessionRead, type SignInStage } from './flow';
import { RefusalBanner } from './RefusalBanner';
import { keyToResend } from './resend';

// The sign-in screens (S1-F01-T15; access-and-approvals 3.1 to 3.3; design-language 10.1, 10.7, 10.12): sign-in, then
// the steps of first sign-in the server names, enrolment of an authenticator app and the password change, then the
// shell. They are solid forms on one card (design-language 5). Every rule is the server's: the screens send what was
// typed and show what came back. A refusal is shown as the server gave it, so sign-in never says which part was
// wrong (access-and-approvals 3.1).

/** What the last press got back: nothing yet, a refusal, or no answer at all (null). */
type Outcome = { readonly refusal: ErrorBody | null } | undefined;

const control =
  'h-9 rounded-control border border-control bg-surface px-3 text-body text-text focus:border-accent ' +
  'aria-[invalid=true]:border-[1.5px] aria-[invalid=true]:border-d-fg';
const codeControl = `${control} font-mono tracking-wider`;
/** An empty optional field is absent, not an empty string, so the route schema reads it as not given. */
const emptyIsAbsent = (value: unknown) => (value === '' ? undefined : value);

function fieldProps(id: string, error: FieldError | undefined, help = false) {
  return describedBy(id, { invalid: error !== undefined, help });
}

/**
 * The sign-in screens, shown while no session is in force. On load they read the session, so a reload in the middle
 * of first sign-in comes back to the step still to do, and a session in force goes straight to the shell.
 */
export function SignInScreens({ initial = { stage: 'read-session' } }: { initial?: SignInStage }) {
  const [stage, setStage] = useState<SignInStage>(initial);
  const { setSession } = useSession();

  useEffect(() => {
    if (stage.stage === 'read-session') {
      let current = true;
      api.call('session', {}).then(
        (result) => {
          if (current) setStage(stageOfSessionRead(result));
        },
        () => {
          if (current) setStage({ stage: 'sign-in' });
        },
      );
      return () => {
        current = false;
      };
    }
    if (stage.stage === 'signed-in') {
      // The session read gives the personas held, in order, and the effective grants, so the shell lands by persona
      // and opens only what a role assignment grants (DEC-116; RR-261, RR-281).
      setSession({
        state: 'active',
        user: {
          organisationCode: stage.view.organisationCode,
          userId: stage.view.userId,
          displayName: stage.view.displayName,
          personasHeld: stage.view.personasHeld,
        },
        grants: stage.view.grants,
      });
    }
    return undefined;
  }, [stage, setSession]);

  switch (stage.stage) {
    case 'read-session':
    case 'signed-in':
      return (
        <Card title="sign-in.title">
          <LoadingState rows={3} />
        </Card>
      );
    case 'sign-in':
      return <SignInForm refusal={stage.refusal} onNext={setStage} />;
    case 'enrolment':
      return <EnrolmentForm onNext={setStage} />;
    case 'password-change':
      return <PasswordChangeForm onNext={setStage} />;
  }
}

/** One step on a solid card: its title, which takes focus when the step changes, its intro and its form. */
function Card({ title, intro, children }: { title: MessageId; intro?: MessageId; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Focus moves to the new step's title, so a screen reader announces it (design-language 9).
    if (document.activeElement !== document.body) heading.current?.focus();
  }, [title]);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-card border border-border bg-surface p-6 shadow-e1">
      <div className="flex flex-col gap-1">
        <h1 ref={heading} tabIndex={-1} className="text-title font-semibold">
          {t(title)}
        </h1>
        {intro !== undefined && <p className="text-body text-text-2">{t(intro)}</p>}
      </div>
      {children}
    </div>
  );
}

function SignInForm({ refusal, onNext }: { refusal: ErrorBody | undefined; onNext: (stage: SignInStage) => void }) {
  const form = useRouteForm(routes.signIn);
  const [outcome, setOutcome] = useState<Outcome>(refusal === undefined ? undefined : { refusal });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async (body) => {
    try {
      const result = await api.call('signIn', { body });
      if (result.ok) {
        onNext(stageAfterSignIn(result.data));
        return;
      }
      setOutcome({ refusal: result.error });
    } catch {
      setOutcome({ refusal: null });
    }
    // Nothing typed into a secret field outlives a refused attempt (PRD-SEC-006).
    form.resetField('password');
    form.resetField('totpCode');
  });
  return (
    <Card title="sign-in.title" intro="sign-in.intro">
      {outcome !== undefined && <RefusalBanner refusal={outcome.refusal} />}
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <FormField id="organisationCode" label="sign-in.organisation-code" required error={errors.organisationCode}>
          <input
            id="organisationCode"
            className={codeControl}
            autoComplete="organization"
            autoCapitalize="characters"
            spellCheck={false}
            {...fieldProps('organisationCode', errors.organisationCode)}
            {...form.register('organisationCode')}
          />
        </FormField>
        <FormField id="login" label="sign-in.login" required error={errors.login}>
          <input
            id="login"
            className={control}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            {...fieldProps('login', errors.login)}
            {...form.register('login')}
          />
        </FormField>
        <FormField id="password" label="sign-in.password" required error={errors.password}>
          <input
            id="password"
            className={control}
            autoComplete="current-password"
            type="password"
            {...fieldProps('password', errors.password)}
            {...form.register('password')}
          />
        </FormField>
        <FormField id="totpCode" label="sign-in.totp-code" help="sign-in.totp-code.help" error={errors.totpCode}>
          <input
            id="totpCode"
            className={codeControl}
            autoComplete="one-time-code"
            inputMode="numeric"
            {...fieldProps('totpCode', errors.totpCode, true)}
            {...form.register('totpCode', { setValueAs: emptyIsAbsent })}
          />
        </FormField>
        <Button label="sign-in.submit" variant="primary" type="submit" disabled={isSubmitting} />
      </form>
    </Card>
  );
}

/** The setup key shown once, kept only while this step is on the screen (code-house-rules 12.6). */
interface ShownKey {
  readonly secret: Secret;
  readonly otpauthUri: Secret;
}

function EnrolmentForm({ onNext }: { onNext: (stage: SignInStage) => void }) {
  const form = useRouteForm(routes.confirmEnrolment);
  const [shown, setShown] = useState<ShownKey | undefined>(undefined);
  const [outcome, setOutcome] = useState<Outcome>(undefined);
  const [starting, setStarting] = useState(false);
  const startKey = useRef<string | undefined>(undefined);
  const confirmKey = useRef<string | undefined>(undefined);
  const { errors, isSubmitting } = form.formState;

  const start = async () => {
    setStarting(true);
    try {
      const result = await api.call('startEnrolment', { body: {}, idempotencyKey: startKey.current });
      startKey.current = keyToResend(result);
      if (result.ok) {
        setShown(result.data);
        setOutcome(undefined);
      } else {
        setOutcome({ refusal: result.error });
      }
    } catch {
      setOutcome({ refusal: null });
    } finally {
      setStarting(false);
    }
  };

  const confirm = form.handleSubmit(async (body) => {
    try {
      const result = await api.call('confirmEnrolment', { body, idempotencyKey: confirmKey.current });
      confirmKey.current = keyToResend(result);
      if (result.ok) {
        // The key is dropped once the app is confirmed; the server says what is still to do.
        setShown(undefined);
        onNext({ stage: 'read-session' });
        return;
      }
      setOutcome({ refusal: result.error });
    } catch {
      setOutcome({ refusal: null });
    }
    form.resetField('totpCode');
  });

  return (
    <Card title="enrolment.title" intro="enrolment.body">
      {outcome !== undefined && <RefusalBanner refusal={outcome.refusal} />}
      {shown === undefined ? (
        <Button
          label="enrolment.start"
          variant="primary"
          disabled={starting}
          onClick={() => {
            void start();
          }}
        />
      ) : (
        <>
          <EnrolmentSecret secret={shown.secret} otpauthUri={shown.otpauthUri} />
          <form noValidate onSubmit={(event) => void confirm(event)} className="flex flex-col gap-4">
            <FormField
              id="totpCode"
              label="sign-in.totp-code"
              help="enrolment.code-help"
              required
              error={errors.totpCode}
            >
              <input
                id="totpCode"
                className={codeControl}
                autoComplete="one-time-code"
                inputMode="numeric"
                {...fieldProps('totpCode', errors.totpCode, true)}
                {...form.register('totpCode')}
              />
            </FormField>
            <Button label="enrolment.confirm" variant="primary" type="submit" disabled={isSubmitting} />
          </form>
        </>
      )}
    </Card>
  );
}

function PasswordChangeForm({ onNext }: { onNext: (stage: SignInStage) => void }) {
  const form = useRouteForm(routes.changePassword);
  const [outcome, setOutcome] = useState<Outcome>(undefined);
  // The repeat is checked here only, to catch a typing slip; it is never sent (it is no part of the route's body).
  const [again, setAgain] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const key = useRef<string | undefined>(undefined);
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (body) => {
    if (body.newPassword !== again) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    try {
      const result = await api.call('changePassword', { body, idempotencyKey: key.current });
      key.current = keyToResend(result);
      if (result.ok) {
        onNext({ stage: 'read-session' });
        return;
      }
      setOutcome({ refusal: result.error });
    } catch {
      setOutcome({ refusal: null });
    }
    form.resetField('totpCode');
  });

  return (
    <Card title="password-change.title" intro="password-change.body">
      {outcome !== undefined && <RefusalBanner refusal={outcome.refusal} />}
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <FormField id="newPassword" label="password-change.new" required error={errors.newPassword}>
          <input
            id="newPassword"
            className={control}
            autoComplete="new-password"
            type="password"
            {...fieldProps('newPassword', errors.newPassword)}
            {...form.register('newPassword')}
          />
        </FormField>
        <FormField
          id="newPasswordAgain"
          label="password-change.again"
          required
          message={mismatch ? 'password-change.mismatch' : undefined}
        >
          <input
            id="newPasswordAgain"
            className={control}
            autoComplete="new-password"
            type="password"
            value={again}
            {...describedBy('newPasswordAgain', { invalid: mismatch, help: false })}
            onChange={(event) => {
              setAgain(event.target.value);
            }}
          />
        </FormField>
        <FormField
          id="totpCode"
          label="sign-in.totp-code"
          help="password-change.code-help"
          required
          error={errors.totpCode}
        >
          <input
            id="totpCode"
            className={codeControl}
            autoComplete="one-time-code"
            inputMode="numeric"
            {...fieldProps('totpCode', errors.totpCode, true)}
            {...form.register('totpCode')}
          />
        </FormField>
        <Button label="password-change.submit" variant="primary" type="submit" disabled={isSubmitting} />
      </form>
    </Card>
  );
}
