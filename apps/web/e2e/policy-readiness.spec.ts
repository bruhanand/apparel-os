import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { organisationToday, signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F04-T01: the stage 1 exit check on screen (access-and-approvals 15 test 1; module-map 4.4; design-language 7,
// 10.17; DM-6; PRD-SEC-017, PRD-UXP-003; DEC-092, DEC-116). A test-only module's SYNTHETIC business-effect operation,
// governed by policy 14, shows the "Live action unavailable" banner naming the policy and what is missing, and links
// to Setup › Policy readiness, where the policy shows Open. The Admin records it as Signed with a SYNTHETIC file and
// switches its capability on; a person holding the validate permission who did not enter the values validates them;
// the operation is then available. Every value is SYNTHETIC.

const PDF = Buffer.from(
  '%PDF-1.4\n% SYNTHETIC signed policy 14\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
  'latin1',
);

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<void> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
}

test('PRD-SEC-017 a gated action names policy 14 until it is Signed and its values validated, then it is available', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const world = readWorld().policyReadiness;
  const adminContext = await browser.newContext();
  const validatorContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const validator = await validatorContext.newPage();
  try {
    const operation = admin.getByRole('listitem', { name: world.operation });

    await test.step('the Admin lands on Policy readiness, where the gated action shows the banner naming its policy', async () => {
      await signedIn(admin, world.organisationCode, world.admin);
      await expect(admin.getByRole('heading', { level: 1, name: 'Policy readiness' })).toBeVisible();
      await expect(operation.getByText('Live action unavailable')).toBeVisible();
      await expect(operation.getByText('Policy 14 · Opening and cutover is not signed.')).toBeVisible();
      await expect(
        operation.getByText(
          'Policy 14 · Opening and cutover: its real values are not validated by a person who did not enter them.',
        ),
      ).toBeVisible();
      await expect(operation.getByText(`The capability ${world.capability} is switched off.`)).toBeVisible();
    });

    const drawer = admin.getByRole('dialog');
    await test.step('the banner links to Policy readiness, where policy 14 shows Open', async () => {
      await operation.getByRole('link', { name: 'See Setup › Policy readiness' }).click();
      await expect(admin).toHaveURL(/\/setup\/policy-readiness\?policy=14$/);
      await expect(drawer.getByRole('heading', { level: 2, name: 'Policy 14 · Opening and cutover' })).toBeVisible();
      await expect(drawer.getByText('Open: not signed yet.')).toBeVisible();
    });

    await test.step('the Admin records it as Signed, with a SYNTHETIC file, and switches the capability on', async () => {
      await drawer.getByLabel('Signed by', { exact: true }).fill('SYNTHETIC signatory');
      await drawer.getByLabel('Signed on', { exact: true }).fill(organisationToday());
      await drawer.getByLabel('Origin', { exact: true }).selectOption('synthetic');
      await drawer.getByLabel('Evidence file', { exact: true }).setInputFiles({
        name: 'SYNTHETIC-policy-14-signed.pdf',
        mimeType: 'application/pdf',
        buffer: PDF,
      });
      await drawer.getByRole('button', { name: 'Record as Signed' }).click();
      await expect(drawer.getByTestId('drawer-header')).toContainText('Signed');
      await expect(
        drawer.getByRole('list', { name: 'Evidence' }).getByText('SYNTHETIC-policy-14-signed.pdf'),
      ).toBeVisible();
      await drawer.getByRole('button', { name: 'Switch on' }).click();
      await expect(drawer.getByText(`The capability ${world.capability} is on.`)).toBeVisible();
      await drawer.getByRole('button', { name: 'Close' }).click();
      await expect(operation.getByText('Policy 14 · Opening and cutover is not signed.')).toHaveCount(0);
      await expect(
        operation.getByText(
          'Policy 14 · Opening and cutover: its real values are not validated by a person who did not enter them.',
        ),
      ).toBeVisible();
    });

    await test.step('a person holding the validate permission who did not enter the values validates them', async () => {
      await signedIn(validator, world.organisationCode, world.validator);
      await validator.goto('/setup/policy-readiness?policy=14');
      const panel = validator.getByRole('dialog');
      await expect(panel.getByRole('heading', { level: 2, name: 'Policy 14 · Opening and cutover' })).toBeVisible();
      await panel.getByLabel('Origin', { exact: true }).selectOption('synthetic');
      await panel.getByLabel('Evidence file', { exact: true }).setInputFiles({
        name: 'SYNTHETIC-policy-14-validation.pdf',
        mimeType: 'application/pdf',
        buffer: PDF,
      });
      await panel.getByRole('button', { name: 'Record as validated' }).click();
      await expect(panel.getByText(world.validator.displayName)).toBeVisible();
    });

    await test.step('the gated action is then available, with nothing missing', async () => {
      await admin.getByRole('button', { name: 'Refresh' }).click();
      await expect(operation.getByText('Available: nothing is missing.')).toBeVisible();
      await expect(operation.getByText('Live action unavailable')).toHaveCount(0);
    });
  } finally {
    await adminContext.close();
    await validatorContext.close();
  }
});
