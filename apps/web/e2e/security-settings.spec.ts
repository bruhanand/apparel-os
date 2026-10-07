import { expect, test, type Locator, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F01-T25: changing an essential security setting after setup (design-language 10.19; access-and-approvals 3.3,
// 9.11; POL-02.06, POL-02.07; DEC-118, RR-334). The Admin prepares a new version of the office session limits on Setup ›
// Security settings; the approver opens it from My work, reads the proposed values on the approval panel and approves
// it with a listed reason and a fresh code; the screen then shows the new version in force. Every value is SYNTHETIC.

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
    await test.step('the Admin prepares a new version of the office session limits', async () => {
      await signedIn(admin, world.organisationCode, world.admin);
      await openSecuritySettings(admin);
      await expect(sessionLimits(admin).getByText('1800', { exact: true })).toBeVisible();
      await sessionLimits(admin).getByRole('button', { name: 'Prepare a new version' }).click();
      const drawer = admin.getByRole('dialog', { name: 'Office session limits' });
      await expect(drawer).toBeVisible();
      await drawer.getByLabel(/^Idle lock \(seconds\)/).fill('1200');
      await drawer.getByLabel(/^Where the values come from/).selectOption({ label: 'Synthetic' });
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
      // The approver holds no view on users, so the panel names people by their identifiers (access-and-approvals 9.3).
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
