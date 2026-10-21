import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { organisationToday, signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S2-F02-T02: the receiver's journey on Receive Goods (goods-in 4.1 to 4.5, section 11; PRD-REC-001 to PRD-REC-008;
// DEC-133). A Warehouse receiver opens the inbox of a SYNTHETIC Site, sees the unit where receiving is not granted
// named with what it lacks, records an Arrival at a Store's unit, is told to record the supplier invoice first, records
// it with its file, counts one line against it, issues the GRN with no approval, and finds it printed with quantities
// only and the delivery waiting for its PT in the inbox. Every value is SYNTHETIC.

/** A SYNTHETIC PDF, as the invoice the supplier sent. */
const INVOICE_PDF = {
  name: 'SYNTHETIC-invoice.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% SYNTHETIC invoice\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'latin1'),
};

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<void> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
}

/** An hour ago, as a `datetime-local` field takes it in the browser's own time. */
function anHourAgo(): string {
  const at = new Date(Date.now() - 3_600_000);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${String(at.getFullYear())}-${two(at.getMonth() + 1)}-${two(at.getDate())}T${two(at.getHours())}:${two(at.getMinutes())}`;
}

test('PRD-REC-001 PRD-REC-008 DEC-133 a receiver records an Arrival, its invoice first, counts it and issues the GRN with no approval', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const world = readWorld().receiving;
  const { options } = world;
  await signedIn(page, world.organisationCode, world.receiver);

  await test.step('the inbox of the Site names the unit where receiving is not available', async () => {
    await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Inbox', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
    await page.getByLabel('Site').selectOption({ label: options.site });
    await expect(page.getByRole('tab', { name: 'Pending' })).toHaveAttribute('aria-selected', 'true');
    const blocked = page.getByRole('list', { name: 'Units that cannot receive now' });
    await expect(blocked.getByText(`Receiving is not available at ${options.warehouse}.`)).toBeVisible();
    await expect(page.getByText('Nothing to receive')).toBeVisible();
  });

  await test.step('the receiver records the Arrival at a Store’s unit', async () => {
    await page.getByRole('button', { name: 'Goods arrived' }).click();
    const form = page.getByRole('form', { name: 'Record an Arrival' });
    await form.locator('#receive-unit').selectOption({ label: options.wholeStore });
    await form.locator('#receive-location').selectOption({ label: options.storeLocation });
    await form.locator('#receive-supplier').selectOption({ label: options.supplier });
    await form.locator('#receive-brand').selectOption({ label: options.brand });
    await form.getByLabel(/^Transporter/).fill('SYNTHETIC Transporter');
    await form.getByLabel(/^Lorry receipt number/).fill('SYN-LR-JOURNEY');
    await form.getByLabel(/^Lorry receipt date/).fill(organisationToday());
    await form.getByLabel(/^Cartons/).fill('2');
    await form.getByLabel(/^Arrived/).fill(anHourAgo());
    await page.getByRole('dialog').getByRole('button', { name: 'Record the Arrival' }).click();
    await expect(page.getByRole('heading', { level: 2, name: `Arrival from ${options.supplier}` })).toBeVisible();
  });

  await test.step('the count waits for the supplier invoice, recorded with its file', async () => {
    await expect(
      page.getByText('Record the supplier invoice first: the count starts once it is recorded.'),
    ).toBeVisible();
    await expect(page.getByRole('form', { name: 'Add a line' })).toHaveCount(0);
    const invoice = page.getByRole('form', { name: 'Add the invoice' });
    await invoice.getByLabel(/^Invoice number/).fill('SYN-INV-JOURNEY');
    await invoice.getByLabel(/^Invoice date/).fill(organisationToday());
    await invoice.getByLabel('Invoice file').setInputFiles(INVOICE_PDF);
    await invoice.getByRole('button', { name: 'Add the invoice' }).click();
    await expect(invoice.getByRole('status').filter({ hasText: 'Invoice recorded.' })).toBeVisible();
    await expect(page.getByText(`Invoice SYN-INV-JOURNEY of ${organisationToday()}`)).toBeVisible();
  });

  await test.step('the receiver counts a line against the invoice', async () => {
    const line = page.getByRole('form', { name: 'Add a line' });
    await line.getByLabel(/^Style code/).fill('SYN-STYLE-JOURNEY');
    await line.getByLabel(/^Colour/).fill('SYNTHETIC NAVY');
    await line.getByLabel(/^Size list/).selectOption({ label: options.sizeList });
    await line.getByLabel(/^Size$/).selectOption({ label: options.sizes[0] ?? '' });
    await line.getByLabel(/^Invoice quantity/).fill('4');
    await line.getByLabel(/^Counted quantity/).fill('4');
    await line.getByRole('button', { name: 'Save the line' }).click();
    const lines = page.getByRole('table', { name: 'Lines counted' });
    await expect(lines.getByRole('row').filter({ hasText: 'SYN-STYLE-JOURNEY' })).toContainText('SYNTHETIC NAVY');
    await expect(lines.getByRole('row').filter({ hasText: 'SYN-STYLE-JOURNEY' })).toContainText(
      world.receiver.displayName,
    );
  });

  await test.step('the receiver issues the GRN with no approval; it is printed with quantities only', async () => {
    await page.getByRole('button', { name: 'Issue the GRN' }).click();
    const grn = page.getByRole('region', { name: /^GRN SYN-GRN-\d{5}$/ });
    await expect(grn).toBeVisible();
    await expect(
      grn.getByRole('table', { name: 'GRN lines' }).getByRole('row').filter({ hasText: 'SYN-STYLE-JOURNEY' }),
    ).toContainText('4');
    await expect(grn.getByText('Quantities only: the GRN holds no price, tax or value.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Issue the GRN' })).toHaveCount(0);
  });

  await test.step('the delivery waits for its PT in the inbox', async () => {
    await page.getByRole('button', { name: 'Back to the inbox' }).click();
    const row = page.getByRole('table', { name: 'Deliveries' }).getByRole('row').filter({ hasText: 'SYN-INV-JOURNEY' });
    await expect(row).toContainText('Issued');
    await expect(row).toContainText('Waiting for the PT');
  });
});
