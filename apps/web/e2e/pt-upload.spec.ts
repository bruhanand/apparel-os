import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { organisationToday, signIn } from './support/journey';
import { readWorld, type EnrolledUser, type ReceivingOptions } from './support/world';

// S2-F04-T02: the PT file journey (goods-in 5.1 to 5.7, section 11; PRD-REC-016, PRD-REC-017, PRD-PTW-011,
// PRD-IMP-007, PRD-IMP-012; DEC-134, DEC-138; code-house-rules 10.1). Warehouse (P-WHS), also assigned to make PTs,
// counts two pieces of one style and size and issues the GRN; on the GRN, a PT file whose MARGIN is wrong and whose QTY
// is one short is refused whole, every problem listed by row and column; the corrected file shows its preview, a new
// style proposed, and is submitted for approval: the GRN's PT waits for a different person, and the GRN is marked PT
// attached. Every value is SYNTHETIC.

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

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<void> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
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
  await form.getByLabel(/^Lorry receipt number/).fill('SYN-LR-PT');
  await form.getByLabel(/^Lorry receipt date/).fill(organisationToday());
  await form.getByLabel(/^Cartons/).fill('1');
  await form.getByLabel(/^Arrived/).fill(anHourAgo());
  await page.getByRole('dialog').getByRole('button', { name: 'Record the Arrival' }).click();
  await expect(page.getByRole('heading', { level: 2, name: `Arrival from ${options.supplier}` })).toBeVisible();
  const invoice = page.getByRole('form', { name: 'Add the invoice' });
  await invoice.getByLabel(/^Invoice number/).fill('SYN-INV-PT');
  await invoice.getByLabel(/^Invoice date/).fill(organisationToday());
  await invoice.getByLabel('Invoice file').setInputFiles(INVOICE_PDF);
  await invoice.getByRole('button', { name: 'Add the invoice' }).click();
  await expect(invoice.getByRole('status').filter({ hasText: 'Invoice recorded.' })).toBeVisible();
}

test('PRD-REC-016 PRD-REC-017 PRD-IMP-012 a PT file for an issued GRN is refused whole with every problem, then a corrected one is submitted for approval', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().ptUpload;
  const { options, styleCode } = world;

  await test.step('Warehouse counts two pieces of the style and size and issues the GRN', async () => {
    await signedIn(page, world.organisationCode, world.maker);
    await arrivalWithInvoice(page, options);
    const line = page.getByRole('form', { name: 'Add a line' });
    await line.getByLabel(/^Style code/).fill(styleCode);
    await line.getByLabel(/^Colour/).fill('SYNTHETIC NAVY');
    await line.getByLabel(/^Size$/).selectOption({ label: options.sizes[0] ?? '' });
    await line.getByLabel(/^Invoice quantity/).fill('2');
    await line.getByLabel(/^Counted quantity/).fill('2');
    await line.getByRole('button', { name: 'Save the line' }).click();
    await expect(
      page.getByRole('table', { name: 'Lines counted' }).getByRole('row').filter({ hasText: styleCode }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Issue the GRN' }).click();
    await expect(page.getByRole('region', { name: /^GRN SYN-GRN-\d{5}$/ })).toBeVisible();
    await expect(page.getByText('No PT attached.', { exact: true })).toBeVisible();
  });

  const upload = page.getByRole('form', { name: 'Upload a PT file' });

  await test.step('a file with a wrong MARGIN and one piece short is refused whole, each problem by row and column', async () => {
    await upload.getByLabel('PT file', { exact: true }).setInputFiles(world.refusedFile);
    await upload.getByRole('button', { name: 'Upload and check' }).click();
    const problems = page.getByRole('table', { name: 'Problems in the file' });
    await expect(problems).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('alert').filter({ hasText: 'The file is refused whole' })).toBeVisible();
    // The MARGIN of the file's first row, on row 2 below the header (goods-in 5.3).
    const margin = problems.getByRole('row').filter({ hasText: 'MARGIN is not' });
    await expect(margin.getByRole('cell').nth(0)).toHaveText('2');
    await expect(margin.getByRole('cell').nth(1)).toContainText('MARGIN');
    await expect(problems.getByRole('row').filter({ hasText: 'does not add up' })).toContainText(`Style ${styleCode}`);
    await expect(page.getByRole('button', { name: 'Submit for approval' })).toHaveCount(0);
  });

  await test.step('the corrected file shows what submitting it makes and is submitted for approval', async () => {
    await upload.getByLabel('PT file', { exact: true }).setInputFiles(world.goodFile);
    await upload.getByRole('button', { name: 'Upload and check' }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'What submitting it makes' })).toBeVisible({
      timeout: 60_000,
    });
    // Nothing blocks: the report notes only the lists sheet the template carries, which is not imported (imports 8.1).
    await expect(page.getByRole('alert').filter({ hasText: 'The file is refused whole' })).toHaveCount(0);
    const report = page.getByRole('table', { name: 'Problems in the file' });
    await expect(report.getByRole('row').filter({ hasText: 'Blocking' })).toHaveCount(0);
    await expect(report.getByRole('row').filter({ hasText: 'This sheet is not imported.' })).toContainText(
      'SYNTHETIC Lists',
    );
    const rows = page.getByRole('table', { name: 'Rows of the file' }).getByRole('row').filter({ hasText: styleCode });
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('52.73');
    await expect(page.getByRole('region', { name: 'New products proposed' })).toContainText(`New style ${styleCode}`);
    await page.getByRole('button', { name: 'Submit for approval' }).click();
    const revisions = page.getByRole('table', { name: 'PT revisions' });
    await expect(revisions).toBeVisible({ timeout: 60_000 });
    await expect(revisions.getByRole('row').nth(1)).toContainText('Awaiting approval');
    await expect(page.getByText(/^PT attached: /)).toBeVisible();
    await expect(page.getByText('A PT file cannot be uploaded for this GRN yet.')).toBeVisible();
  });
});
