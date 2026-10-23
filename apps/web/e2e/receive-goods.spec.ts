import { expect, test, type Page } from '@playwright/test';
import { inbox, signedIn } from './support/journey';
import { readWorld, type ReceivingOptions } from './support/world';
import { anHourAgo, organisationDate } from './support/clock';

// S2-F02-T02: the journeys of Receive Goods, one per persona that receives (code-house-rules 10.1; goods-in 4.1 to
// 4.5, section 11; PRD-REC-001 to PRD-REC-008; DEC-133), each in a SYNTHETIC world of its own. A Warehouse receiver
// (P-WHS) sees the unit where receiving is not granted named with what it lacks, records an Arrival, is told to record
// the supplier invoice first, counts a line short of its invoice and is refused the GRN with the reason, since this
// world routes the shortage's follow-up to no one at the Site (goods-in 4.9; S2-F02-T03), corrects the count and issues
// the GRN with no approval. A Store's staff (P-STM) counts a batch-tracked product named on the line,
// is refused the GRN until the line has its batch and expiry, adds them and issues it. Each finds the GRN printed with
// quantities only. Every value is SYNTHETIC.

/** A SYNTHETIC PDF, as the invoice the supplier sent. */
const INVOICE_PDF = {
  name: 'SYNTHETIC-invoice.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% SYNTHETIC invoice\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'latin1'),
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The read of one Arrival, `GET /api/receiving/arrivals/{arrivalId}`. */
const ARRIVAL_READ = /\/api\/receiving\/arrivals\/[^/?]+$/;

/**
 * Has the screen read the Arrival slowly, as on a slow connection, so the GRN is pressed while the Arrival is still
 * being read again after a change: the change made the Arrival's version newer, and issuing names the version
 * (code-house-rules 12.7). Answers the step that ends it.
 */
async function slowArrivalReads(page: Page): Promise<() => Promise<void>> {
  await page.route(ARRIVAL_READ, async (route) => {
    if (route.request().method() === 'GET') await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.continue();
  });
  return () => page.unroute(ARRIVAL_READ);
}

/** A business date as the screens show it, DD MMM YYYY (design-language 8). */
function shown(date: string): string {
  const [year = '', month = '', day = ''] = date.split('-');
  return `${day} ${MONTHS[Number(month) - 1] ?? ''} ${year}`;
}

/** Opens the inbox of the world's Site, on its Pending view. */
async function inboxOf(page: Page, options: ReceivingOptions): Promise<void> {
  await inbox(page, options.site);
  await expect(page.getByRole('tab', { name: 'Pending' })).toHaveAttribute('aria-selected', 'true');
}

/** Records an Arrival at the first Store's unit of the world and opens it (goods-in 4.2). */
async function recordArrival(page: Page, options: ReceivingOptions, lorryReceipt: string): Promise<void> {
  await page.getByRole('button', { name: 'Goods arrived' }).click();
  const form = page.getByRole('form', { name: 'Record an Arrival' });
  await form.locator('#receive-unit').selectOption({ label: options.wholeStore });
  await form.locator('#receive-location').selectOption({ label: options.storeLocation });
  await form.locator('#receive-supplier').selectOption({ label: options.supplier });
  await form.locator('#receive-brand').selectOption({ label: options.brand });
  await form.getByLabel(/^Transporter/).fill('SYNTHETIC Transporter');
  await form.getByLabel(/^Lorry receipt number/).fill(lorryReceipt);
  await form.getByLabel(/^Lorry receipt date/).fill(await organisationDate());
  await form.getByLabel(/^Cartons/).fill('2');
  await form.getByLabel(/^Arrived/).fill(await anHourAgo());
  await page.getByRole('dialog').getByRole('button', { name: 'Record the Arrival' }).click();
  await expect(page.getByRole('heading', { level: 2, name: `Arrival from ${options.supplier}` })).toBeVisible();
}

/** Records the supplier invoice with its file (DEC-133). */
async function recordInvoice(page: Page, number: string): Promise<void> {
  const invoice = page.getByRole('form', { name: 'Add the invoice' });
  await invoice.getByLabel(/^Invoice number/).fill(number);
  await invoice.getByLabel(/^Invoice date/).fill(await organisationDate());
  await invoice.getByLabel('Invoice file').setInputFiles(INVOICE_PDF);
  await invoice.getByRole('button', { name: 'Add the invoice' }).click();
  await expect(invoice.getByRole('status').filter({ hasText: 'Invoice recorded.' })).toBeVisible();
  await expect(page.getByText(`Invoice ${number} of ${shown(await organisationDate())}`)).toBeVisible();
}

test('PRD-REC-001 PRD-REC-008 DEC-133 a Warehouse receiver records an Arrival, its invoice first, is refused a GRN whose shortage has no owner at the Site, and issues it with no approval', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const world = readWorld().receiving;
  const { options } = world;
  await signedIn(page, world.organisationCode, world.receiver);

  await test.step('the inbox of the Site names the unit where receiving is not available', async () => {
    await inboxOf(page, options);
    const blocked = page.getByRole('list', { name: 'Units that cannot receive now' });
    await expect(blocked.getByText(`Receiving is not available at ${options.warehouse}.`)).toBeVisible();
    await expect(page.getByText('Nothing to receive')).toBeVisible();
  });

  await test.step('the receiver records the Arrival at a Store’s unit', async () => {
    await recordArrival(page, options, 'SYN-LR-JOURNEY');
  });

  await test.step('the count waits for the supplier invoice, recorded with its file', async () => {
    await expect(
      page.getByText('Record the supplier invoice first: the count starts once it is recorded.'),
    ).toBeVisible();
    await expect(page.getByRole('form', { name: 'Add a line' })).toHaveCount(0);
    await recordInvoice(page, 'SYN-INV-JOURNEY');
  });

  await test.step('the receiver counts a line one piece short of the invoice', async () => {
    const line = page.getByRole('form', { name: 'Add a line' });
    await line.getByLabel(/^Style code/).fill('SYN-STYLE-JOURNEY');
    await line.getByLabel(/^Colour/).fill('SYNTHETIC NAVY');
    await line.getByLabel(/^Size$/).selectOption({ label: options.sizes[0] ?? '' });
    await line.getByLabel(/^Invoice quantity/).fill('5');
    await line.getByLabel(/^Counted quantity/).fill('4');
    await line.getByRole('button', { name: 'Save the line' }).click();
    const row = page.getByRole('table', { name: 'Lines counted' }).getByRole('row').filter({
      hasText: 'SYN-STYLE-JOURNEY',
    });
    await expect(row).toContainText('SYNTHETIC NAVY');
    await expect(row).toContainText(world.receiver.displayName);
  });

  await test.step('the GRN is refused while its shortage’s follow-up has no owner at the Site, with the reason', async () => {
    // The shortage reaches Booking as an exception, routed at the Site (goods-in 4.9; POL-02.16): this world routes none.
    await page.getByRole('button', { name: 'Issue the GRN' }).click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Exceptions of this type have no owner here yet: no exception rule is in force.' }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: /^GRN SYN-GRN-/ })).toHaveCount(0);
  });

  await test.step('the receiver corrects the count and issues the GRN with no approval; it is printed with quantities only', async () => {
    await page
      .getByRole('table', { name: 'Lines counted' })
      .getByRole('row')
      .filter({ hasText: 'SYN-STYLE-JOURNEY' })
      .getByRole('button', { name: 'Change' })
      .click();
    const change = page.getByRole('form', { name: 'Change' });
    await change.getByLabel(/^Counted quantity/).fill('5');
    const readsAtSpeed = await slowArrivalReads(page);
    await change.getByRole('button', { name: 'Save the change' }).click();
    await expect(change).toHaveCount(0);
    // Pressed at once, while the Arrival is read again: issuing waits for the read and names the change's new version,
    // so it is never refused as stale (code-house-rules 12.7).
    await page.getByRole('button', { name: 'Issue the GRN' }).click();
    const grn = page.getByRole('region', { name: /^GRN SYN-GRN-\d{5}$/ });
    await expect(grn).toBeVisible();
    await expect(
      grn.getByRole('table', { name: 'GRN lines' }).getByRole('row').filter({ hasText: 'SYN-STYLE-JOURNEY' }),
    ).toContainText('5');
    await expect(grn.getByText(`SYN-INV-JOURNEY of ${shown(await organisationDate())}`)).toBeVisible();
    await expect(grn.getByText('Quantities only: the GRN holds no price, tax or value.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Issue the GRN' })).toHaveCount(0);
    await readsAtSpeed();
  });

  await test.step('the delivery waits for its PT in the inbox', async () => {
    await page.getByRole('button', { name: 'Back to the inbox' }).click();
    const row = page.getByRole('table', { name: 'Deliveries' }).getByRole('row').filter({ hasText: 'SYN-INV-JOURNEY' });
    await expect(row).toContainText('Issued');
    await expect(row).toContainText('Waiting for the PT');
  });
});

test('PRD-REC-004 PRD-MER-011 a Store’s staff counts a batch-tracked product at their Store and is refused the GRN until the line has its batch and expiry', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const world = readWorld().receiving;
  const options = world.storeOptions;
  const expiry = await organisationDate(90);
  await signedIn(page, world.organisationCode, world.storeStaff);

  await test.step('the Store’s staff records the Arrival at their Store’s unit, its invoice first', async () => {
    await inboxOf(page, options);
    await recordArrival(page, options, 'SYN-LR-STORE');
    await recordInvoice(page, 'SYN-INV-STORE');
  });

  await test.step('the line names the product set up for its style code, whose profile asks for a batch and expiry', async () => {
    const line = page.getByRole('form', { name: 'Add a line' });
    await line.getByLabel(/^Style code/).fill(world.storeBatchStyleCode);
    await line.getByLabel(/^Product/).selectOption({ label: options.batchSku });
    // Goods on the invoice are counted with their size before the GRN (goods-in 4.3; RR-586).
    await line.getByLabel(/^Size$/).selectOption({ label: options.sizes[0] ?? '' });
    await expect(line.getByLabel(/^Batch/)).toBeVisible();
    await line.getByLabel(/^Invoice quantity/).fill('3');
    await line.getByLabel(/^Counted quantity/).fill('3');
    await line.getByRole('button', { name: 'Save the line' }).click();
    await expect(
      page.getByRole('table', { name: 'Lines counted' }).getByRole('row').filter({ hasText: options.batchSku }),
    ).toContainText(world.storeStaff.displayName);
  });

  await test.step('the GRN is refused while the line lacks its batch and expiry, with the reason', async () => {
    await page.getByRole('button', { name: 'Issue the GRN' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'This product needs its batch and expiry on the line.' }),
    ).toBeVisible();
  });

  await test.step('the batch and expiry are added to the line, and the GRN is issued with them', async () => {
    await page
      .getByRole('table', { name: 'Lines counted' })
      .getByRole('row')
      .filter({ hasText: options.batchSku })
      .getByRole('button', { name: 'Change' })
      .click();
    const change = page.getByRole('form', { name: 'Change' });
    await change.getByLabel(/^Batch/).fill('SYN-BATCH-STORE');
    await change.getByLabel(/^Expiry date/).fill(expiry);
    const readsAtSpeed = await slowArrivalReads(page);
    await change.getByRole('button', { name: 'Save the change' }).click();
    await expect(change).toHaveCount(0);
    // Pressed at once, while the Arrival is read again: issuing waits for the read (12.7).
    await page.getByRole('button', { name: 'Issue the GRN' }).click();
    const grn = page.getByRole('region', { name: /^GRN SYN-GRN-\d{5}$/ });
    await expect(grn).toBeVisible();
    await expect(
      grn.getByRole('table', { name: 'GRN lines' }).getByRole('row').filter({ hasText: options.batchSku }),
    ).toContainText(`SYN-BATCH-STORE, expires ${shown(expiry)}`);
    await readsAtSpeed();
  });
});
