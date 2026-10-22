import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// RR-556, for S2-F02-T02: the season and size attributes journey (structure-and-masters 4.2 "As built", 8; goods-in
// GI-3; POL-02.07). An Admin (P-ADM) marks a SYNTHETIC list attribute as the Organisation's size list on Setup ›
// Vocabularies, Attributes; their own approval is refused, with its reason on screen; the Owner (P-OWN) approves it
// from My work, and the Attributes tab then shows it in force. Every value is SYNTHETIC.

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

async function openAttributes(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'Vocabularies', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vocabularies' })).toBeVisible();
  await page.getByRole('tab', { name: 'Attributes', exact: true }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Marked attributes' })).toBeVisible();
}

test('RR-556 POL-02.07 an Admin marks the size attribute; their own approval is refused; the Owner approves it from My work', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().markedAttributes;
  const adminContext = await browser.newContext();
  const ownerContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const owner = await ownerContext.newPage();
  try {
    await test.step('the Admin marks a list attribute as the size list', async () => {
      await signedIn(admin, world.organisationCode, world.admin);
      await openAttributes(admin);
      await expect(admin.getByRole('heading', { level: 4, name: 'Size attribute' }).locator('..')).toContainText(
        'Not marked yet',
      );
      await admin
        .getByRole('button', { name: 'Change' })
        .nth(1) // The season attribute's comes first, then the size attribute's.
        .click();
      const form = admin.getByRole('form', { name: 'Mark the size attribute' });
      await form.getByLabel(/^Attribute/).selectOption({ label: world.attributeOption });
      await form.getByLabel(/^Where the values come from/).selectOption('synthetic');
      await admin.getByRole('button', { name: 'Send for approval' }).click();
      await expect(form.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
      await admin.keyboard.press('Escape');
    });

    await test.step('the preparer’s own approval is refused, with its reason on screen', async () => {
      const versions = admin.getByRole('table', { name: 'Versions · Size attribute' });
      await expect(versions.getByRole('row').filter({ hasText: world.attributeOption })).toContainText(
        'Awaiting approval',
      );
      await versions.getByRole('button', { name: 'Open the approval' }).click();
      const drawer = admin.getByRole('dialog');
      await expect(
        drawer
          .getByRole('status')
          .filter({ hasText: 'You prepared or changed this version, so another person must decide it.' }),
      ).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
      await admin.keyboard.press('Escape');
    });

    await test.step('the Owner approves it from My work', async () => {
      const app = await signedIn(owner, world.organisationCode, world.owner);
      await owner
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: /^My work/ })
        .click();
      const title = 'Marked attribute change';
      await expect(async () => {
        await owner.getByRole('button', { name: 'Refresh' }).click();
        await expect(owner.getByRole('listitem').filter({ hasText: title })).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 30_000 });
      await owner
        .getByRole('listitem')
        .filter({ hasText: title })
        .getByRole('button', { name: 'Open and decide' })
        .click();
      const drawer = owner.getByRole('dialog');
      await expect(drawer.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
      await expect(drawer.getByText('Size attribute', { exact: true })).toBeVisible();
      await drawer.getByLabel(/^Reason/).selectOption({ index: 1 });
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
      await owner.keyboard.press('Escape');
    });

    await test.step('the Attributes tab shows it in force', async () => {
      await openAttributes(owner);
      const versions = owner.getByRole('table', { name: 'Versions · Size attribute' });
      await expect(versions.getByRole('row').filter({ hasText: world.attributeOption })).toContainText('In force');
    });
  } finally {
    await adminContext.close();
    await ownerContext.close();
  }
});
