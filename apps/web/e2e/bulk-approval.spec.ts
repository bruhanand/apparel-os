import { expect, test } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld } from './support/world';

// S1-F05-T02: bulk approval (access-and-approvals 9.9, 14; design-language 10.9; PRD-ACS-011, PRD-ACS-019, POL-02.19,
// PRD-MOD-015). An approver selects three SYNTHETIC requests of a test-only action type on the SYNTHETIC bulk
// allowlist, one of Unknown value, sees the known total and the count of Unknown items, and approves them in bulk with
// one fresh code: the two within their SYNTHETIC limit are approved, and the one of Unknown value, which their limit
// does not cover, stays in My work for individual review with its reason on screen. Every value is SYNTHETIC: the
// allowlist and the limits are KDPS's (B-9, V-02).

test('PRD-ACS-019 an approver approves a selection in bulk; an item failing its recheck stays for individual review', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const world = readWorld().bulk;
  const app = new Authenticator(Buffer.from(world.approver.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, {
    code: world.organisationCode,
    login: world.approver.login,
    password: world.approver.password,
    totp: await app.nextCode(),
  });
  await expect(page.getByLabel('Profile')).toHaveText(world.approver.displayName);

  await test.step('the three requests reach My work, each offered for bulk approval', async () => {
    await expect(async () => {
      await page.getByRole('button', { name: 'Refresh' }).click();
      await expect(page.getByRole('checkbox', { name: /for bulk approval/ })).toHaveCount(3, { timeout: 1_000 });
    }).toPass({ timeout: 60_000 });
  });

  await test.step('PRD-MOD-015: the bulk bar shows the known total and the count of Unknown items, never Unknown as zero', async () => {
    for (const box of await page.getByRole('checkbox', { name: /for bulk approval/ }).all()) await box.check();
    const bar = page.getByTestId('bulk-bar');
    await expect(bar.getByText('3 selected')).toBeVisible();
    await expect(bar.getByText('Total ₹3,500.00 on cost · 1 of unknown value')).toBeVisible();
  });

  await test.step('POL-02.19: approving them decides each on its own; the Unknown one stays, with its reason', async () => {
    const bar = page.getByTestId('bulk-bar');
    await bar.getByRole('button', { name: 'Approve selected', exact: true }).click();
    await bar.getByLabel(/^Reason/).selectOption(world.reasonId);
    await bar.getByLabel(/^Authenticator code/).fill(await app.nextCode());
    await bar.getByRole('button', { name: 'Approve the selected requests' }).click();
    const results = bar.getByRole('status', { name: 'Bulk approval results' });
    await expect(results.getByText('2 approved · 1 left for individual review')).toBeVisible();
    await expect(
      results.getByText(
        'The value isn’t known yet. Only an approver whose authority covers an unknown value can approve this.',
      ),
    ).toBeVisible();
    // The item that failed stays in My work for individual review; the two approved leave it.
    await expect(async () => {
      await page.getByRole('button', { name: 'Refresh' }).click();
      await expect(page.getByRole('button', { name: 'Open and decide' })).toHaveCount(1, { timeout: 1_000 });
    }).toPass({ timeout: 60_000 });
  });
});
