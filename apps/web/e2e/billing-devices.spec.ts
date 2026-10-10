import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F12-T01: the Admin's journey on Setup › Devices, tills and bill series (offline-counter 3.1, 3.2 step 1, 12.1,
// 14.1 test 12 in part; PRD-OFF-002, PRD-ORG-005, PRD-UXP-003, POL-02.03). The Admin registers a SYNTHETIC billing
// device for a Store, choosing only that Store's whole-store and brand-counter units; it shows Setting up, with its
// units, and no series until it is enrolled in the counter app. Registering the same code again is refused with its
// reason. Revoke, retire and replace, and the rest of test 12, come with S1-F12-T02. Every value is SYNTHETIC.

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
