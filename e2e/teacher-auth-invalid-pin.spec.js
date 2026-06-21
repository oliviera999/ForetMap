const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

test('mode prof: code PIN invalide affiche une erreur', async ({ page }) => {
  await loginAsNewStudent(page);

  await page.getByRole('button', { name: 'Activer les droits étendus' }).click();
  await page.locator('.pin-card .pin-input').fill('9999');
  const elevateDone = page.waitForResponse(
    (r) => r.url().includes('/api/auth/elevate') && r.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await page.locator('.pin-card').getByRole('button', { name: 'Entrer', exact: true }).click();
  const elevateResp = await elevateDone;
  expect(elevateResp.status()).toBe(401);

  await expect(page.locator('.pin-error')).toContainText(
    /PIN incorrect|Code incorrect|Élévation PIN désactivée/i,
    { timeout: 15_000 },
  );
});
