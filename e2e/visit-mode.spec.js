const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, enableTeacherMode } = require('./fixtures/auth.fixture');

test('visite publique : choix mascotte obligatoire au premier lancement puis mémorisé', async ({ page }) => {
  await page.goto('/');
  const guestCta = page.getByRole('button', { name: /Visiter sans compte/i });
  await expect(guestCta).toBeVisible({ timeout: 30_000 });
  await guestCta.click();

  const onboarding = page.locator('.visit-mascot-onboarding');
  await expect(onboarding).toBeVisible({ timeout: 30_000 });
  await expect(onboarding.getByRole('heading', { name: /Choisis ta mascotte guide/i })).toBeVisible();
  await onboarding.locator('.visit-mascot-onboarding__option').first().click();
  await onboarding.getByRole('button', { name: /Commencer la visite/i }).click();
  await expect(onboarding).toHaveCount(0);

  await expect(page.locator('.visit-view--guest-public')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Retour connexion/i })).toBeVisible();
  await page.getByRole('button', { name: /Retour connexion/i }).click();
  await expect(guestCta).toBeVisible({ timeout: 30_000 });

  await guestCta.click();
  await expect(page.locator('.visit-view--guest-public')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.visit-mascot-onboarding')).toHaveCount(0);
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
    await expect(stage.locator('.visit-map-mascot')).toBeAttached({ timeout: 15_000 });
    await expect(stage.locator('.visit-map-mascot-inner')).toBeVisible({ timeout: 15_000 });
  }
});

test('visite connectée : bouton Présentation du lieu (animation si parcours carte à 0)', async ({ page }) => {
  await loginAsNewStudent(page);
  await page.getByRole('button', { name: /^🧭 Visite$/ }).click();
  await expect(page.locator('.visit-view')).toBeVisible({ timeout: 30_000 });
  const pres = page.getByTestId('visit-presentation-link');
  if ((await pres.count()) === 0) {
    test.skip();
    return;
  }
  await expect(pres).toBeVisible();
  await expect(pres).toHaveText(/Présentation du lieu/i);
  const stage = page.locator('.visit-map-stage');
  await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 15_000 });
  const navigable = (await stage.locator('.visit-zone-hit, .visit-marker-btn').count()) > 0;
  if (navigable) {
    await expect(pres).toHaveAttribute('data-invite-pulse', '1');
  }
});

test('visite connectée : clic sur une zone ouvre le panneau détail', async ({ page }) => {
  await loginAsNewStudent(page);
  await page.getByRole('button', { name: /^🧭 Visite$/ }).click();
  await expect(page.locator('.visit-view')).toBeVisible({ timeout: 30_000 });

  const stage = page.locator('.visit-map-stage');
  await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 15_000 });
  const zoneHit = stage.locator('.visit-zone-hit').first();
  if ((await zoneHit.count()) === 0) {
    test.skip();
    return;
  }
  const poly = zoneHit.locator('polygon').first();
  if (await poly.count()) {
    await poly.click({ force: true, timeout: 10_000 });
  } else {
    await zoneHit.click({ force: true, timeout: 10_000 });
  }
  const panel = page.getByTestId('visit-detail-panel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel).toHaveAttribute('role', 'dialog');
  await panel.getByRole('button', { name: 'Fermer' }).click();
  await expect(panel).toHaveCount(0);
});

test('visite prof : aperçu comme élève masque le panneau d’édition', async ({ page }) => {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);
  await page.getByRole('button', { name: /^🧭 Visite$/ }).click();
  await expect(page.locator('.visit-view')).toBeVisible({ timeout: 30_000 });

  const stage = page.locator('.visit-map-stage');
  await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 15_000 });
  const zoneHit = stage.locator('.visit-zone-hit').first();
  if ((await zoneHit.count()) === 0) {
    test.skip();
    return;
  }
  const poly = zoneHit.locator('polygon').first();
  if (await poly.count()) {
    await poly.click({ force: true, timeout: 10_000 });
  } else {
    await zoneHit.click({ force: true, timeout: 10_000 });
  }
  await expect(page.getByTestId('visit-detail-panel')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('visit-editor-panel')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Mise en page éditoriale')).toBeVisible({ timeout: 10_000 });

  await page.getByTestId('visit-teacher-preview-toggle').evaluate((el) => el.click());
  await expect(page.getByTestId('visit-editor-panel')).toHaveCount(0);

  await page.getByTestId('visit-teacher-preview-toggle').evaluate((el) => el.click());
  await expect(page.getByTestId('visit-editor-panel')).toBeVisible({ timeout: 10_000 });
});

test('visite publique : marquage vu hors ligne puis synchronisation', async ({ page, context }) => {
  await page.goto('/');
  const guestCta = page.getByRole('button', { name: /Visiter sans compte/i });
  await expect(guestCta).toBeVisible({ timeout: 30_000 });
  await guestCta.click();

  await expect(page.locator('.visit-view--guest-public')).toBeVisible({ timeout: 30_000 });
  const stage = page.locator('.visit-map-stage');
  await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 15_000 });

  const zoneHit = stage.locator('.visit-zone-hit').first();
  if ((await zoneHit.count()) === 0) {
    test.skip();
    return;
  }
  const poly = zoneHit.locator('polygon').first();
  if (await poly.count()) {
    await poly.click({ force: true, timeout: 10_000 });
  } else {
    await zoneHit.click({ force: true, timeout: 10_000 });
  }
  const panel = page.getByTestId('visit-detail-panel');
  await expect(panel).toBeVisible({ timeout: 10_000 });

  await context.setOffline(true);
  const status = page.getByTestId('visit-network-status');
  await expect(status).toHaveAttribute('data-online', '0', { timeout: 10_000 });

  const markBtn = panel.getByRole('button', { name: /Marquer comme vu/i });
  if ((await markBtn.count()) === 0) {
    test.skip();
    return;
  }
  await markBtn.click();
  await expect(status).toHaveAttribute('data-pending', /[1-9]/, { timeout: 10_000 });

  await context.setOffline(false);
  await expect(status).toHaveAttribute('data-online', '1', { timeout: 15_000 });
  await expect(status).toHaveAttribute('data-pending', '0', { timeout: 25_000 });
});
