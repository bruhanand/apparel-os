import type { BillingDeviceView, DeviceEnrolled } from '@apparel-os/schemas';
import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react';
import { deviceKey, dropUnboundKey, identities, keepIdentity, newDeviceKey, type DeviceIdentity } from './device-store';
import { refusalText, t } from './messages';
import { api, publicKeyOf, signedChallenge } from './proof';

// The counter's enrolment and sign-in pages (offline-counter 3.2 steps 2 and 3, 3.3, 3.4, 5.1 to 5.3; access-and-
// approvals 3.1, 3.3; PRD-OFF-002, PRD-OFF-010, POL-02.18; GC8-8, DEC-116; S1-F12-T01). A browser that holds no device
// identity offers enrolment: an authorised person signs in, chooses a device that is Setting up, and gives a fresh
// authenticator code; the page makes the key pair, signs the server's challenge and sends the public key. A browser
// that holds one offers the sign-in on that device, with its proof, which gives a shared POS session. No till screen
// yet, and nothing works offline: Workbox, the working set and billing come with the offline counter (S4-F11).

const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
const box: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  maxWidth: 480,
  margin: '32px auto',
  padding: 16,
};

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <label htmlFor={id} style={field}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function Alert({ text }: { text: string }) {
  return (
    <p role="alert" style={{ color: '#a11', margin: '8px 0' }}>
      {text}
    </p>
  );
}

interface Credentials {
  readonly organisationCode: string;
  readonly login: string;
  readonly password: string;
  readonly totpCode: string;
}

/** The sign-in form: Organisation code (unless the device fixes it), login, password and authenticator code. */
function SignInForm({
  title,
  organisationCode,
  onSubmit,
}: {
  title: string;
  organisationCode?: string;
  onSubmit: (credentials: Credentials) => Promise<string | undefined>;
}) {
  const [organisation, setOrganisation] = useState(organisationCode ?? '');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setPending(true);
    void onSubmit({ organisationCode: organisation, login, password, totpCode }).then((refused) => {
      setPending(false);
      setRefusal(refused);
      // The password is never kept on the page after an attempt (PRD-SEC-014).
      setPassword('');
    });
  };
  return (
    <form aria-label={title} onSubmit={submit}>
      <h1>{title}</h1>
      {refusal !== undefined && <Alert text={refusal} />}
      {organisationCode === undefined && (
        <Field id="organisation" label={t('sign-in.organisation')}>
          <input
            id="organisation"
            value={organisation}
            onChange={(event) => {
              setOrganisation(event.target.value);
            }}
          />
        </Field>
      )}
      <Field id="login" label={t('sign-in.login')}>
        <input
          id="login"
          autoComplete="username"
          value={login}
          onChange={(event) => {
            setLogin(event.target.value);
          }}
        />
      </Field>
      <Field id="password" label={t('sign-in.password')}>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
      </Field>
      <Field id="totp" label={t('sign-in.code')}>
        <input
          id="totp"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={totpCode}
          onChange={(event) => {
            setTotpCode(event.target.value);
          }}
        />
      </Field>
      <button type="submit" disabled={pending}>
        {t('sign-in.submit')}
      </button>
    </form>
  );
}

/** Choose a device that is Setting up and enrol this browser as it, with a fresh code (3.2; GC8-8). */
function EnrolForm({ organisationCode, onEnrolled }: { organisationCode: string; onEnrolled: () => void }) {
  const [devices, setDevices] = useState<BillingDeviceView[] | undefined>(undefined);
  const [deviceId, setDeviceId] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  const [enrolled, setEnrolled] = useState<(DeviceEnrolled & { code: string }) | undefined>(undefined);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    void api.call('listBillingDevices', {}).then((answer) => {
      if (answer.ok) setDevices(answer.data.devices.filter((each) => each.state === 'Setting up'));
      else setRefusal(refusalText(answer.error.code));
    });
  }, []);
  const enrol = async (): Promise<void> => {
    const device = devices?.find((each) => each.deviceId === deviceId);
    if (device === undefined) return;
    const pair = await newDeviceKey(organisationCode, deviceId);
    const signed = await signedChallenge(pair.privateKey, 'enrol', organisationCode, deviceId);
    if (signed === undefined) {
      await dropUnboundKey(organisationCode, deviceId);
      setRefusal(t('error.no-answer'));
      return;
    }
    const answer = await api.call('enrolBillingDevice', {
      params: { deviceId },
      body: { publicKey: await publicKeyOf(pair), ...signed, totpCode },
    });
    if (!answer.ok) {
      await dropUnboundKey(organisationCode, deviceId);
      setRefusal(refusalText(answer.error.code));
      return;
    }
    await keepIdentity({ organisationCode, deviceId, code: device.code });
    setEnrolled({ ...answer.data, code: device.code });
  };
  if (enrolled !== undefined) {
    return (
      <section aria-label={t('enrol.title')}>
        <p role="status">{t('enrol.done', { code: enrolled.code })}</p>
        <p>
          {enrolled.series.length > 0
            ? t('enrol.series', { count: enrolled.series.length })
            : t('enrol.series-missing')}
        </p>
        <button type="button" onClick={onEnrolled}>
          {t('sign-in.submit')}
        </button>
      </section>
    );
  }
  return (
    <form
      aria-label={t('enrol.title')}
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        setRefusal(undefined);
        void enrol().finally(() => {
          setPending(false);
        });
      }}
    >
      {refusal !== undefined && <Alert text={refusal} />}
      {devices?.length === 0 && <p>{t('enrol.no-device')}</p>}
      {devices !== undefined && devices.length > 0 && (
        <>
          <Field id="device" label={t('enrol.device')}>
            <select
              id="device"
              value={deviceId}
              onChange={(event) => {
                setDeviceId(event.target.value);
              }}
            >
              <option value="">{t('enrol.choose-device')}</option>
              {devices.map((each) => (
                <option key={each.deviceId} value={each.deviceId}>
                  {`${each.code} · ${each.label}`}
                </option>
              ))}
            </select>
          </Field>
          <Field id="fresh-code" label={t('enrol.fresh-code')}>
            <input
              id="fresh-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={totpCode}
              onChange={(event) => {
                setTotpCode(event.target.value);
              }}
            />
          </Field>
          <button type="submit" disabled={pending || deviceId === '' || totpCode === ''}>
            {t('enrol.submit')}
          </button>
        </>
      )}
    </form>
  );
}

/** Enrolment: sign in with an office session, then enrol (3.2). */
function Enrolment({ onEnrolled }: { onEnrolled: () => void }) {
  const [signedIn, setSignedIn] = useState<{ organisationCode: string; name: string } | undefined>(undefined);
  return (
    <main style={box}>
      <h1>{t('enrol.title')}</h1>
      <p>{t('enrol.intro')}</p>
      {signedIn === undefined ? (
        <SignInForm
          title={t('sign-in.office-title')}
          onSubmit={async ({ organisationCode, login, password, totpCode }) => {
            const answer = await api.call('signIn', { body: { organisationCode, login, password, totpCode } });
            if (!answer.ok) return refusalText(answer.error.code);
            if (answer.data.outcome !== 'signed-in') return t('sign-in.not-finished');
            const session = await api.call('session', {});
            setSignedIn({ organisationCode, name: session.ok ? session.data.displayName : login });
            return undefined;
          }}
        />
      ) : (
        <>
          <p>{t('enrol.signed-in-as', { name: signedIn.name })}</p>
          <EnrolForm organisationCode={signedIn.organisationCode} onEnrolled={onEnrolled} />
        </>
      )}
    </main>
  );
}

/** Sign-in on the device this browser holds, with its proof: a shared POS session (3.3, 3.4; POL-02.18). */
function DeviceSignIn({ held }: { held: DeviceIdentity }) {
  const [signedIn, setSignedIn] = useState<string | undefined>(undefined);
  if (signedIn !== undefined) {
    return (
      <main style={box}>
        <p role="status">{t('sign-in.on-device', { code: signedIn })}</p>
      </main>
    );
  }
  return (
    <main style={box}>
      <SignInForm
        title={t('sign-in.title', { code: held.code })}
        organisationCode={held.organisationCode}
        onSubmit={async ({ login, password, totpCode }) => {
          const key = await deviceKey(held.organisationCode, held.deviceId);
          if (key === undefined) return t('error.access.device-not-found');
          const signed = await signedChallenge(key, 'sign-in', held.organisationCode, held.deviceId);
          if (signed === undefined) return t('error.no-answer');
          const answer = await api.call('signIn', {
            body: {
              organisationCode: held.organisationCode,
              login,
              password,
              totpCode,
              device: { deviceId: held.deviceId, ...signed },
            },
          });
          if (!answer.ok) return refusalText(answer.error.code);
          if (answer.data.outcome !== 'signed-in') return t('sign-in.not-finished');
          const session = await api.call('session', {});
          setSignedIn(session.ok ? (session.data.device?.code ?? held.code) : held.code);
          return undefined;
        }}
      />
    </main>
  );
}

/** The counter: enrolment until this browser holds a device identity, then the sign-in on that device. */
export function App() {
  const [held, setHeld] = useState<DeviceIdentity[] | undefined>(undefined);
  const load = () => {
    void identities().then(setHeld);
  };
  useEffect(load, []);
  if (held === undefined) return null;
  const [first] = held;
  return first === undefined ? <Enrolment onEnrolled={load} /> : <DeviceSignIn held={first} />;
}
