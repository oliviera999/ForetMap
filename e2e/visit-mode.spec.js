const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, enableTeacherMode, openVisitTab } = require('./fixtures/auth.fixture');

const {
  MAP_VIEW_MASCOT_MOVE_MS: VISIT_MAP_MASCOT_MOVE_MS,
} = require('./fixtures/mascot-motion.fixture');

/** Clic fiable sur la première zone visite (polygon ou hitbox). */
async function clickFirstVisitZone(stage) {
  const zoneHit = stage.locator('.fm-pct-zone').first();
  const poly = zoneHit.locator('polygon').first();
  if (await poly.count()) {
    const box = await poly.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      await poly.click({
        position: { x: box.width / 2, y: box.height / 2 },
        force: true,
        timeout: 10_000,
      });
      return;
    }
  }
  await zoneHit.click({ force: true, timeout: 10_000 });
}

test('visite publique : accueil → carte en un clic, sans fenêtre de mascotte (U3, U4)', async ({
  page,
}) => {
  await page.goto('/');
  const guestCta = page.getByRole('button', { name: /Découvrir le lieu/i });
  await expect(guestCta).toBeVisible({ timeout: 30_000 });
  // Visible sans défilement : la porte « Découvrir le lieu » est dans la fenêtre.
  await expect(guestCta).toBeInViewport();
  await guestCta.click();

  await expect(page.locator('.visit-view--guest-public')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('dialog', { name: /Choix de la mascotte/i })).toHaveCount(0);
  await expect(page.locator('.visit-map-stage img.visit-map-img')).toBeVisible({
    timeout: 15_000,
  });
  // Le choix du guide reste accessible depuis la barre.
  await expect(page.getByTestId('visit-mascot-picker')).toBeVisible();

  const quit = page.getByRole('button', { name: /Quitter la visite/i });
  await expect(quit).toBeVisible();
  await quit.click();
  await expect(guestCta).toBeVisible({ timeout: 30_000 });
});

test('visite connectée : onglet Visite affiche la vue visite', async ({ page }) => {
  await loginAsNewStudent(page);

  const visitTab = page.getByRole('button', { name: 'Visite', exact: true });
  await expect(visitTab).toBeVisible({ timeout: 30_000 });
  await visitTab.click();

  await expect(page.locator('.visit-view')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.visit-view--guest-public')).toHaveCount(0);
});

test('visite connectée : plein écran carte puis Échap pour quitter', async ({ page }) => {
  await loginAsNewStudent(page);

  await openVisitTab(page);
  await expect(page.locator('.visit-view')).toBeVisible({ timeout: 30_000 });

  const stage = page.locator('.visit-map-stage');
  await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('visit-map-fullscreen-open').click();
  await expect(page.getByTestId('fm-map-fullscreen-layer')).toBeVisible();
  await expect(page.getByTestId('visit-map-fullscreen-open')).toHaveCount(0);
  await expect(stage).toHaveClass(/visit-map-stage--fullscreen/);
  const fullscreenImg = page.getByTestId('fm-map-fullscreen-layer').locator('img.visit-map-img');
  await expect(fullscreenImg).toBeVisible();
  const imgBox = await fullscreenImg.boundingBox();
  expect(imgBox && imgBox.width > 80 && imgBox.height > 80).toBeTruthy();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('fm-map-fullscreen-layer')).toHaveCount(0);
  await expect(page.getByTestId('visit-map-fullscreen-open')).toBeVisible();
});

test('visite connectée : scène carte, image chargée et contrôles zoom', async ({ page }) => {
  await loginAsNewStudent(page);

  await openVisitTab(page);
  await expect(page.locator('.visit-view')).toBeVisible({ timeout: 30_000 });

  const stage = page.locator('.visit-map-stage');
  await expect(stage).toBeVisible({ timeout: 30_000 });
  const box = await stage.boundingBox();
  expect(box && box.width > 20 && box.height > 20).toBeTruthy();

  const mapImg = stage.locator('img.visit-map-img');
  await expect(mapImg).toBeVisible({ timeout: 15_000 });
  await expect(mapImg).toHaveAttribute('src', /./);

  // Depuis l'unification sur `SharedMapStage` (14 sept. 2026), la visite n'a plus ses propres
  // contrôles (`VisitMapZoomControls`, devenu code mort) : elle emprunte ceux de la pile
  // partagée, dans `.fm-pct-map-controls` et repérés par `data-testid` préfixés `visit-`.
  const controls = stage.locator('.fm-pct-map-controls');
  await expect(controls.getByTestId('visit-zoom-in')).toBeVisible();
  await expect(controls.getByTestId('visit-zoom-out')).toBeVisible();
  await expect(controls.getByTestId('visit-zoom-reset')).toBeVisible();
});

test('visite connectée : mascotte visible si au moins une zone ou un repère sur le plan', async ({
  page,
}) => {
  await loginAsNewStudent(page);

  await openVisitTab(page);
  await expect(page.locator('.visit-view')).toBeVisible({ timeout: 30_000 });

  const stage = page.locator('.visit-map-stage');
  await expect(stage).toBeVisible({ timeout: 30_000 });
  await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 15_000 });

  const zoneCount = await stage.locator('.fm-pct-zone').count();
  const markerCount = await stage.locator('.fm-pct-marker').count();
  if (zoneCount + markerCount > 0) {
    await expect(stage.locator('.visit-map-mascot')).toBeAttached({ timeout: 15_000 });
    await expect(stage.locator('.visit-map-mascot-inner')).toBeVisible({ timeout: 15_000 });
  }
});

test('visite connectée : bouton Présentation du lieu, sans animation d’invite', async ({
  page,
}) => {
  await loginAsNewStudent(page);
  await openVisitTab(page);
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
  // L'invite pulsée se déclenchait à « aucun lieu vu », c'est-à-dire exactement quand tous
  // les lieux clignotent déjà en rouge : deux sollicitations en boucle pour le même message.
  // Elle est retirée (audit §5.6) — le bouton reste le seul bouton plein du bandeau.
  await expect(pres).not.toHaveAttribute('data-invite-pulse');
  await expect(pres).not.toHaveClass(/visit-map-card__presentation-btn--invite/);
});

test('visite connectée : clic sur une zone ouvre le panneau détail', async ({ page }) => {
  await loginAsNewStudent(page);
  await openVisitTab(page);
  await expect(page.locator('.visit-view')).toBeVisible({ timeout: 30_000 });

  const stage = page.locator('.visit-map-stage');
  await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 15_000 });
  const zoneHit = stage.locator('.fm-pct-zone').first();
  if ((await zoneHit.count()) === 0) {
    test.skip();
    return;
  }
  await clickFirstVisitZone(stage);
  const panel = page.getByTestId('visit-detail-panel');
  await expect(panel).toBeVisible({ timeout: VISIT_MAP_MASCOT_MOVE_MS + 15_000 });
  await expect(panel).toHaveAttribute('role', 'dialog');
  await panel.getByRole('button', { name: 'Fermer' }).click();
  await expect(panel).toHaveCount(0);
});

test('visite prof : aperçu comme élève masque le panneau d’édition', async ({ page }) => {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);
  await openVisitTab(page);
  await expect(page.locator('.visit-view')).toBeVisible({ timeout: 30_000 });

  const stage = page.locator('.visit-map-stage');
  await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 15_000 });
  const zoneHit = stage.locator('.fm-pct-zone').first();
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
  const guestCta = page.getByRole('button', { name: /Découvrir le lieu/i });
  await expect(guestCta).toBeVisible({ timeout: 30_000 });
  await guestCta.click();

  await expect(page.locator('.visit-view--guest-public')).toBeVisible({ timeout: 30_000 });
  const stage = page.locator('.visit-map-stage');
  await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 15_000 });

  const markerBtn = stage.locator('.fm-pct-marker').first();
  const zoneHit = stage.locator('.fm-pct-zone').first();
  if ((await markerBtn.count()) === 0 && (await zoneHit.count()) === 0) {
    test.skip();
    return;
  }
  if ((await markerBtn.count()) > 0) {
    await markerBtn.click({ force: true, timeout: 10_000 });
  } else {
    await clickFirstVisitZone(stage);
  }
  const panel = page.getByTestId('visit-detail-panel');
  await expect(panel).toBeVisible({ timeout: VISIT_MAP_MASCOT_MOVE_MS + 20_000 });

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

/**
 * Audit UI/UX du 19/11/2026, U6 : sur ordinateur, la fiche est un panneau latéral non modal ;
 * ouvrir puis fermer trois fiches de suite rend la carte dans son cadrage de départ, et la
 * carte reste cliquable fiche ouverte (un autre lieu remplace la fiche).
 */
test('visite publique : trois fiches ouvertes puis fermées sans perdre le cadrage (U6)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 860 });
  await page.goto('/');
  await page.getByRole('button', { name: /Découvrir le lieu/i }).click();
  const stage = page.locator('.visit-map-stage');
  await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 30_000 });
  const markers = stage.locator('.fm-pct-marker');
  if ((await markers.count()) < 2) {
    test.skip();
    return;
  }
  const world = stage.locator('.visit-map-world');
  const readTransform = () => world.evaluate((el) => el.style.transform || '');
  const readScale = async () => {
    const m = /scale\(([\d.]+)\)/.exec(await readTransform());
    return m ? Number(m[1]) : 1;
  };
  await expect.poll(readScale, { timeout: 10_000 }).toBeCloseTo(1, 1);
  const startScale = await readScale();

  const panel = page.getByTestId('visit-detail-panel');
  for (let i = 0; i < 3; i += 1) {
    await markers.nth(i % (await markers.count())).click({ force: true });
    await expect(panel).toBeVisible({ timeout: VISIT_MAP_MASCOT_MOVE_MS + 15_000 });
    await expect(panel).toHaveAttribute('aria-modal', 'false');
    await expect(panel).toHaveClass(/visit-detail-panel--side/);
    await expect(page.getByTestId('visit-detail-panel-scrim')).toHaveCount(0);
    await panel.getByRole('button', { name: 'Fermer' }).click();
    await expect(panel).toHaveCount(0);
    await expect.poll(readScale, { timeout: 5_000 }).toBeCloseTo(startScale, 1);
  }

  // Fiche ouverte, la carte reste cliquable : un autre repère remplace la fiche.
  await markers.nth(0).click({ force: true });
  await expect(panel).toBeVisible({ timeout: VISIT_MAP_MASCOT_MOVE_MS + 15_000 });
  const firstTitle = await panel.locator('.visit-detail-panel__title').textContent();
  await markers.nth(1).click({ force: true });
  await expect(panel.locator('.visit-detail-panel__title')).not.toHaveText(String(firstTitle), {
    timeout: VISIT_MAP_MASCOT_MOVE_MS + 15_000,
  });
});

/** U6 : une vignette d'espèce active ouvre la fiche espèce en lecture (visiteur). */
test('visite publique : une vignette d’espèce ouvre la fiche espèce', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 860 });
  await page.goto('/');
  await page.getByRole('button', { name: /Découvrir le lieu/i }).click();
  const stage = page.locator('.visit-map-stage');
  await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 30_000 });
  const places = stage.locator('.fm-pct-marker, .fm-pct-zone');
  const count = Math.min(await places.count(), 12);
  const panel = page.getByTestId('visit-detail-panel');
  for (let i = 0; i < count; i += 1) {
    await places.nth(i).click({ force: true });
    await expect(panel).toBeVisible({ timeout: VISIT_MAP_MASCOT_MOVE_MS + 15_000 });
    const tile = panel.locator('button.visit-biodiv-tile').first();
    if ((await tile.count()) > 0) {
      await tile.click();
      await expect(page.locator('#plant-catalog-preview-title')).toBeVisible({ timeout: 15_000 });
      return;
    }
  }
  test.skip();
});

/** Lot 2 — moteur de carte partagé : zoom bouton, double-clic, recentrage et bornes. */
test('visite connectée : zoom bouton, double-clic et recentrage sur le moteur partagé', async ({
  page,
}) => {
  await loginAsNewStudent(page);
  await openVisitTab(page);
  const stage = page.locator('.visit-map-stage');
  await expect(stage).toBeVisible({ timeout: 30_000 });
  const world = stage.locator('.visit-map-world');
  const readScale = async () => {
    const t = await world.evaluate((el) => el.style.transform || '');
    const m = /scale\(([\d.]+)\)/.exec(t);
    return m ? Number(m[1]) : 1;
  };
  await expect.poll(readScale, { timeout: 10_000 }).toBeCloseTo(1, 1);

  await stage.locator('.fm-pct-map-controls').getByTestId('visit-zoom-in').click();
  await expect.poll(readScale, { timeout: 5_000 }).toBeGreaterThan(1.1);

  await stage.locator('.fm-pct-map-controls').getByTestId('visit-zoom-reset').click();
  await expect.poll(readScale, { timeout: 5_000 }).toBeCloseTo(1, 1);

  // Double-clic sur le fond : zoom vers le point visé ; le plan reste dans son cadre.
  const box = await stage.boundingBox();
  await page.mouse.dblclick(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await expect.poll(readScale, { timeout: 5_000 }).toBeGreaterThan(2);
  const translate = await world.evaluate((el) => {
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform || '');
    return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
  });
  const scale = await readScale();
  expect(translate.x).toBeLessThanOrEqual(0.5);
  expect(translate.x).toBeGreaterThanOrEqual(box.width * (1 - scale) - 0.5);
  expect(translate.y).toBeLessThanOrEqual(0.5);
  expect(translate.y).toBeGreaterThanOrEqual(box.height * (1 - scale) - 0.5);
});
