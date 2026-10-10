import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { watchSecurityPolicy } from './support/security-policy';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F12-T01: the Admin's journey on Setup › Devices, tills and bill series (offline-counter 3.1, 3.2 step 1, 12.1,
// 14.1 test 12 in part; PRD-OFF-002, PRD-ORG-005, PRD-UXP-003, POL-02.03). The Admin registers a SYNTHETIC billing
// device for a Store, choosing only that Store's whole-store and brand-counter units; it shows Setting up, with its
// units, and no series until it is enrolled in the counter app. Registering the same code again is refused with its
// reason. S1-F12-T02 adds the rest of test 12: the Admin enrols a device in the counter app served at /counter/ from the
// one origin, under its security policy (RR-420), revokes it after confirming, and replaces another, whose new code must
// be free (offline-counter 3.5). Every value is SYNTHETIC.

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<void> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
}

test('PRD-OFF-002 PRD-ORG-005 the Admin registers a billing device for a Store and its units; a code already taken is refused with its reason', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const world = readWorld().devices;
  const [whole, counter, elsewhere] = world.units;
  if (whole === undefined || counter === undefined || elsewhere === undefined) throw new Error('Three units');
  const code = `SYN-JOURNEY-TILL-${String(Date.now())}`;
  await signedIn(page, world.organisationCode, world.admin);
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'Devices, tills and bill series', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Devices, tills and bill series' })).toBeVisible();

  await test.step('only the chosen Store’s selling units are offered, and nothing registers until all is stated', async () => {
    const register = page.getByRole('button', { name: 'Register device' });
    await expect(register).toBeDisabled();
    await page.getByLabel('Device code').fill(code);
    await page.getByLabel('Label', { exact: true }).fill('SYNTHETIC front till');
    await page.getByRole('combobox', { name: /^Store/ }).selectOption({ label: world.otherStoreOption });
    await expect(page.getByLabel(new RegExp(elsewhere.code))).toBeVisible();
    await page.getByRole('combobox', { name: /^Store/ }).selectOption({ label: world.storeOption });
    await expect(page.getByLabel(new RegExp(elsewhere.code))).toHaveCount(0);
    await expect(register).toBeDisabled();
    await page.getByLabel(new RegExp(whole.code)).check();
    await page.getByLabel(new RegExp(counter.code)).check();
    await expect(register).toBeEnabled();
    await register.click();
    await expect(page.getByRole('status').filter({ hasText: 'Registered.' })).toBeVisible();
  });

  await test.step('the device shows Setting up, with its units and no series until it is enrolled', async () => {
    const device = page.getByRole('listitem', { name: `Device ${code}` });
    await expect(device).toContainText('Setting up');
    await expect(device).toContainText(whole.code);
    await expect(device).toContainText(counter.code);
    await expect(device).toContainText('Its bill series are defined when it is enrolled.');
  });

  await test.step('the same code again is refused, naming why', async () => {
    await page.getByLabel('Device code').fill(code.toLowerCase());
    await page.getByLabel('Label', { exact: true }).fill('SYNTHETIC second till');
    await page.getByLabel(new RegExp(whole.code)).check();
    await page.getByRole('button', { name: 'Register device' }).click();
    await expect(page.getByRole('alert')).toContainText('Another device already has this code.');
  });
});

test('PRD-OFF-010 PRD-SEC-008 GC-8 test 12 the Admin enrols a device at /counter/ on the one origin, then revokes it, and replaces another', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const world = readWorld().devices;
  const [whole] = world.units;
  if (whole === undefined) throw new Error('A unit');
  const app = new Authenticator(Buffer.from(world.lifecycleAdmin.factorSecretHex, 'hex'));
  const stamp = String(Date.now());
  const first = `SYN-JOURNEY-LOST-${stamp}`;
  const second = `SYN-JOURNEY-OLD-${stamp}`;
  const replacement = `SYN-JOURNEY-NEW-${stamp}`;
  await page.goto('/');
  await signIn(page, {
    code: world.organisationCode,
    login: world.lifecycleAdmin.login,
    password: world.lifecycleAdmin.password,
    totp: await app.nextCode(),
  });
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'Devices, tills and bill series', exact: true })
    .click();
  for (const code of [first, second]) {
    await page.getByLabel('Device code').fill(code);
    await page.getByLabel('Label', { exact: true }).fill(`SYNTHETIC till ${code}`);
    await page.getByRole('combobox', { name: /^Store/ }).selectOption({ label: world.storeOption });
    await page.getByLabel(new RegExp(whole.code)).check();
    await page.getByRole('button', { name: 'Register device' }).click();
    await expect(page.getByRole('listitem', { name: `Device ${code}` })).toContainText('Setting up');
  }

  await test.step('RR-420 the counter at /counter/ loads under the one-origin security policy and enrols the device', async () => {
    const counter = await context.newPage();
    const violations = watchSecurityPolicy(counter);
    const response = await counter.goto('/counter/');
    expect(response?.status()).toBe(200);
    expect(response?.headers()['cache-control']).toBe('no-store');
    expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
    await expect(counter.getByRole('heading', { name: 'Enrol this browser as a billing device' })).toBeVisible();
    await counter.getByLabel('Organisation code').fill(world.organisationCode);
    await counter.getByLabel('Login').fill(world.lifecycleAdmin.login);
    await counter.getByLabel('Password').fill(world.lifecycleAdmin.password);
    await counter.getByLabel('Authenticator code').fill(await app.nextCode());
    await counter.getByRole('button', { name: 'Sign in' }).click();
    await counter
      .getByRole('combobox', { name: /^Device/ })
      .selectOption({ label: `${first} · SYNTHETIC till ${first}` });
    await counter.getByLabel('Fresh authenticator code').fill(await app.nextCode());
    await counter.getByRole('button', { name: 'Enrol this browser' }).click();
    await expect(counter.getByRole('status')).toHaveText(`This browser is now device ${first}.`);
    // The golden-case test page is the counter run's, never the deployed service's (offline-counter 5.2).
    expect((await counter.request.get('/counter/golden/')).status()).toBe(404);
    expect(violations()).toEqual([]);
    await counter.close();
  });

  await test.step('PRD-SEC-008 the Admin revokes the lost device after confirming; it shows Revoked and offers nothing more', async () => {
    await page.getByRole('button', { name: 'Refresh' }).click();
    const device = page.getByRole('listitem', { name: `Device ${first}` });
    await expect(device).toContainText('Active');
    await device.getByRole('button', { name: 'Revoke (lost)' }).click();
    await expect(device).toContainText('This cannot be undone');
    await device.getByRole('button', { name: 'Revoke device' }).click();
    await expect(device).toContainText('Revoked');
    await expect(device.getByRole('button', { name: 'Revoke (lost)' })).toHaveCount(0);
  });

  await test.step('PRD-OFF-010 the Admin replaces a device: the old one Ended, the new one Setting up for the same units', async () => {
    const old = page.getByRole('listitem', { name: `Device ${second}` });
    await old.getByRole('button', { name: 'Replace' }).click();
    await old
      .getByRole('combobox', { name: 'The old device' })
      .selectOption({ label: 'Retire it: it is taken out of use' });
    await old.getByLabel('New device code').fill(second);
    await old.getByLabel('New device label').fill('SYNTHETIC replacement till');
    await old.getByRole('button', { name: 'Replace device' }).click();
    await expect(old.getByRole('alert')).toContainText('Another device already has this code.');
    await old.getByLabel('New device code').fill(replacement);
    await old.getByRole('button', { name: 'Replace device' }).click();
    await expect(old).toContainText('Ended');
    const fresh = page.getByRole('listitem', { name: `Device ${replacement}` });
    await expect(fresh).toContainText('Setting up');
    await expect(fresh).toContainText(whole.code);
    await expect(fresh).toContainText('Replaces an earlier device.');
  });
});
