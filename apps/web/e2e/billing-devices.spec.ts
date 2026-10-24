import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signedIn, signIn } from './support/journey';
import { watchSecurityPolicy } from './support/security-policy';
import { readWorld } from './support/world';

// S1-F12-T01: the Admin's journey on Setup › Devices, tills and bill series (offline-counter 3.1, 3.2 step 1, 12.1,
// 14.1 test 12 in part; PRD-OFF-002, PRD-ORG-005, PRD-UXP-003, POL-02.03). The Admin registers a SYNTHETIC billing
// device for a Store, choosing only that Store's whole-store and brand-counter units; it shows Setting up, with its
// units, and no series until it is enrolled in the counter app. Registering the same code again is refused with its
// reason. S1-F12-T02 adds the rest of test 12: the Admin enrols a device in the counter app served at /counter/ from the
// one origin, under its security policy (RR-420), changes its units, revokes it after confirming, retires another and
// replaces a third, whose new code must be free (offline-counter 3.5, 12.1). Each action's refusal shows its reason:
// the same units again and another Store's unit, sent as a tampered page would send it; revoking or retiring from a page
// opened before the revocation; a replacement code taken. Every value is SYNTHETIC.

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

test('PRD-OFF-010 PRD-SEC-008 PRD-UXP-003 GC-8 test 12 the Admin enrols a device at /counter/, changes its units, revokes it, retires one and replaces another; each refusal shows its reason', async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().devices;
  const [whole, counterUnit, elsewhere] = world.units;
  if (whole === undefined || counterUnit === undefined || elsewhere === undefined) throw new Error('Three units');
  const app = new Authenticator(Buffer.from(world.lifecycleAdmin.factorSecretHex, 'hex'));
  const stamp = String(Date.now());
  const first = `SYN-JOURNEY-LOST-${stamp}`;
  const second = `SYN-JOURNEY-OLD-${stamp}`;
  const third = `SYN-JOURNEY-DONE-${stamp}`;
  const replacement = `SYN-JOURNEY-NEW-${stamp}`;
  const toDevices = async (on: Page) => {
    await on
      .getByRole('navigation', { name: 'Main menu' })
      .getByRole('link', { name: 'Devices, tills and bill series', exact: true })
      .click();
    await expect(on.getByRole('heading', { level: 1, name: 'Devices, tills and bill series' })).toBeVisible();
  };
  await page.goto('/');
  await signIn(page, {
    code: world.organisationCode,
    login: world.lifecycleAdmin.login,
    password: world.lifecycleAdmin.password,
    totp: await app.nextCode(),
  });
  await toDevices(page);
  for (const code of [first, second, third]) {
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

  await test.step('PRD-ORG-005 the Admin changes the Active device’s units from tomorrow; the same list and another Store’s unit are refused with their reasons', async () => {
    await page.getByRole('button', { name: 'Refresh' }).click();
    const device = page.getByRole('listitem', { name: `Device ${first}` });
    await expect(device).toContainText('Active');
    await device.getByRole('button', { name: 'Change units' }).click();
    const from = device.getByLabel('From', { exact: true });
    const today = await from.getAttribute('min');
    if (today === null) throw new Error('The date field names today');
    const tomorrow = new Date(`${today}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await from.fill(tomorrow.toISOString().slice(0, 10));
    const change = device.getByRole('button', { name: 'Change units' });
    await change.click();
    await expect(device.getByRole('alert')).toContainText('These are the units it bills for on that date already.');
    // The screen offers only the Store's own units; the request is sent with another Store's unit added, as a
    // tampered or stale page might send it, so the server's refusal and its reason show (PRD-ORG-005, PRD-UXP-003).
    const units = (await (await page.request.get('/api/organisation/business-units')).json()) as {
      records: { id: string; code: string }[];
    };
    const otherStore = units.records.find((unit) => unit.code === elsewhere.code)?.id;
    if (otherStore === undefined) throw new Error('The other Store’s unit');
    await page.route('**/api/pos/billing-devices/*/units', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as { businessUnitIds: string[] };
      await route.continue({
        postData: JSON.stringify({ ...body, businessUnitIds: [...body.businessUnitIds, otherStore] }),
      });
    });
    await change.click();
    await expect(device.getByRole('alert')).toContainText(
      'A device bills only for whole-store and brand-counter units of its own Store.',
    );
    await expect(device.getByRole('alert')).toContainText(`Business unit ${elsewhere.code}`);
    await page.unroute('**/api/pos/billing-devices/*/units');
    await device.getByLabel(new RegExp(counterUnit.code)).check();
    await change.click();
    await expect(device.getByRole('status').filter({ hasText: 'Units changed.' })).toBeVisible();
  });

  // A second page of the same Admin, opened before the device is revoked, still offers Revoke and Retire on it.
  const stale = await context.newPage();
  await stale.goto('/');
  await toDevices(stale);
  const staleDevice = stale.getByRole('listitem', { name: `Device ${first}` });
  await staleDevice.getByRole('button', { name: 'Revoke (lost)' }).click();
  await staleDevice.getByRole('button', { name: 'Retire' }).click();

  await test.step('PRD-SEC-008 the Admin revokes the lost device after confirming; it shows Revoked and offers nothing more', async () => {
    const device = page.getByRole('listitem', { name: `Device ${first}` });
    await device.getByRole('button', { name: 'Revoke (lost)' }).click();
    await expect(device).toContainText('This cannot be undone');
    await device.getByRole('button', { name: 'Revoke device' }).click();
    await expect(device).toContainText('Revoked');
    await expect(device.getByRole('button', { name: 'Revoke (lost)' })).toHaveCount(0);
  });

  await test.step('PRD-OFF-010 revoking or retiring it again, from the page opened before, is refused with its reason', async () => {
    await staleDevice.getByRole('button', { name: 'Revoke device' }).click();
    await expect(staleDevice.getByRole('alert').first()).toContainText(
      'This device is revoked or retired already, which is final.',
    );
    await staleDevice.getByRole('button', { name: 'Retire device' }).click();
    await expect(staleDevice.getByRole('alert')).toHaveCount(2);
    await expect(staleDevice.getByRole('alert').nth(1)).toContainText(
      'This device is revoked or retired already, which is final.',
    );
    await stale.close();
  });

  await test.step('PRD-OFF-010 the Admin retires a device after confirming; it shows Ended and offers nothing more', async () => {
    const device = page.getByRole('listitem', { name: `Device ${third}` });
    await device.getByRole('button', { name: 'Retire' }).click();
    await expect(device).toContainText('This cannot be undone');
    await device.getByRole('button', { name: 'Retire device' }).click();
    await expect(device).toContainText('Ended');
    await expect(device.getByRole('button', { name: 'Retire' })).toHaveCount(0);
  });

  await test.step('PRD-OFF-010 the Admin replaces a device: a code taken is refused with its reason; then the old one Ended, the new one Setting up for the same units', async () => {
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
