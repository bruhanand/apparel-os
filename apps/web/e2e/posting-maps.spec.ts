import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { organisationToday, signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F09-T02: the posting maps journey (books-and-posting 6.3, 12, 14; POL-09.01, POL-09.12, POL-11.01; PRD-SEC-005,
// PRD-PRF-004; DEC-112, GC4-2). An Accounts user prepares a version of a SYNTHETIC book's map on Setup › Posting maps
// and attaches a SYNTHETIC CA evidence file; a different Accounts user decides it from My work; the screen then shows
// it in force on a chosen date; and the trial balance on Money › Internal ledger and trial balance shows its as-of time
// and, for a reader scoped to one Store, says it is partial. Every value is SYNTHETIC.

const CA_FILE = {
  name: 'SYNTHETIC-ca-approval.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% SYNTHETIC CA approval\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n'),
};

const tomorrow = () => new Date(Date.parse(`${organisationToday()}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

async function openPostingMaps(page: Page, bookOption: string) {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'Posting maps', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Posting maps' })).toBeVisible();
  await page.getByLabel('Book', { exact: true }).selectOption({ label: bookOption });
}

test('POL-09.01 POL-09.12 a posting map version prepared with the CA’s evidence, decided by another Accounts user, in force on a chosen date; the trial balance partial for a Store reader', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().postingMaps;
  const preparerContext = await browser.newContext();
  const approverContext = await browser.newContext();
  const readerContext = await browser.newContext();
  const preparer = await preparerContext.newPage();
  const approver = await approverContext.newPage();
  const reader = await readerContext.newPage();
  try {
    await test.step('an Accounts user prepares a map version from tomorrow and attaches the CA’s evidence file', async () => {
      await signedIn(preparer, world.organisationCode, world.preparer);
      await openPostingMaps(preparer, world.bookOption);
      await expect(preparer.getByRole('button', { name: world.eventKind })).toBeVisible();
      await preparer.getByRole('button', { name: 'Prepare a map version' }).click();
      const form = preparer.getByRole('form', { name: 'Prepare a map version' });
      await form.getByLabel('Event kind').selectOption(world.eventKind);
      for (const [component, debit, credit] of [
        ['to-pool', 'SYN-INV', 'SYN-PUR'],
        ['to-dispatch', 'SYN-TRN', 'SYN-PUR'],
      ] as const) {
        const group = form.getByRole('group', { name: component });
        await group.getByLabel('Debit account').selectOption({ label: `${debit} · ${debitName(debit)}` });
        await group.getByLabel('Credit account').selectOption({ label: `${credit} · ${debitName(credit)}` });
      }
      await form.getByLabel('Starts on').fill(tomorrow());
      await preparer.getByRole('button', { name: 'Request approval' }).click();
      await expect(form.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
      await preparer.keyboard.press('Escape');
      await preparer.getByRole('button', { name: world.eventKind }).click();
      const drawer = preparer.getByRole('dialog');
      const awaiting = drawer.getByRole('listitem').filter({ hasText: 'Awaiting approval' });
      await awaiting.getByLabel('CA approval evidence file').setInputFiles(CA_FILE);
      await awaiting.getByRole('button', { name: 'Attach the CA’s approval evidence' }).click();
      await expect(
        drawer.getByRole('status').filter({ hasText: 'The CA’s approval evidence is attached.' }),
      ).toBeVisible();
      await expect(drawer.getByText(CA_FILE.name)).toBeVisible();
      // POL-09.01: the preparer cannot decide their own version.
      await awaiting.getByRole('button', { name: 'Open the approval' }).click();
      await expect(
        drawer
          .getByRole('status')
          .filter({ hasText: 'You prepared or changed this version, so another person must decide it.' }),
      ).toBeVisible();
    });

    let approverApp: Authenticator | undefined;
    await test.step('a different Accounts user decides it from My work', async () => {
      approverApp = await signedIn(approver, world.organisationCode, world.approver);
      await approver
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: /^My work/ })
        .click();
      const title = 'Posting map version';
      await expect(async () => {
        await approver.getByRole('button', { name: 'Refresh' }).click();
        await expect(approver.getByRole('listitem').filter({ hasText: title })).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 30_000 });
      await approver
        .getByRole('listitem')
        .filter({ hasText: title })
        .getByRole('button', { name: 'Open and decide' })
        .click();
      const drawer = approver.getByRole('dialog');
      await expect(drawer.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
      await drawer.getByLabel(/^Reason/).selectOption(world.reasonId);
      await drawer.getByLabel(/^Authenticator code/).fill(await approverApp.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
      await approver.keyboard.press('Escape');
    });

    await test.step('the Posting maps screen shows the version in force on a chosen date', async () => {
      await openPostingMaps(approver, world.bookOption);
      await approver.getByLabel('Show the version in force on').fill(tomorrow());
      await approver.getByRole('button', { name: world.eventKind }).click();
      const drawer = approver.getByRole('dialog');
      const shown = drawer.getByRole('listitem').filter({ hasText: 'In force on the date shown' });
      await expect(shown).toHaveCount(1);
      // From tomorrow the new version is in force: today it shows Scheduled, and holds the CA's evidence file.
      await expect(shown).toContainText('Scheduled');
      await expect(shown.getByText(CA_FILE.name)).toBeVisible();
    });

    await test.step('the trial balance shows its as-of time and, for a Store reader, says it is partial', async () => {
      await signedIn(reader, world.organisationCode, world.storeReader);
      await reader
        .getByRole('navigation', { name: 'Main menu' })
        .getByRole('link', { name: 'Internal ledger and trial balance', exact: true })
        .click();
      await expect(reader.getByText(/^Internal ledger: /)).toBeVisible();
      await reader.getByLabel('Book', { exact: true }).selectOption({ label: world.bookOption });
      await reader.getByLabel('Period', { exact: true }).selectOption(world.periodId);
      await expect(reader.getByText(/^as of /)).toBeVisible();
      await expect(
        reader.getByRole('status').filter({ hasText: 'Partial: your access covers only part of this book' }),
      ).toBeVisible();
      // The reader sees the Store unit's line only: 1,000.00 debited and credited, not the warehouse's 500.00.
      const totals = reader.getByRole('table', { name: 'Trial balance' }).getByRole('row', { name: /Totals/ });
      await expect(totals).toContainText('₹1,000.00');
      await expect(totals).not.toContainText('₹1,500.00');
    });
  } finally {
    await preparerContext.close();
    await approverContext.close();
    await readerContext.close();
  }
});

/** The SYNTHETIC accounts' names, as the server of the journeys writes them. */
function debitName(code: string): string {
  return (
    {
      'SYN-INV': 'SYNTHETIC Stock in cost pools',
      'SYN-TRN': 'SYNTHETIC Value held on a dispatch',
      'SYN-PUR': 'SYNTHETIC Purchase clearing',
    }[code] ?? code
  );
}
