const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, enableTeacherMode } = require('./fixtures/auth.fixture');

/** Un nom d'espèce peut contenir des caractères de syntaxe d'expression régulière. */
function escapeForRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('parcours prof: onglet Biodiversité accessible', async ({ page }) => {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);

  await page.getByRole('button', { name: /Biodiversité/ }).click();
  await expect(
    page.getByRole('heading', { name: /Biodiversité|Plantes|Catalogue/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
});

/**
 * Le catalogue affichait toutes les fiches dépliées, chacune allant chercher ses propres
 * données au montage : ~471 requêtes pour 78 espèces, de quoi épuiser le plafond de
 * requêtes d'un établissement (docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md, §1). Il affiche
 * désormais des vignettes muettes, et la fiche complète s'ouvre au clic.
 *
 * Ce scénario tient les deux bouts sur l'application réellement servie : le compte des
 * requêtes à l'ouverture de l'onglet, et le fait que le clic ouvre bien la fiche. Les tests
 * unitaires couvrent le câblage du composant ; seul un vrai navigateur montre ce que la
 * page émet pour de bon.
 */
test('catalogue biodiversité : vignettes muettes, fiche complète au clic', async ({ page }) => {
  await loginAsNewStudent(page);

  /** Requêtes API émises par la page, hors sondes de synchronisation et temps réel. */
  const apiCalls = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.includes('/api/')) return;
    if (url.includes('/api/sync-state') || url.includes('/socket.io')) return;
    if (url.includes('/api/health')) return;
    apiCalls.push(url.replace(/^https?:\/\/[^/]+/, ''));
  });

  await page.getByRole('button', { name: /Biodiversité/ }).click();
  const firstTile = page.getByRole('button', { name: /^Ouvrir la fiche de / }).first();
  await firstTile.waitFor({ state: 'visible', timeout: 20_000 });

  const tileCount = await page.getByRole('button', { name: /^Ouvrir la fiche de / }).count();
  expect(tileCount, 'le catalogue doit afficher des vignettes').toBeGreaterThan(0);

  // Laisse retomber d'éventuels effets différés avant de compter.
  await page.waitForTimeout(1500);

  // Aucune requête PAR FICHE : ni bloc pédagogique, ni commentaires de contexte, ni
  // réglages publics redemandés — c'est exactement ce que la grille émettait avant.
  const perPlant = apiCalls.filter((u) => /\/api\/plants\/\d+\//.test(u));
  const comments = apiCalls.filter((u) => u.includes('/api/context-comments'));
  expect(perPlant, `appels par fiche : ${perPlant.join(', ')}`).toEqual([]);
  expect(comments, `appels commentaires : ${comments.join(', ')}`).toEqual([]);

  // Le coût PROPRE au catalogue : la liste, les compteurs d'observation, l'annonce du
  // contrôle. Trois appels de page, quel que soit le nombre de vignettes. (Le compteur
  // global inclut aussi le démarrage de l'application — cartes, tâches, visite… — qui n'a
  // rien à voir avec cet écran.)
  const catalogCalls = apiCalls.filter(
    (u) => u.startsWith('/api/plants') || u.includes('/learning/gating/summary'),
  );
  expect(
    catalogCalls.length,
    `${catalogCalls.length} appels de catalogue pour ${tileCount} vignettes : ${catalogCalls.join(', ')}`,
  ).toBeLessThanOrEqual(3);

  // Le clic ouvre la fiche complète — la modale d'aperçu, celle qu'ouvrent déjà la carte,
  // le glossaire, le quiz et le réseau trophique.
  const tileName = (await firstTile.getAttribute('aria-label')).replace(/^Ouvrir la fiche de /, '');
  await firstTile.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  // `.first()` : le titre du dialogue et celui de la fiche portent tous deux le nom.
  await expect(
    dialog.getByRole('heading', { name: new RegExp(escapeForRegExp(tileName)) }).first(),
  ).toBeVisible();

  // C'est seulement là que les données de la fiche sont demandées — pour cette fiche.
  await expect
    .poll(() => apiCalls.filter((u) => /\/api\/plants\/\d+\/interactions/.test(u)).length, {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  const openedPerPlant = apiCalls.filter((u) => /\/api\/plants\/(\d+)\//.test(u));
  const ids = new Set(openedPerPlant.map((u) => u.match(/\/api\/plants\/(\d+)\//)[1]));
  expect(ids.size, `une seule fiche chargée, vu : ${[...ids].join(', ')}`).toBe(1);
});
