import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Authenticator } from './support/authenticator';
import { firstSignIn, organisationToday, tabTo, typeInto } from './support/journey';
import { readWorld } from './support/world';

// S1-F01-T20: the approval journey of the spec (sections 1, 5 and 10; S1-F01-AT18; PRD-SEC-016, PRD-UXP-001,
// PRD-UXP-003), in an Organisation the real setup step made (access-and-approvals 9.11). The first Admin and the first
// approver sign in for the first time; the Admin proposes the first reason list, which the approver decides with
// free text from My work, the first decision with the keyboard only; the Admin prepares a user with persona P-AUD, a
// role and its assignment, and cannot decide them; the approver decides each from My work with a listed reason and a
// fresh code, one of them after a reload in the middle of the decision, and nothing is decided twice; the third person
// signs in, reads the history of the assignment, and finds the role editor refused with the missing permission named.
// Every value is SYNTHETIC.

const today = organisationToday();
const suffix = String(Date.now()).slice(-6);
const ADMIN_PASSWORD = 'SYNTHETIC-admin-own-password-1';
const APPROVER_PASSWORD = 'SYNTHETIC-approver-own-password-1';
const READER_PASSWORD = 'SYNTHETIC-reader-own-password-1';
const READER = {
  login: `syn-reader-${suffix}`,
  displayName: 'SYNTHETIC History reader',
  temporaryPassword: 'SYNTHETIC-reader-temporary-1',
};
const ROLE = { code: `SYN-HISTORY-${suffix}`, name: 'SYNTHETIC history reader' };
const APPROVE_REASON = { code: 'SYN-OK', text: 'SYNTHETIC checked and in order' };
const REJECT_REASON = { code: 'SYN-NO', text: 'SYNTHETIC not in order' };

function menu(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Main menu' });
}

async function openScreen(page: Page, name: string): Promise<void> {
  await menu(page).getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** Opens a form drawer by its button, fills it through `fill`, sends it, and waits for "Sent for approval". */
async function prepare(page: Page, button: string, fill: (drawer: Locator) => Promise<void>): Promise<void> {
  await page.getByRole('button', { name: button }).click();
  const drawer = page.getByRole('dialog', { name: button });
  await expect(drawer).toBeVisible();
  await fill(drawer);
  await drawer.getByRole('button', { name: 'Request approval' }).click();
  await expect(drawer.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
}

/** The open items of My work, read again with Refresh until there are `count` (the worker publishes them; RR-301). */
async function myWorkHolds(page: Page, count: number): Promise<void> {
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByRole('button', { name: 'Open and decide' })).toHaveCount(count, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}

/** Opens the item of My work whose approval panel has this title, closing the others it opens on the way. */
async function openItem(page: Page, title: string): Promise<Locator> {
  const items = page.getByRole('button', { name: 'Open and decide' });
  const total = await items.count();
  for (let index = 0; index < total; index += 1) {
    await items.nth(index).click();
    const drawer = page.getByRole('dialog');
    const heading = drawer.getByRole('heading', { level: 2, name: title, exact: true });
    await expect(drawer.getByRole('heading', { level: 2 }).nth(1)).toBeVisible();
    if ((await heading.count()) > 0) return drawer;
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  }
  throw new Error(`No item of My work is a ${title}`);
}

/** Decides an open panel with a listed reason and a fresh code, and waits for the panel to show the decision. */
async function approveListed(drawer: Locator, app: Authenticator, approverName: string): Promise<void> {
  await drawer.getByLabel(/^Reason/).selectOption({ label: `${APPROVE_REASON.code} · ${APPROVE_REASON.text}` });
  await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
  await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(drawer.getByText(`Approved by ${approverName}`)).toBeVisible();
}

test('PRD-UXP-001 PRD-UXP-003 the Admin prepares, the approver approves from My work, the third person reads the history', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const world = readWorld().journey;
  const code = world.organisationCode;
  const adminContext = await browser.newContext();
  const approverContext = await browser.newContext();
  // Tall enough that the evidence screenshot holds the whole history of the assignment (spec section 15).
  const readerContext = await browser.newContext({ viewport: { width: 1280, height: 2000 } });
  const admin = await adminContext.newPage();
  const approver = await approverContext.newPage();
  const reader = await readerContext.newPage();
  try {
    await test.step('access-and-approvals 3.2: the first Admin signs in for the first time', async () => {
      await firstSignIn(admin, code, world.admin, ADMIN_PASSWORD);
      await expect(admin.getByLabel('Profile')).toHaveText(world.admin.displayName);
    });

    await test.step('POL-02.23 DEC-104: the Admin proposes the first reason list', async () => {
      await openScreen(admin, 'Reason codes');
      for (const [kind, reason] of [
        ['Approve reason', APPROVE_REASON],
        ['Reject reason', REJECT_REASON],
      ] as const) {
        await prepare(admin, 'New reason', async (drawer) => {
          await drawer.getByLabel(/^Code/).fill(reason.code);
          await drawer.getByLabel(/^Kind/).selectOption({ label: kind });
          await drawer.getByLabel(/^Text/).fill(reason.text);
          await drawer.getByLabel(/^Starts on/).fill(today);
        });
      }
    });

    let approverApp: Authenticator | undefined;
    await test.step('PRD-SEC-016 the first approver signs in for the first time with the keyboard only', async () => {
      approverApp = await firstSignIn(approver, code, world.approver, APPROVER_PASSWORD, 'keyboard');
      await expect(approver.getByRole('heading', { level: 1, name: 'My work' })).toBeVisible();
    });
    if (approverApp === undefined) throw new Error('The approver enrolled no app');
    const app = approverApp;

    await test.step('PRD-UXP-001 the first reason is decided from My work with free text, with the keyboard only', async () => {
      await myWorkHolds(approver, 2);
      await tabTo(approver, approver.getByRole('button', { name: 'Open and decide' }).first());
      await approver.keyboard.press('Enter');
      const drawer = approver.getByRole('dialog');
      await expect(drawer.getByRole('heading', { name: 'Reason list change' })).toBeVisible();
      await expect(drawer.getByText('You didn’t prepare this, so you can decide it.')).toBeVisible();
      await typeInto(approver, drawer.getByLabel(/^Reason in your own words/), 'SYNTHETIC first list');
      await typeInto(approver, drawer.getByLabel(/^Authenticator code/), await app.nextCode());
      await approver.keyboard.press('Enter');
      await expect(drawer.getByText(`Approved by ${world.approver.displayName}`)).toBeVisible();
      await approver.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
    });

    await test.step('DEC-104: the second reason is decided with free text too', async () => {
      await myWorkHolds(approver, 1);
      const drawer = await openItem(approver, 'Reason list change');
      await drawer.getByLabel(/^Reason in your own words/).fill('SYNTHETIC first list');
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByText(`Approved by ${world.approver.displayName}`)).toBeVisible();
      await approver.keyboard.press('Escape');
      await myWorkHolds(approver, 0);
      await expect(approver.getByText('Nothing waiting for you')).toBeVisible();
    });

    await test.step('DEC-112 DEC-116: the Admin prepares the third person, a role and the assignment', async () => {
      await openScreen(admin, 'Users');
      await prepare(admin, 'New user', async (drawer) => {
        await drawer.getByLabel(/^Login/).fill(READER.login);
        await drawer.getByLabel(/^Display name/).fill(READER.displayName);
        await drawer.locator('#new-user-persona-P-AUD').check();
        await drawer.getByLabel(/^Temporary password/).fill(READER.temporaryPassword);
      });
      await openScreen(admin, 'Roles');
      await prepare(admin, 'New role', async (drawer) => {
        await drawer.getByLabel(/^Code/).fill(ROLE.code);
        await drawer.getByLabel(/^Name/).fill(ROLE.name);
        await drawer.getByLabel(/^Starts on/).fill(today);
        for (const recordType of ['User', 'Role assignment', 'Audit record']) {
          const row = drawer.getByRole('listitem').filter({ has: admin.getByText(recordType, { exact: true }) });
          await row.getByLabel('View', { exact: true }).check();
        }
      });
      await openScreen(admin, 'Role assignments');
      await prepare(admin, 'New role assignment', async (drawer) => {
        await drawer.getByLabel(/^Person/).selectOption({ label: `${READER.displayName} (${READER.login})` });
        await drawer.getByLabel(/^Role/).selectOption({ label: `${ROLE.code} · ${ROLE.name}` });
        await drawer.getByLabel(/^Starts on/).fill(today);
      });
    });

    await test.step('PRD-ACS-006 PRD-UXP-003: the Admin cannot decide what they prepared, and the panel says why', async () => {
      await openScreen(admin, 'Users');
      await admin.getByRole('button', { name: READER.login, exact: true }).click();
      const drawer = admin.getByRole('dialog');
      await drawer.getByRole('button', { name: 'Open the approval' }).click();
      await expect(drawer.getByRole('heading', { name: 'User change' })).toBeVisible();
      await expect(drawer.getByRole('status')).toContainText(/can’t decide this request|another person must decide it/);
      await expect(drawer.getByLabel(/^Authenticator code/)).toHaveCount(0);
      await admin.keyboard.press('Escape');
    });

    await test.step('DEC-116: the assignment waits for its user, and the panel names what is missing', async () => {
      await myWorkHolds(approver, 3);
      const drawer = await openItem(approver, 'Role assignment change');
      await expect(drawer.getByText('The user this is for must be approved first.')).toBeVisible();
      await approver.keyboard.press('Escape');
    });

    await test.step('spec section 10: a reload in the middle of a decision reloads the request, and nothing is decided', async () => {
      const drawer = await openItem(approver, 'Role change');
      await drawer.getByLabel(/^Reason/).selectOption({ label: `${APPROVE_REASON.code} · ${APPROVE_REASON.text}` });
      await drawer.getByLabel(/^Authenticator code/).fill('12');
      await approver.reload();
      await expect(approver.getByRole('heading', { level: 1, name: 'My work' })).toBeVisible();
      await myWorkHolds(approver, 3);
      const again = await openItem(approver, 'Role change');
      await expect(again.getByText('You didn’t prepare this, so you can decide it.')).toBeVisible();
      await expect(again.getByLabel(/^Authenticator code/)).toHaveValue('');
      await approveListed(again, app, world.approver.displayName);
      await approver.keyboard.press('Escape');
    });

    await test.step('PRD-INT-002: the user is approved, and a reload right after shows it decided once', async () => {
      await myWorkHolds(approver, 2);
      const drawer = await openItem(approver, 'User change');
      await approveListed(drawer, app, world.approver.displayName);
      await approver.reload();
      await expect(approver.getByRole('heading', { level: 1, name: 'My work' })).toBeVisible();
      await myWorkHolds(approver, 1);
      await openScreen(approver, 'Users');
      await approver.getByRole('button', { name: READER.login, exact: true }).click();
      const record = approver.getByRole('dialog');
      await expect(record.getByText('Open the approval')).toHaveCount(0);
      await record.getByRole('tab', { name: 'History' }).click();
      await expect(record.getByText('Approved a user version')).toHaveCount(1);
      await approver.keyboard.press('Escape');
    });

    await test.step('PRD-ACS-007: the assignment is approved with a listed reason and a fresh code', async () => {
      await openScreen(approver, 'My work');
      await myWorkHolds(approver, 1);
      const drawer = await openItem(approver, 'Role assignment change');
      await approveListed(drawer, app, world.approver.displayName);
      await approver.keyboard.press('Escape');
      await myWorkHolds(approver, 0);
    });

    await test.step('access-and-approvals 3.2: the third person signs in for the first time', async () => {
      await firstSignIn(reader, code, READER, READER_PASSWORD);
      await expect(reader.getByLabel('Profile')).toHaveText(READER.displayName);
      // A persona grants nothing: the menu holds what the role grants (PRD-ACS-002, PRD-ACS-003).
      await expect(menu(reader).getByRole('link', { name: 'Role assignments' })).toBeVisible();
      await expect(menu(reader).getByRole('link', { name: 'Roles', exact: true })).toHaveCount(0);
    });

    await test.step('PRD-ACS-013 PRD-PRF-004: the third person reads the history of their assignment', async () => {
      await openScreen(reader, 'Role assignments');
      await reader.getByRole('button', { name: READER.displayName, exact: true }).click();
      const drawer = reader.getByRole('dialog');
      await drawer.getByRole('tab', { name: 'History' }).click();
      const prepared = drawer.getByRole('listitem').filter({ hasText: 'Prepared a role assignment' });
      await expect(prepared).toContainText(world.admin.displayName);
      const approved = drawer.getByRole('listitem').filter({ hasText: 'Approved a role assignment' });
      await expect(approved).toHaveCount(1);
      await expect(approved).toContainText(world.approver.displayName);
      await expect(approved).toContainText(APPROVE_REASON.text);
      await expect(drawer.getByText(/^as of /)).toBeVisible();
      await test.info().attach('history-of-the-approved-assignment', {
        body: await reader.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    });

    await test.step('PRD-UXP-003: the role editor is refused, naming the missing permission', async () => {
      await reader.keyboard.press('Escape');
      await reader.goto('/setup/roles');
      await expect(reader.getByRole('status')).toContainText('Needs View on Role.');
      await expect(reader.getByRole('button', { name: 'New role' })).toHaveCount(0);
    });
  } finally {
    await adminContext.close();
    await approverContext.close();
    await readerContext.close();
  }
});
