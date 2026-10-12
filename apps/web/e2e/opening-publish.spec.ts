import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F13-T03: Publish on an opening batch shows unavailable with what is missing (imports-and-opening-data 4.2, 10.1,
// 16, 17 test 22; PRD-SEC-017, PRD-UXP-003; stage 1 exit check 5). A preparer of opening batches opens a SYNTHETIC
// opening batch from the Outcomes tab, in an Organisation where policy 14 is not signed, of a unit with no approved
// switch: Publish stays visible and disabled, and the banner names the policy, its validation, the capability and the
// switch, with a link to Policy readiness. Every value is SYNTHETIC.

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<void> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
}

test('PRD-SEC-017 PRD-UXP-003 Publish of an opening batch shows unavailable, naming what is missing', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const world = readWorld().fileIntake;
  await signedIn(page, world.organisationCode, world.opening.preparer);
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'File intake and saved layouts', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Outcomes', exact: true }).click();
  await page.getByRole('button', { name: `Open batch ${world.opening.batchCode}`, exact: true }).click();
  const batch = page.getByRole('region', { name: `Batch ${world.opening.batchCode}` });
  await expect(batch.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  const banner = batch.getByRole('status').filter({ hasText: 'Policy 14 · Opening and cutover' });
  await expect(banner).toContainText('Policy 14 · Opening and cutover is not signed.');
  await expect(banner).toContainText(
    'Policy 14 · Opening and cutover: its real values are not validated by a person who did not enter them.',
  );
  await expect(banner).toContainText('The capability Opening-data publishing is switched off.');
  await expect(banner).toContainText('The unit has no approved switch with its cutover still open.');
  await expect(banner.getByRole('link')).toHaveAttribute('href', '/setup/policy-readiness?policy=14');
});
