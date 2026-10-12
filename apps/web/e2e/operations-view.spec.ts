import { expect, test } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld } from './support/world';

// S1-F08-T04, S1-F14-T02: the operations view (code-house-rules 12.9; module-map 4.1; backup-and-restore 10.2;
// PRD-SEC-013). A person holding view on
// `kernel.job` through a SYNTHETIC role opens Setup › Operations view and sees the failed SYNTHETIC job, which the
// worker failed for good once it exhausted its SYNTHETIC retries; the list refreshes live when it fails. Every value is
// SYNTHETIC.

test('PRD-SEC-013 an authorised operator opens the operations view and sees a failed synthetic job', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const world = readWorld().operationsView;
  const app = new Authenticator(Buffer.from(world.viewer.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, {
    code: world.organisationCode,
    login: world.viewer.login,
    password: world.viewer.password,
    totp: await app.nextCode(),
  });
  await expect(page.getByLabel('Profile')).toHaveText(world.viewer.displayName);
  await page
    .getByRole('link', { name: /^Operations view/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Operations view' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: world.jobKind });
  // Five SYNTHETIC attempts with growing delays may still be running when the journey starts.
  await expect(row).toBeVisible({ timeout: 90_000 });
  await expect(row.getByText('Failed', { exact: true })).toBeVisible();
  await expect(row.getByText('5 of 5')).toBeVisible();
  await expect(row.getByText('Failed each time it was tried')).toBeVisible();
  await expect(row.getByText('CommandTimedOut')).toBeVisible();
  await expect(row.getByText('kernel.synthetic-work-requested')).toBeVisible();
  // S1-F14-T02: backup status, for a person who also holds view on `kernel.backup_record` (PRD-SEC-013).
  await expect(page.getByRole('heading', { level: 2, name: 'Backups', exact: true })).toBeVisible();
  await expect(page.getByText(/^Last complete backup taken from the data as it was at/)).toBeVisible();
  const backup = page.getByRole('row').filter({ hasText: world.backupId });
  await expect(backup.getByText('Completed', { exact: true })).toBeVisible();
});
