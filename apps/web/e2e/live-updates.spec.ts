import { randomUUID } from 'node:crypto';
import { expect, request, test } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld, WEB_ORIGIN } from './support/world';

// S1-F08-T04: live updates (code-house-rules 12.12; deployment.md section 5; access-and-approvals 11.1). An
// Operations user watches My work while another person raises a SYNTHETIC exception routed to them, through the API
// as a raising module would; it arrives in My work without reloading, and the Operations user opens it. Every value
// is SYNTHETIC.

test('code-house-rules 12.12 a new exception arrives in the owner’s My work without reloading, and opens', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const world = readWorld().live;
  const app = new Authenticator(Buffer.from(world.operations.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, {
    code: world.organisationCode,
    login: world.operations.login,
    password: world.operations.password,
    totp: await app.nextCode(),
  });
  await expect(page.getByLabel('Profile')).toHaveText(world.operations.displayName);
  await page
    .getByRole('link', { name: /^My work/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'My work' })).toBeVisible();
  await expect(page.getByText('Nothing waiting for you')).toBeVisible();

  const raised = await test.step('another person raises an exception routed to them', async () => {
    const raiser = await request.newContext({ baseURL: WEB_ORIGIN, extraHTTPHeaders: { origin: WEB_ORIGIN } });
    const code = await new Authenticator(Buffer.from(world.raiser.factorSecretHex, 'hex')).nextCode();
    const signedIn = await raiser.post('/api/access/sign-in', {
      data: {
        organisationCode: world.organisationCode,
        login: world.raiser.login,
        password: world.raiser.password,
        totpCode: code,
      },
    });
    expect(signedIn.status()).toBe(200);
    const answer = await raiser.post('/api/exceptions/exceptions', {
      headers: { 'idempotency-key': randomUUID() },
      data: {
        typeCode: world.typeCode,
        siteId: world.siteId,
        storeId: null,
        businessUnitId: null,
        brandId: null,
        links: [{ ...world.link, versionId: null }],
        exposure: { kind: 'unknown' },
        comment: null,
      },
    });
    expect(answer.status(), await answer.text()).toBe(200);
    const body = (await answer.json()) as { code: string };
    await raiser.dispose();
    return body.code;
  });

  await test.step('it arrives in My work without reloading, and opens', async () => {
    const reloads: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) reloads.push(frame.url());
    });
    await page.getByRole('button', { name: 'Open', exact: true }).click({ timeout: 30_000 });
    expect(reloads).toEqual([]);
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText(raised).first()).toBeVisible();
    await expect(drawer.getByText('Unresolved').first()).toBeVisible();
  });
});
