const { test } = require('@playwright/test');
const {
  loginAsNewStudent,
  openVisitTab,
  dismissProfilePromotionModalIfPresent,
  dismissDiscoveryTourIfPresent,
} = require('./fixtures/auth.fixture');
const { verifierA11y } = require('./fixtures/a11y.fixture');

// Cliquet d'accessibilité en navigateur réel. Stratégie, portée et limites :
// `docs/AUDIT_VISITE_UI_UX_2026-09.md` §6.
//
// Un écran = une clé d'inventaire dans `e2e/fixtures/a11y-baseline.json`. Le test échoue
// sur toute violation NOUVELLE, et aussi quand une dette inventoriée a été corrigée sans
// que le cliquet soit resserré — l'inventaire ne peut que rétrécir.

/** Ouvre un onglet de la barre élève et laisse la vue se stabiliser avant la mesure. */
async function ouvrirOngletEleve(page, libelle) {
  await dismissProfilePromotionModalIfPresent(page);
  await dismissDiscoveryTourIfPresent(page);
  await page.locator('nav.bottom-nav').waitFor({ state: 'visible', timeout: 30_000 });
  await page
    .locator('nav.bottom-nav')
    .getByRole('button', { name: libelle })
    .first()
    .click({ timeout: 25_000 });
  // Les vues chargent leurs données après le clic : sans cette pause, `axe` mesure un
  // squelette et l'inventaire décrit un écran qui n'existe pas.
  await page.waitForTimeout(1_500);
}

test.describe('Accessibilité — écrans publics', () => {
  test('écran de connexion', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('button', { name: /Visiter sans compte|Se connecter|Connexion/i })
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    await verifierA11y(page, 'auth-connexion');
  });

  test('visite publique invitée', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('button', { name: /Visiter sans compte/i });
    if ((await cta.count()) === 0) {
      test.skip();
      return;
    }
    await cta.click();
    const onboarding = page.locator('.visit-mascot-onboarding');
    if (await onboarding.isVisible().catch(() => false)) {
      await onboarding.locator('.visit-mascot-onboarding__option').first().click();
      await onboarding.getByRole('button', { name: /Commencer la visite/i }).click();
    }
    await page.locator('.visit-view').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1_500);
    await verifierA11y(page, 'visite-invite');
  });
});

test.describe('Accessibilité — Gnomes & Licornes', () => {
  // GL est servi par host (`X-Foretmap-Product`), avec sa propre coque et ses propres
  // styles : il ne bénéficie d'aucune des corrections faites côté ForetMap et mérite donc
  // son propre inventaire.
  test('accueil G&L (intro)', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.waitForTimeout(2_000);
    await verifierA11y(page, 'gl-accueil');
  });

  test('plateau découverte (invité)', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('gl_intro_seen', '1'));
    await page.reload();
    const cta = page.getByRole('button', { name: 'Découvrir sans compte' });
    // Attendre le rendu : un `count()` immédiat après `reload()` renvoie 0 et faisait
    // sauter le scénario — un écran sauté n'entre jamais dans l'inventaire.
    const disponible = await cta
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!disponible) {
      test.skip();
      return;
    }
    await cta.click();
    await page.getByRole('heading', { name: 'Découverte' }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1_500);
    await verifierA11y(page, 'gl-decouverte-invite');
  });
});

test.describe('Accessibilité — écrans élève', () => {
  test('visite', async ({ page }) => {
    await loginAsNewStudent(page);
    await openVisitTab(page);
    await page.locator('.visit-view').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1_500);
    await verifierA11y(page, 'visite-eleve');
  });

  test('visite — fiche d’un lieu ouverte', async ({ page }) => {
    await loginAsNewStudent(page);
    await openVisitTab(page);
    const stage = page.locator('.visit-map-stage');
    await stage.locator('img.visit-map-img').waitFor({ state: 'visible', timeout: 30_000 });
    const marker = stage.locator('.visit-marker-btn').first();
    const zone = stage.locator('.visit-zone-hit').first();
    if ((await marker.count()) === 0 && (await zone.count()) === 0) {
      test.skip();
      return;
    }
    if ((await marker.count()) > 0) await marker.click({ force: true, timeout: 10_000 });
    else await zone.click({ force: true, timeout: 10_000 });
    await page.getByTestId('visit-detail-panel').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(500);
    // Le panneau est modal : on mesure le dialogue, pas la carte inerte derrière lui.
    await verifierA11y(page, 'visite-fiche-lieu');
  });

  test('carte', async ({ page }) => {
    await loginAsNewStudent(page);
    await ouvrirOngletEleve(page, 'Carte');
    await verifierA11y(page, 'carte-eleve');
  });

  test('tâches', async ({ page }) => {
    await loginAsNewStudent(page);
    await ouvrirOngletEleve(page, /^Tâches/);
    await verifierA11y(page, 'taches-eleve');
  });

  test('biodiversité', async ({ page }) => {
    await loginAsNewStudent(page);
    await ouvrirOngletEleve(page, 'Biodiversité');
    await verifierA11y(page, 'biodiversite-eleve');
  });

  test('glossaire', async ({ page }) => {
    await loginAsNewStudent(page);
    await ouvrirOngletEleve(page, 'Glossaire');
    await verifierA11y(page, 'glossaire-eleve');
  });

  test('réseau trophique', async ({ page }) => {
    await loginAsNewStudent(page);
    await ouvrirOngletEleve(page, 'Réseau');
    await verifierA11y(page, 'reseau-trophique-eleve');
  });

  test('quiz', async ({ page }) => {
    await loginAsNewStudent(page);
    await ouvrirOngletEleve(page, 'Quiz');
    await verifierA11y(page, 'quiz-eleve');
  });
});
