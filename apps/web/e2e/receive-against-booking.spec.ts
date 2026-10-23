import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { organisationToday, signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';
import { anHourAgo } from './support/clock';

// S2-F02-T04: the receive-against-booking journey (goods-in 3.7, 4.1, 4.10, section 11; PRD-REC-002, PRD-BKG-007,
// PRD-BKG-008, POL-05.08; code-house-rules 10.1). Warehouse (P-WHS) chooses "Receive against booking", is refused once
// until the booking is named, sees its open lines as the expected goods, counts three pieces where two are booked and
// issues the GRN: the line goes to Booking for review as beyond the booking line's outstanding. Booking (P-BKG) proposes
// it into the booking from the GRN; the Owner (P-OWN), a different person, approves it from My work, seeing why it needs
// approval; and the GRN line reads linked to the booking with approval. The booking, two pieces of one style and size,
// was approved by the journeys' server through the API. Every value is SYNTHETIC.

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

/** The world's Site's inbox, from the main menu (goods-in 4.1). */
async function inbox(page: Page, site: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Inbox', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
  await page.getByLabel('Site').selectOption({ label: site });
}

test('PRD-REC-002 PRD-BKG-007 POL-05.08 Warehouse receives against a booking; excess goes to Booking, who proposes it, and the Owner approves it', async ({
  browser,
}) => {
  test.setTimeout(480_000);
  const world = readWorld().againstBooking;
  const { options } = world;
  const size = options.sizes[0] ?? '';
  const receiverContext = await browser.newContext();
  const bookerContext = await browser.newContext();
  const ownerContext = await browser.newContext();
  const receiver = await receiverContext.newPage();
  const booker = await bookerContext.newPage();
  const owner = await ownerContext.newPage();
  let grnNumber = '';
  try {
    await test.step('Warehouse records the Arrival against the booking, refused once until it is named', async () => {
      await signedIn(receiver, world.organisationCode, world.receiver);
      await inbox(receiver, options.site);
      await receiver.getByRole('button', { name: 'Receive against booking' }).click();
      const form = receiver.getByRole('form', { name: 'Receive against a booking' });
      await form.locator('#receive-unit').selectOption({ label: options.wholeStore });
      await form.locator('#receive-location').selectOption({ label: options.storeLocation });
      await form.locator('#receive-supplier').selectOption({ label: options.supplier });
      await form.locator('#receive-brand').selectOption({ label: options.brand });
      await form.getByLabel(/^Transporter/).fill('SYNTHETIC Transporter');
      await form.getByLabel(/^Lorry receipt number/).fill('SYN-LR-RAB');
      await form.getByLabel(/^Lorry receipt date/).fill(organisationToday());
      await form.getByLabel(/^Cartons/).fill('1');
      await form.getByLabel(/^Arrived/).fill(await anHourAgo());
      await receiver.getByRole('dialog').getByRole('button', { name: 'Record the Arrival' }).click();
      await expect(form.getByText('Choose the booking the goods come against.')).toBeVisible();
      const option = form.locator('#receive-booking option', { hasText: world.bookingNumber });
      await expect(option).toHaveCount(1);
      await form.locator('#receive-booking').selectOption((await option.getAttribute('value')) ?? '');
      await receiver.getByRole('dialog').getByRole('button', { name: 'Record the Arrival' }).click();
      await expect(receiver.getByRole('heading', { level: 2, name: `Arrival from ${options.supplier}` })).toBeVisible();
      // The booking's open lines are the expected goods (goods-in 4.1).
      await expect(receiver.getByRole('table', { name: 'Expected goods' })).toContainText(world.styleCode);
    });

    await test.step('Warehouse counts three pieces where two are booked and issues the GRN; the line goes to review', async () => {
      const invoice = receiver.getByRole('form', { name: 'Add the invoice' });
      await invoice.getByLabel(/^Invoice number/).fill('SYN-INV-RAB');
      await invoice.getByLabel(/^Invoice date/).fill(organisationToday());
      await invoice.getByLabel('Invoice file').setInputFiles(INVOICE_PDF);
      await invoice.getByRole('button', { name: 'Add the invoice' }).click();
      await expect(invoice.getByRole('status').filter({ hasText: 'Invoice recorded.' })).toBeVisible();
      const line = receiver.getByRole('form', { name: 'Add a line' });
      await line.getByLabel(/^Style code/).fill(world.styleCode);
      await line.getByLabel(/^Colour/).fill('SYNTHETIC NAVY');
      await line.getByLabel(/^Size$/).selectOption({ label: size });
      await line.getByLabel(/^Invoice quantity/).fill('3');
      await line.getByLabel(/^Counted quantity/).fill('3');
      await line.getByRole('button', { name: 'Save the line' }).click();
      await expect(
        receiver.getByRole('table', { name: 'Lines counted' }).getByRole('row').filter({ hasText: world.styleCode }),
      ).toBeVisible();
      await receiver.getByRole('button', { name: 'Issue the GRN' }).click();
      const grn = receiver.getByRole('region', { name: /^GRN SYN-GRN-\d{5}$/ });
      await expect(grn).toBeVisible();
      grnNumber = ((await grn.getByRole('heading', { level: 3 }).textContent()) ?? '').replace('GRN ', '');
      const row = receiver
        .getByRole('table', { name: 'GRN lines' })
        .getByRole('row')
        .filter({ hasText: world.styleCode });
      await expect(row).toContainText(`With Booking for review against ${world.bookingNumber}`);
      await expect(row).toContainText('beyond the booking line’s outstanding');
    });

    await test.step('Booking proposes the excess into the booking from the GRN', async () => {
      await signedIn(booker, world.organisationCode, world.booker);
      await inbox(booker, options.site);
      await booker.getByRole('table', { name: 'Deliveries' }).getByRole('row').nth(1).getByRole('button').click();
      const card = booker.getByRole('region', { name: `GRN ${grnNumber}` });
      await expect(card).toBeVisible();
      const lines = booker.getByRole('table', { name: 'Lines to link' });
      // The booking line the excess matched at issue is chosen already.
      await expect(lines).toContainText('2 outstanding');
      await booker.getByRole('button', { name: 'Link to the booking' }).click();
      await expect(booker.getByText('Linked now: 0. Sent to a different person for approval: 1.')).toBeVisible();
      const row = booker
        .getByRole('table', { name: 'GRN lines' })
        .getByRole('row')
        .filter({ hasText: world.styleCode });
      await expect(row).toContainText(`Waiting for approval to link to ${world.bookingNumber}`);
    });

    await test.step('the Owner approves it from My work, seeing why it needs approval', async () => {
      const app = await signedIn(owner, world.organisationCode, world.owner);
      await owner
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: /^My work/ })
        .click();
      // The worker publishes the receiving Organisation's events in order, its setup's many approvals first, so the
      // item may take a while to reach My work on a busy machine.
      const item = owner.getByRole('listitem').filter({ hasText: 'Late or excess goods into a booking' });
      await expect(async () => {
        await owner.getByRole('button', { name: 'Refresh' }).click();
        await expect(item).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 180_000 });
      await item.getByRole('button', { name: 'Open and decide' }).click();
      const drawer = owner.getByRole('dialog');
      await expect(
        drawer.getByRole('heading', { level: 2, name: 'Late or excess goods into a booking', exact: true }),
      ).toBeVisible();
      const proposed = drawer.getByRole('table', { name: 'Lines proposed' });
      await expect(proposed).toContainText(grnNumber);
      await expect(proposed).toContainText('Excess');
      await drawer.getByLabel(/^Reason/).selectOption(world.reasonId);
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
    });

    await test.step('the GRN line reads linked to the booking, accepted with approval; the GRN is otherwise as issued', async () => {
      await booker.getByRole('button', { name: 'Refresh' }).click();
      const row = booker
        .getByRole('table', { name: 'GRN lines' })
        .getByRole('row')
        .filter({ hasText: world.styleCode });
      await expect(row).toContainText(`Linked to ${world.bookingNumber}, line 1`);
      await expect(row).toContainText('Accepted into the booking with approval');
      await expect(booker.getByRole('button', { name: 'Link to the booking' })).toHaveCount(0);
    });
  } finally {
    await receiverContext.close();
    await bookerContext.close();
    await ownerContext.close();
  }
});
