import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld } from './support/world';
import type { EnrolledUser } from './support/world';

// S1-F08-T03: evidence files on an exception and on an approval decision (access-and-approvals 9.5, 12.3;
// imports-and-opening-data 11, 13.1; design-language 10.14, 10.15; PRD-EXC-001, PRD-ACS-010, PRD-SEC-005, POL-02.23,
// POL-03.05). An Operations user adds a SYNTHETIC photograph to the exception they own, from My work; an approver
// decides an exception rule change with a SYNTHETIC PDF as evidence; each file then opens from its record through the
// app, the very bytes handed in. Every value is SYNTHETIC.

const PHOTO = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('SYNTHETIC photograph of a damaged carton', 'latin1'),
]);
const PDF = Buffer.from(
  '%PDF-1.4\n% SYNTHETIC signed routing sheet\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
  'latin1',
);

async function signedIn(page: Page, organisationCode: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, {
    code: organisationCode,
    login: user.login,
    password: user.password,
    totp: await app.nextCode(),
  });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  await page
    .getByRole('link', { name: /^My work/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'My work' })).toBeVisible();
  return app;
}

/** Opens a file from its record and checks that what the browser saves is the file handed in. */
async function opensAs(page: Page, list: Locator, name: string, bytes: Buffer): Promise<void> {
  const saving = page.waitForEvent('download');
  await list.getByRole('link', { name: `Open ${name}` }).click();
  const download = await saving;
  expect(download.suggestedFilename()).toBe(name);
  const saved = await readFile(await download.path());
  expect(saved.equals(bytes)).toBe(true);
}

test('POL-03.05 PRD-SEC-005 the owner adds a photograph to an exception, and it opens from its record', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const world = readWorld().evidence;
  await signedIn(page, world.organisationCode, world.operations);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText(world.code).first()).toBeVisible();

  await test.step('the Evidence tab picks a file, which is stored and then added', async () => {
    await drawer.getByRole('tab', { name: 'Evidence 0' }).click();
    await expect(drawer.getByText('No evidence files yet.')).toBeVisible();
    await drawer.getByLabel(/^Evidence file/).setInputFiles({
      name: 'SYNTHETIC-damaged-carton.jpg',
      mimeType: 'image/jpeg',
      buffer: PHOTO,
    });
    await drawer.getByRole('button', { name: 'Add evidence' }).click();
    await expect(drawer.getByText('Evidence added.')).toBeVisible();
    await expect(drawer.getByRole('tab', { name: 'Evidence 1' })).toBeVisible();
  });

  await test.step('it is listed with its name, type and size, and opens through the app', async () => {
    const list = drawer.getByRole('list', { name: 'Evidence' });
    await expect(list.getByText('SYNTHETIC-damaged-carton.jpg')).toBeVisible();
    await expect(list.getByText(`JPEG photograph · ${String(PHOTO.length)} bytes`)).toBeVisible();
    await opensAs(page, list, 'SYNTHETIC-damaged-carton.jpg', PHOTO);
  });

  await test.step('its history records the evidence', async () => {
    await drawer.getByRole('tab', { name: 'History' }).click();
    await expect(drawer.getByText('Evidence added')).toBeVisible();
  });
});

test('PRD-ACS-010 POL-02.23 the approver attaches a PDF to a decision, and it opens from the decision', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const world = readWorld().evidence;
  const app = await signedIn(page, world.organisationCode, world.approver);
  // The worker publishes the request to My work (module-map 4.8); Refresh reads it again until it is there.
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByRole('button', { name: 'Open and decide' })).toHaveCount(1, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Open and decide' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('heading', { level: 2, name: 'Exception rule change', exact: true })).toBeVisible();

  await test.step('the decision is given with a reason, the evidence file and a fresh code', async () => {
    await drawer.getByLabel(/^Reason/).selectOption(world.reasonId);
    await drawer.getByLabel(/^Evidence file/).setInputFiles({
      name: 'SYNTHETIC-routing-sheet.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    });
    await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
    await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(drawer.getByTestId('drawer-header')).toContainText('Approved');
  });

  await test.step('the decision lists the file, which opens through the app', async () => {
    const list = drawer.getByRole('list', { name: 'Evidence' });
    await expect(list.getByText('SYNTHETIC-routing-sheet.pdf')).toBeVisible();
    await expect(list.getByText(`PDF · ${String(PDF.length)} bytes`)).toBeVisible();
    await opensAs(page, list, 'SYNTHETIC-routing-sheet.pdf', PDF);
  });
});
