import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signedIn } from './support/journey';
import { readWorld } from './support/world';

// S2-F01-T02: the open-to-buy journey (goods-in 3.3, section 11; PRD-BKG-004; POL-05.09, POL-02.07). A Booking user
// prepares a budget for a SYNTHETIC brand and season on Booking › Open-to-buy; their own check is refused, with its
// reason on screen; Accounts records the check from My work; only then does the Owner find the approval in My work and
// approve it; the screen then shows the version In force and the remaining amount. Every value is SYNTHETIC.

/** A SYNTHETIC amount in rupees, as the form takes it, and as the screen shows it. */
const AMOUNT = '12,50,000';
const AMOUNT_SHOWN = '₹12,50,000.00';

async function openOpenToBuy(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'Open-to-buy', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Open-to-buy' })).toBeVisible();
}

/** Opens My work and decides the one item titled so, approving it with the reason and a fresh code. */
async function approveFromMyWork(page: Page, app: Authenticator, title: string, reasonId: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: /^My work/ })
    .click();
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(1, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole('listitem').filter({ hasText: title }).getByRole('button', { name: 'Open and decide' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
  await expect(drawer.getByText(AMOUNT_SHOWN)).toBeVisible();
  await drawer.getByLabel(/^Reason/).selectOption(reasonId);
  await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
  await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(drawer.getByText(/^Approved by /)).toBeVisible();
  await page.keyboard.press('Escape');
}

test('POL-05.09 POL-02.07 a budget prepared by Booking, checked by Accounts and only then approved by the Owner, each from My work, is used with its remaining amount', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().openToBuy;
  const bookingContext = await browser.newContext();
  const accountsContext = await browser.newContext();
  const ownerContext = await browser.newContext();
  const booking = await bookingContext.newPage();
  const accounts = await accountsContext.newPage();
  const owner = await ownerContext.newPage();
  try {
    await test.step('Booking prepares a budget for a brand and a season', async () => {
      await signedIn(booking, world.organisationCode, world.booking);
      await openOpenToBuy(booking);
      await booking.getByRole('button', { name: 'Prepare a budget' }).click();
      const form = booking.getByRole('form', { name: 'Prepare a budget' });
      await form.locator('#budget-brand').selectOption({ label: world.brandOption });
      await form.locator('#budget-season').selectOption({ label: world.seasonOption });
      await form.locator('#budget-amount').fill(AMOUNT);
      await form.locator('#budget-origin').selectOption('synthetic');
      await booking.getByRole('button', { name: 'Send for the Accounts check' }).click();
      await expect(form.getByRole('status').filter({ hasText: 'Sent for the Accounts check' })).toBeVisible();
      await booking.keyboard.press('Escape');
      const row = booking.getByRole('table', { name: 'Open-to-buy budgets' }).getByRole('row').filter({
        hasText: world.brandOption,
      });
      await expect(row).toContainText('Waiting for the Accounts check');
      await expect(row).toContainText('Not approved yet');
    });

    await test.step('the preparer’s own check is refused, with its reason on screen', async () => {
      await booking.getByRole('button', { name: world.brandOption }).click();
      const drawer = booking.getByRole('dialog');
      await drawer.getByRole('button', { name: 'Open the approval' }).click();
      await expect(
        drawer
          .getByRole('status')
          .filter({ hasText: 'You prepared or changed this version, so another person must decide it.' }),
      ).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
      await booking.keyboard.press('Escape');
    });

    await test.step('Accounts records the check from My work', async () => {
      const app = await signedIn(accounts, world.organisationCode, world.accounts);
      await approveFromMyWork(accounts, app, 'Open-to-buy budget check', world.reasonId);
    });

    await test.step('only then does the Owner find the approval in My work, and approves it', async () => {
      const app = await signedIn(owner, world.organisationCode, world.owner);
      await approveFromMyWork(owner, app, 'Open-to-buy budget approval', world.reasonId);
    });

    await test.step('the budget is in force, with its remaining amount', async () => {
      await openOpenToBuy(owner);
      const row = owner.getByRole('table', { name: 'Open-to-buy budgets' }).getByRole('row').filter({
        hasText: world.brandOption,
      });
      await expect(row).toContainText('In force');
      // Approved, nothing reserved yet, and the whole amount remaining (S2-F01-T03 reserves).
      await expect(row).toContainText(AMOUNT_SHOWN);
      await expect(row).toContainText('₹0.00');
    });
  } finally {
    await bookingContext.close();
    await accountsContext.close();
    await ownerContext.close();
  }
});
