import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F03-T01: the vocabularies journey (structure-and-masters 4.2, 8; PRD-IMP-008, POL-02.07). A Booking user
// proposes a value of the Organisation's SYNTHETIC colour attribute on Setup › Vocabularies; their own confirmation
// is refused, with its reason on screen; a different person confirms it from My work, and the value then shows on the
// Vocabularies screen, In force. Every value is SYNTHETIC.

const suffix = String(Date.now()).slice(-6);
const VALUE = { code: `SYN-TEAL-${suffix}`, name: 'SYNTHETIC Journey Teal' };

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

async function openVocabularies(page: Page, tab: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'Vocabularies', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vocabularies' })).toBeVisible();
  await page.getByRole('tab', { name: tab, exact: true }).click();
}

test('PRD-IMP-008 POL-02.07 a Booking user proposes a colour value; their own confirmation is refused; another person confirms it from My work', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().vocabularies;
  const bookingContext = await browser.newContext();
  const confirmerContext = await browser.newContext();
  const booking = await bookingContext.newPage();
  const confirmer = await confirmerContext.newPage();
  try {
    await test.step('the Booking user proposes a colour value', async () => {
      await signedIn(booking, world.organisationCode, world.booking);
      await openVocabularies(booking, world.attributeName);
      await booking.getByRole('button', { name: 'Propose a value' }).click();
      const drawer = booking.getByRole('dialog', { name: 'Propose a value' });
      await drawer.getByLabel(/^Code/).fill(VALUE.code);
      await drawer.getByLabel(/^Name/).fill(VALUE.name);
      await drawer.getByTestId('drawer-footer').getByRole('button', { name: 'Request approval' }).click();
      await expect(drawer.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
      await booking.keyboard.press('Escape');
      const proposals = booking.getByRole('table', { name: 'Proposals' });
      await expect(proposals.getByRole('row').filter({ hasText: VALUE.code })).toContainText('Proposed');
    });

    await test.step('the proposer’s own confirmation is refused, with its reason on screen', async () => {
      const proposals = booking.getByRole('table', { name: 'Proposals' });
      await proposals.getByRole('button', { name: VALUE.code }).click();
      const drawer = booking.getByRole('dialog', { name: VALUE.name });
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
      const title = 'Vocabulary value confirmation';
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
      await expect(drawer.getByText(VALUE.name)).toBeVisible();
      await drawer.getByLabel(/^Reason/).selectOption({ index: 1 });
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
      await confirmer.keyboard.press('Escape');
    });

    await test.step('the value shows on the Vocabularies screen, In force', async () => {
      await openVocabularies(confirmer, world.attributeName);
      const values = confirmer.getByRole('row').filter({ hasText: VALUE.code });
      await expect(values.first()).toContainText('In force');
      await expect(values.first()).toContainText(VALUE.name);
    });
  } finally {
    await bookingContext.close();
    await confirmerContext.close();
  }
});
