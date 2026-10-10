import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F09-T03: the period close journey (books-and-posting 4.2, 4.3, 14; PRD-LED-009, PRD-LED-019, PRD-LED-020;
// DEC-106, DEC-107). An Accounts user locks a SYNTHETIC book's two periods in order on Money › Period close and asks
// to reopen the first, naming one SYNTHETIC correction; their own approval is refused with its reason; a different
// Accounts user approves it from My work; the correction posts, as the module owning it would, and the period shows
// Locked again. Each step is visible on Period close. Every value is SYNTHETIC; who may lock, request and approve is
// KDPS's (V-01).

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

async function openPeriodClose(page: Page, bookOption: string) {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'Period close', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Period close' })).toBeVisible();
  await page.getByLabel('Book', { exact: true }).selectOption({ label: bookOption });
}

const row = (page: Page, code: string) =>
  page.getByRole('table', { name: 'Period close' }).getByRole('row').filter({ hasText: code });

async function openPeriod(page: Page, code: string) {
  await row(page, code).getByRole('button', { name: code }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  return page.getByRole('dialog');
}

test('PRD-LED-009 PRD-LED-019 PRD-LED-020 periods locked in order; a reopening naming one correction, approved by another Accounts user, lets it post and the period locks again', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().periodClose;
  const [first, second] = world.periodCodes;
  if (first === undefined || second === undefined) throw new Error('The journey needs two periods');
  const requesterContext = await browser.newContext();
  const approverContext = await browser.newContext();
  const requester = await requesterContext.newPage();
  const approver = await approverContext.newPage();
  try {
    await test.step('an Accounts user locks the two periods in date order', async () => {
      await signedIn(requester, world.organisationCode, world.requester);
      await openPeriodClose(requester, world.bookOption);
      await expect(row(requester, first)).toContainText('Open');
      await expect(row(requester, second)).toContainText('Open');
      // PRD-LED-009: the later period cannot be locked while the earlier one is Open, and the refusal names it.
      let drawer = await openPeriod(requester, second);
      await drawer.getByRole('button', { name: 'Lock this period' }).click();
      await expect(drawer.getByRole('alert')).toContainText('An earlier period of this book is still open.');
      await expect(drawer.getByRole('alert')).toContainText(`Financial period ${first}`);
      await requester.keyboard.press('Escape');
      drawer = await openPeriod(requester, first);
      await drawer.getByRole('button', { name: 'Lock this period' }).click();
      await expect(drawer.getByText(/^Locked at /)).toBeVisible();
      await requester.keyboard.press('Escape');
      await expect(row(requester, first)).toContainText('Locked');
      drawer = await openPeriod(requester, second);
      await drawer.getByRole('button', { name: 'Lock this period' }).click();
      await expect(drawer.getByText(/^Locked at /)).toBeVisible();
      await requester.keyboard.press('Escape');
      await expect(row(requester, second)).toContainText('Locked');
    });

    await test.step('they ask to reopen the first period for one named correction; their own approval is refused', async () => {
      const drawer = await openPeriod(requester, first);
      await drawer.getByRole('button', { name: 'Request a reopening' }).click();
      const form = drawer.getByRole('form', { name: 'Request a reopening' });
      await form.getByLabel('Reason').fill('SYNTHETIC late receipt to correct');
      await form.getByLabel('Owning module').fill(world.correction.module);
      await form.getByLabel('Record type').fill(world.correction.recordType);
      await form.getByLabel('Record identifier').fill(world.correction.recordId);
      await requester.getByRole('button', { name: 'Request approval' }).click();
      await expect(form.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
      const reopening = drawer.getByRole('listitem').filter({ hasText: 'Awaiting approval' });
      await expect(reopening).toContainText(world.correction.recordId);
      await expect(reopening).toContainText('not posted yet');
      // PRD-LED-019: a different authorised person from the requester approves it.
      await reopening.getByRole('button', { name: 'Open the approval' }).click();
      await expect(
        drawer
          .getByRole('status')
          .filter({ hasText: 'You prepared or changed this version, so another person must decide it.' }),
      ).toBeVisible();
      await requester.keyboard.press('Escape');
      await expect(row(requester, first)).toContainText('Locked');
    });

    await test.step('a different Accounts user approves it from My work; the period shows Reopened', async () => {
      const approverApp = await signedIn(approver, world.organisationCode, world.approver);
      await approver
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: /^My work/ })
        .click();
      const title = 'Period reopening';
      await expect(async () => {
        await approver.getByRole('button', { name: 'Refresh' }).click();
        await expect(approver.getByRole('listitem').filter({ hasText: title })).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 30_000 });
      await approver
        .getByRole('listitem')
        .filter({ hasText: title })
        .getByRole('button', { name: 'Open and decide' })
        .click();
      const drawer = approver.getByRole('dialog');
      await expect(drawer.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
      // The approval binds to the request as made: its period, reason and named correction (PRD-ACS-007).
      await expect(drawer.getByText('SYNTHETIC late receipt to correct')).toBeVisible();
      await expect(drawer.getByText(world.correction.recordId, { exact: false })).toBeVisible();
      await drawer.getByLabel(/^Reason/).selectOption(world.reasonId);
      await drawer.getByLabel(/^Authenticator code/).fill(await approverApp.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
      await approver.keyboard.press('Escape');
      await openPeriodClose(approver, world.bookOption);
      await expect(row(approver, first)).toContainText('Reopened');
      await expect(row(approver, second)).toContainText('Locked');
    });

    await test.step('the named correction posts, and the period shows Locked again', async () => {
      const response = await fetch(world.harnessUrl, { method: 'POST' });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ kind: 'posted' });
      await requester.reload();
      await openPeriodClose(requester, world.bookOption);
      await expect(row(requester, first)).toContainText('Locked');
      const drawer = await openPeriod(requester, first);
      const reopening = drawer.getByRole('listitem').filter({ hasText: 'Completed' });
      await expect(reopening).toContainText(world.correction.recordId);
      await expect(reopening.getByRole('list', { name: 'Named corrections' })).toContainText('posted');
      await expect(reopening).not.toContainText('not posted yet');
    });
  } finally {
    await requesterContext.close();
    await approverContext.close();
  }
});
