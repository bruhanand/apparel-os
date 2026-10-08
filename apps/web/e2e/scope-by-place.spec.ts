import { expect, test, type Locator, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { organisationToday, signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F02-T03: scope by place (access-and-approvals 5, 7.1, 14; structure-and-masters 3.9, 6.1; PRD-ACS-021,
// PRD-ACS-006, PRD-UXP-003). An Admin prepares a role assignment selecting one synthetic Store from the place tree; a
// different authorised person approves it from My work; the person then reads that Store's records, sees no other
// Store, and is refused at the other Store with the place named. Every value is SYNTHETIC.

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

async function openScreen(page: Page, name: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test('PRD-ACS-021 PRD-UXP-003 an assignment selecting one Store lets its person read that Store and refuses another, naming it', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().scope;
  const [mine, other] = world.stores;
  if (mine === undefined || other === undefined) throw new Error('The scope journey needs two Stores');
  const adminContext = await browser.newContext();
  const approverContext = await browser.newContext();
  const readerContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const approver = await approverContext.newPage();
  const reader = await readerContext.newPage();
  try {
    await test.step('access-and-approvals 14: the Admin selects one Store from the place tree', async () => {
      await signedIn(admin, world.organisationCode, world.admin);
      await openScreen(admin, 'Role assignments');
      await admin.getByRole('button', { name: 'New role assignment' }).click();
      const drawer: Locator = admin.getByRole('dialog', { name: 'New role assignment' });
      await drawer.getByLabel(/^Person/).selectOption({ label: world.readerOption });
      await drawer.getByLabel(/^Role/).selectOption({ label: world.roleOption });
      const place = drawer.getByRole('group', { name: 'Place', exact: true });
      await place.getByLabel('Selected members').check();
      const tree = place.getByRole('list', { name: 'Places' });
      // The tree: the Site, and its two Stores under it; the note says what a selection covers later.
      await expect(tree.getByText(`Store ${other.code} · ${other.name}`)).toBeVisible();
      await tree.getByLabel(`Store ${mine.code} · ${mine.name}`).check();
      await expect(
        drawer.getByText(/a selected Store covers its business units, including ones added later/),
      ).toBeVisible();
      await drawer.getByLabel(/^Starts on/).fill(organisationToday());
      await drawer.getByTestId('drawer-footer').getByRole('button', { name: 'Request approval' }).click();
      await expect(drawer.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
      await admin.keyboard.press('Escape');
    });

    await test.step('PRD-ACS-006: a different authorised person approves it from My work', async () => {
      const app = await signedIn(approver, world.organisationCode, world.approver);
      await expect(async () => {
        await approver.getByRole('button', { name: 'Refresh' }).click();
        await expect(approver.getByRole('listitem').filter({ hasText: 'Role assignment change' })).toHaveCount(1, {
          timeout: 1_000,
        });
      }).toPass({ timeout: 30_000 });
      await approver
        .getByRole('listitem')
        .filter({ hasText: 'Role assignment change' })
        .getByRole('button', { name: 'Open and decide' })
        .click();
      const drawer = approver.getByRole('dialog');
      await drawer.getByLabel(/^Reason/).selectOption({ index: 1 });
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(/^Approved by /)).toBeVisible();
    });

    await test.step('PRD-ACS-021: the person reads that Store, and no other Store is listed', async () => {
      await signedIn(reader, world.organisationCode, world.reader);
      await openScreen(reader, 'Organisation structure');
      await reader.getByRole('tab', { name: 'Stores', exact: true }).click();
      const row = reader.getByRole('row').filter({ hasText: mine.code });
      await expect(row).toContainText('In force');
      await expect(reader.getByRole('row').filter({ hasText: other.code })).toHaveCount(0);
      await row.getByRole('button', { name: mine.code }).click();
      await expect(reader.getByRole('dialog', { name: mine.name })).toBeVisible();
      await reader.keyboard.press('Escape');
    });

    await test.step('PRD-UXP-003: at the other Store the person is refused, with the place named', async () => {
      // The other Store's record, read with the person's own session (access-and-approvals 7.1 step 3).
      const response = await reader.request.get(`/api/organisation/stores/${other.id}`);
      expect(response.status()).toBe(403);
      expect(await response.json()).toMatchObject({
        error: {
          code: 'access.not-authorised',
          missing: [{ kind: 'scope', dimension: 'place', factType: 'store', factId: other.id, factCode: other.code }],
        },
      });
    });
  } finally {
    await adminContext.close();
    await approverContext.close();
    await readerContext.close();
  }
});
