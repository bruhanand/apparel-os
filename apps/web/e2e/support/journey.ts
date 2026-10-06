import { expect, type Locator, type Page } from '@playwright/test';
import { Authenticator, decodeBase32 } from './authenticator';
import type { FirstSignInUser } from './world';

// Steps the journeys share (S1-F01-T15, S1-F01-T20): signing in, the first sign-in with its enrolment and password
// change (access-and-approvals 3.1, 3.2), the same done with the keyboard only (PRD-SEC-016, PRD-UXP-001), and the
// date fields' value. Every value is SYNTHETIC.

export interface SignInFields {
  readonly code: string;
  readonly login: string;
  readonly password: string;
  readonly totp?: string;
}

/** Signs in by filling the form and pressing the button. */
export async function signIn(page: Page, fields: SignInFields): Promise<void> {
  await page.getByLabel('Organisation code').fill(fields.code);
  await page.getByLabel('Login').fill(fields.login);
  await page.getByLabel(/^Password/).fill(fields.password);
  if (fields.totp !== undefined) await page.getByLabel('Authenticator code').fill(fields.totp);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/**
 * Presses Tab until the control has the focus, and fails if it never comes: the control is reachable from the
 * keyboard, in the page's own order (design-language 9; PRD-UXP-001).
 */
export async function tabTo(page: Page, control: Locator, most = 80): Promise<void> {
  for (let presses = 0; presses < most; presses += 1) {
    if (await control.evaluate((element) => element === document.activeElement).catch(() => false)) return;
    await page.keyboard.press('Tab');
  }
  await expect(control).toBeFocused();
}

/** Tabs to a field and types into it, with the keyboard only. */
export async function typeInto(page: Page, control: Locator, text: string): Promise<void> {
  await tabTo(page, control);
  await page.keyboard.type(text);
}

export type Input = 'pointer' | 'keyboard';

/** Signs in with the keyboard only: Tab from field to field, type, and Enter to send. */
export async function signInByKeyboard(page: Page, fields: SignInFields): Promise<void> {
  await typeInto(page, page.getByLabel('Organisation code'), fields.code);
  await typeInto(page, page.getByLabel('Login'), fields.login);
  await typeInto(page, page.getByLabel(/^Password/), fields.password);
  if (fields.totp !== undefined) await typeInto(page, page.getByLabel('Authenticator code'), fields.totp);
  await page.keyboard.press('Enter');
}

/**
 * The first sign-in of a user the setup step or an Admin made: the temporary password, an authenticator app enrolled
 * from the key shown once, then the user's own password after a fresh code (access-and-approvals 3.2). Gives back the
 * journey's authenticator app for the user.
 */
export async function firstSignIn(
  page: Page,
  code: string,
  user: FirstSignInUser,
  newPassword: string,
  input: Input = 'pointer',
): Promise<Authenticator> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  const fields = { code, login: user.login, password: user.temporaryPassword };
  if (input === 'keyboard') await signInByKeyboard(page, fields);
  else await signIn(page, fields);

  await expect(page.getByRole('heading', { name: 'Set up your authenticator app' })).toBeVisible();
  const show = page.getByRole('button', { name: 'Show the setup key' });
  if (input === 'keyboard') {
    await tabTo(page, show);
    await page.keyboard.press('Enter');
  } else {
    await show.click();
  }
  const key = await page.getByTestId('enrolment-key').textContent();
  const app = new Authenticator(decodeBase32(key ?? ''));
  if (input === 'keyboard') {
    await typeInto(page, page.getByLabel('Authenticator code'), await app.nextCode());
    await page.keyboard.press('Enter');
  } else {
    await page.getByLabel('Authenticator code').fill(await app.nextCode());
    await page.getByRole('button', { name: 'Confirm the app' }).click();
  }

  await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();
  const first = page.getByLabel(/^New password(?! again)/);
  const again = page.getByLabel('New password again');
  const totp = page.getByLabel('Authenticator code');
  if (input === 'keyboard') {
    await typeInto(page, first, newPassword);
    await typeInto(page, again, newPassword);
    await typeInto(page, totp, await app.nextCode());
    await page.keyboard.press('Enter');
  } else {
    await first.fill(newPassword);
    await again.fill(newPassword);
    await totp.fill(await app.nextCode());
    await page.getByRole('button', { name: 'Change password' }).click();
  }
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible();
  return app;
}

/**
 * Today under the journeys' Organisation timezone, as a date field takes it. The server of the journeys gives every
 * Organisation the synthetic timezone Etc/UTC (apps/server/test/browser/serve.ts), so this is the UTC date.
 */
export function organisationToday(): string {
  return new Date().toISOString().slice(0, 10);
}
