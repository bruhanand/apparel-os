import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F12-T03: the financial year and the bill-number format on Setup › Devices, tills and bill series (offline-counter
// 4.1, 4.3b; numbering-and-audit 3.3, 3.5; PRD-ACS-006, PRD-POS-020, PRD-UXP-003, POL-10.07; DEC-116, DEC-117). The
// Admin enrols a device in the counter app while neither is set, so it has no series; prepares a financial year and,
// after a format without the device code is refused with its reason, a bill-number format; a different person approves
// both from My work, reading what each sets on the approval panel; the device then shows its Open series for the year.
// Every year, format and person is SYNTHETIC.

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

async function toDevices(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'Devices, tills and bill series', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Devices, tills and bill series' })).toBeVisible();
}

/** A business date so many days from today, as the date field takes it. */
function day(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

test('PRD-ACS-006 DEC-117 the Admin prepares a financial year and a bill-number format; a different person approves both from My work, and a device enrolled before gets its series', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().devices;
  const [whole] = world.units;
  if (whole === undefined) throw new Error('A unit');
  const stamp = String(Date.now());
  const device = `SYN-JOURNEY-NUMBERED-${stamp}`;
  const year = `SYN-FY-${stamp}`;
  const format = `SYN-BILL-${stamp}`;
  const adminContext = await browser.newContext();
  const approverContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const approver = await approverContext.newPage();
  try {
    const app = await signedIn(admin, world.organisationCode, world.numberingAdmin);
    await toDevices(admin);

    await test.step('DEC-116 a device enrolled at /counter/ before the year and the format has no series', async () => {
      await admin.getByLabel('Device code').fill(device);
      await admin.getByLabel('Label', { exact: true }).fill(`SYNTHETIC till ${device}`);
      await admin.getByRole('combobox', { name: /^Store/ }).selectOption({ label: world.storeOption });
      await admin.getByLabel(new RegExp(whole.code)).check();
      await admin.getByRole('button', { name: 'Register device' }).click();
      await expect(admin.getByRole('listitem', { name: `Device ${device}` })).toContainText('Setting up');
      const counter = await adminContext.newPage();
      await counter.goto('/counter/');
      await counter.getByLabel('Organisation code').fill(world.organisationCode);
      await counter.getByLabel('Login').fill(world.numberingAdmin.login);
      await counter.getByLabel('Password').fill(world.numberingAdmin.password);
      await counter.getByLabel('Authenticator code').fill(await app.nextCode());
      await counter.getByRole('button', { name: 'Sign in' }).click();
      await counter
        .getByRole('combobox', { name: /^Device/ })
        .selectOption({ label: `${device} · SYNTHETIC till ${device}` });
      await counter.getByLabel('Fresh authenticator code').fill(await app.nextCode());
      await counter.getByRole('button', { name: 'Enrol this browser' }).click();
      await expect(counter.getByRole('status')).toHaveText(`This browser is now device ${device}.`);
      await counter.close();
      await admin.getByRole('button', { name: 'Refresh' }).click();
      const row = admin.getByRole('listitem', { name: `Device ${device}` });
      await expect(row).toContainText('Active');
      await expect(row).toContainText('No bill series yet');
    });

    await test.step('the Admin prepares a financial year, stating its label, dates and origin', async () => {
      await admin.getByRole('button', { name: 'Define a financial year' }).click();
      const form = admin.getByRole('group', { name: 'Define a financial year' });
      const request = form.getByRole('button', { name: 'Request approval' });
      await expect(request).toBeDisabled();
      await form.getByLabel('Year label').fill(year);
      await form.getByLabel('First day').fill(day(-180));
      await form.getByLabel('Last day').fill(day(180));
      await form.getByLabel('Where the values come from').selectOption({ label: 'Synthetic' });
      await request.click();
      await expect(form.getByRole('status')).toContainText('Sent for approval');
    });

    await test.step('PRD-UXP-003 a format without the device code is refused with its reason; one with it is sent for approval', async () => {
      await admin.getByRole('button', { name: 'Prepare a new format' }).click();
      const form = admin.getByRole('group', { name: 'Prepare a new format' });
      await form.getByLabel('Format code').fill(format);
      await form.getByLabel('Where the values come from').selectOption({ label: 'Synthetic' });
      await form.getByRole('button', { name: 'Add part' }).click();
      await form.getByLabel('Text of part 1').fill('SYN/');
      await form.getByRole('button', { name: 'Add part' }).click();
      await form.getByRole('combobox', { name: /^Part 2/ }).selectOption({ label: 'Sequence number' });
      await form.getByLabel('Digits of part 2').fill('5');
      await form.getByRole('button', { name: 'Request approval' }).click();
      await expect(form.getByRole('alert')).toContainText('must show the device code');
      await form.getByRole('combobox', { name: /^Part 2/ }).selectOption({ label: 'Device code' });
      await form.getByRole('button', { name: 'Add part' }).click();
      await form.getByLabel('Text of part 3').fill('/');
      await form.getByRole('button', { name: 'Add part' }).click();
      await form.getByRole('combobox', { name: /^Part 4/ }).selectOption({ label: 'Sequence number' });
      await form.getByLabel('Digits of part 4').fill('5');
      await form.getByRole('button', { name: 'Request approval' }).click();
      await expect(form.getByRole('status')).toContainText('Sent for approval');
      // Nothing is in force yet: the device still has no series.
      await admin.getByRole('button', { name: 'Refresh' }).click();
      await expect(admin.getByRole('listitem', { name: `Device ${device}` })).toContainText('No bill series yet');
    });

    await test.step('PRD-ACS-006 a different person approves both from My work, reading what each sets', async () => {
      const code = await signedIn(approver, world.organisationCode, world.numberingApprover);
      await expect(approver.getByRole('heading', { level: 1, name: 'My work' })).toBeVisible();
      for (const [title, fact] of [
        ['Financial year', year],
        ['Bill-number format', format],
      ] as const) {
        const item = approver.getByRole('listitem').filter({ hasText: title });
        await expect(async () => {
          await approver.getByRole('button', { name: 'Refresh' }).click();
          await expect(item.getByRole('button', { name: 'Open and decide' })).toHaveCount(1, { timeout: 1_000 });
        }).toPass({ timeout: 30_000 });
        await item.getByRole('button', { name: 'Open and decide' }).click();
        const drawer = approver.getByRole('dialog');
        await expect(drawer.getByRole('heading', { name: title })).toBeVisible();
        await expect(drawer.getByText(fact, { exact: true })).toBeVisible();
        await drawer.getByLabel(/^Reason/).selectOption({ index: 1 });
        await drawer.getByLabel(/^Authenticator code/).fill(await code.nextCode());
        await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
        await expect(drawer.getByText(/^Approved by /)).toBeVisible();
        await approver.keyboard.press('Escape');
      }
    });

    await test.step('DEC-117 the device enrolled before now holds its Open series for the year; both settings show in force', async () => {
      await admin.getByRole('button', { name: 'Refresh' }).click();
      const row = admin.getByRole('listitem', { name: `Device ${device}` });
      await expect(async () => {
        await admin.reload();
        await expect(row).toContainText(year, { timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
      await expect(row).toContainText('Open');
      await expect(admin.getByRole('list', { name: 'Financial years' })).toContainText(year);
      await expect(admin.getByText(`In force: ${format}`)).toBeVisible();
    });
  } finally {
    await adminContext.close();
    await approverContext.close();
  }
});
