import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { organisationToday, signIn } from './support/journey';
import { readWorld, type EnrolledUser, type ReceivingOptions } from './support/world';
import { anHourAgo } from './support/clock';

// S2-F02-T05: the recount journey (goods-in 4.7, 4.11, section 11; PRD-REC-019, POL-02.07; code-house-rules 10.1).
// Warehouse (P-WHS) counts 4 of the 5 pieces the invoice lists and issues the GRN; finding the fifth piece, they propose
// a recount of the line: proposed at the pieces it counts already, it is refused with the reason on screen; at 5 pieces,
// with why, it waits for approval and the GRN keeps its count. The Owner (P-OWN) finds the recount in My work with its
// facts and approves it on an Unknown cost, which their SYNTHETIC limit covers; the receiver then reads the line
// recounted at 5, its original count kept. Every value is SYNTHETIC.

/** A SYNTHETIC invoice PDF, as the supplier sent it. */
const INVOICE_PDF = {
  name: 'SYNTHETIC-invoice.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% SYNTHETIC invoice\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'latin1'),
};

const STYLE = 'SYN-STYLE-RECOUNT';
const REASON = 'SYNTHETIC fifth piece found in the second carton';

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
  await form.getByLabel(/^Lorry receipt number/).fill('SYN-LR-RECOUNT');
  await form.getByLabel(/^Lorry receipt date/).fill(organisationToday());
  await form.getByLabel(/^Cartons/).fill('2');
  await form.getByLabel(/^Arrived/).fill(await anHourAgo());
  await page.getByRole('dialog').getByRole('button', { name: 'Record the Arrival' }).click();
  await expect(page.getByRole('heading', { level: 2, name: `Arrival from ${options.supplier}` })).toBeVisible();
  const invoice = page.getByRole('form', { name: 'Add the invoice' });
  await invoice.getByLabel(/^Invoice number/).fill('SYN-INV-RECOUNT');
  await invoice.getByLabel(/^Invoice date/).fill(organisationToday());
  await invoice.getByLabel('Invoice file').setInputFiles(INVOICE_PDF);
  await invoice.getByRole('button', { name: 'Add the invoice' }).click();
  await expect(invoice.getByRole('status').filter({ hasText: 'Invoice recorded.' })).toBeVisible();
}

test('PRD-REC-019 POL-02.07 Warehouse proposes a recount of a GRN line, and the Owner approves it from My work', async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const world = readWorld().recount;
  const { options } = world;
  const receiverContext = await browser.newContext();
  const approverContext = await browser.newContext();
  const receiver = await receiverContext.newPage();
  const approver = await approverContext.newPage();
  let grnNumber = '';
  try {
    await test.step('Warehouse counts 4 of the 5 pieces invoiced and issues the GRN', async () => {
      await signedIn(receiver, world.organisationCode, world.receiver);
      await arrivalWithInvoice(receiver, options);
      const line = receiver.getByRole('form', { name: 'Add a line' });
      await line.getByLabel(/^Style code/).fill(STYLE);
      await line.getByLabel(/^Colour/).fill('SYNTHETIC NAVY');
      await line.getByLabel(/^Size$/).selectOption({ label: options.sizes[0] ?? '' });
      await line.getByLabel(/^Invoice quantity/).fill('5');
      await line.getByLabel(/^Counted quantity/).fill('4');
      await line.getByRole('button', { name: 'Save the line' }).click();
      const counted = receiver
        .getByRole('table', { name: 'Lines counted' })
        .getByRole('row')
        .filter({ hasText: STYLE });
      await expect(counted).toContainText('Short 1');
      await receiver.getByRole('button', { name: 'Issue the GRN' }).click();
      const grn = receiver.getByRole('region', { name: /^GRN SYN-GRN-\d{5}$/ });
      await expect(grn).toBeVisible();
      grnNumber = ((await grn.getByRole('heading', { level: 3 }).textContent()) ?? '').replace('GRN ', '');
    });

    await test.step('a recount at the pieces counted already is refused with the reason; at 5 it waits for approval', async () => {
      const recount = receiver.getByRole('form', { name: 'Propose a recount' });
      await recount.getByLabel('Recounted pieces of line 1').fill('4');
      await recount.getByLabel(/^Why the lines are recounted/).fill(REASON);
      await recount.getByRole('button', { name: 'Propose the recount' }).click();
      await expect(
        recount.getByText('A line is recounted at the pieces it counts now.', { exact: false }),
      ).toBeVisible();
      await recount.getByLabel('Recounted pieces of line 1').fill('5');
      await recount.getByRole('button', { name: 'Propose the recount' }).click();
      await expect(receiver.getByText('A recount of this GRN waits for its decision in My work.')).toBeVisible();
      const proposed = receiver.getByRole('region', { name: /^Recount proposed / });
      await expect(proposed).toContainText('Awaiting approval');
      await expect(proposed).toContainText('Line 1: counted 4, recounted 5');
      await expect(proposed).toContainText(REASON);
      // The GRN keeps its count until the recount is approved (PRD-REC-019).
      const row = receiver.getByRole('table', { name: 'GRN lines' }).getByRole('row').filter({ hasText: STYLE });
      await expect(row).toContainText('Short 1');
    });

    await test.step('the Owner finds the recount in My work with its facts and approves it', async () => {
      const app = await signedIn(approver, world.organisationCode, world.approver);
      await approver
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: /^My work/ })
        .click();
      // The approval's item comes through the worker; the server delivers its fixtures' events before the journeys start
      // (apps/server/test/browser/serve.ts), so only the events of journeys running beside this one come first.
      const request = approver.getByRole('listitem').filter({ hasText: 'Recount of a GRN' });
      await expect(async () => {
        await approver.getByRole('button', { name: 'Refresh' }).click();
        await expect(request).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 180_000 });
      await request.getByRole('button', { name: 'Open and decide' }).click();
      const drawer = approver.getByRole('dialog');
      await expect(drawer.getByRole('heading', { level: 2, name: 'Recount of a GRN', exact: true })).toBeVisible();
      await expect(drawer.getByText(grnNumber, { exact: true })).toBeVisible();
      await expect(drawer.getByText(REASON, { exact: true })).toBeVisible();
      const line = drawer.getByRole('table', { name: 'Lines recounted' }).getByRole('row').filter({ hasText: STYLE });
      await expect(line).toContainText('4');
      await expect(line).toContainText('5');
      await drawer.getByLabel(/^Reason/).selectOption(world.reasonId);
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
    });

    await test.step('the receiver reads the GRN again: the line is recounted at 5, its original count kept', async () => {
      await receiver.getByRole('button', { name: 'Refresh' }).click();
      const row = receiver.getByRole('table', { name: 'GRN lines' }).getByRole('row').filter({ hasText: STYLE });
      await expect(row.getByRole('cell').nth(8)).toHaveText('4');
      await expect(row.getByRole('cell').nth(9)).toHaveText('5');
      await expect(receiver.getByRole('region', { name: /^Recount proposed / })).toContainText('Approved');
    });
  } finally {
    await receiverContext.close();
    await approverContext.close();
  }
});
