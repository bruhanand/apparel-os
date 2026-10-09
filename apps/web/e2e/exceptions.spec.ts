import { expect, test } from '@playwright/test';
import { Authenticator } from './support/authenticator';
import { signIn } from './support/journey';
import { readWorld } from './support/world';

// S1-F08-T02: an exception in My work (access-and-approvals 12, 14, 15 test 21; PRD-EXC-001, PRD-EXC-002,
// PRD-UXP-003, POL-03.05). An Operations user who owns a SYNTHETIC exception opens it from My work, comments on it, and
// is refused closing it, with the reason on screen, because the test-only module's resolution check does not yet
// verify the outcome. The record also offers resolve, reassign and raise, each naming what it still needs (S1-F08
// review). Its arrival without reloading is S1-F08-T04's journey. Every value is SYNTHETIC.

test('PRD-EXC-002 POL-03.05 the owner opens an exception from My work, comments, and is refused closing it', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const world = readWorld().exceptions;
  const app = new Authenticator(Buffer.from(world.operations.factorSecretHex, 'hex'));
  await page.goto('/');
  await signIn(page, {
    code: world.organisationCode,
    login: world.operations.login,
    password: world.operations.password,
    totp: await app.nextCode(),
  });
  await expect(page.getByLabel('Profile')).toHaveText(world.operations.displayName);

  await test.step('My work lists the exception, and opening it shows its record', async () => {
    await page
      .getByRole('link', { name: /^My work/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'My work' })).toBeVisible();
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText(world.code).first()).toBeVisible();
    await expect(drawer.getByText('Unresolved').first()).toBeVisible();
  });

  await test.step('the owner comments on it', async () => {
    const drawer = page.getByRole('dialog');
    await drawer.getByLabel(/^Comment/).fill('SYNTHETIC checked the document');
    await drawer.getByRole('button', { name: 'Add comment' }).click();
    await expect(drawer.getByText('Comment added.')).toBeVisible();
    await drawer.getByRole('tab', { name: 'History' }).click();
    await expect(drawer.getByText('SYNTHETIC checked the document')).toBeVisible();
    await drawer.getByRole('tab', { name: 'Details' }).click();
  });

  await test.step('closing is refused until the resolution check passes, and the reason is on screen', async () => {
    const drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: 'Close exception' }).click();
    const refusal = drawer.getByRole('alert');
    await expect(
      refusal.getByText('This exception cannot be closed yet: the outcome it is about has not been put right.'),
    ).toBeVisible();
    await expect(refusal.getByText('The SYNTHETIC test document is not marked resolved yet.')).toBeVisible();
    await expect(drawer.getByText('Unresolved').first()).toBeVisible();
  });

  await test.step('the record offers resolve, reassign and raise, each naming what it still needs', async () => {
    const drawer = page.getByRole('dialog');
    // Resolved is recorded by the module that owns the problem, never on this record (access-and-approvals 12.3).
    await expect(drawer.getByRole('button', { name: 'Resolve' })).toBeDisabled();
    await expect(drawer.getByText(/^It is resolved when .+ records the correction/)).toBeVisible();
    // The Operations user may not list people, so reassigning to a person names that permission (PRD-UXP-003).
    await drawer.getByLabel('Assign to').selectOption({ label: 'A person' });
    await expect(drawer.getByText('Needs View on User')).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Reassign' })).toBeDisabled();
    // Raising needs create on exceptions, which this user does not hold.
    await expect(drawer.getByRole('button', { name: 'Raise it again' })).toBeDisabled();
    await expect(drawer.getByText('Needs Create on Exception')).toBeVisible();
  });
});
