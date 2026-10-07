import { expect, test, type Locator, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F01-T25: changing an essential security setting after setup (design-language 10.19; access-and-approvals 3.3,
// 9.11; POL-02.06, POL-02.07; DEC-118, RR-334). The Admin prepares a new version of the office session limits on Setup ›
// Security settings; the approver opens it from My work, reads the proposed values on the approval panel and approves
// it with a listed reason and a fresh code; the screen then shows the new version in force. Each holds only the role
// the setup step gives the first Admin or the first approver (DEC-120, RR-402). Every value is SYNTHETIC.

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

function sessionLimits(page: Page): Locator {
  return page.getByRole('region', { name: 'Office session limits' });
}

async function openSecuritySettings(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Security settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Security settings' })).toBeVisible();
}

test('POL-02.07 DEC-118 the Admin prepares a session-limit change and the approver approves it from My work', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const world = readWorld().settings;
  const adminContext = await browser.newContext();
  const approverContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const approver = await approverContext.newPage();
  try {
    await test.step('design-language 6 D (S1-F01-T32): at 375 px the top bar holds the menu, the logo slot and My work, and the profile is at the bottom of the drawer', async () => {
      await signedIn(admin, world.organisationCode, world.admin);
      await admin.setViewportSize({ width: 375, height: 812 });
      const topBar = admin.getByTestId('top-bar');
      await expect(topBar.getByRole('button', { name: 'Open menu' })).toBeVisible();
      await expect(topBar.getByRole('link', { name: /^My work/ })).toBeVisible();
      await expect(topBar.getByText(world.admin.displayName)).toBeHidden();
      const fits = await admin.evaluate(() => {
        const bar = document.querySelector('[data-testid="top-bar"]');
        return {
          sideways: document.documentElement.scrollWidth - window.innerWidth,
          overflow: bar === null ? -1 : bar.scrollWidth - bar.clientWidth,
          height: bar?.getBoundingClientRect().height ?? -1,
        };
      });
      expect(fits).toEqual({ sideways: 0, overflow: 0, height: 56 });
      await topBar.getByRole('button', { name: 'Open menu' }).click();
      const profile = admin.getByTestId('drawer-profile');
      await expect(profile.getByText(world.admin.displayName)).toBeVisible();
      await expect(profile.getByRole('button', { name: 'Sign out' })).toBeVisible();
      const drawerBox = await admin.getByRole('navigation', { name: 'Main menu' }).boundingBox();
      const profileBox = await profile.boundingBox();
      expect((profileBox?.y ?? 0) > (drawerBox?.y ?? 0)).toBe(true);
      await topBar.getByRole('button', { name: 'Close menu' }).click();
      await admin.setViewportSize({ width: 1280, height: 720 });
      await expect(admin.getByLabel('Profile')).toHaveText(world.admin.displayName);
    });

    await test.step('the Admin prepares a new version of the office session limits', async () => {
      await openSecuritySettings(admin);
      await expect(sessionLimits(admin).getByText('1800', { exact: true })).toBeVisible();
      await sessionLimits(admin).getByRole('button', { name: 'Prepare a new version' }).click();
      const drawer = admin.getByRole('dialog', { name: 'Office session limits' });
      await expect(drawer).toBeVisible();
      await drawer.getByLabel(/^Idle lock \(seconds\)/).fill('1200');
      await drawer.getByLabel(/^Where the values come from/).selectOption({ label: 'Synthetic' });
      // design-language 8, 10.7 (S1-F01-T34): a start before the Organisation's today says so below the field, on blur.
      await drawer.getByLabel(/^Takes effect/).selectOption({ label: 'From a later day' });
      const starts = drawer.getByLabel(/^Starts on/);
      await starts.fill('2020-01-01');
      await starts.blur();
      await expect(drawer.getByText('The start date is in the past. Choose today or a later date.')).toBeVisible();
      await drawer.getByLabel(/^Takes effect/).selectOption({ label: 'When approved' });
      await drawer.getByRole('button', { name: 'Request approval' }).click();
      await expect(drawer.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
      await admin.keyboard.press('Escape');
    });

    await test.step('the approver approves it from My work with a listed reason and a fresh code', async () => {
      const app = await signedIn(approver, world.organisationCode, world.approver);
      await expect(approver.getByRole('heading', { level: 1, name: 'My work' })).toBeVisible();
      await expect(async () => {
        await approver.getByRole('button', { name: 'Refresh' }).click();
        await expect(approver.getByRole('button', { name: 'Open and decide' })).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 30_000 });
      await approver.getByRole('button', { name: 'Open and decide' }).click();
      const drawer = approver.getByRole('dialog');
      await expect(drawer.getByRole('heading', { name: 'Security setting change' })).toBeVisible();
      await expect(drawer.getByText('1200', { exact: true })).toBeVisible();
      await drawer.getByLabel(/^Reason/).selectOption({ index: 1 });
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
      await approver.keyboard.press('Escape');
    });

    await test.step('the new version is in force', async () => {
      await openSecuritySettings(approver);
      await expect(sessionLimits(approver).getByText('1200', { exact: true })).toBeVisible();
    });
  } finally {
    await adminContext.close();
    await approverContext.close();
  }
});
