// The counter's screen text, English first (code-house-rules 12.13; AGENTS.md "Delivery": Hindi arrives in stage 5).
// Every word the enrolment and sign-in pages show comes from here; a refusal is shown by its code's message.

const messages = {
  'counter.title': 'Apparel OS counter',
  'enrol.title': 'Enrol this browser as a billing device',
  'enrol.intro':
    'Sign in as a person allowed to enrol devices, choose the device registered for this till in Setup › Devices, tills and bill series, and give a fresh authenticator code. The device key is made in this browser and never leaves it.',
  'enrol.device': 'Device',
  'enrol.choose-device': 'Choose a device that is Setting up',
  'enrol.no-device': 'No device is Setting up. Register one in Setup › Devices, tills and bill series first.',
  'enrol.fresh-code': 'Fresh authenticator code',
  'enrol.submit': 'Enrol this browser',
  'enrol.done': 'This browser is now device {code}.',
  'enrol.series': 'Bill series: {count}',
  'enrol.series-missing':
    'No bill series yet: the bill-number format or the financial year is not set. They are defined when it is.',
  'enrol.signed-in-as': 'Signed in as {name}.',
  'sign-in.title': 'Sign in on device {code}',
  'sign-in.office-title': 'Sign in',
  'sign-in.organisation': 'Organisation code',
  'sign-in.login': 'Login',
  'sign-in.password': 'Password',
  'sign-in.code': 'Authenticator code',
  'sign-in.submit': 'Sign in',
  'sign-in.on-device': 'Signed in on device {code}: a shared POS session.',
  'sign-in.not-finished': 'Finish your first sign-in in the back office, then come back.',
  'error.no-answer': 'No answer from the server. Try again.',
  'error.access.sign-in-refused': 'Sign-in refused. Check every part and try again.',
  'error.access.sign-in-slowed': 'Too many tries. Wait a while, then try again.',
  'error.access.sign-in-unavailable': 'Sign-in is not available yet: a setting is missing.',
  'error.access.authenticator-code-refused': 'That authenticator code is not fresh. Wait for the next one.',
  'error.access.not-authorised': 'Your role assignments do not allow this.',
  'error.access.device-already-enrolled': 'This device is enrolled already. A new key needs a new device.',
  'error.access.device-proof-refused': 'The device could not prove itself. Try again.',
  'error.access.device-not-found': 'This device is not registered.',
  'error.other': 'Refused: {code}',
} as const;

export type MessageId = keyof typeof messages;

/** A message with its `{name}` parts filled in. */
export function t(id: MessageId, values: Readonly<Record<string, string | number>> = {}): string {
  return messages[id].replace(/\{([a-z]+)\}/g, (_match, name: string) => String(values[name] ?? ''));
}

/** The message of a refusal's code, or the code itself named plainly. */
export function refusalText(code: string | undefined): string {
  if (code === undefined) return t('error.no-answer');
  const id = `error.${code}`;
  return id in messages ? t(id as MessageId) : t('error.other', { code });
}
