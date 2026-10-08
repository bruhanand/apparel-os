import { expect, test, type Locator, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F02-T02: the business units journey (structure-and-masters 3.3, 3.4, 8, 9 tests 1 and 16; README 7.1 exit check
// 1, mapping part; PRD-ORG-005, PRD-ACS-006, POL-10.08; GC2-2, DEC-105). An Admin prepares two units at one Site,
// mapped to different books and registrations; a different authorised person approves them from My work; an Accounts
// user who did not make the mappings verifies one, attaching an evidence file; the Admin's own verification of the
// other is refused, with its reason on screen. Every value is SYNTHETIC.

const suffix = String(Date.now()).slice(-6);
const UNITS = [
  { code: `SYN-BU-A-${suffix}`, name: 'SYNTHETIC Journey Warehouse Unit', kind: 'Warehouse' },
  { code: `SYN-BU-B-${suffix}`, name: 'SYNTHETIC Journey Office Unit', kind: 'Office' },
] as const;
const EVIDENCE = {
  name: 'SYNTHETIC-mapping-evidence.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% SYNTHETIC mapping evidence\n%%EOF\n', 'latin1'),
};

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

async function openStructure(page: Page, tab: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: 'Organisation structure', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Organisation structure' })).toBeVisible();
  await page.getByRole('tab', { name: tab, exact: true }).click();
}

/** Approves every item of My work whose approval panel has this title, with a listed reason and a fresh code. */
async function approveAllFromMyWork(page: Page, app: Authenticator, title: string, count: number): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: /^My work/ })
    .click();
  for (let left = count; left > 0; left -= 1) {
    await expect(async () => {
      await page.getByRole('button', { name: 'Refresh' }).click();
      await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(left, { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await page
      .getByRole('listitem')
      .filter({ hasText: title })
      .first()
      .getByRole('button', { name: 'Open and decide' })
      .click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
    await drawer.getByLabel(/^Reason/).selectOption({ index: 1 });
    await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
    await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(drawer.getByText(/^Approved by /)).toBeVisible();
    await page.keyboard.press('Escape');
  }
}

/** Opens a unit's mapping on the Mappings tab and verifies it with the evidence file. */
async function verifyMapping(page: Page, unitCode: string): Promise<Locator> {
  await openStructure(page, 'Mappings');
  const row = page.getByRole('row').filter({ hasText: unitCode });
  await row.getByRole('button', { name: unitCode }).click();
  const drawer = page.getByRole('dialog', { name: unitCode });
  await expect(drawer.getByRole('list', { name: 'Versions' })).toContainText('In force');
  await drawer.getByRole('button', { name: 'Verify mapping' }).click();
  await drawer.getByLabel('Evidence').setInputFiles(EVIDENCE);
  await drawer.getByRole('button', { name: 'Verify with this evidence' }).click();
  return drawer;
}

test('PRD-ORG-005 POL-10.08 two units at one Site mapped to different books and registrations; approved by another person; one verified with evidence by Accounts; the maker’s own verification refused', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().structure;
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [admin, approver, accounts] = await Promise.all(contexts.map((context) => context.newPage()));
  if (admin === undefined || approver === undefined || accounts === undefined) throw new Error('no pages');
  try {
    await test.step('the Admin prepares two units at one Site, mapped to different books and registrations', async () => {
      await signedIn(admin, world.organisationCode, world.unitsAdmin);
      await openStructure(admin, 'Business units');
      for (const [index, unit] of UNITS.entries()) {
        const entity = world.entities[index];
        if (entity === undefined) throw new Error('no entity');
        await admin.getByRole('button', { name: 'New business unit' }).click();
        const drawer = admin.getByRole('dialog', { name: 'New business unit' });
        await drawer.getByLabel(/^Code/).fill(unit.code);
        await drawer.getByLabel(/^Site/).selectOption({ label: world.siteOption });
        await drawer.getByLabel(/^Kind/).selectOption({ label: unit.kind });
        await drawer.getByLabel(/^Name/).fill(unit.name);
        await drawer.getByLabel(/^Legal entity/).selectOption({ label: entity.legalEntityOption });
        await drawer.getByLabel(/^Tax registration/).selectOption({ label: entity.registrationOption });
        await drawer.getByLabel(/^Accounting book/).selectOption({ label: entity.bookOption });
        await drawer.getByTestId('drawer-footer').getByRole('button', { name: 'Request approval' }).click();
        await expect(drawer.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
        await admin.keyboard.press('Escape');
        await expect(admin.getByRole('row').filter({ hasText: unit.code })).toContainText('Awaiting approval');
      }
    });

    await test.step('a different authorised person approves both from My work', async () => {
      const app = await signedIn(approver, world.organisationCode, world.unitsApprover);
      await approveAllFromMyWork(approver, app, 'Business unit change', 2);
    });

    await test.step('an Accounts user who did not make the mapping verifies one, attaching an evidence file', async () => {
      await signedIn(accounts, world.organisationCode, world.accounts);
      const drawer = await verifyMapping(accounts, UNITS[0].code);
      const verification = drawer.getByRole('group', { name: 'Verification' });
      await expect(verification).toContainText('Verified');
      await expect(verification).toContainText(EVIDENCE.name);
      await accounts.keyboard.press('Escape');
    });

    await test.step('the Admin who made the other mapping is refused verifying it, with the reason on screen', async () => {
      const drawer = await verifyMapping(admin, UNITS[1].code);
      await expect(drawer.getByRole('alert')).toContainText('You made this mapping, so you cannot verify it.');
      await expect(drawer.getByRole('group', { name: 'Verification' })).toHaveCount(0);
    });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
