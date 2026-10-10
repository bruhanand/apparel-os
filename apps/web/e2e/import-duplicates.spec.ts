import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F06-T04: duplicate control and the import outcomes report (imports-and-opening-data 7.2, 7.4, 14, 16;
// PRD-IMP-011, PRD-IMP-013, PRD-MOD-003, PRD-SEC-005). A Booking user (P-BKG) publishes a SYNTHETIC product file; the
// same file again cannot start a second batch while the first stands; a later file holding the same style unchanged
// and a new one publishes the new one, and its repeat counts as a duplicate. A reader whose assignment covers one Store
// sees, on the Outcomes tab, only that Store's batch, with the report's as-of time. Every value is SYNTHETIC.

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<void> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
}

async function openIntake(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'File intake and saved layouts', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'File intake and saved layouts' })).toBeVisible();
}

async function upload(page: Page, file: string): Promise<void> {
  await page.locator('#intake-file').setInputFiles(file);
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'The file is stored.' })).toBeVisible();
}

async function startWithLayout(page: Page, option: string): Promise<void> {
  await expect(
    page.getByRole('status').filter({ hasText: 'One saved layout matches this file. It is chosen below.' }),
  ).toBeVisible();
  await page.locator('#intake-layout').selectOption({ label: option });
  await page.getByRole('button', { name: 'Start the import', exact: true }).click();
}

test('PRD-IMP-011 PRD-IMP-013 a Booking user repeats a published style in a later file; it counts as a duplicate', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const world = readWorld().fileIntake;
  await signedIn(page, world.organisationCode, world.duplicate.booking);
  await openIntake(page);
  const batch = page.getByRole('region', { name: /^Batch SYN-IB-\d{5}$/ });

  await test.step('the first file publishes its one style', async () => {
    await upload(page, world.duplicate.firstFile);
    await startWithLayout(page, world.layoutOption);
    await batch.getByRole('button', { name: 'Validate', exact: true }).click();
    await expect(batch.getByRole('status').filter({ hasText: 'Validation finished.' })).toBeVisible();
    await batch.getByRole('button', { name: 'Submit for review', exact: true }).click();
    await expect(batch.getByRole('status').filter({ hasText: 'Submitted for review.' })).toBeVisible();
    await batch.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(batch.getByRole('status').filter({ hasText: 'Published.' })).toBeVisible();
    await expect(batch).toContainText('2 rows read, 1 accepted');
  });

  await test.step('the same file again starts no second batch while the first stands', async () => {
    await upload(page, world.duplicate.firstFile);
    await expect(page.getByText('These same bytes were stored before').first()).toBeVisible();
    await startWithLayout(page, world.layoutOption);
    await expect(page.getByText('This file is already in a batch for this target and layout.')).toBeVisible();
  });

  await test.step('a later file with the style unchanged and a new one: the repeat is a duplicate', async () => {
    await upload(page, world.duplicate.secondFile);
    await startWithLayout(page, world.layoutOption);
    await expect(batch).toContainText('Staged');
    await batch.getByRole('button', { name: 'Validate', exact: true }).click();
    await expect(batch.getByRole('status').filter({ hasText: 'Validation finished.' })).toBeVisible();
    await expect(
      batch.getByRole('status').filter({ hasText: 'Already published with the same content.' }).first(),
    ).toBeVisible();
    await expect(batch.getByRole('table', { name: 'Issues' })).toContainText(
      'Already published with the same content.',
    );
    await batch.getByRole('button', { name: 'Submit for review', exact: true }).click();
    await expect(batch.getByRole('status').filter({ hasText: 'Submitted for review.' })).toBeVisible();
    await batch.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(batch.getByRole('status').filter({ hasText: 'Published.' })).toBeVisible();
    await expect(batch).toContainText('3 rows read, 1 accepted, 1 ignored, 0 rejected, 0 pending, 1 duplicate.');
    const documents = batch.getByRole('list', { name: 'Documents of the attempt' });
    await expect(documents).toContainText(`${world.duplicate.style}: already published with the same content`);
    await expect(documents).toContainText(`${world.duplicate.newStyle}: published.`);
  });
});

test('PRD-MOD-003 PRD-SEC-005 a reader scoped to one Store sees only its batches in the import outcomes report', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const world = readWorld().fileIntake;
  await signedIn(page, world.organisationCode, world.outcomes.reader);
  await openIntake(page);
  await page.getByRole('tab', { name: 'Outcomes', exact: true }).click();
  const table = page.getByRole('table', { name: 'Import batches' });
  await expect(table).toContainText(world.outcomes.storeBatchCode);
  await expect(table).not.toContainText(world.outcomes.otherBatchCode);
  await expect(page.getByText(/as of /).first()).toBeVisible();
  await page.locator('#outcomes-state').selectOption({ label: 'Published' });
  await expect(page.getByText('No batch you may see matches these filters.')).toBeVisible();
});
