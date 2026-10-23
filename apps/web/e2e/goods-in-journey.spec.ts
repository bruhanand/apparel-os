import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { anHourAgo, serverNow } from './support/clock';
import { organisationToday, signIn } from './support/journey';
import { readWorld, type EnrolledUser, type ReceivingOptions } from './support/world';

// S2-F07-T02: the first version of goods-in, joined, in the browser (goods-in 12 test 22, sections 3 to 9 and 11;
// roadmap 2.2 "Persona journeys ... with recovery"; code-house-rules 10.1). Six people, each a persona, take one style
// of two pieces from a booking to stock that can be sold, and each step meets one refusal, its reason on screen, and
// recovers from it:
//
// 1. Booking (P-BKG) records the booking by hand; its submission is refused until the booking document is attached.
// 2. The Owner (P-OWN) approves it from My work: refused, since its brand and season have no approved open-to-buy.
// 3. Booking prepares the budget; Accounts (P-ACC) records its check from My work, and is refused approving the
//    version they checked (DEC-142); the Owner approves the budget, then the booking, which reserves it.
// 4. Warehouse (P-WHS) receives against the booking: the Arrival is refused until the booking is named, and the count
//    waits for the supplier invoice.
// 5. Warehouse counts one piece of the two invoiced; after a restart of the browser the count is still there; the GRN
//    is refused while the shortage's follow-up has no owner at the Site; the second piece is found, the line changed,
//    and the GRN issued, its line linked to the booking.
// 6. Warehouse, also assigned to make PTs, uploads a PT file refused whole, every problem listed; then one that passes.
// 7. Operations (P-OPS) rejects that PT with a reason, its P RATE missing the handling; Warehouse uploads the corrected
//    file and Operations approves it; the PT is Official.
// 8. A Store's staff (P-STM) scan the pieces in at their Store at phone width: a barcode not on the PT is refused; after
//    one piece the browser restarts, and the scan-in resumes where it stopped.
// 9. The pieces are sellable in Stock search: the Store's staff see both on the floor, available to sell, cost hidden;
//    Accounts sees their value at cost. Booking is refused Stock search, naming the permission, and reads the booking
//    delivered in full in Booking status.
//
// Every value is SYNTHETIC.

/** A SYNTHETIC PDF, as the brand's booking document and the supplier's invoice. */
const pdf = (what: string) => ({
  name: `SYNTHETIC-${what}.pdf`,
  mimeType: 'application/pdf',
  buffer: Buffer.from(`%PDF-1.4\n% SYNTHETIC ${what}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n`, 'latin1'),
});

/** The style's two pieces at the corrected PT's P RATE, 945.00 each, by hand: 1,890.00 at cost. */
const VALUE_AT_COST = '1,890.00';

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

/** A business date so many days from the server's today (Etc/UTC on the journeys' server). */
async function daysFromToday(days: number): Promise<string> {
  return new Date((await serverNow()).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Opens a screen from the main menu. */
async function menu(page: Page, name: string | RegExp): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name, ...(typeof name === 'string' ? { exact: true } : {}) })
    .click();
}

/** The one item of My work titled so, of the preparer named if any, My work read again until it arrives. */
async function myWorkItem(page: Page, title: string, preparedBy?: string) {
  await menu(page, /^My work/);
  const titled = page.getByRole('listitem').filter({ hasText: title });
  const item = preparedBy === undefined ? titled : titled.filter({ hasText: preparedBy });
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(item).toHaveCount(1, { timeout: 1_000 });
  }).toPass({ timeout: 180_000 });
  return item;
}

/** Decides the open drawer's request with the reason and a fresh code, and waits for the decision to show. */
async function decide(page: Page, app: Authenticator, outcome: 'Approve' | 'Reject', reasonId: string): Promise<void> {
  const drawer = page.getByRole('dialog');
  if (outcome === 'Reject') await drawer.getByRole('radio', { name: 'Reject' }).check();
  await drawer.getByLabel(/^Reason/).selectOption(reasonId);
  await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
  await drawer.getByRole('button', { name: outcome, exact: true }).click();
  await expect(drawer.getByText(outcome === 'Approve' ? /^Approved by / : /^Rejected by /)).toBeVisible({
    timeout: 60_000,
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** The Site's inbox, from the main menu (goods-in 4.1). */
async function inbox(page: Page, options: ReceivingOptions): Promise<void> {
  await menu(page, 'Inbox');
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
  await page.getByLabel('Site').selectOption({ label: options.site });
}

test('PRD-ACP-001 PRD-REC-017 PRD-STK-003 POL-02.07 goods-in 12 test 22 a booking becomes stock that can be sold at a Store, each person refused once on the way and recovering', async ({
  browser,
}) => {
  test.setTimeout(900_000);
  const world = readWorld().goodsIn;
  const { options, styleCode } = world;
  // Each person in a browser of their own.
  const bookingContext = await browser.newContext();
  const accountsContext = await browser.newContext();
  const ownerContext = await browser.newContext();
  const warehouseContext = await browser.newContext();
  const operationsContext = await browser.newContext();
  const storeContext = await browser.newContext();
  const booking = await bookingContext.newPage();
  const accounts = await accountsContext.newPage();
  const owner = await ownerContext.newPage();
  const warehouse = await warehouseContext.newPage();
  const operations = await operationsContext.newPage();
  const store = await storeContext.newPage();
  let ownerApp: Authenticator | undefined;
  let accountsApp: Authenticator | undefined;
  let operationsApp: Authenticator | undefined;
  const app = (each: Authenticator | undefined): Authenticator => {
    if (each === undefined) throw new Error('That person is not signed in');
    return each;
  };
  let bookingNumber = '';
  let grnNumber = '';
  try {
    await test.step('1. Booking records the booking by hand; its submission is refused until the document is attached', async () => {
      await signedIn(booking, world.organisationCode, world.booker);
      await menu(booking, 'Bookings');
      await booking.getByRole('button', { name: 'New booking' }).click();
      const form = booking.getByRole('form', { name: 'New booking' });
      await form.locator('#booking-brand').selectOption({ label: options.brand });
      await form.locator('#booking-site').selectOption({ label: options.site });
      await form.locator('#booking-supplier').selectOption({ label: options.supplier });
      await form.locator('#booking-season').selectOption({ label: world.seasonOption });
      await form.locator('#booking-window-from').fill(await daysFromToday(-1));
      await form.locator('#booking-window-to').fill(await daysFromToday(30));
      // One line at style level: two pieces at an indicative ₹500.00 and MRP ₹1,999.00 (goods-in 3.1).
      await form.getByRole('button', { name: 'Add a line' }).click();
      await form.getByLabel('Style code, line 1').fill(styleCode);
      await form.getByLabel('Pieces, line 1').fill('2');
      await form.getByLabel('Indicative cost (₹), line 1').fill('500');
      await form.getByLabel('MRP (₹), line 1').fill('1,999');
      await expect(
        form.getByRole('table', { name: 'Totals' }).getByRole('row').filter({ hasText: 'The booking' }),
      ).toContainText('₹1,000.00');
      await form.getByRole('button', { name: 'Save the Draft' }).click();
      await expect(booking.getByRole('heading', { level: 2, name: /^Booking Draft / })).toBeVisible();
      await booking.getByRole('button', { name: 'Submit for approval' }).click();
      await expect(
        booking.getByText('Attach at least one booking document before submitting the booking.').first(),
      ).toBeVisible();
      await booking.getByLabel('Booking document (PDF, JPEG or PNG)').setInputFiles(pdf('booking'));
      await booking.getByRole('button', { name: 'Attach the document' }).click();
      await expect(booking.getByRole('status').filter({ hasText: 'Document attached.' })).toBeVisible();
      // Submitted, the booking is read again and its card gives way to its approval.
      await expect(async () => {
        const submit = booking.getByRole('button', { name: 'Submit for approval' });
        if ((await submit.count()) > 0) await submit.click({ timeout: 2_000 });
        await expect(booking.getByText('This version waits for approval by a different person.')).toBeVisible({
          timeout: 2_000,
        });
      }).toPass({ timeout: 30_000 });
    });

    await test.step('2. the Owner’s approval is refused: the brand and season have no approved open-to-buy', async () => {
      ownerApp = await signedIn(owner, world.organisationCode, world.owner);
      // Offered to this Owner alone: their booking limit, at this Site only, is the lowest that covers it (serve.ts).
      const item = await myWorkItem(owner, 'Booking approval');
      await item.getByRole('button', { name: 'Open and decide' }).click();
      const drawer = owner.getByRole('dialog');
      await expect(drawer.getByRole('heading', { level: 2, name: 'Booking approval', exact: true })).toBeVisible();
      await expect(drawer.getByRole('table', { name: 'Totals' })).toContainText('₹1,000.00');
      await drawer.getByLabel(/^Reason/).selectOption(world.approveReasonId);
      await drawer.getByLabel(/^Authenticator code/).fill(await app(ownerApp).nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(
        drawer.getByText(
          'This brand and season have no approved open-to-buy budget, so no booking of them can be approved.',
        ),
      ).toBeVisible({ timeout: 60_000 });
      await expect(drawer.getByText(/^Approved by /)).toHaveCount(0);
      await owner.keyboard.press('Escape');
    });

    await test.step('3. Booking prepares the budget; Accounts checks it from My work and is refused approving what they checked', async () => {
      // In a second tab, so the booking stays open where Booking left it.
      const budgets = await bookingContext.newPage();
      await budgets.goto('/booking/open-to-buy');
      await expect(budgets.getByRole('heading', { level: 1, name: 'Open-to-buy' })).toBeVisible();
      await budgets.getByRole('button', { name: 'Prepare a budget' }).click();
      const form = budgets.getByRole('form', { name: 'Prepare a budget' });
      await form.locator('#budget-brand').selectOption({ label: options.brand });
      await form.locator('#budget-season').selectOption({ label: world.seasonOption });
      // A SYNTHETIC ₹1,00,000.00.
      await form.locator('#budget-amount').fill('1,00,000');
      await form.locator('#budget-origin').selectOption('synthetic');
      await budgets.getByRole('button', { name: 'Send for the Accounts check' }).click();
      await expect(form.getByRole('status').filter({ hasText: 'Sent for the Accounts check' })).toBeVisible();
      await budgets.close();

      accountsApp = await signedIn(accounts, world.organisationCode, world.accounts);
      const check = await myWorkItem(accounts, 'Open-to-buy budget check');
      await check.getByRole('button', { name: 'Open and decide' }).click();
      await expect(accounts.getByRole('dialog').getByText('₹1,00,000.00').first()).toBeVisible();
      await decide(accounts, app(accountsApp), 'Approve', world.approveReasonId);
      // The approval that follows the check is for a third person (DEC-142; POL-05.09).
      await menu(accounts, 'Open-to-buy');
      await accounts.getByRole('button', { name: options.brand }).click();
      const drawer = accounts.getByRole('dialog');
      await drawer.getByRole('button', { name: 'Open the approval' }).click();
      await expect(
        drawer.getByRole('status').filter({
          hasText: 'You recorded an earlier step of this version, such as its check, so another person must decide it.',
        }),
      ).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
      await accounts.keyboard.press('Escape');
    });

    await test.step('3. the Owner approves the budget, then the booking, which reserves it', async () => {
      const budget = await myWorkItem(owner, 'Open-to-buy budget approval');
      await budget.getByRole('button', { name: 'Open and decide' }).click();
      await decide(owner, app(ownerApp), 'Approve', world.approveReasonId);
      const item = await myWorkItem(owner, 'Booking approval');
      await item.getByRole('button', { name: 'Open and decide' }).click();
      await decide(owner, app(ownerApp), 'Approve', world.approveReasonId);
      await booking.getByRole('button', { name: 'Refresh' }).click();
      const heading = booking.getByRole('heading', { level: 2, name: /^Booking SYN-BKG-\d{5}$/ });
      await expect(heading).toBeVisible({ timeout: 30_000 });
      bookingNumber = ((await heading.textContent()) ?? '').replace('Booking ', '');
      await expect(booking.getByText('Open-to-buy reserved')).toBeVisible();
    });

    await test.step('4. Warehouse receives against the booking: refused until it is named; the count waits for the invoice', async () => {
      await signedIn(warehouse, world.organisationCode, world.receiver);
      await inbox(warehouse, options);
      await warehouse.getByRole('button', { name: 'Receive against booking' }).click();
      const form = warehouse.getByRole('form', { name: 'Receive against a booking' });
      await form.locator('#receive-unit').selectOption({ label: options.wholeStore });
      await form.locator('#receive-location').selectOption({ label: options.storeLocation });
      await form.locator('#receive-supplier').selectOption({ label: options.supplier });
      await form.locator('#receive-brand').selectOption({ label: options.brand });
      await form.getByLabel(/^Transporter/).fill('SYNTHETIC Transporter');
      await form.getByLabel(/^Lorry receipt number/).fill('SYN-LR-GI');
      await form.getByLabel(/^Lorry receipt date/).fill(organisationToday());
      await form.getByLabel(/^Cartons/).fill('1');
      await form.getByLabel(/^Arrived/).fill(await anHourAgo());
      await warehouse.getByRole('dialog').getByRole('button', { name: 'Record the Arrival' }).click();
      await expect(form.getByText('Choose the booking the goods come against.')).toBeVisible();
      const option = form.locator('#receive-booking option', { hasText: bookingNumber });
      await expect(option).toHaveCount(1);
      await form.locator('#receive-booking').selectOption((await option.getAttribute('value')) ?? '');
      await warehouse.getByRole('dialog').getByRole('button', { name: 'Record the Arrival' }).click();
      await expect(
        warehouse.getByRole('heading', { level: 2, name: `Arrival from ${options.supplier}` }),
      ).toBeVisible();
      await expect(warehouse.getByRole('table', { name: 'Expected goods' })).toContainText(styleCode);
      // No invoice, no count (goods-in 12 test 3; DEC-133).
      await expect(
        warehouse.getByText('Record the supplier invoice first: the count starts once it is recorded.'),
      ).toBeVisible();
      await expect(warehouse.getByRole('form', { name: 'Add a line' })).toHaveCount(0);
      const invoice = warehouse.getByRole('form', { name: 'Add the invoice' });
      await invoice.getByLabel(/^Invoice number/).fill('SYN-INV-GI');
      await invoice.getByLabel(/^Invoice date/).fill(organisationToday());
      await invoice.getByLabel('Invoice file').setInputFiles(pdf('invoice'));
      await invoice.getByRole('button', { name: 'Add the invoice' }).click();
      await expect(invoice.getByRole('status').filter({ hasText: 'Invoice recorded.' })).toBeVisible();
    });

    await test.step('5. Warehouse counts one piece; the count outlives a restart; the GRN is refused, then issued once the second piece is found', async () => {
      const line = warehouse.getByRole('form', { name: 'Add a line' });
      await line.getByLabel(/^Style code/).fill(styleCode);
      await line.getByLabel(/^Colour/).fill('SYNTHETIC NAVY');
      await line.getByLabel(/^Size$/).selectOption({ label: options.sizes[0] ?? '' });
      await line.getByLabel(/^Invoice quantity/).fill('2');
      await line.getByLabel(/^Counted quantity/).fill('1');
      await line.getByRole('button', { name: 'Save the line' }).click();
      const counted = warehouse.getByRole('table', { name: 'Lines counted' }).getByRole('row').filter({
        hasText: styleCode,
      });
      await expect(counted).toBeVisible();
      // The browser restarts mid-count: the Arrival and its counted line are kept, found again from the inbox.
      await warehouse.reload();
      await inbox(warehouse, options);
      await warehouse
        .getByRole('table', { name: 'Deliveries' })
        .getByRole('row')
        .filter({ hasText: 'SYN-INV-GI' })
        .getByRole('button')
        .first()
        .click();
      await expect(counted).toBeVisible({ timeout: 30_000 });
      // The shortage reaches Booking as an exception routed at the Site; this Site routes none (goods-in 4.9).
      await warehouse.getByRole('button', { name: 'Issue the GRN' }).click();
      await expect(
        warehouse
          .getByRole('alert')
          .filter({ hasText: 'Exceptions of this type have no owner here yet: no exception rule is in force.' }),
      ).toBeVisible();
      await expect(warehouse.getByRole('region', { name: /^GRN SYN-GRN-/ })).toHaveCount(0);
      // The second piece is found in the carton: the line is changed to two and the GRN issued.
      await counted.getByRole('button', { name: 'Change' }).click();
      const change = warehouse.getByRole('form', { name: 'Change' });
      await change.getByLabel(/^Counted quantity/).fill('2');
      await change.getByRole('button', { name: 'Save the change' }).click();
      await expect(change).toHaveCount(0);
      await warehouse.getByRole('button', { name: 'Issue the GRN' }).click();
      const grn = warehouse.getByRole('region', { name: /^GRN SYN-GRN-\d{5}$/ });
      await expect(grn).toBeVisible({ timeout: 30_000 });
      grnNumber = ((await grn.getByRole('heading', { level: 3 }).textContent()) ?? '').replace('GRN ', '');
      const issued = grn.getByRole('table', { name: 'GRN lines' }).getByRole('row').filter({ hasText: styleCode });
      await expect(issued).toContainText('2');
      await expect(issued).toContainText(`Linked to ${bookingNumber}`);
    });

    const upload = warehouse.getByRole('form', { name: 'Upload a PT file' });
    const revisions = warehouse.getByRole('table', { name: 'PT revisions' });

    await test.step('6. a PT file is refused whole, every problem listed; the next one is submitted for approval', async () => {
      await upload.getByLabel('PT file', { exact: true }).setInputFiles(world.refusedFile);
      await upload.getByRole('button', { name: 'Upload and check' }).click();
      const problems = warehouse.getByRole('table', { name: 'Problems in the file' });
      await expect(problems).toBeVisible({ timeout: 60_000 });
      await expect(warehouse.getByRole('alert').filter({ hasText: 'The file is refused whole' })).toBeVisible();
      await expect(problems.getByRole('row').filter({ hasText: 'MARGIN is not' })).toHaveCount(1);
      await expect(problems.getByRole('row').filter({ hasText: 'does not add up' })).toContainText(
        `Style ${styleCode}`,
      );
      await expect(warehouse.getByRole('button', { name: 'Submit for approval' })).toHaveCount(0);
      await upload.getByLabel('PT file', { exact: true }).setInputFiles(world.rejectedFile);
      await upload.getByRole('button', { name: 'Upload and check' }).click();
      await expect(warehouse.getByRole('heading', { level: 3, name: 'What submitting it makes' })).toBeVisible({
        timeout: 60_000,
      });
      await warehouse.getByRole('button', { name: 'Submit for approval' }).click();
      await expect(revisions).toBeVisible({ timeout: 60_000 });
      await expect(revisions.getByRole('row').nth(1)).toContainText('Awaiting approval');
    });

    await test.step('7. Operations rejects the PT with a reason; the corrected file is approved and the PT is Official', async () => {
      operationsApp = await signedIn(operations, world.organisationCode, world.operations);
      const first = await myWorkItem(operations, 'PT approval', world.receiver.displayName);
      await first.getByRole('button', { name: 'Open and decide' }).click();
      const drawer = operations.getByRole('dialog');
      await expect(drawer.getByRole('heading', { level: 3, name: 'What approving it makes' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(drawer.getByText(grnNumber, { exact: true })).toBeVisible();
      // SYNTHETIC: P RATE 900.00 beside BASIC 700.00, the handling left out.
      await expect(drawer.getByRole('table', { name: 'Rows of the file' }).getByRole('row').nth(1)).toContainText(
        '900.00',
      );
      await decide(operations, app(operationsApp), 'Reject', world.rejectReasonId);
      // The draft ends and the GRN takes a corrected file (goods-in 6.3 "Reject").
      await warehouse.getByRole('button', { name: 'Refresh' }).click();
      await expect(revisions.getByRole('row').nth(1)).toContainText('Rejected', { timeout: 30_000 });
      await upload.getByLabel('PT file', { exact: true }).setInputFiles(world.correctedFile);
      await upload.getByRole('button', { name: 'Upload and check' }).click();
      await expect(warehouse.getByRole('heading', { level: 3, name: 'What submitting it makes' })).toBeVisible({
        timeout: 60_000,
      });
      await warehouse.getByRole('button', { name: 'Submit for approval' }).click();
      await expect(revisions.getByRole('row').nth(1)).toContainText('Awaiting approval', { timeout: 60_000 });
      const corrected = await myWorkItem(operations, 'PT approval', world.receiver.displayName);
      await corrected.getByRole('button', { name: 'Open and decide' }).click();
      await expect(drawer.getByRole('heading', { level: 3, name: 'What approving it makes' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(drawer.getByRole('table', { name: 'Rows of the file' }).getByRole('row').nth(1)).toContainText(
        '945.00',
      );
      await decide(operations, app(operationsApp), 'Approve', world.approveReasonId);
      await warehouse.getByRole('button', { name: 'Refresh' }).click();
      await expect(revisions.getByRole('row').nth(1)).toContainText(/SYN-PT-\d{5}/, { timeout: 30_000 });
      await expect(revisions.getByRole('row').nth(1)).toContainText('Official');
      await expect(revisions.getByRole('row').nth(2)).toContainText('Rejected');
    });

    await test.step('8. the Store’s staff scan in at phone width: a barcode not on the PT refused; resumed after a restart', async () => {
      await signedIn(store, world.organisationCode, world.storeStaff);
      const openScanIn = async (left: string) => {
        await store.setViewportSize({ width: 1280, height: 900 });
        await inbox(store, options);
        const row = store.getByRole('row').filter({ hasText: grnNumber });
        await expect(row).toContainText('Waiting for its scan-in', { timeout: 30_000 });
        // A phone, as a Store's staff scan with one (goods-in section 11; PRD-PRO-009).
        await store.setViewportSize({ width: 375, height: 812 });
        await row.getByRole('button').first().click();
        const summary = store.getByRole('region', { name: 'Scan-in' });
        await expect(summary.getByText(left)).toBeVisible({ timeout: 30_000 });
        await summary.getByRole('button', { name: 'Scan the pieces in' }).click();
        const form = store.getByRole('form', { name: 'Scan a piece' });
        await form.getByLabel('Where the pieces go').selectOption({ label: world.floor });
        return form;
      };
      const form = await openScanIn('2 pieces left to scan in');
      const barcode = form.getByLabel('Barcode');
      // A tag of another supplier's goods: on no product of this PT, the reason shown and the scan kept (goods-in 7.2).
      await barcode.fill('8900000099997');
      await barcode.press('Enter');
      await expect(form.getByRole('alert').filter({ hasText: 'Not on this PT' })).toBeVisible();
      await barcode.fill(world.barcodes[0] ?? '');
      await barcode.press('Enter');
      await expect(form.getByRole('status').filter({ hasText: 'Accepted' })).toBeVisible();
      await expect(store.getByText('1 piece left to scan in')).toBeVisible();
      // The browser restarts after one piece; the scan-in resumes where it stopped (goods-in 7.3; 12 test 14).
      await store.reload();
      const resumed = await openScanIn('1 piece left to scan in');
      await resumed.getByLabel('Barcode').fill(world.barcodes[1] ?? '');
      await resumed.getByLabel('Barcode').press('Enter');
      await expect(resumed.getByRole('status').filter({ hasText: 'Accepted' })).toBeVisible();
      await expect(store.getByText('Every piece is scanned in or under a damage report.')).toBeVisible();
      await expect(store.getByRole('list', { name: 'Scans' }).getByRole('listitem')).toHaveCount(3);
      expect(await store.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    await test.step('9. the pieces are sellable in Stock search: the Store’s staff see them, cost hidden; Accounts sees their value', async () => {
      await store.setViewportSize({ width: 1280, height: 900 });
      const found = async (page: Page) => {
        await menu(page, 'Stock search');
        const search = page.getByRole('search', { name: 'Search stock' });
        await search.getByLabel('Style code or product').fill(styleCode);
        await search.getByRole('button', { name: 'Search', exact: true }).click();
        const row = page.getByRole('table', { name: 'Stock found' }).getByRole('row').filter({ hasText: styleCode });
        await expect(row).toHaveCount(1);
        await expect(row).toContainText(world.floorName);
        const cells = row.getByRole('cell');
        // Physical 2, available to sell 2, none waiting and none held, worked by hand (goods-in 9.2; PRD-STK-003).
        await expect(cells.nth(3)).toHaveText('2');
        await expect(cells.nth(4)).toHaveText(/^2\s*to sell$/);
        await expect(cells.nth(5)).toHaveText('0');
        await expect(cells.nth(6)).toHaveText('0');
        return cells;
      };
      await expect((await found(store)).nth(7)).toHaveText('Hidden');
      await expect((await found(accounts)).nth(7)).toHaveText(VALUE_AT_COST);
    });

    await test.step('9. Booking is refused Stock search, naming the permission, and reads the booking delivered in full', async () => {
      await booking.goto('/stock/search');
      await expect(booking.getByText('Not available to you')).toBeVisible();
      await expect(booking.getByText('Needs View on Stock balance.')).toBeVisible();
      await menu(booking, 'Booking status');
      await expect(booking.getByRole('heading', { level: 1, name: 'Booking status' })).toBeVisible();
      await booking.getByLabel('Supplier').selectOption({ label: options.supplier });
      const table = booking.getByRole('table', { name: 'Booking status' });
      await expect(table.getByRole('button', { name: bookingNumber })).toBeVisible();
      const cells = table.getByRole('row').filter({ hasText: styleCode }).getByRole('cell');
      // Ordered 2, delivered 2, cancelled 0, outstanding 0, by hand (goods-in 3.6; PRD-BKG-005).
      await expect(cells.nth(3)).toHaveText('2');
      await expect(cells.nth(4)).toHaveText('2');
      await expect(cells.nth(5)).toHaveText('0');
      await expect(cells.nth(6)).toHaveText('0');
    });
  } finally {
    for (const context of [
      bookingContext,
      accountsContext,
      ownerContext,
      warehouseContext,
      operationsContext,
      storeContext,
    ]) {
      await context.close();
    }
  }
});
