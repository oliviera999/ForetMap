const { test, expect } = require('@playwright/test');

const { planPlaceNamePattern } = require('./helpers/planPlaceName');

/**
 * Plan Lyautey (lot 4) — filet e2e du produit servi par host : la coquille se monte sur un
 * téléphone, la charge publique répond, la recherche et la fiche d'un lieu fonctionnent.
 *
 * Le produit est résolu par l'en-tête `X-Foretmap-Product` (projet `plan-mobile` de
 * `playwright.config.js`) : en local il n'y a pas de sous-domaine `planlyautey.*`.
 */

test('plan : coquille, recherche et fiche d’un lieu', async ({ page, request }) => {
  test.setTimeout(120_000);

  // La charge publique répond et décrit une carte : sans elle, rien à afficher.
  const contentRes = await request.get('/api/plan/content', {
    headers: { 'X-Foretmap-Product': 'plan' },
  });
  expect(contentRes.ok()).toBeTruthy();
  const content = await contentRes.json();
  expect(content.map?.id).toBeTruthy();
  expect(Array.isArray(content.zones)).toBeTruthy();
  expect(Array.isArray(content.markers)).toBeTruthy();
  // Aucune donnée d'élève ni de tâche ne doit transiter par ce produit public.
  expect(content.tasks).toBeUndefined();
  expect(content.students).toBeUndefined();

  // Les contrôles de la carte (« Voir tout le plan », « Me situer », pastilles) ne sont rendus
  // que si le plan a un fond d'image : `AppPlan` ne monte `PlanMapStage` que sous
  // `hasMapImage`. Sans cette garde, une base dont la carte n'a pas d'image fait échouer le
  // scénario sur un bouton absent, là où il n'y a en réalité rien à vérifier — c'est ce qui
  // rendait le smoke bloquant rouge en intégration. Garde posée **avant** les assertions
  // qu'elle protège, comme dans `plan-routes-mode.spec.js`.
  test.skip(!content.map?.map_image_url, 'La carte du plan de cette base locale n’a pas de fond.');
  const places = [...(content.zones || []), ...(content.markers || [])];
  test.skip(places.length === 0, 'Aucun lieu publié sur le plan de cette base locale.');

  await page.goto('/');
  const search = page.getByLabel('Rechercher un lieu');
  await expect(search).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Voir tout le plan/ })).toBeVisible();

  const first = places[0];
  const name = String(first.name || first.label || '').trim();
  await search.fill(name);
  const results = page.getByTestId('plan-results-sheet');
  await expect(results).toBeVisible({ timeout: 15_000 });
  await results
    .getByRole('button', { name: planPlaceNamePattern(name) })
    .first()
    .click();

  const placeSheet = page.getByTestId('plan-place-sheet');
  await expect(placeSheet).toBeVisible({ timeout: 15_000 });
  await expect(placeSheet.getByRole('button', { name: 'Y aller' })).toBeDisabled();
  await expect(page).toHaveURL(/lieu=/);

  await placeSheet.getByRole('button', { name: 'Fermer la fiche du lieu' }).click();
  await expect(placeSheet).toBeHidden({ timeout: 15_000 });
});
