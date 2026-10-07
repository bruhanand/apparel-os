import { expect, test, type Request } from '@playwright/test';
import { Authenticator, decodeBase32 } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, WEB_ORIGIN } from './support/world';

// S1-F01-T23: a synthetic user with no role assignment walks the first sign-in and lands on "No access assigned"
// (DEC-118; RR-260; PRD-ACS-002); on the way, the enrolment screen draws the setup link as a QR code in the page
// (RR-280; PRD-SEC-001), and every request, the fonts included (RR-262), goes to the app's own origin only
// (code-house-rules 12.1). Every value is SYNTHETIC.

/** SYNTHETIC: the password the journey's user chooses. */
const NEW_PASSWORD = 'SYNTHETIC-no-access-password-1';

test('PRD-ACS-002 a synthetic user with no role assignment enrols with a QR code, sees "No access assigned" and signs out, and the page calls no other origin', async ({
  page,
}) => {
  const world = readWorld();
  const requests: Request[] = [];
  page.on('request', (request) => requests.push(request));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await signIn(page, {
    code: world.organisationCode,
    login: world.noAccess.login,
    password: world.noAccess.temporaryPassword,
  });

  let app: Authenticator | undefined;
  await test.step('RR-280: the setup key shown once, with a QR code of the setup link beside it', async () => {
    await expect(page.getByRole('heading', { name: 'Set up your authenticator app' })).toBeVisible();
    await page.getByRole('button', { name: 'Show the setup key' }).click();
    const qr = page.getByRole('img', { name: /QR code of the setup link.*type the setup key instead/ });
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute('data-testid', 'enrolment-qr');
    // Drawn as inline SVG in the page: modules, no image fetched from anywhere.
    expect(await qr.locator('path').count()).toBeGreaterThan(0);
    expect(await qr.locator('image').count()).toBe(0);
    const key = await page.getByTestId('enrolment-key').textContent();
    expect(key).toMatch(/^([A-Z2-7]{4} )+[A-Z2-7]{1,4}$/);
    app = new Authenticator(decodeBase32(key ?? ''));
    await page.getByLabel('Authenticator code').fill(await app.nextCode());
    await page.getByRole('button', { name: 'Confirm the app' }).click();
  });
  if (app === undefined) throw new Error('No authenticator was enrolled');
  const enrolled = app;

  await test.step('access-and-approvals 3.2: the user chooses their own password', async () => {
    await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();
    await page.getByLabel(/^New password(?! again)/).fill(NEW_PASSWORD);
    await page.getByLabel('New password again').fill(NEW_PASSWORD);
    await page.getByLabel('Authenticator code').fill(await enrolled.nextCode());
    await page.getByRole('button', { name: 'Change password' }).click();
  });

  await test.step('DEC-118: with no role assignment in force, only "No access assigned" and Sign out', async () => {
    await expect(page.getByRole('heading', { name: 'No access assigned' })).toBeVisible();
    await expect(page.getByText('An Admin must assign you a role')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main menu' })).toHaveCount(0);
    // Any address shows the same page: no screen opens without a role assignment.
    await page.goto('/setup/users');
    await expect(page.getByRole('heading', { name: 'No access assigned' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main menu' })).toHaveCount(0);
  });

  await test.step('RR-262: the three font families load from the app’s own origin', async () => {
    // Devanagari text is what fetches Noto Sans Devanagari (its unicode-range); no screen has Hindi yet (stage 5).
    await page.evaluate(async () => {
      await document.fonts.load("16px 'Noto Sans Devanagari'", 'हिन्दी');
      await document.fonts.ready;
    });
    // Source Code Pro was fetched on the enrolment screen, for the setup key in mono.
    const fonts = await Promise.all(
      requests
        .filter((request) => new URL(request.url()).pathname.endsWith('.woff2'))
        .map(async (request) => ({ url: new URL(request.url()), ok: (await request.response())?.ok() ?? false })),
    );
    for (const family of ['source-sans-3', 'source-code-pro', 'noto-sans-devanagari']) {
      expect(
        fonts.some(
          (font) => font.ok && font.url.origin === WEB_ORIGIN && font.url.pathname.startsWith(`/fonts/${family}/`),
        ),
        family,
      ).toBe(true);
    }
    // The licence travels with the fonts: each family's licence file is served beside its font files.
    for (const licence of ['source-sans-3/LICENSE.md', 'source-code-pro/LICENSE.md', 'noto-sans-devanagari/OFL.txt']) {
      const response = await page.request.get(`/fonts/${licence}`);
      expect(response.ok(), licence).toBe(true);
      expect(await response.text(), licence).toContain('SIL Open Font License, Version 1.1');
    }
  });

  await test.step('code-house-rules 12.1: no request went to another origin, not even for the QR code', () => {
    const elsewhere = requests
      .map((request) => request.url())
      .filter((url) => !url.startsWith('data:') && new URL(url).origin !== WEB_ORIGIN);
    expect(elsewhere).toEqual([]);
  });

  await test.step('access-and-approvals 3.3: Sign out returns to the sign-in screen', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});
