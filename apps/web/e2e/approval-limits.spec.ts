import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { organisationToday, signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F05-T01: approval limits and routing (access-and-approvals 9.2 to 9.5, 14; design-language 10.14; POL-02.07,
// POL-02.09, POL-02.15, PRD-ACS-006, PRD-ACS-015, PRD-ACS-016; DEC-116). An Admin prepares a SYNTHETIC limit for the
// booking approver's role, a test-only action limited on cost; a different authorised person approves it from My work;
// the booking approver then opens a SYNTHETIC booking within it and sees its value, basis and limit, and one above
// every limit, which says "No approver set up", with Approve disabled and no action to send it on. Every value is
// SYNTHETIC: the real limits and their holders are KDPS's (V-02).

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

async function openScreen(page: Page, name: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** Refreshes My work until it lists `count` items with the text given (the worker publishes them; module-map 4.8). */
async function waitForItems(page: Page, text: string | RegExp, count: number): Promise<void> {
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: text })).toHaveCount(count, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}

test('POL-02.09 PRD-ACS-015 a limit approved by another person lets its holder approve within it, never above every limit', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().limits;
  const adminContext = await browser.newContext();
  const approverContext = await browser.newContext();
  const bookingContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const approver = await approverContext.newPage();
  const booking = await bookingContext.newPage();
  try {
    await test.step('POL-02.15: the Admin prepares a SYNTHETIC limit for a role, with the basis beside it', async () => {
      await signedIn(admin, world.organisationCode, world.admin);
      await openScreen(admin, 'Approval limits');
      await admin.getByRole('button', { name: 'New approval limit' }).click();
      const drawer = admin.getByRole('dialog', { name: 'New approval limit' });
      await drawer.getByLabel(/^Action/).selectOption({ label: world.actionOption });
      await expect(drawer.getByText('The limit is on cost, the basis of this action’s approval rule.')).toBeVisible();
      await drawer.getByLabel(/^Role/).selectOption({ label: world.roleOption });
      await drawer.getByLabel(/^Limit in rupees/).fill('2000');
      await drawer.getByLabel(/^Where the values come from/).selectOption('synthetic');
      await drawer.getByLabel(/^Starts on/).fill(organisationToday());
      await drawer.getByTestId('drawer-footer').getByRole('button', { name: 'Request approval' }).click();
      await expect(drawer.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
      await admin.keyboard.press('Escape');
      const row = admin.getByRole('row').filter({ hasText: world.roleOption.split(' · ')[0] ?? '' });
      await expect(row).toContainText('₹2,000.00 on cost');
      await expect(row).toContainText('Awaiting approval');
    });

    await test.step('POL-02.07: a different authorised person approves it from My work', async () => {
      const app = await signedIn(approver, world.organisationCode, world.approver);
      await waitForItems(approver, 'Approval limit change', 1);
      await approver
        .getByRole('listitem')
        .filter({ hasText: 'Approval limit change' })
        .getByRole('button', { name: 'Open and decide' })
        .click();
      const drawer = approver.getByRole('dialog');
      // The limit decided, with its basis beside it; a limit change has no value of its own (DM-8).
      await expect(drawer.getByText('₹2,000.00 on cost')).toBeVisible();
      await expect(drawer.getByText('No value: an access change has none, so no approval limit applies')).toBeVisible();
      await drawer.getByLabel(/^Reason/).selectOption(world.reasonId);
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
    });

    await test.step('PRD-ACS-015: the booking approver opens a request within the limit: value, basis and limit', async () => {
      await signedIn(booking, world.organisationCode, world.bookingApprover);
      // Both requests are listed: the one within the limit offered to its holder (9.4), and the one above every
      // limit, which stays with those who would decide it.
      await waitForItems(booking, /approve-booking/, 2);
      await booking.getByRole('button', { name: 'Open and decide' }).first().click();
      const drawer = booking.getByRole('dialog');
      await expect(drawer.getByText('₹1,500.00 (cost)')).toBeVisible();
      const limit = drawer.getByTestId('approval-limit');
      await expect(limit.getByText('₹0.00 · Your limit up to ₹2,000.00')).toBeVisible();
      await expect(limit.getByText('Within your limit. You didn’t prepare this, so you can approve.')).toBeVisible();
      await expect(drawer.getByLabel(/^Authenticator code/)).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
      await booking.keyboard.press('Escape');
    });

    await test.step('POL-02.09 DEC-116: above every limit, "No approver set up", Approve disabled, no send-on action', async () => {
      await booking.getByRole('button', { name: 'Open and decide' }).nth(1).click();
      const drawer = booking.getByRole('dialog');
      await expect(drawer.getByText('₹50,00,000.00 (cost)')).toBeVisible();
      const limit = drawer.getByTestId('approval-limit');
      await expect(limit.getByText('No approver set up')).toBeVisible();
      await expect(limit.getByText(/No one is set up to approve this amount yet/)).toBeVisible();
      await expect(limit.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
      await expect(drawer.getByLabel(/^Authenticator code/)).toHaveCount(0);
      await expect(drawer.getByRole('button', { name: /^Send to/ })).toHaveCount(0);
    });
  } finally {
    await adminContext.close();
    await approverContext.close();
    await bookingContext.close();
  }
});
