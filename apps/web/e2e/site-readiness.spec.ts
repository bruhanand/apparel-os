import { expect, test, type Page } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, type EnrolledUser } from './support/world';

// S1-F04-T02: stage 1 exit check 6 on screen (module-map 4.16; domain-model 3.6; ui-blueprint Setup › Site opening and
// closure › Readiness; PRD-LIF-001 to PRD-LIF-003, PRD-UXP-003; MM-8, DEC-105; DEC-116; product owner, 10 Oct 2026).
// An Operations user runs the Site's shared checks for receiving and asks for their approval; the unit's own checks
// fail on the stock plan and on its Site not being ready; a different authorised person makes the Site ready from My
// work; the Operations user declares that the unit holds no stock and runs the unit's checks again; every check passes
// and they ask for approval; the approver sees the zero declaration on the panel and approves receiving from My work;
// the unit's receiving is then granted and the unit and its Site show Active. Every value is SYNTHETIC.

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
    const receiving = ops.getByRole('region', { name: 'Receiving', exact: true });
    const siteReceiving = ops.getByRole('region', { name: 'Site readiness for Receiving', exact: true });
    const stockPlan = receiving.getByRole('listitem', { name: 'Stock plan' });
    const siteReadiness = receiving.getByRole('listitem', { name: 'Site readiness' });

    /** Opens the next request in My work and approves it, checking its title. */
    const approveFromMyWork = async (app: Authenticator, title: string, facts?: string) => {
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
      await expect(drawer.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
      if (facts !== undefined) await expect(drawer.getByText(facts)).toBeVisible();
      await drawer.getByLabel(/^Reason/).selectOption(world.reasonId);
      await drawer.getByLabel(/^Authenticator code/).fill(await app.nextCode());
      await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(drawer.getByTestId('drawer-header')).toContainText('Approved');
      await approver.keyboard.press('Escape');
    };

    await test.step("Operations runs the Site's shared checks for receiving and asks for their approval", async () => {
      await signedIn(ops, world.organisationCode, world.operations);
      await ops.getByRole('link', { name: 'Site opening and closure' }).click();
      await expect(ops.getByRole('heading', { level: 1, name: 'Site opening and closure' })).toBeVisible();
      await ops.getByLabel('Business unit').selectOption({ label: world.unitOption });
      await siteReceiving.getByRole('button', { name: 'Run the checks' }).click();
      await expect(
        siteReceiving.getByRole('listitem', { name: 'Required policies' }).getByText('Passed'),
      ).toBeVisible();
      await siteReceiving.getByRole('button', { name: 'Ask for approval' }).click();
      await expect(
        siteReceiving.getByText('Sent for approval. A different person decides it from My work.'),
      ).toBeVisible();
    });

    await test.step("the unit's checks fail on the stock plan and on its Site, each with its reason", async () => {
      await expect(receiving.getByText('The checks have not been run yet.')).toBeVisible();
      await receiving.getByRole('button', { name: 'Run the checks' }).click();
      await expect(stockPlan.getByText('Fails')).toBeVisible();
      await expect(
        stockPlan.getByText('An approved opening plan, or a declaration that the unit holds no stock.'),
      ).toBeVisible();
      await expect(siteReadiness.getByText('Fails')).toBeVisible();
      await expect(receiving.getByRole('listitem', { name: 'Mappings' }).getByText('Passed')).toBeVisible();
      await expect(receiving.getByRole('button', { name: 'Ask for approval' })).toHaveCount(0);
    });

    const app = await signedIn(approver, world.organisationCode, world.approver);
    await test.step('a different authorised person makes the Site ready for receiving from My work', async () => {
      await approveFromMyWork(app, 'Site readiness approval');
    });

    await test.step('they declare the unit holds no stock and run the checks again; every check passes', async () => {
      await ops.getByRole('button', { name: 'Refresh' }).click();
      await expect(siteReceiving.getByText('Ready: the Site’s shared checks are approved.')).toBeVisible();
      await ops.getByLabel('This unit genuinely holds no stock').check();
      await ops.getByRole('button', { name: 'Record the declaration' }).click();
      await expect(ops.getByText(`Declared to hold no stock by ${world.operations.displayName}`)).toBeVisible();
      await receiving.getByRole('button', { name: 'Run the checks' }).click();
      await expect(stockPlan.getByText('Passed')).toBeVisible();
      await expect(siteReadiness.getByText('Passed')).toBeVisible();
      await receiving.getByRole('button', { name: 'Ask for approval' }).click();
      await expect(receiving.getByText('Sent for approval. A different person decides it from My work.')).toBeVisible();
    });

    await test.step('the approver sees the zero declaration it relies on and approves receiving from My work', async () => {
      await approveFromMyWork(app, 'Activity approval', `Declared to hold no stock by ${world.operations.displayName}`);
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
