import { expect, test } from '@playwright/test';
import { readWorld } from './support/world';

// S1-F01-T28: the test sign-in of the development environments (access-and-approvals 3.4; deployment.md section 3;
// POL-02.17, PRD-ACS-017; DEC-121). The journeys' server runs as `local` with one SYNTHETIC person listed, so the
// sign-in screen shows one button below the form, and one press signs that person in with no password and no code.

test('POL-02.17 a listed synthetic person signs in with one press of the test sign-in button below the form', async ({
  page,
}) => {
  const world = readWorld();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  const demo = page.getByRole('region', { name: 'Test sign-in (dev only)' });
  await expect(demo).toBeVisible();
  // Below the form's own Sign in button.
  const submit = await page.getByRole('button', { name: 'Sign in', exact: true }).boundingBox();
  const box = await demo.boundingBox();
  expect(submit !== null && box !== null && box.y > submit.y).toBe(true);

  await demo.getByRole('button', { name: world.demo.label }).click();
  await expect(page.getByText(world.demo.displayName)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0);
});
