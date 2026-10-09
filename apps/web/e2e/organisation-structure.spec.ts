import { expect, test, type Locator, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F02-T01: the organisation structure journey (structure-and-masters 2.3, 3.3, 3.7, 8; module-map 4.11, 6.2 flow A;
// PRD-ORG-003, PRD-ORG-021, PRD-ACS-006). An Admin prepares a Site and a Store at it on Setup › Organisation
// structure; a different authorised person approves each from My work with a listed reason and a fresh code; both
// then show Setting up, In force, with their version history, and in the master lists with the time they were read.
// Every value is SYNTHETIC.

const suffix = String(Date.now()).slice(-6);
const SITE = { code: `SYN-SITE-${suffix}`, name: 'SYNTHETIC Journey Site' };
const STORE = { code: `SYN-STORE-${suffix}`, name: 'SYNTHETIC Journey Store' };

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

/** Opens a form drawer by its button, fills it, sends it, and waits for "Sent for approval". */
async function prepare(page: Page, button: string, fill: (drawer: Locator) => Promise<void>): Promise<void> {
  await page.getByRole('button', { name: button }).click();
  const drawer = page.getByRole('dialog', { name: button });
  await expect(drawer).toBeVisible();
  await fill(drawer);
  await drawer.getByTestId('drawer-footer').getByRole('button', { name: 'Request approval' }).click();
  await expect(drawer.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
}

/** Approves the item of My work whose approval panel has this title, with a listed reason and a fresh code. */
async function approveFromMyWork(page: Page, app: Authenticator, title: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('link', { name: /^My work/ })
    .click();
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(1, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole('listitem').filter({ hasText: title }).getByRole('button', { name: 'Open and decide' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
  await drawer.getByLabel(/^Reason/).selectOption({ index: 1 });
  await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
  await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(drawer.getByText(/^Approved by /)).toBeVisible();
  await page.keyboard.press('Escape');
}

test('PRD-ORG-021 PRD-ACS-006 an Admin prepares a Site and a Store at it; another person approves each from My work', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().structure;
  const adminContext = await browser.newContext();
  const approverContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const approver = await approverContext.newPage();
  try {
    await test.step('the Admin prepares a Site', async () => {
      await signedIn(admin, world.organisationCode, world.admin);
      await openStructure(admin, 'Sites');
      await prepare(admin, 'New Site', async (drawer) => {
        await drawer.getByLabel(/^Code/).fill(SITE.code);
        await drawer.getByLabel(/^Name/).fill(SITE.name);
        await drawer.getByLabel(/^Physical kind/).selectOption({ label: 'Retail site' });
        await drawer.getByLabel(/^Area/).selectOption({ label: world.areaOption });
        await drawer.getByLabel(/^Addresses/).fill('SYNTHETIC 1 Journey Road');
      });
      await expect(admin.getByRole('row').filter({ hasText: SITE.code })).toContainText('Awaiting approval');
    });

    await test.step('the Admin prepares a Store at that Site', async () => {
      await admin.getByRole('tab', { name: 'Stores', exact: true }).click();
      await prepare(admin, 'New Store', async (drawer) => {
        await drawer.getByLabel(/^Code/).fill(STORE.code);
        await drawer.getByLabel(/^Name/).fill(STORE.name);
        await drawer.getByLabel(/^Format/).selectOption({ label: 'EBO' });
        await drawer.getByLabel(/^Operating model/).selectOption({ label: 'Company-owned' });
        await drawer.getByLabel(/^Site/).selectOption({ label: `${SITE.code} · ${SITE.name}` });
      });
    });

    await test.step('a different authorised person approves the Site, then the Store, from My work', async () => {
      const app = await signedIn(approver, world.organisationCode, world.approver);
      await approveFromMyWork(approver, app, 'Site change');
      await approveFromMyWork(approver, app, 'Store change');
    });

    await test.step('both are Setting up and In force, with their version history', async () => {
      for (const [tab, record] of [
        ['Sites', SITE],
        ['Stores', STORE],
      ] as const) {
        await openStructure(admin, tab);
        const row = admin.getByRole('row').filter({ hasText: record.code });
        await expect(row).toContainText('Setting up');
        await expect(row).toContainText('In force');
        await row.getByRole('button', { name: record.code }).click();
        const drawer = admin.getByRole('dialog', { name: record.name });
        const versions = drawer.getByRole('list', { name: 'Versions' });
        await expect(versions.locator(':scope > li')).toHaveCount(1);
        await expect(versions).toContainText('In force');
        await expect(versions).toContainText('Setting up');
        await admin.keyboard.press('Escape');
      }
    });

    await test.step('both are in the master lists, with the time they were read', async () => {
      await openStructure(admin, 'Master lists');
      const table = admin.getByRole('table', { name: 'Master lists' });
      await expect(table.getByRole('row').filter({ hasText: SITE.code })).toContainText('Setting up');
      await expect(table.getByRole('row').filter({ hasText: STORE.code })).toContainText(STORE.name);
      await expect(admin.getByText(/^as of /)).toBeVisible();
    });
  } finally {
    await adminContext.close();
    await approverContext.close();
  }
});

// S1-F02-T04: the classifications journey (structure-and-masters 3.1, 8; PRD-ORG-008; RR-440, product owner 9 Oct
// 2026). An Admin defines a classification kind for Sites and a value of it; a different authorised person approves
// each from My work; the Admin gives a new Site that classification, which the Site editor offers as the
// Organisation's own; once approved, the Site's version shows it. It runs after the journey above, in this file, so
// the two never offer each other's Site change in My work.
const KIND = { code: `SYN-CK-${suffix}`, name: 'SYNTHETIC Journey Site label' };
const VALUE = { code: `SYN-CV-${suffix}`, name: 'SYNTHETIC Journey Flagship' };
const CLASSIFIED = { code: `SYN-CSITE-${suffix}`, name: 'SYNTHETIC Journey Classified Site' };

/** Waits until the tab's row for a record shows the text, refreshing the list, which another person's decision changes. */
async function rowShows(page: Page, code: string, text: string): Promise<Locator> {
  const row = page.getByRole('row').filter({ hasText: code });
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(row).toContainText(text, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  return row;
}

test('PRD-ORG-008 RR-440 an Admin defines a classification kind and value; another person approves; the Admin gives a Site that classification', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const world = readWorld().structure;
  const adminContext = await browser.newContext();
  const approverContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const approver = await approverContext.newPage();
  try {
    await test.step('the Admin defines a classification kind for Sites', async () => {
      await signedIn(admin, world.organisationCode, world.classifyAdmin);
      await openStructure(admin, 'Classification kinds');
      await prepare(admin, 'New classification kind', async (drawer) => {
        await drawer.getByLabel(/^Code/).fill(KIND.code);
        await drawer.getByLabel(/^Classifies/).selectOption({ label: 'Sites' });
        await drawer.getByLabel(/^Name/).fill(KIND.name);
      });
      await expect(admin.getByRole('row').filter({ hasText: KIND.code })).toContainText('Awaiting approval');
    });

    const app = await signedIn(approver, world.organisationCode, world.classifyApprover);
    await test.step('a different authorised person approves the kind from My work', async () => {
      await approveFromMyWork(approver, app, 'Classification kind change');
    });

    await test.step('the Admin defines a value of that kind, and the other person approves it', async () => {
      await openStructure(admin, 'Classification values');
      await prepare(admin, 'New classification value', async (drawer) => {
        await drawer.getByLabel(/^Classification kind/).selectOption({ label: `${KIND.code} · ${KIND.name}` });
        await drawer.getByLabel(/^Code/).fill(VALUE.code);
        await drawer.getByLabel(/^Name/).fill(VALUE.name);
      });
      await approveFromMyWork(approver, app, 'Classification value change');
      await openStructure(admin, 'Classification values');
      await rowShows(admin, VALUE.code, 'In force');
    });

    await test.step('the Admin gives a new Site that classification, which the Site editor offers', async () => {
      await openStructure(admin, 'Sites');
      await prepare(admin, 'New Site', async (drawer) => {
        await drawer.getByLabel(/^Code/).fill(CLASSIFIED.code);
        await drawer.getByLabel(/^Name/).fill(CLASSIFIED.name);
        await drawer.getByLabel(/^Physical kind/).selectOption({ label: 'Retail site' });
        await drawer.getByLabel(/^Area/).selectOption({ label: world.areaOption });
        await drawer.getByLabel(/^Addresses/).fill('SYNTHETIC 1 Classified Road');
        await drawer.getByRole('checkbox', { name: `${VALUE.code} · ${VALUE.name}` }).check();
      });
      await approveFromMyWork(approver, app, 'Site change');
    });

    await test.step('the Site is in force, its version carrying the classification', async () => {
      await openStructure(admin, 'Sites');
      const row = await rowShows(admin, CLASSIFIED.code, 'In force');
      await row.getByRole('button', { name: CLASSIFIED.code }).click();
      const versions = admin.getByRole('dialog', { name: CLASSIFIED.name }).getByRole('list', { name: 'Versions' });
      await expect(versions).toContainText(`${VALUE.code} · ${VALUE.name}`);
    });
  } finally {
    await adminContext.close();
    await approverContext.close();
  }
});
