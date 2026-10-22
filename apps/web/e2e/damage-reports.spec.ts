import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { organisationToday, signIn } from './support/journey';
import { readWorld, type EnrolledUser, type ReceivingOptions } from './support/world';

// S2-F08-T01: the damage journey (goods-in 8.1 to 8.3, 8.5, section 11; PRD-DMG-001 to PRD-DMG-005, PRD-ACS-016;
// code-house-rules 10.1). A Store's staff (P-STM) receives goods of a product not yet set up at their Store and issues
// the GRN, then reports damage on the GRN line: more pieces than are in custody is refused with the reason on screen;
// two pieces with a photo are reported and held, the report Submitted. Operations (P-OPS) finds the decision and the
// damage exception in My work, sees the report's facts and photo, and confirms it on an Unknown cost, which their
// SYNTHETIC limit covers; the reporter then reads the report Confirmed. Every value is SYNTHETIC.

/** A SYNTHETIC invoice PDF, as the supplier sent it. */
const INVOICE_PDF = {
  name: 'SYNTHETIC-invoice.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% SYNTHETIC invoice\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'latin1'),
};

/** A SYNTHETIC photograph of the damage. */
const PHOTO = {
  name: 'SYNTHETIC-torn-seam.jpg',
  mimeType: 'image/jpeg',
  buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('SYNTHETIC torn seam', 'latin1')]),
};

const STYLE = 'SYN-STYLE-DAMAGE';

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
  await form.getByLabel(/^Lorry receipt number/).fill('SYN-LR-DAMAGE');
  await form.getByLabel(/^Lorry receipt date/).fill(organisationToday());
  await form.getByLabel(/^Cartons/).fill('1');
  await form.getByLabel(/^Arrived/).fill(anHourAgo());
  await page.getByRole('dialog').getByRole('button', { name: 'Record the Arrival' }).click();
  await expect(page.getByRole('heading', { level: 2, name: `Arrival from ${options.supplier}` })).toBeVisible();
  const invoice = page.getByRole('form', { name: 'Add the invoice' });
  await invoice.getByLabel(/^Invoice number/).fill('SYN-INV-DAMAGE');
  await invoice.getByLabel(/^Invoice date/).fill(organisationToday());
  await invoice.getByLabel('Invoice file').setInputFiles(INVOICE_PDF);
  await invoice.getByRole('button', { name: 'Add the invoice' }).click();
  await expect(invoice.getByRole('status').filter({ hasText: 'Invoice recorded.' })).toBeVisible();
}

test('PRD-DMG-001 PRD-DMG-003 PRD-ACS-016 a Store’s staff reports damage on a GRN line, is refused more than is in custody, and Operations confirms it from My work', async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const world = readWorld().damage;
  const { options } = world;
  const reporterContext = await browser.newContext();
  const operationsContext = await browser.newContext();
  const reporter = await reporterContext.newPage();
  const operations = await operationsContext.newPage();
  let number = '';
  try {
    await test.step('the Store’s staff receives six pieces of a product not yet set up and issues the GRN', async () => {
      await signedIn(reporter, world.organisationCode, world.reporter);
      await arrivalWithInvoice(reporter, options);
      const line = reporter.getByRole('form', { name: 'Add a line' });
      await line.getByLabel(/^Style code/).fill(STYLE);
      await line.getByLabel(/^Colour/).fill('SYNTHETIC NAVY');
      await line.getByLabel(/^Size$/).selectOption({ label: options.sizes[0] ?? '' });
      await line.getByLabel(/^Invoice quantity/).fill('6');
      await line.getByLabel(/^Counted quantity/).fill('6');
      await line.getByRole('button', { name: 'Save the line' }).click();
      await expect(
        reporter.getByRole('table', { name: 'Lines counted' }).getByRole('row').filter({ hasText: STYLE }),
      ).toContainText(world.reporter.displayName);
      await reporter.getByRole('button', { name: 'Issue the GRN' }).click();
      await expect(reporter.getByRole('region', { name: /^GRN SYN-GRN-\d{5}$/ })).toBeVisible();
    });

    const form = reporter.getByRole('form', { name: 'Report damage' });
    await test.step('damage on more pieces than are in custody is refused, with the reason on screen', async () => {
      await reporter
        .getByRole('table', { name: 'GRN lines' })
        .getByRole('row')
        .filter({ hasText: STYLE })
        .getByRole('button', { name: 'Report damage' })
        .click();
      await form.getByLabel(/^Damaged pieces/).fill('7');
      await form.getByLabel(/^What is wrong/).fill('SYNTHETIC torn seam seen at the count');
      await form.getByRole('button', { name: 'Report and hold the pieces' }).click();
      await expect(form.getByRole('alert').filter({ hasText: 'These goods are not in custody here.' })).toBeVisible();
    });

    await test.step('two pieces are reported with a photo and held at once; the report waits for its decision', async () => {
      await form.getByLabel(/^Damaged pieces/).fill('2');
      await form.getByLabel(/^Photo of the damage/).setInputFiles(PHOTO);
      await form.getByRole('button', { name: 'Report and hold the pieces' }).click();
      const heading = reporter.getByRole('heading', { level: 3, name: /^Damage report SYN-DMG-\d{5}$/ });
      await expect(heading).toBeVisible();
      number = ((await heading.textContent()) ?? '').replace('Damage report ', '');
      await expect(reporter.getByText('Submitted', { exact: true })).toBeVisible();
      await expect(reporter.getByRole('list', { name: 'Decisions' })).toContainText(
        'As reported: Waiting for a decision',
      );
    });

    await test.step('Operations finds the exception and the decision in My work, with the report’s facts and photo', async () => {
      const app = await signedIn(operations, world.organisationCode, world.operations);
      await operations
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: /^My work/ })
        .click();
      // The exception is raised in the report's own transaction; the decision's item comes through the worker, which
      // hands this Organisation's earlier events, the fixtures' approvals of the receiving worlds, to My work first
      // (apps/server/test/browser/serve.ts), so it may take a while.
      await expect(operations.getByRole('listitem').filter({ hasText: 'Exception' })).toHaveCount(1);
      const decision = operations.getByRole('listitem').filter({ hasText: 'Damage report decision' });
      await expect(async () => {
        await operations.getByRole('button', { name: 'Refresh' }).click();
        await expect(decision).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 180_000 });
      await decision.getByRole('button', { name: 'Open and decide' }).click();
      const drawer = operations.getByRole('dialog');
      await expect(
        drawer.getByRole('heading', { level: 2, name: 'Damage report decision', exact: true }),
      ).toBeVisible();
      await expect(drawer.getByText(number, { exact: true }).first()).toBeVisible();
      await expect(drawer.getByText('SYNTHETIC torn seam seen at the count')).toBeVisible();
      await expect(drawer.getByRole('list', { name: 'Evidence' }).getByText(PHOTO.name)).toBeVisible();

      await drawer.getByLabel(/^Reason/).selectOption(world.reasonId);
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
    });

    await test.step('the reporter reads the report again: it is Confirmed', async () => {
      await reporter.getByRole('button', { name: 'Read the report again' }).click();
      await expect(reporter.getByText('Confirmed', { exact: true })).toBeVisible();
      await expect(reporter.getByRole('list', { name: 'Decisions' })).toContainText('As reported: Confirmed');
    });
  } finally {
    await reporterContext.close();
    await operationsContext.close();
  }
});
