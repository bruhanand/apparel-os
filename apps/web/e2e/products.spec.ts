import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F03-T02: the products journey (structure-and-masters 4.1, 4.2, 8; PRD-MER-005, PRD-MER-013; DM-5, DEC-105). A
// Booking user proposes a style with two SKUs on Setup › Products, one of Unknown size and one of the category's
// SYNTHETIC free size; their own confirmation is refused, with its reason on screen; a different person confirms it
// from My work, and both SKUs then show on the Products screen with their codes. Every value is SYNTHETIC.

const suffix = String(Date.now()).slice(-6);
const STYLE = `SYN-STYLE-${suffix}`;
const SKU_UNKNOWN = `SYN-SKU-U-${suffix}`;
const SKU_FREE = `SYN-SKU-F-${suffix}`;

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

async function openProducts(page: Page, tab: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'Products', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible();
  await page.getByRole('tab', { name: tab, exact: true }).click();
}

test('PRD-MER-013 DM-5 PRD-MER-005 a Booking user proposes a style with an Unknown-size and a free-size SKU; their own confirmation is refused; another person confirms it from My work', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().products;
  const bookingContext = await browser.newContext();
  const confirmerContext = await browser.newContext();
  const booking = await bookingContext.newPage();
  const confirmer = await confirmerContext.newPage();
  try {
    await test.step('the Booking user proposes a style with two SKUs', async () => {
      await signedIn(booking, world.organisationCode, world.booking);
      await openProducts(booking, 'Proposals');
      await booking.getByRole('button', { name: 'Propose a product' }).click();
      const drawer = booking.getByRole('dialog', { name: 'Propose a product' });
      await drawer.locator('#product-proposal-form-code').fill(STYLE);
      await drawer.locator('#product-proposal-form-brand').selectOption({ label: world.brandOption });
      await drawer.locator('#product-proposal-form-category').selectOption({ label: world.categoryOption });
      // The first SKU's size is left Unknown; the second takes the category's free size (PRD-MER-005).
      await drawer.locator('#product-sku-0-code').fill(SKU_UNKNOWN);
      await expect(drawer.locator('#product-sku-0-size')).toHaveValue('');
      await drawer.locator('#product-sku-0-unit').selectOption({ label: 'Piece' });
      await drawer.locator('#product-sku-0-purpose').selectOption({ label: 'Merchandise' });
      await drawer.getByRole('button', { name: 'Add a SKU' }).click();
      await drawer.locator('#product-sku-1-code').fill(SKU_FREE);
      await drawer.locator('#product-sku-1-size').selectOption({ label: world.freeSize });
      await drawer.locator('#product-sku-1-unit').selectOption({ label: 'Piece' });
      await drawer.locator('#product-sku-1-purpose').selectOption({ label: 'Merchandise' });
      await drawer.getByTestId('drawer-footer').getByRole('button', { name: 'Request approval' }).click();
      await expect(drawer.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
      await booking.keyboard.press('Escape');
      const proposals = booking.getByRole('table', { name: 'Proposals' });
      await expect(proposals.getByRole('row').filter({ hasText: STYLE })).toContainText('Proposed');
    });

    await test.step('the proposer’s own confirmation is refused, with its reason on screen', async () => {
      const proposals = booking.getByRole('table', { name: 'Proposals' });
      await proposals.getByRole('button', { name: STYLE }).click();
      const drawer = booking.getByRole('dialog', { name: 'Product proposal' });
      await expect(
        drawer
          .getByRole('status')
          .filter({ hasText: 'You prepared or changed this version, so another person must decide it.' }),
      ).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
      await booking.keyboard.press('Escape');
    });

    await test.step('a different person confirms it from My work', async () => {
      const app = await signedIn(confirmer, world.organisationCode, world.confirmer);
      await confirmer
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: /^My work/ })
        .click();
      const title = 'Product confirmation';
      await expect(async () => {
        await confirmer.getByRole('button', { name: 'Refresh' }).click();
        await expect(confirmer.getByRole('listitem').filter({ hasText: title })).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 30_000 });
      await confirmer
        .getByRole('listitem')
        .filter({ hasText: title })
        .getByRole('button', { name: 'Open and decide' })
        .click();
      const drawer = confirmer.getByRole('dialog');
      await expect(drawer.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
      await expect(drawer.getByText(SKU_FREE)).toBeVisible();
      await drawer.getByLabel(/^Reason/).selectOption({ index: 1 });
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
      await confirmer.keyboard.press('Escape');
    });

    await test.step('both SKUs show on the Products screen with their codes', async () => {
      await openProducts(confirmer, 'SKUs');
      await expect(confirmer.getByRole('row').filter({ hasText: SKU_UNKNOWN })).toContainText('In force');
      await expect(confirmer.getByRole('row').filter({ hasText: SKU_FREE })).toContainText('In force');
    });
  } finally {
    await bookingContext.close();
    await confirmerContext.close();
  }
});
