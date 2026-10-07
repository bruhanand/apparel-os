import { expect, test, type Page } from '@playwright/test';
import { Authenticator, decodeBase32 } from './support/authenticator';
import { watchSecurityPolicy } from './support/security-policy';
import { readWorld } from './support/world';

// S1-F01-T15: the first sign-in journey (code-house-rules 10.1; PRD-SEC-016). A synthetic user with a temporary
// password and no authenticator app signs in, enrols an app, chooses their own password, and reaches the shell; then
// signs in again with the new password and a code. The other S1-F01-AT18 journeys are S1-F01-T20's.

/** SYNTHETIC: the password the journey's user chooses. */
const NEW_PASSWORD = 'SYNTHETIC-own-password-1';

async function signIn(page: Page, fields: { code: string; login: string; password: string; totp?: string }) {
  await page.getByLabel('Organisation code').fill(fields.code);
  await page.getByLabel('Login').fill(fields.login);
  await page.getByLabel(/^Password/).fill(fields.password);
  if (fields.totp !== undefined) await page.getByLabel('Authenticator code').fill(fields.totp);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('PRD-SEC-001 a synthetic user signs in for the first time, enrols an authenticator app, sets their own password, then signs in with both', async ({
  page,
  browser,
}) => {
  const world = readWorld();
  // The pages of the journey, the enrolment QR code included, load nothing the one-origin policy refuses (S1-F01-T27).
  const violations = watchSecurityPolicy(page);

  await test.step('access-and-approvals 3.1: sign in with the temporary password and no code', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main menu' })).toHaveCount(0);
    await signIn(page, { code: world.organisationCode, login: world.login, password: world.temporaryPassword });
  });

  let authenticator: Authenticator | undefined;
  await test.step('access-and-approvals 3.2: enrol an authenticator app from the key shown once', async () => {
    await expect(page.getByRole('heading', { name: 'Set up your authenticator app' })).toBeVisible();
    await page.getByRole('button', { name: 'Show the setup key' }).click();
    const key = await page.getByTestId('enrolment-key').textContent();
    authenticator = new Authenticator(decodeBase32(key ?? ''));
    await page.getByLabel('Authenticator code').fill(await authenticator.nextCode());
    await page.getByRole('button', { name: 'Confirm the app' }).click();
  });
  if (authenticator === undefined) throw new Error('No authenticator was enrolled');
  const app = authenticator;

  await test.step('access-and-approvals 3.2: replace the temporary password after a fresh code', async () => {
    await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();
    await page.getByLabel(/^New password(?! again)/).fill(NEW_PASSWORD);
    await page.getByLabel('New password again').fill(NEW_PASSWORD);
    await page.getByLabel('Authenticator code').fill(await app.nextCode());
    await page.getByRole('button', { name: 'Change password' }).click();
  });

  await test.step('DEC-116: first sign-in done, the shell opens on My work under the user’s name', async () => {
    await expect(page.getByRole('heading', { name: 'My work' })).toBeVisible();
    await expect(page.getByText(world.displayName)).toBeVisible();
    // A reload keeps the session: the screens read it from the server, not from the page (access-and-approvals 3.3).
    await page.reload();
    await expect(page.getByRole('heading', { name: 'My work' })).toBeVisible();
  });

  const fresh = await browser.newContext();
  const second = await fresh.newPage();
  try {
    await test.step('access-and-approvals 3.1: a wrong password is refused with the one message that names no part', async () => {
      await second.goto('/');
      await signIn(second, {
        code: world.organisationCode,
        login: world.login,
        password: world.temporaryPassword,
      });
      await expect(second.getByRole('alert')).toContainText(
        'The Organisation code, login, password or authenticator code is not right.',
      );
      // Nothing typed into a secret field outlives the refused attempt (PRD-SEC-006).
      await expect(second.getByLabel(/^Password/)).toHaveValue('');
    });

    await test.step('PRD-SEC-001 sign in again with the new password and a code from the app', async () => {
      await signIn(second, {
        code: world.organisationCode,
        login: world.login,
        password: NEW_PASSWORD,
        totp: await app.nextCode(),
      });
      await expect(second.getByRole('heading', { name: 'My work' })).toBeVisible();
      await expect(second.getByText(world.displayName)).toBeVisible();
    });
  } finally {
    await fresh.close();
  }
  expect(violations()).toEqual([]);
});
