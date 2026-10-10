import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F06-T03: the mapping rule journey (imports-and-opening-data 6.3, 6.4, 14, 16; PRD-IMP-008, POL-02.07; DEC-112
// GC6-4). A Booking user (P-BKG) proposes a mapping rule on Setup › File intake and saved layouts › Mapping rules; their
// own confirmation is refused, with its reason on screen; a different person confirms it from My work, and the rule
// then shows In force. Every value is SYNTHETIC.

const suffix = String(Date.now()).slice(-6);
const WORD = `synthetic journey word ${suffix}`;

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

async function openRules(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'File intake and saved layouts', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'File intake and saved layouts' })).toBeVisible();
  await page.getByRole('tab', { name: 'Mapping rules', exact: true }).click();
}

test('PRD-IMP-008 POL-02.07 a Booking user proposes a mapping rule; their own confirmation is refused; another person confirms it from My work', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().fileIntake;
  const bookingContext = await browser.newContext();
  const confirmerContext = await browser.newContext();
  const booking = await bookingContext.newPage();
  const confirmer = await confirmerContext.newPage();
  try {
    await test.step('the Booking user proposes a rule mapping a word to the brand', async () => {
      await signedIn(booking, world.organisationCode, world.ruleBooking);
      await openRules(booking);
      await booking.getByRole('button', { name: 'Propose a mapping rule' }).click();
      const drawer = booking.getByRole('dialog', { name: 'Propose a mapping rule' });
      await drawer.getByLabel('Word in the file').fill(WORD);
      await drawer.getByLabel('Approved value').fill(world.brandCode);
      await drawer.getByLabel('From', { exact: true }).fill(world.today);
      await drawer.getByTestId('drawer-footer').getByRole('button', { name: 'Request approval' }).click();
      await expect(drawer.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
      await booking.keyboard.press('Escape');
      await booking.getByRole('button', { name: 'Refresh' }).click();
      const rules = booking.getByRole('table', { name: 'Mapping rules' });
      await expect(rules.getByRole('row').filter({ hasText: WORD })).toContainText('Proposed');
    });

    await test.step('the proposer’s own confirmation is refused, with its reason on screen', async () => {
      const rules = booking.getByRole('table', { name: 'Mapping rules' });
      await rules.getByRole('button', { name: WORD }).click();
      const drawer = booking.getByRole('dialog', { name: WORD });
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
      const title = 'Mapping rule confirmation';
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
      await expect(drawer.getByText(WORD)).toBeVisible();
      await drawer.getByLabel(/^Reason/).selectOption({ index: 1 });
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
      await confirmer.keyboard.press('Escape');
    });

    await test.step('the rule shows In force', async () => {
      await booking.getByRole('button', { name: 'Refresh' }).click();
      const rules = booking.getByRole('table', { name: 'Mapping rules' });
      await expect(rules.getByRole('row').filter({ hasText: WORD })).toContainText('In force');
    });
  } finally {
    await bookingContext.close();
    await confirmerContext.close();
  }
});
