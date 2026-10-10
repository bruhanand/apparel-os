import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F06-T02: intake refusals and restricted columns on Setup › File intake and saved layouts
// (imports-and-opening-data 9.3, 11, 16; PRD-SEC-011, PRD-ACS-008, PRD-UXP-003). A preparer whose workbook holds a
// macro project sees it refused before it is stored, with the reason and what to do next, and stores a clean copy;
// a preparer who is not granted the class cost stages a file with a cost column and sees cost masked, its value
// nowhere on the screen. Every value is SYNTHETIC.

async function openIntake(page: Page, user: EnrolledUser, organisationCode: string) {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, {
    code: organisationCode,
    login: user.login,
    password: user.password,
    totp: await app.nextCode(),
  });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'File intake and saved layouts', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'File intake and saved layouts' })).toBeVisible();
}

test('PRD-SEC-011 PRD-UXP-003 a workbook holding a macro is refused before it is stored, with what to do next', async ({
  page,
}) => {
  const world = readWorld().fileIntake;
  await openIntake(page, world.refusal.booking, world.organisationCode);
  await page.locator('#intake-file').setInputFiles(world.refusal.macroFilePath);
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  const refusal = page.getByRole('alert');
  await expect(refusal).toContainText(
    'This workbook holds macros, controls or embedded objects, so it was not stored.',
  );
  await expect(refusal).toContainText('Save it as a plain Excel workbook (.xlsx) without them and upload it again.');
  await expect(refusal).toContainText('Macros.');
  // Nothing was stored, so no stored file is shown.
  await expect(page.getByRole('status').filter({ hasText: 'The file is stored.' })).toHaveCount(0);

  await page.locator('#intake-file').setInputFiles(world.refusal.cleanFilePath);
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'The file is stored.' })).toBeVisible();
  await expect(page.getByText('Excel workbook (XLSX)').first()).toBeVisible();
});

test('PRD-ACS-008 a preparer without the class cost sees cost masked in the staged batch and its report', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const world = readWorld().fileIntake;
  await openIntake(page, world.cost.reader, world.organisationCode);
  await page.locator('#intake-file').setInputFiles(world.cost.filePath);
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'The file is stored.' })).toBeVisible();
  await page.locator('#intake-layout').selectOption({ label: world.cost.layoutOption });
  await page.getByRole('button', { name: 'Start the import', exact: true }).click();
  const batch = page.getByRole('region', { name: /^Batch SYN-IB-\d{5}$/ });
  await expect(batch).toBeVisible();
  await expect(batch.getByRole('table', { name: `Staged rows of ${world.cost.styleCode}` })).toBeVisible();
  const masked = batch
    .getByRole('status')
    .filter({ hasText: 'Some values are masked: you are not granted these classes.' });
  await expect(masked).toContainText('Cost');
  await batch.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(batch.getByRole('status').filter({ hasText: 'Validation finished.' })).toBeVisible();
  // The cost value is nowhere on the screen, in the staged rows or the report.
  await expect(page.locator('body')).not.toContainText(world.cost.costValue);
  await expect(page.locator('body')).not.toContainText(world.cost.costValue.replace('.37', ''));
});
