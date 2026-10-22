import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { organisationToday, signIn } from './support/journey';
import { readWorld, type EnrolledUser, type ReceivingOptions } from './support/world';

// S2-F06-T01: the PT approval journey (goods-in 6.1 to 6.5, section 11; PRD-REC-017, PRD-REC-018, PRD-ACS-006,
// POL-02.07; DEC-135, DEC-140; code-house-rules 10.1). Warehouse (P-WHS), also assigned to make PTs, counts two pieces
// of a style not set up yet, issues the GRN and submits its PT file for approval; Operations (P-OPS), assigned to
// approve PTs, finds it in My work and reviews it there, the GRN's invoice, the totals with BASIC beside P RATE and the
// new product it sets up, and approves it; the PT is then Official with its number from the PT series, and its maker
// downloads it in the template's columns. Every value is SYNTHETIC.

/** A SYNTHETIC invoice PDF, as the supplier sent it. */
const INVOICE_PDF = {
  name: 'SYNTHETIC-invoice.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% SYNTHETIC invoice\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'latin1'),
};

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
  await form.getByLabel(/^Lorry receipt number/).fill('SYN-LR-APR');
  await form.getByLabel(/^Lorry receipt date/).fill(organisationToday());
  await form.getByLabel(/^Cartons/).fill('1');
  await form.getByLabel(/^Arrived/).fill(anHourAgo());
  await page.getByRole('dialog').getByRole('button', { name: 'Record the Arrival' }).click();
  await expect(page.getByRole('heading', { level: 2, name: `Arrival from ${options.supplier}` })).toBeVisible();
  const invoice = page.getByRole('form', { name: 'Add the invoice' });
  await invoice.getByLabel(/^Invoice number/).fill('SYN-INV-APR');
  await invoice.getByLabel(/^Invoice date/).fill(organisationToday());
  await invoice.getByLabel('Invoice file').setInputFiles(INVOICE_PDF);
  await invoice.getByRole('button', { name: 'Add the invoice' }).click();
  await expect(invoice.getByRole('status').filter({ hasText: 'Invoice recorded.' })).toBeVisible();
}

test('PRD-REC-017 PRD-REC-018 POL-02.07 a PT submitted for approval is reviewed and approved from My work, then Official and downloaded', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const world = readWorld().ptApproval;
  const { options, styleCode } = world;
  const makerContext = await browser.newContext({ acceptDownloads: true });
  const approverContext = await browser.newContext();
  const maker = await makerContext.newPage();
  const approver = await approverContext.newPage();
  let grnNumber = '';
  try {
    await test.step('Warehouse counts two pieces of a new style, issues the GRN and submits its PT file', async () => {
      await signedIn(maker, world.organisationCode, world.maker);
      await arrivalWithInvoice(maker, options);
      const line = maker.getByRole('form', { name: 'Add a line' });
      await line.getByLabel(/^Style code/).fill(styleCode);
      await line.getByLabel(/^Colour/).fill('SYNTHETIC NAVY');
      await line.getByLabel(/^Size$/).selectOption({ label: options.sizes[0] ?? '' });
      await line.getByLabel(/^Invoice quantity/).fill('2');
      await line.getByLabel(/^Counted quantity/).fill('2');
      await line.getByRole('button', { name: 'Save the line' }).click();
      await expect(
        maker.getByRole('table', { name: 'Lines counted' }).getByRole('row').filter({ hasText: styleCode }),
      ).toBeVisible();
      await maker.getByRole('button', { name: 'Issue the GRN' }).click();
      const grn = maker.getByRole('region', { name: /^GRN SYN-GRN-\d{5}$/ });
      await expect(grn).toBeVisible();
      grnNumber = ((await grn.getByRole('heading', { level: 3 }).textContent()) ?? '').replace('GRN ', '');
      const upload = maker.getByRole('form', { name: 'Upload a PT file' });
      await upload.getByLabel('PT file', { exact: true }).setInputFiles(world.file);
      await upload.getByRole('button', { name: 'Upload and check' }).click();
      await expect(maker.getByRole('heading', { level: 3, name: 'What submitting it makes' })).toBeVisible({
        timeout: 60_000,
      });
      await maker.getByRole('button', { name: 'Submit for approval' }).click();
      const revisions = maker.getByRole('table', { name: 'PT revisions' });
      await expect(revisions).toBeVisible({ timeout: 60_000 });
      await expect(revisions.getByRole('row').nth(1)).toContainText('Awaiting approval');
    });

    await test.step('Operations reviews the PT in My work: the invoice, BASIC beside P RATE and the new product', async () => {
      const app = await signedIn(approver, world.organisationCode, world.approver);
      await approver
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: /^My work/ })
        .click();
      // The approval's item comes through the worker, which hands this Organisation's earlier events, the fixtures'
      // approvals of the receiving worlds, to My work first (apps/server/test/browser/serve.ts), so it may take a while:
      // over three minutes when this journey runs first.
      // This maker's: the PT file journey submits a PT in this Organisation too.
      const item = approver
        .getByRole('listitem')
        .filter({ hasText: 'PT approval' })
        .filter({ hasText: world.maker.displayName });
      await expect(async () => {
        await approver.getByRole('button', { name: 'Refresh' }).click();
        await expect(item).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 360_000 });
      await item.getByRole('button', { name: 'Open and decide' }).click();
      const drawer = approver.getByRole('dialog');
      await expect(drawer.getByRole('heading', { level: 2, name: 'PT approval', exact: true })).toBeVisible();
      await expect(drawer.getByRole('heading', { level: 3, name: 'What approving it makes' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(drawer.getByText(grnNumber, { exact: true })).toBeVisible();
      await expect(drawer.getByRole('list', { name: 'Supplier invoices' })).toContainText('SYN-INV-APR');
      const rows = drawer
        .getByRole('table', { name: 'Rows of the file' })
        .getByRole('row')
        .filter({ hasText: styleCode });
      await expect(rows).toHaveCount(2);
      // SYNTHETIC: BASIC 700.00 beside P RATE 945.00, MARGIN 52.73 (goods-in 6.2).
      await expect(rows.first()).toContainText('700.00');
      await expect(rows.first()).toContainText('945.00');
      await expect(drawer.getByRole('region', { name: 'New products proposed' })).toContainText(
        `New style ${styleCode}`,
      );
      await drawer.getByLabel(/^Reason/).selectOption(world.reasonId);
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible({ timeout: 60_000 });
    });

    await test.step('the PT is Official with its number, and its maker downloads it in the template’s columns', async () => {
      await maker.getByRole('button', { name: 'Refresh' }).click();
      const newest = maker.getByRole('table', { name: 'PT revisions' }).getByRole('row').nth(1);
      await expect(newest).toContainText('Official', { timeout: 30_000 });
      await expect(newest).toContainText(/SYN-PT-\d{5}/);
      const number = /SYN-PT-\d{5}/.exec((await newest.textContent()) ?? '')?.[0] ?? '';
      const downloading = maker.waitForEvent('download');
      await maker.getByRole('button', { name: 'Download the PT' }).click();
      const download = await downloading;
      expect(download.suggestedFilename()).toBe(`${number}.xlsx`);
    });
  } finally {
    await makerContext.close();
    await approverContext.close();
  }
});
