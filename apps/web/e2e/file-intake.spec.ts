import { expect, test } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld } from './support/world';

// S1-F06-T01, S1-F06-T03: the file intake journey (imports-and-opening-data 3.1, 5, 6.5, 8, 13.1, 16;
// structure-and-masters 7; PRD-IMP-002, PRD-IMP-004 to PRD-IMP-007, PRD-IMP-010, PRD-MER-013). A Booking user (P-BKG)
// uploads the SYNTHETIC product file on Setup › File intake and saved layouts; it is stored; the one confirmed saved
// layout it matches is proposed, and they start an import with it, which stages its row with each value beside the
// cell it came from; they validate it and read the validation report, submit it for review and publish it; the style
// arrives on Setup › Products as a proposal a different person confirms. Every value is SYNTHETIC.

test('PRD-IMP-002 PRD-IMP-006 PRD-MER-013 a Booking user uploads, stages, validates and publishes a SYNTHETIC product file', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const world = readWorld().fileIntake;
  const app = new Authenticator(Buffer.from(world.booking.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, {
    code: world.organisationCode,
    login: world.booking.login,
    password: world.booking.password,
    totp: await app.nextCode(),
  });
  await expect(page.getByLabel('Profile')).toHaveText(world.booking.displayName);

  await test.step('upload: the file is checked from its content and stored', async () => {
    await page
      .getByRole('navigation', { name: 'Main menu' })
      .getByRole('link', { name: 'File intake and saved layouts', exact: true })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'File intake and saved layouts' })).toBeVisible();
    await page.locator('#intake-file').setInputFiles(world.filePath);
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'The file is stored.' })).toBeVisible();
    await expect(page.getByText('Excel workbook (XLSX)').first()).toBeVisible();
  });

  await test.step('start: the matching saved layout is proposed, and stages the row, each value beside its cell', async () => {
    await expect(
      page.getByRole('status').filter({ hasText: 'One saved layout matches this file. It is chosen below.' }),
    ).toBeVisible();
    await page.locator('#intake-layout').selectOption({ label: world.layoutOption });
    await page.getByRole('button', { name: 'Start the import', exact: true }).click();
    const batch = page.getByRole('region', { name: /^Batch SYN-IB-\d{5}$/ });
    await expect(batch).toBeVisible();
    await expect(batch).toContainText('Staged');
    const rows = batch.getByRole('table', { name: `Staged rows of ${world.styleCode}` });
    await expect(rows).toContainText(world.skuCode);
    await expect(rows).toContainText('From cell B2');
    // The file leaves the size empty: it stays Unknown, never a default (PRD-MOD-015).
    await expect(rows).toContainText('Unknown');
    await expect(batch.getByRole('list', { name: 'What publishing would create' })).toContainText(world.styleCode);
  });

  await test.step('validate, read the report, submit and publish through the merchandise handler', async () => {
    const batch = page.getByRole('region', { name: /^Batch SYN-IB-\d{5}$/ });
    await batch.getByRole('button', { name: 'Validate', exact: true }).click();
    await expect(batch.getByRole('status').filter({ hasText: 'Validation finished.' })).toBeVisible();
    // The file's hidden notes sheet is listed, not imported (8.1, A-8).
    const issues = batch.getByRole('table', { name: 'Issues' });
    await expect(issues).toContainText('This sheet is not imported.');
    await batch.getByRole('button', { name: 'Submit for review', exact: true }).click();
    await expect(batch.getByRole('status').filter({ hasText: 'Submitted for review.' })).toBeVisible();
    await batch.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(batch.getByRole('status').filter({ hasText: 'Published.' })).toBeVisible();
    await expect(batch).toContainText('2 rows read, 1 accepted');
  });

  await test.step('the style waits on Setup › Products as a proposal a different person confirms', async () => {
    await page
      .getByRole('navigation', { name: 'Main menu' })
      .getByRole('link', { name: 'Products', exact: true })
      .click();
    await page.getByRole('tab', { name: 'Proposals', exact: true }).click();
    const proposals = page.getByRole('table', { name: 'Proposals' });
    await expect(proposals.getByRole('row').filter({ hasText: world.styleCode })).toContainText('Proposed');
  });
});
