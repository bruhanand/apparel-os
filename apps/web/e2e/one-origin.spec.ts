import { expect, test } from '@playwright/test';
import { watchSecurityPolicy } from './support/security-policy';
import { WEB_ORIGIN } from './support/world';

// S1-F01-T27: the server serves the built web app and the API from one origin (deployment.md section 3;
// code-house-rules 12.1). The pages load under the one-origin security policy with no violation, a link to a screen
// opens the web app, and /api stays the API.

test('deployment.md section 3: the web app and the API from one origin, under the one-origin security policy', async ({
  page,
}) => {
  const violations = watchSecurityPolicy(page);

  await test.step('/ answers the web app, never kept by a cache, with the security policy', async () => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    expect(response?.headers()['cache-control']).toBe('no-store');
    expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  await test.step('a link to a screen opens the web app, which asks for sign-in', async () => {
    const response = await page.goto('/setup/users');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  await test.step('an unknown /api path answers the not-found envelope, never the web app', async () => {
    const response = await page.request.get(`${WEB_ORIGIN}/api/unknown`);
    expect(response.status()).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('kernel.not-found');
  });

  expect(violations()).toEqual([]);
});
