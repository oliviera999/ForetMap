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

test('visite connectée : scène carte, image chargée et contrôles zoom', async ({ page }) => {
  await loginAsNewStudent(page);

  await page.getByRole('button', { name: /^🧭 Visite$/ }).click();
  await expect(page.locator('.visit-view')).toBeVisible({ timeout: 30_000 });

  const stage = page.locator('.visit-map-stage');
  await expect(stage).toBeVisible({ timeout: 30_000 });
  const box = await stage.boundingBox();
  expect(box && box.width > 20 && box.height > 20).toBeTruthy();

  const mapImg = stage.locator('img.visit-map-img');
  await expect(mapImg).toBeVisible({ timeout: 15_000 });
  await expect(mapImg).toHaveAttribute('src', /./);

  const controls = stage.locator('.visit-map-controls');
  await expect(controls.getByRole('button', { name: 'Zoomer la carte de visite', exact: true })).toBeVisible();
  await expect(controls.getByRole('button', { name: 'Dézoomer la carte de visite', exact: true })).toBeVisible();
  await expect(controls.getByRole('button', { name: 'Recentrer la carte de visite', exact: true })).toBeVisible();
});

test('visite connectée : mascotte visible si au moins une zone ou un repère sur le plan', async ({ page }) => {
  await loginAsNewStudent(page);

  await page.getByRole('button', { name: /^🧭 Visite$/ }).click();
  await expect(page.locator('.visit-view')).toBeVisible({ timeout: 30_000 });

  const stage = page.locator('.visit-map-stage');
  await expect(stage).toBeVisible({ timeout: 30_000 });
  await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 15_000 });

  const zoneCount = await stage.locator('.visit-zone-hit').count();
  const markerCount = await stage.locator('.visit-marker-btn').count();
  if (zoneCount + markerCount > 0) {
    await expect(stage.locator('.visit-map-mascot')).toBeVisible({ timeout: 15_000 });
  }
});
