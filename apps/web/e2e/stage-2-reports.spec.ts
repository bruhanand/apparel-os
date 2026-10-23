import { expect, test } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld } from './support/world';

// S2-F11-T02: the reports journey (goods-in 9.1, 9.3, 9.5, section 11; PRD-BKG-005, PRD-EXC-010, PRD-EXC-011;
// code-house-rules 10.1). Booking (P-BKG) opens Reports › Booking status, finds the booking the journeys' server
// approved, four pieces of one style and size, ordered and still outstanding, nothing delivered; exports the report as
// XLSX; opens the booking from it; and is refused the stock report, which needs a grant of view on stock that Booking
// does not hold, with the reason shown. Every value is SYNTHETIC.

test('PRD-BKG-005 PRD-EXC-011 Booking reads the booking status, exports it and opens a booking from it; the stock report is refused with its reason', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const world = readWorld().reports;
  const app = new Authenticator(Buffer.from(world.reader.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, {
    code: world.organisationCode,
    login: world.reader.login,
    password: world.reader.password,
    totp: await app.nextCode(),
  });
  await expect(page.getByLabel('Profile')).toHaveText(world.reader.displayName);

  await test.step('Booking opens Reports › Booking status and finds the booking with its quantities', async () => {
    const menu = page.getByRole('navigation', { name: 'Main menu' });
    // Booking may not read stock, so the stock report is not in the menu (design-language 6 A).
    await expect(menu.getByRole('link', { name: 'Stock by place, condition and owner' })).toHaveCount(0);
    await menu.getByRole('link', { name: 'Booking status', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Booking status' })).toBeVisible();
    await page.getByLabel('Supplier').selectOption({ label: world.options.supplier });
    const table = page.getByRole('table', { name: 'Booking status' });
    await expect(table.getByRole('button', { name: world.bookingNumber })).toBeVisible();
    const line = table.getByRole('row').filter({ hasText: world.styleCode });
    await expect(line).toHaveCount(1);
    // Ordered 4, delivered 0, cancelled 0, outstanding 4, over-delivered 0, by hand.
    const cells = line.getByRole('cell');
    await expect(cells.nth(2)).toHaveText('4');
    await expect(cells.nth(3)).toHaveText('0');
    await expect(cells.nth(4)).toHaveText('0');
    await expect(cells.nth(5)).toHaveText('4');
    await expect(page.getByText(/^as of /)).toBeVisible();
  });

  await test.step('Booking exports the report as XLSX', async () => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export to XLSX' }).click();
    expect((await download).suggestedFilename()).toMatch(/^booking-status-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  await test.step('Booking opens the booking from the report', async () => {
    await page
      .getByRole('table', { name: 'Booking status' })
      .getByRole('button', { name: world.bookingNumber })
      .click();
    await expect(page.getByRole('heading', { level: 2, name: `Booking ${world.bookingNumber}` })).toBeVisible();
    await page.getByRole('button', { name: 'Back to the bookings' }).click();
    await expect(page.getByRole('table', { name: 'Booking status' })).toBeVisible();
  });

  await test.step('Booking is refused the stock report, with the permission it needs named', async () => {
    await page.goto('/reports/stock');
    await expect(page.getByText('Not available to you')).toBeVisible();
    await expect(page.getByText('Needs View on Stock balance.')).toBeVisible();
  });
});
