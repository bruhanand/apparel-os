import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S2-F01-T03: the booking journey (goods-in 3.1 to 3.4, section 11; PRD-BKG-001 to PRD-BKG-004; POL-02.07; DEC-130,
// DEC-132, DEC-136). Booking enters a booking by hand on Booking › Bookings: its header, one style's lines through the
// size-colour grid, one line of them changed, and a line at style level alone, with the totals shown as typed; saves it
// as a Draft; is refused the submission until the booking document is attached; attaches it and submits. The Owner
// approves it from My work, a different person whose SYNTHETIC limit covers its value at cost. The booking is then
// Approved with its number, its open-to-buy reserved and the Agreement version fixed. Every value is SYNTHETIC.

/** A SYNTHETIC PDF, as the booking document the brand gave. */
const BOOKING_PDF = {
  name: 'SYNTHETIC-booking.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% SYNTHETIC booking\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'latin1'),
};

/**
 * The booking's totals, worked by hand: 30 pieces of the grid's style at ₹500.00 and 6 of the other at ₹300.00 is
 * ₹16,800.00 at cost; at MRP 25 at ₹999.00, 5 at ₹1,099.00 and 6 at ₹699.00 is ₹34,664.00.
 */
const COST_TOTAL = '₹16,800.00';
const MRP_TOTAL = '₹34,664.00';

/** The Organisation's business date so many days from today (Etc/UTC on the journeys' server). */
function daysFromToday(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

async function openBookings(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'Bookings', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bookings' })).toBeVisible();
}

test('PRD-BKG-001 PRD-BKG-004 POL-02.07 Booking records a booking with the size-colour grid, and a different person approves it', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().booking;
  const bookingContext = await browser.newContext();
  const ownerContext = await browser.newContext();
  const booking = await bookingContext.newPage();
  const owner = await ownerContext.newPage();
  try {
    await test.step('Booking enters the header, the grid of one style and a line at style level, with totals', async () => {
      await signedIn(booking, world.organisationCode, world.booker);
      await openBookings(booking);
      await booking.getByRole('button', { name: 'New booking' }).click();
      const form = booking.getByRole('form', { name: 'New booking' });
      await form.locator('#booking-brand').selectOption({ label: world.brandOption });
      await form.locator('#booking-site').selectOption({ label: world.siteOption });
      await form.locator('#booking-supplier').selectOption({ label: world.supplierOption });
      await form.locator('#booking-season').selectOption({ label: world.seasonOption });
      await form.locator('#booking-window-from').fill(daysFromToday(10));
      await form.locator('#booking-window-to').fill(daysFromToday(40));
      // The grid: colours down, sizes across, one cost and MRP for the style (goods-in 3.1).
      await form.locator('#booking-grid-style').fill('SYN-JOURNEY-ST-1');
      await form.locator('#booking-grid-cost').fill('500');
      await form.locator('#booking-grid-mrp').fill('999');
      await form.locator('#booking-grid-colours').fill('SYNTHETIC NAVY, SYNTHETIC RED');
      await form.locator('#booking-grid-sizes').fill('S, M');
      await form.getByLabel('Quantity SYNTHETIC NAVY S').fill('10');
      await form.getByLabel('Quantity SYNTHETIC NAVY M').fill('10');
      await form.getByLabel('Quantity SYNTHETIC RED S').fill('5');
      await form.getByLabel('Quantity SYNTHETIC RED M').fill('5');
      await form.getByRole('button', { name: 'Add the grid’s lines' }).click();
      // One line of the grid changes its MRP; a line at style level has no colour and no size (PRD-MER-005).
      await form.getByLabel('MRP (₹), line 4').fill('1,099');
      await form.getByRole('button', { name: 'Add a line' }).click();
      await form.getByLabel('Style code, line 5').fill('SYN-JOURNEY-ST-2');
      await form.getByLabel('Pieces, line 5').fill('6');
      await form.getByLabel('Indicative cost (₹), line 5').fill('300');
      await form.getByLabel('MRP (₹), line 5').fill('699');
      const totals = form.getByRole('table', { name: 'Totals' });
      await expect(totals.getByRole('row').filter({ hasText: 'SYN-JOURNEY-ST-1' })).toContainText('30');
      await expect(totals.getByRole('row').filter({ hasText: 'The booking' })).toContainText(COST_TOTAL);
      await expect(totals.getByRole('row').filter({ hasText: 'The booking' })).toContainText(MRP_TOTAL);
      await form.getByRole('button', { name: 'Save the Draft' }).click();
      await expect(booking.getByRole('heading', { level: 2, name: /^Booking Draft / })).toBeVisible();
    });

    await test.step('the submission is refused until the booking document is attached', async () => {
      await booking.getByRole('button', { name: 'Submit for approval' }).click();
      await expect(
        booking.getByText('Attach at least one booking document before submitting the booking.').first(),
      ).toBeVisible();
      await booking.getByLabel('Booking document (PDF, JPEG or PNG)').setInputFiles(BOOKING_PDF);
      await booking.getByRole('button', { name: 'Attach the document' }).click();
      await expect(booking.getByRole('status').filter({ hasText: 'Document attached.' })).toBeVisible();
    });

    await test.step('Booking submits the Draft; it waits for a different person', async () => {
      await expect(async () => {
        await booking.getByRole('button', { name: 'Submit for approval' }).click();
        await expect(booking.getByRole('status').filter({ hasText: 'Submitted.' })).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
      await expect(booking.getByText('This version waits for approval by a different person.')).toBeVisible();
    });

    await test.step('the Owner approves it from My work, seeing its totals and open-to-buy', async () => {
      const app = await signedIn(owner, world.organisationCode, world.owner);
      await owner
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: /^My work/ })
        .click();
      // The worker publishes the receiving Organisation's events in order, its setup's many approvals first, so the
      // item may take a while to reach My work on a busy machine.
      await expect(async () => {
        await owner.getByRole('button', { name: 'Refresh' }).click();
        await expect(owner.getByRole('listitem').filter({ hasText: 'Booking approval' })).toHaveCount(1, {
          timeout: 1_000,
        });
      }).toPass({ timeout: 180_000 });
      await owner
        .getByRole('listitem')
        .filter({ hasText: 'Booking approval' })
        .getByRole('button', { name: 'Open and decide' })
        .click();
      const drawer = owner.getByRole('dialog');
      await expect(drawer.getByRole('heading', { level: 2, name: 'Booking approval', exact: true })).toBeVisible();
      await expect(drawer.getByRole('table', { name: 'Totals' })).toContainText(COST_TOTAL);
      await drawer.getByLabel(/^Reason/).selectOption(world.reasonId);
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
      await owner.keyboard.press('Escape');
    });

    await test.step('the booking is Approved with its number, its open-to-buy reserved and its terms fixed', async () => {
      await booking.getByRole('button', { name: 'Refresh' }).click();
      await expect(booking.getByRole('heading', { level: 2, name: /^Booking SYN-BKG-\d{5}$/ })).toBeVisible();
      await expect(booking.getByText('Open-to-buy reserved')).toBeVisible();
      await expect(booking.getByText(/fixed when the booking was approved/)).toBeVisible();
      await expect(booking.getByRole('button', { name: 'Submit for approval' })).toHaveCount(0);
    });
  } finally {
    await bookingContext.close();
    await ownerContext.close();
  }
});
