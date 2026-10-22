import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { organisationToday, signIn } from './support/journey';
import { readWorld, type EnrolledUser, type ReceivingOptions } from './support/world';

// S2-F02-T03: the held-line journey (goods-in 4.4 to 4.6, section 11; PRD-REC-006, PRD-REC-013, POL-17.02,
// POL-17.11; code-house-rules 10.1). Warehouse (P-WHS) counts one piece more than the invoice lists: saving the line
// without saying whether the extra piece is received is refused with the reason on screen; received and held, the GRN
// shows the excess awaiting Booking's decision. A Booking approver (P-BKG) finds the decision in My work with the held
// goods' facts, and takes the excess in on an Unknown cost, which their SYNTHETIC limit covers; the receiver then reads
// the GRN line Accepted. Every value is SYNTHETIC.

/** A SYNTHETIC invoice PDF, as the supplier sent it. */
const INVOICE_PDF = {
  name: 'SYNTHETIC-invoice.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% SYNTHETIC invoice\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'latin1'),
};

const STYLE = 'SYN-STYLE-HELD';

/**
 * An hour ago, as a `datetime-local` field takes it: the Organisation's wall clock, Etc/UTC on the journeys' server
 * (apps/server/test/browser/serve.ts), whatever the browser's time zone (code-house-rules 9).
 */
function anHourAgo(): string {
  return new Date(Date.now() - 3_600_000).toISOString().slice(0, 16);
}

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

/** Records an Arrival at the Store's unit of the world from its Site's inbox, and its invoice (goods-in 4.2). */
async function arrivalWithInvoice(page: Page, options: ReceivingOptions): Promise<void> {
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Inbox', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
  await page.getByLabel('Site').selectOption({ label: options.site });
  await page.getByRole('button', { name: 'Goods arrived' }).click();
  const form = page.getByRole('form', { name: 'Record an Arrival' });
  await form.locator('#receive-unit').selectOption({ label: options.wholeStore });
  await form.locator('#receive-location').selectOption({ label: options.storeLocation });
  await form.locator('#receive-supplier').selectOption({ label: options.supplier });
  await form.locator('#receive-brand').selectOption({ label: options.brand });
  await form.getByLabel(/^Transporter/).fill('SYNTHETIC Transporter');
  await form.getByLabel(/^Lorry receipt number/).fill('SYN-LR-HELD');
  await form.getByLabel(/^Lorry receipt date/).fill(organisationToday());
  await form.getByLabel(/^Cartons/).fill('1');
  await form.getByLabel(/^Arrived/).fill(anHourAgo());
  await page.getByRole('dialog').getByRole('button', { name: 'Record the Arrival' }).click();
  await expect(page.getByRole('heading', { level: 2, name: `Arrival from ${options.supplier}` })).toBeVisible();
  const invoice = page.getByRole('form', { name: 'Add the invoice' });
  await invoice.getByLabel(/^Invoice number/).fill('SYN-INV-HELD');
  await invoice.getByLabel(/^Invoice date/).fill(organisationToday());
  await invoice.getByLabel('Invoice file').setInputFiles(INVOICE_PDF);
  await invoice.getByRole('button', { name: 'Add the invoice' }).click();
  await expect(invoice.getByRole('status').filter({ hasText: 'Invoice recorded.' })).toBeVisible();
}

test('PRD-REC-006 PRD-REC-013 POL-17.11 Warehouse counts excess and holds it, and a Booking approver takes it in from My work', async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const world = readWorld().heldLines;
  const { options } = world;
  const receiverContext = await browser.newContext();
  const approverContext = await browser.newContext();
  const receiver = await receiverContext.newPage();
  const approver = await approverContext.newPage();
  let grnNumber = '';
  try {
    await test.step('Warehouse counts one piece beyond the invoice; the line waits until the extra piece is said received or not', async () => {
      await signedIn(receiver, world.organisationCode, world.receiver);
      await arrivalWithInvoice(receiver, options);
      const line = receiver.getByRole('form', { name: 'Add a line' });
      await line.getByLabel(/^Style code/).fill(STYLE);
      await line.getByLabel(/^Colour/).fill('SYNTHETIC NAVY');
      await line.getByLabel(/^Size$/).selectOption({ label: options.sizes[0] ?? '' });
      await line.getByLabel(/^Invoice quantity/).fill('4');
      await line.getByLabel(/^Counted quantity/).fill('5');
      await line.getByRole('button', { name: 'Save the line' }).click();
      await expect(
        line.getByText('Say whether the extra pieces are received or not received.', { exact: false }),
      ).toBeVisible();
      await line.getByLabel(/^Extra pieces/).selectOption({ label: 'Received and held' });
      await line.getByRole('button', { name: 'Save the line' }).click();
      const row = receiver.getByRole('table', { name: 'Lines counted' }).getByRole('row').filter({ hasText: STYLE });
      await expect(row).toContainText('Excess 1');
    });

    await test.step('the GRN holds the excess for Booking’s decision', async () => {
      await receiver.getByRole('button', { name: 'Issue the GRN' }).click();
      const grn = receiver.getByRole('region', { name: /^GRN SYN-GRN-\d{5}$/ });
      await expect(grn).toBeVisible();
      grnNumber = ((await grn.getByRole('heading', { level: 3 }).textContent()) ?? '').replace('GRN ', '');
      const row = receiver.getByRole('table', { name: 'GRN lines' }).getByRole('row').filter({ hasText: STYLE });
      await expect(row).toContainText('Excess 1');
      await expect(row).toContainText('Awaiting approval');
    });

    await test.step('a Booking approver finds the decision in My work with the held goods’ facts and takes them in', async () => {
      const app = await signedIn(approver, world.organisationCode, world.approver);
      await approver
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: /^My work/ })
        .click();
      // The decision's item comes through the worker, which hands this Organisation's earlier events, the fixtures'
      // approvals of the receiving worlds, to My work first (apps/server/test/browser/serve.ts), so it may take a while.
      const decision = approver.getByRole('listitem').filter({ hasText: 'Decision on held goods' });
      await expect(async () => {
        await approver.getByRole('button', { name: 'Refresh' }).click();
        await expect(decision).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 180_000 });
      await decision.getByRole('button', { name: 'Open and decide' }).click();
      const drawer = approver.getByRole('dialog');
      await expect(
        drawer.getByRole('heading', { level: 2, name: 'Decision on held goods', exact: true }),
      ).toBeVisible();
      await expect(drawer.getByText(grnNumber, { exact: true })).toBeVisible();
      await expect(drawer.getByText('Excess', { exact: true })).toBeVisible();
      await drawer.getByLabel(/^Reason/).selectOption(world.reasonId);
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
    });

    await test.step('the receiver reads the GRN again: the excess is Accepted, its finding kept', async () => {
      await receiver.getByRole('button', { name: 'Refresh' }).click();
      const row = receiver.getByRole('table', { name: 'GRN lines' }).getByRole('row').filter({ hasText: STYLE });
      await expect(row).toContainText('Accepted');
      await expect(row).toContainText('Excess 1');
    });
  } finally {
    await receiverContext.close();
    await approverContext.close();
  }
});
