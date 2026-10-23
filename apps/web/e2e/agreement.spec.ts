import { expect, test, type Page } from '@playwright/test';
import { signedIn } from './support/journey';
import { readWorld } from './support/world';

// S2-F01-T01: the agreement journey without the default model for new bookings (structure-and-masters 5.2, 8;
// DEC-129, POL-01.02; RR-545). Booking prepares a SYNTHETIC supplier's agreement on Setup › Agreement: the form asks its
// commercial model and offers no default model; a different person approves it from My work with a fresh code; the
// terms in force show the commercial model and no default model. Every value is SYNTHETIC.

const agreementCode = `SYN-AGR-${String(Date.now()).slice(-6)}`;

async function openAgreements(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'Agreement', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Agreement' })).toBeVisible();
}

test('DEC-129 POL-01.02 an agreement is prepared and approved with its commercial model and no default model for new bookings', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().agreement;
  const preparerContext = await browser.newContext();
  const approverContext = await browser.newContext();
  const preparer = await preparerContext.newPage();
  const approver = await approverContext.newPage();
  try {
    await test.step('Booking prepares the agreement: a commercial model is asked, no default model', async () => {
      await signedIn(preparer, world.organisationCode, world.preparer);
      await openAgreements(preparer);
      await preparer.getByRole('button', { name: 'New agreement' }).click();
      const drawer = preparer.getByRole('dialog');
      await expect(drawer.getByLabel(/^Commercial model/)).toBeVisible();
      await expect(drawer.getByText(/Default model/)).toHaveCount(0);
      await drawer.getByLabel(/^Code/).fill(agreementCode);
      await drawer.getByLabel(/^Supplier \*/).selectOption({ label: `${world.supplierCode} · ${world.supplierName}` });
      await drawer.getByLabel(/^Commercial model/).selectOption({ label: 'Outright' });
      await drawer.getByRole('button', { name: 'Request approval' }).click();
      await expect(drawer.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
      await preparer.keyboard.press('Escape');
    });

    await test.step('a different person approves it from My work with a fresh code', async () => {
      const app = await signedIn(approver, world.organisationCode, world.approver);
      await approver
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: /^My work/ })
        .click();
      const title = 'Agreement version';
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
      await expect(drawer.getByText(agreementCode)).toBeVisible();
      await expect(drawer.getByText(/Default model/)).toHaveCount(0);
      await drawer.getByLabel(/^Reason/).selectOption({ index: 1 });
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
    });

    await test.step('the terms in force show the commercial model and no default model', async () => {
      await preparer.getByRole('button', { name: 'Refresh' }).click();
      await preparer.getByRole('combobox', { name: 'Agreement', exact: true }).selectOption({ label: agreementCode });
      const terms = preparer.getByRole('definition').filter({ hasText: 'Outright' });
      await expect(terms).toHaveCount(1);
      await expect(preparer.getByRole('term').filter({ hasText: 'Commercial model' })).toHaveCount(1);
      await expect(preparer.getByText(/Default model/)).toHaveCount(0);
    });
  } finally {
    await preparerContext.close();
    await approverContext.close();
  }
});
