import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { organisationToday, signIn } from './support/journey';
import { readWorld, type EnrolledUser, type ReceivingOptions } from './support/world';
import { anHourAgo, serverNow } from './support/clock';

// S2-F06-T01: the PT approval journey (goods-in 6.1 to 6.5, section 11; PRD-REC-017, PRD-REC-018, PRD-ACS-006,
// POL-02.07; DEC-135, DEC-140; code-house-rules 10.1). Warehouse (P-WHS), also assigned to make PTs, counts two pieces
// of a style not set up yet, issues the GRN and submits its PT file for approval; Operations (P-OPS), assigned to
// approve PTs, finds it in My work and reviews it there, the GRN's invoice, the totals with BASIC beside P RATE and the
// new product it sets up, and approves it; the PT is then Official with its number from the PT series, and its maker
// downloads it in the template's columns; then proposes reversing it with a reason, which Operations approves from My
// work, the PT then Reversed, and uploads the corrected file at another P RATE, which Operations approves again
// (goods-in 6.4, 6.7; DEC-137, PRD-REC-019; S2-F09-T01); then, at phone width, scans its two pieces in to the Store's
// floor, a barcode not on the PT refused and kept (goods-in 7, section 11; S2-F07-T01); then finds them in Stock
// search, physical, available to sell, waiting and held as the ledger holds them, exports the search, and is refused
// damage on the product once, with the reason shown (goods-in 9.2, 8.1; S2-F11-T01). Every value is SYNTHETIC.

/** A SYNTHETIC invoice PDF, as the supplier sent it. */
const INVOICE_PDF = {
  name: 'SYNTHETIC-invoice.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% SYNTHETIC invoice\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'latin1'),
};

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
  await form.getByLabel(/^Arrived/).fill(await anHourAgo());
  await page.getByRole('dialog').getByRole('button', { name: 'Record the Arrival' }).click();
  await expect(page.getByRole('heading', { level: 2, name: `Arrival from ${options.supplier}` })).toBeVisible();
  const invoice = page.getByRole('form', { name: 'Add the invoice' });
  await invoice.getByLabel(/^Invoice number/).fill('SYN-INV-APR');
  await invoice.getByLabel(/^Invoice date/).fill(organisationToday());
  await invoice.getByLabel('Invoice file').setInputFiles(INVOICE_PDF);
  await invoice.getByRole('button', { name: 'Add the invoice' }).click();
  await expect(invoice.getByRole('status').filter({ hasText: 'Invoice recorded.' })).toBeVisible();
}

test('PRD-REC-017 PRD-REC-018 POL-02.07 PRD-REC-019 PRD-REC-021 PRD-STK-006 a PT submitted for approval is reviewed and approved from My work, then Official, downloaded, reversed and approved again, scanned in and found in stock search', async ({
  browser,
}) => {
  test.setTimeout(900_000);
  const world = readWorld().ptApproval;
  const { options, styleCode } = world;
  const makerContext = await browser.newContext({ acceptDownloads: true });
  const approverContext = await browser.newContext();
  const maker = await makerContext.newPage();
  const approver = await approverContext.newPage();
  let grnNumber = '';
  // The approver's authenticator app, which gives each code for a later step than the last (support/authenticator.ts).
  let approverApp: Authenticator | undefined;
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
      approverApp = app;
      await approver
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: /^My work/ })
        .click();
      // The approval's item comes through the worker; the server delivers its fixtures' events before the journeys start
      // (apps/server/test/browser/serve.ts), so only the events of journeys running beside this one come first.
      // This maker's: the PT file journey submits a PT in this Organisation too.
      const item = approver
        .getByRole('listitem')
        .filter({ hasText: 'PT approval' })
        .filter({ hasText: world.maker.displayName });
      await expect(async () => {
        await approver.getByRole('button', { name: 'Refresh' }).click();
        await expect(item).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 180_000 });
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

    await test.step('Warehouse proposes reversing the PT with a reason; Operations approves it from My work; the corrected file is approved again', async () => {
      // Before any piece is scanned in (goods-in 6.4, 6.7; DEC-137, PRD-REC-019; S2-F09-T01).
      const proposal = maker.getByRole('form', { name: 'Reverse this PT' });
      await proposal.getByLabel(/^Why the PT is wrong/).fill('SYNTHETIC: P RATE keyed with the handling left out');
      await proposal.getByRole('button', { name: 'Propose the reversal' }).click();
      await expect(maker.getByRole('status').filter({ hasText: 'Reversal proposed.' })).toBeVisible();
      await expect(maker.getByRole('list', { name: 'Reversals' })).toContainText('Awaiting approval');
      // The PT approval's drawer closes with Esc; My work is read again for the reversal.
      await approver.keyboard.press('Escape');
      await expect(approver.getByRole('dialog')).toHaveCount(0);
      const reversal = approver
        .getByRole('listitem')
        .filter({ hasText: 'PT reversal' })
        .filter({ hasText: world.maker.displayName });
      await expect(async () => {
        await approver.getByRole('button', { name: 'Refresh' }).click();
        await expect(reversal).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 120_000 });
      await reversal.getByRole('button', { name: 'Open and decide' }).click();
      const drawer = approver.getByRole('dialog');
      await expect(drawer.getByRole('heading', { level: 2, name: 'PT reversal', exact: true })).toBeVisible();
      // The approval panel's facts: why, and the PT it reverses (goods-in 6.7, section 11).
      await expect(drawer.getByText('SYNTHETIC: P RATE keyed with the handling left out')).toBeVisible({
        timeout: 30_000,
      });
      await expect(drawer.getByRole('heading', { level: 3, name: 'The PT it reverses' })).toBeVisible({
        timeout: 30_000,
      });
      const app = approverApp;
      if (app === undefined) throw new Error('The approver is not signed in');
      await drawer.getByLabel(/^Reason/).selectOption(world.reasonId);
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible({ timeout: 60_000 });
      await approver.keyboard.press('Escape');
      await expect(approver.getByRole('dialog')).toHaveCount(0);

      // The PT is Reversed and the GRN takes the corrected file (goods-in 6.4).
      await maker.getByRole('button', { name: 'Refresh' }).click();
      const revisions = maker.getByRole('table', { name: 'PT revisions' });
      await expect(revisions.getByRole('row').nth(1)).toContainText('Reversed', { timeout: 30_000 });
      await expect(maker.getByRole('list', { name: 'Reversals' })).toContainText('Approved');
      const upload = maker.getByRole('form', { name: 'Upload a PT file' });
      await upload.getByLabel('PT file', { exact: true }).setInputFiles(world.correctedFile);
      await upload.getByRole('button', { name: 'Upload and check' }).click();
      await expect(maker.getByRole('heading', { level: 3, name: 'What submitting it makes' })).toBeVisible({
        timeout: 60_000,
      });
      await maker.getByRole('button', { name: 'Submit for approval' }).click();
      await expect(revisions.getByRole('row').nth(1)).toContainText('Awaiting approval', { timeout: 60_000 });

      const corrected = approver
        .getByRole('listitem')
        .filter({ hasText: 'PT approval' })
        .filter({ hasText: world.maker.displayName });
      await expect(async () => {
        await approver.getByRole('button', { name: 'Refresh' }).click();
        await expect(corrected).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 120_000 });
      await corrected.getByRole('button', { name: 'Open and decide' }).click();
      const again = approver.getByRole('dialog');
      await expect(again.getByRole('heading', { level: 3, name: 'What approving it makes' })).toBeVisible({
        timeout: 30_000,
      });
      // SYNTHETIC: the corrected P RATE, 900.00.
      await expect(again.getByRole('table', { name: 'Rows of the file' }).getByRole('row').nth(1)).toContainText(
        '900.00',
      );
      await again.getByLabel(/^Reason/).selectOption(world.reasonId);
      await again.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await again.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(again.getByText(/^Approved by /)).toBeVisible({ timeout: 60_000 });
      await maker.getByRole('button', { name: 'Refresh' }).click();
      await expect(revisions.getByRole('row').nth(1)).toContainText('Official', { timeout: 30_000 });
      await expect(revisions.getByRole('row').nth(2)).toContainText('Reversed');
    });

    await test.step('Warehouse scans the two pieces in to the floor at phone width, a barcode not on the PT refused', async () => {
      // The inbox now says the delivery waits for its scan-in (goods-in 7.1; RR-606).
      await maker.getByRole('button', { name: 'Back to the inbox' }).click();
      const row = maker.getByRole('row').filter({ hasText: grnNumber });
      // The inbox was read before the approval, in another person's session: read it again.
      await maker.getByRole('button', { name: 'Refresh' }).click();
      await expect(row).toContainText('Waiting for its scan-in', { timeout: 30_000 });
      // A phone, as a Store's staff scan with one (goods-in section 11; PRD-PRO-009).
      await maker.setViewportSize({ width: 375, height: 812 });
      await row.getByRole('button').first().click();
      const summary = maker.getByRole('region', { name: 'Scan-in' });
      await expect(summary.getByText('2 pieces left to scan in')).toBeVisible({ timeout: 30_000 });
      await summary.getByRole('button', { name: 'Scan the pieces in' }).click();
      await expect(maker.getByRole('heading', { level: 2, name: `Scan-in of GRN ${grnNumber}` })).toBeVisible();
      const form = maker.getByRole('form', { name: 'Scan a piece' });
      await form.getByLabel('Where the pieces go').selectOption({ label: world.floor });
      const barcode = form.getByLabel('Barcode');
      // Refused once with the reason shown, and kept in the record (code-house-rules 10.1; goods-in 7.2).
      await barcode.fill('8900000099999');
      await barcode.press('Enter');
      await expect(form.getByRole('alert').filter({ hasText: 'Not on this PT' })).toBeVisible();
      for (const [index, code] of world.barcodes.entries()) {
        await barcode.fill(code);
        // The scanner's Enter sends it.
        await barcode.press('Enter');
        if (index === 0) {
          await expect(form.getByRole('status').filter({ hasText: 'Accepted' })).toBeVisible();
          await expect(maker.getByText('1 piece left to scan in')).toBeVisible();
        }
      }
      await expect(maker.getByText('Every piece is scanned in or under a damage report.')).toBeVisible();
      const scans = maker.getByRole('list', { name: 'Scans' });
      await expect(scans.getByRole('listitem')).toHaveCount(3);
      await expect(scans.getByRole('listitem').last()).toContainText('refused: on no product of this PT');
      // One column at phone width: nothing scrolls sideways (design-language; PRD-PRO-009).
      expect(await maker.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    await test.step('Warehouse finds the two pieces in Stock search as the ledger holds them, exports it, and is refused damage once', async () => {
      // S2-F11-T01 (goods-in 9.1, 9.2, 9.4; PRD-STK-001, PRD-STK-006, PRD-DMG-004): on the journey's own data.
      await maker.setViewportSize({ width: 1280, height: 900 });
      await maker
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: 'Stock search', exact: true })
        .click();
      await expect(maker.getByRole('heading', { level: 1, name: 'Stock search' })).toBeVisible();
      const form = maker.getByRole('search', { name: 'Search stock' });
      await form.getByLabel('Style code or product').fill(styleCode.toLowerCase());
      await form.getByRole('button', { name: 'Search', exact: true }).click();
      const row = maker.getByRole('table', { name: 'Stock found' }).getByRole('row').filter({ hasText: styleCode });
      // The two pieces scanned in are on the floor, accepted, covered and free: physical 2, available to sell 2, none
      // waiting and none held, as the ledger holds them; nothing is left at the receiving location. Their cost, at
      // the corrected PT's P RATE, 900.00 a piece, shows for whoever may see cost (SYNTHETIC; goods-in 9.4).
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(world.floorName);
      const cells = row.getByRole('cell');
      await expect(cells.nth(3)).toHaveText('2');
      await expect(cells.nth(4)).toHaveText(/^2\s*to sell$/);
      await expect(cells.nth(5)).toHaveText('0');
      await expect(cells.nth(6)).toHaveText('0');
      await expect(cells.nth(7)).toHaveText('₹1,800.00');
      const downloading = maker.waitForEvent('download');
      await maker.getByRole('button', { name: 'Export to XLSX' }).click();
      // Named by the business date, on the server's clock (Etc/UTC on the journeys' server).
      const today = (await serverNow()).toISOString().slice(0, 10);
      expect((await downloading).suggestedFilename()).toBe(`stock-search-${today}.xlsx`);
      // Damage reported on the product where it is, from its result (goods-in 8.1, 8.5): refused once with the reason
      // on screen, since no rule routes damage at this Site yet, so nothing is held.
      await row.getByRole('button', { name: 'Report damage' }).click();
      const damage = maker.getByRole('form', { name: 'Report damage' });
      await damage.getByLabel(/^Damaged pieces/).fill('1');
      await damage.getByLabel(/^What is wrong/).fill('SYNTHETIC stain seen on the shop floor');
      await damage.getByRole('button', { name: 'Report and hold the pieces' }).click();
      await expect(damage.getByRole('alert').filter({ hasText: 'This action is not available yet.' })).toBeVisible();
      await maker.getByRole('button', { name: 'Refresh' }).click();
      await expect(cells.nth(4)).toHaveText(/^2\s*to sell$/);
    });
  } finally {
    await makerContext.close();
    await approverContext.close();
  }
});
