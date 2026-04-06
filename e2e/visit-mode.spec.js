const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

test('visite publique : accès sans compte puis retour connexion', async ({ page }) => {
  await page.goto('/');
  const guestCta = page.getByRole('button', { name: /Visiter sans connexion/i });
  await expect(guestCta).toBeVisible({ timeout: 30_000 });
  await guestCta.click();

  await expect(page.locator('.visit-view--guest-public')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Retour connexion/i })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
});

test('visite connectée : onglet Visite affiche la vue visite', async ({ page }) => {
  await loginAsNewStudent(page);

  const visitTab = page.getByRole('button', { name: /^🧭 Visite$/ });
  await expect(visitTab).toBeVisible({ timeout: 30_000 });
  await visitTab.click();

  await expect(page.locator('.visit-view')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.visit-view--guest-public')).toHaveCount(0);
});
