import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F03-T03: the bank details journey (structure-and-masters 5.1, 8; access-and-approvals 3.3, 6; POL-02.07,
// PRD-ACS-008, PRD-SEC-001; DEC-114). A person prepares a SYNTHETIC supplier's bank-detail change on Setup › Suppliers
// and agreements with a fresh code; their own approval is refused, with its reason on screen; a different person
// approves it from My work with a fresh code; the details then show masked until that person shows them with a fresh
// code. Every value is SYNTHETIC.

const suffix = String(Date.now()).slice(-6);
const BANK = {
  holder: 'SYNTHETIC Journey Holder',
  number: `SYN0099${suffix}`,
  ifsc: 'SYNJ0000099',
  bank: 'SYNTHETIC Journey Bank',
};

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

async function openSupplier(page: Page, supplierCode: string) {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'Suppliers and agreements', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Suppliers and agreements' })).toBeVisible();
  await page
    .getByRole('table', { name: 'Suppliers and other parties' })
    .getByRole('button', { name: supplierCode })
    .click();
  return page.getByRole('dialog');
}

test('POL-02.07 PRD-ACS-008 a supplier’s bank-detail change: own approval refused, approved by another from My work, masked until shown with a fresh code', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().bankDetails;
  const preparerContext = await browser.newContext();
  const approverContext = await browser.newContext();
  const preparer = await preparerContext.newPage();
  const approver = await approverContext.newPage();
  try {
    await test.step('the preparer changes the supplier’s bank details with a fresh code', async () => {
      const app = await signedIn(preparer, world.organisationCode, world.preparer);
      const drawer = await openSupplier(preparer, world.supplierCode);
      await drawer.getByRole('button', { name: 'Change bank details' }).click();
      const form = drawer.getByRole('form', { name: 'Change bank details' });
      await form.getByLabel(/^Account holder/).fill(BANK.holder);
      await form.getByLabel(/^Account number/).fill(BANK.number);
      await form.getByLabel(/^IFSC/).fill(BANK.ifsc);
      await form.getByLabel(/^Bank/).fill(BANK.bank);
      await form.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await form.getByRole('button', { name: 'Request approval' }).click();
      await expect(form.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
      await expect(drawer.getByText('Awaiting approval').first()).toBeVisible();
      // The value never shows on the party, not even to its preparer.
      await expect(drawer.getByText(BANK.number)).toHaveCount(0);
    });

    await test.step('the preparer’s own approval is refused, with its reason on screen', async () => {
      const drawer = preparer.getByRole('dialog');
      await drawer.getByRole('button', { name: 'Open its approval' }).click();
      await expect(
        drawer
          .getByRole('status')
          .filter({ hasText: 'You prepared or changed this version, so another person must decide it.' }),
      ).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    });

    let approverApp: Authenticator | undefined;
    const approverCode = async (): Promise<string> => {
      if (approverApp === undefined) throw new Error('The approver has not signed in');
      return approverApp.nextCode();
    };
    await test.step('a different person approves it from My work with a fresh code', async () => {
      approverApp = await signedIn(approver, world.organisationCode, world.approver);
      await approver
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: /^My work/ })
        .click();
      const title = 'Bank details change';
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
      await drawer.getByLabel(/^Reason/).selectOption({ index: 1 });
      await drawer.getByLabel(/^Authenticator code/).fill(await approverCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
      await approver.keyboard.press('Escape');
    });

    await test.step('the details show masked until shown with a fresh code', async () => {
      const drawer = await openSupplier(approver, world.supplierCode);
      await expect(drawer.getByText('In force').first()).toBeVisible();
      await expect(drawer.getByText('•••• masked')).toBeVisible();
      await expect(drawer.getByText(BANK.number)).toHaveCount(0);
      const show = drawer.getByRole('form', { name: 'Show bank details' });
      await show.getByLabel(/^Authenticator code/).fill(await approverCode());
      await show.getByRole('button', { name: 'Show bank details' }).click();
      await expect(drawer.getByText(BANK.number)).toBeVisible();
      await expect(drawer.getByText(BANK.holder)).toBeVisible();
    });
  } finally {
    await preparerContext.close();
    await approverContext.close();
  }
});
