import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F04-T02: stage 1 exit check 6 on screen (module-map 4.16; domain-model 3.6; ui-blueprint Setup › Site opening and
// closure › Readiness; PRD-LIF-001 to PRD-LIF-003, PRD-UXP-003; MM-8, DEC-105; DEC-116). An Operations user runs the
// checks for a SYNTHETIC unit, sees the stock-plan check fail and why, declares that the unit holds no stock and runs
// them again; every check passes and they ask for approval; a different authorised person approves receiving from My
// work; the unit's receiving is then granted and the unit and its Site show Active. Every value is SYNTHETIC.

async function signedIn(page: Page, code: string, user: EnrolledUser): Promise<Authenticator> {
  const app = new Authenticator(Buffer.from(user.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, { code, login: user.login, password: user.password, totp: await app.nextCode() });
  await expect(page.getByLabel('Profile')).toHaveText(user.displayName);
  return app;
}

test('PRD-LIF-001 receiving stays unavailable until the checks pass and a different person approves it from My work', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const world = readWorld().readiness;
  const opsContext = await browser.newContext();
  const approverContext = await browser.newContext();
  const ops = await opsContext.newPage();
  const approver = await approverContext.newPage();
  try {
    const receiving = ops.getByRole('region', { name: 'Receiving' });
    const stockPlan = receiving.getByRole('listitem', { name: 'Stock plan' });

    await test.step('Operations runs the checks for the unit and sees the stock plan fail, with its reason', async () => {
      await signedIn(ops, world.organisationCode, world.operations);
      await ops.getByRole('link', { name: 'Site opening and closure' }).click();
      await expect(ops.getByRole('heading', { level: 1, name: 'Site opening and closure' })).toBeVisible();
      await ops.getByLabel('Business unit').selectOption({ label: world.unitOption });
      await expect(receiving.getByText('The checks have not been run yet.')).toBeVisible();
      await receiving.getByRole('button', { name: 'Run the checks' }).click();
      await expect(stockPlan.getByText('Fails')).toBeVisible();
      await expect(
        stockPlan.getByText('An approved opening plan, or a declaration that the unit holds no stock.'),
      ).toBeVisible();
      await expect(receiving.getByRole('listitem', { name: 'Mappings' }).getByText('Passed')).toBeVisible();
      await expect(receiving.getByRole('button', { name: 'Ask for approval' })).toHaveCount(0);
    });

    await test.step('they declare the unit holds no stock and run the checks again; every check passes', async () => {
      await ops.getByLabel('This unit genuinely holds no stock').check();
      await ops.getByRole('button', { name: 'Record the declaration' }).click();
      await expect(ops.getByText(`Declared to hold no stock by ${world.operations.displayName}`)).toBeVisible();
      await receiving.getByRole('button', { name: 'Run the checks' }).click();
      await expect(stockPlan.getByText('Passed')).toBeVisible();
      await receiving.getByRole('button', { name: 'Ask for approval' }).click();
      await expect(receiving.getByText('Sent for approval. A different person decides it from My work.')).toBeVisible();
    });

    await test.step('a different authorised person approves receiving from My work', async () => {
      const app = await signedIn(approver, world.organisationCode, world.approver);
      await approver
        .getByRole('link', { name: /^My work/ })
        .first()
        .click();
      // The worker publishes the request to My work (module-map 4.8); Refresh reads it again until it is there.
      await expect(async () => {
        await approver.getByRole('button', { name: 'Refresh' }).click();
        await expect(approver.getByRole('button', { name: 'Open and decide' })).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 30_000 });
      await approver.getByRole('button', { name: 'Open and decide' }).click();
      const drawer = approver.getByRole('dialog');
      await expect(drawer.getByRole('heading', { level: 2, name: 'Activity approval', exact: true })).toBeVisible();
      await drawer.getByLabel(/^Reason/).selectOption(world.reasonId);
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByTestId('drawer-header')).toContainText('Approved');
    });

    await test.step("the unit's receiving is then granted, and the unit and its Site show Active", async () => {
      await ops.getByRole('button', { name: 'Refresh' }).click();
      await expect(receiving.getByText('Granted for this unit: the activity is Active here.')).toBeVisible();
      await expect(ops.getByText('Site: Active')).toBeVisible();
      await expect(receiving.getByRole('button', { name: 'Run the checks' })).toHaveCount(0);
    });
  } finally {
    await opsContext.close();
    await approverContext.close();
  }
});
