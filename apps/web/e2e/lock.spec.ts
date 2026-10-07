import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld } from './support/world';

// S1-F01-T20: a locked session keeps unfinished work (spec sections 6 and 10; S1-F01-AT18, S1-F01-AT05 in the browser;
// access-and-approvals 3.3; design-language 10.7, 10.12; RR-304). An enrolled user, in an Organisation whose synthetic
// idle limit is short, half fills a new user and goes idle: the next request finds the session locked, the lock screen
// asks for the password, a wrong one is refused, the right one unlocks, and the form still holds what was typed but
// the temporary password, which is a secret and is entered again (PRD-SEC-006). Then the same with a reload while
// locked: the page shows sign-in (RR-304), and after the next sign-in the input kept on the device is offered back,
// again without the secret. Every value is SYNTHETIC.

/** SYNTHETIC: the temporary password typed into the new user. */
const TEMPORARY_PASSWORD = 'SYNTHETIC-lock-temporary-1';

async function openNewUser(page: Page) {
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Users' }).click();
  await page.getByRole('button', { name: 'New user' }).click();
  const drawer = page.getByRole('dialog', { name: 'New user' });
  await expect(drawer).toBeVisible();
  return drawer;
}

test('PRD-ACS-017 a locked session keeps the unfinished new user, drops the secret, and unlocks with the password; a reload offers the input back after sign-in', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const world = readWorld().lock;
  const app = new Authenticator(Buffer.from(world.factorSecretHex, 'hex'));
  const idleMs = (world.idleLockSeconds + 3) * 1000;
  const firstLogin = `syn-lock-${String(Date.now())}`;

  await test.step('access-and-approvals 3.1: sign in with the password and a code', async () => {
    await page.goto('/');
    await signIn(page, {
      code: world.organisationCode,
      login: world.login,
      password: world.password,
      totp: await app.nextCode(),
    });
    await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible();
    await expect(page.getByLabel('Profile')).toHaveText(world.displayName);
  });

  const drawer = await openNewUser(page);
  await test.step('design-language 5, 6 A: the page fits the window, and the drawer starts under the banner and top bar', async () => {
    const layout = await page.evaluate(() => {
      const bottom = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().bottom ?? -1;
      const top = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().top ?? -1;
      return {
        overflow: document.documentElement.scrollHeight - window.innerHeight,
        banner: bottom('[data-testid="environment-banner"]'),
        header: bottom('[data-testid="top-bar"]'),
        headerTop: top('[data-testid="top-bar"]'),
        scrim: top('[data-testid="drawer-scrim"]'),
        drawer: top('[role="dialog"]'),
      };
    });
    // Visual review finding 1: no blank band below the page, and no overlay over part of the top bar.
    expect(layout.overflow).toBeLessThanOrEqual(0);
    expect(layout.headerTop).toBe(layout.banner);
    expect(layout.scrim).toBe(layout.banner);
    expect(layout.drawer).toBe(layout.header);
  });

  await test.step('half fill a new user, then go idle past the synthetic limit', async () => {
    await drawer.getByLabel(/^Login/).fill(firstLogin);
    await drawer.getByLabel(/^Display name/).fill('SYNTHETIC locked draft');
    await drawer.getByLabel(/^Temporary password/).fill(TEMPORARY_PASSWORD);
    await page.waitForTimeout(idleMs);
    await drawer.getByRole('button', { name: 'Request approval' }).click();
  });

  const lock = page.getByRole('dialog', { name: 'Session locked' });
  await test.step('access-and-approvals 3.3: the lock screen asks for the password; the work stays, the secret goes', async () => {
    await expect(lock).toBeVisible();
    await expect(drawer.getByLabel(/^Login/)).toHaveValue(firstLogin);
    await expect(drawer.getByLabel(/^Display name/)).toHaveValue('SYNTHETIC locked draft');
    await expect(drawer.getByLabel(/^Temporary password/)).toHaveValue('');
    await expect(lock.getByRole('button', { name: 'Sign out instead' })).toBeVisible();
  });

  await test.step('visual review finding 2: the lock covers the open drawer, which shows no error for the lock', async () => {
    const box = await drawer.boundingBox();
    expect(box).not.toBeNull();
    const covered = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.closest('[data-testid="lock-overlay"]') !== null,
      [(box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + 24],
    );
    expect(covered).toBe(true);
    await expect(drawer.getByRole('alert')).toHaveCount(0);
    await expect(drawer.getByText('Your session is locked')).toHaveCount(0);
  });

  await test.step('access-and-approvals 3.1: a wrong password gets the one refusal and is not kept', async () => {
    await lock.getByLabel(/^Password/).fill('SYNTHETIC-not-the-password');
    await lock.getByRole('button', { name: 'Unlock' }).click();
    await expect(lock.getByRole('alert')).toContainText(
      'The Organisation code, login, password or authenticator code is not right.',
    );
    await expect(lock.getByLabel(/^Password/)).toHaveValue('');
  });

  await test.step('PRD-ACS-017 the same user unlocks, the form is live again, and the request is sent', async () => {
    await lock.getByLabel(/^Password/).fill(world.password);
    await lock.getByRole('button', { name: 'Unlock' }).click();
    await expect(lock).toHaveCount(0);
    await expect(drawer.getByLabel(/^Login/)).toHaveValue(firstLogin);
    await drawer.getByLabel(/^Temporary password/).fill(TEMPORARY_PASSWORD);
    await drawer.getByRole('button', { name: 'Request approval' }).click();
    await expect(drawer.getByRole('status').filter({ hasText: 'Sent for approval' })).toBeVisible();
  });

  const secondLogin = `syn-kept-${String(Date.now())}`;
  await test.step('RR-304 locked again with unsaved input, a reload shows sign-in, not the lock', async () => {
    await drawer.getByLabel(/^Login/).fill(secondLogin);
    await drawer.getByLabel(/^Display name/).fill('SYNTHETIC kept draft');
    await drawer.getByLabel(/^Temporary password/).fill(TEMPORARY_PASSWORD);
    await page.waitForTimeout(idleMs);
    await drawer.getByRole('button', { name: 'Request approval' }).click();
    await expect(lock).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  await test.step('PRD-UXP-003 after the next sign-in the kept input is offered back, without the secret', async () => {
    await signIn(page, {
      code: world.organisationCode,
      login: world.login,
      password: world.password,
      totp: await app.nextCode(),
    });
    const again = await openNewUser(page);
    await expect(again.getByText('Unsaved input from your last session was kept on this device.')).toBeVisible();
    await again.getByRole('button', { name: 'Restore it' }).click();
    await expect(again.getByLabel(/^Login/)).toHaveValue(secondLogin);
    await expect(again.getByLabel(/^Display name/)).toHaveValue('SYNTHETIC kept draft');
    await expect(again.getByLabel(/^Temporary password/)).toHaveValue('');
  });
});
