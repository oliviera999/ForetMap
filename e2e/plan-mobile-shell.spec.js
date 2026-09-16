const { test, expect } = require('@playwright/test');

const { planPlaceNamePattern, planSearchTerm } = require('./helpers/planPlaceName');

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

  /**
   * Frappe **réelle** : toucher le champ puis taper, comme un visiteur.
   *
   * `fill()` ne suffit pas et ne suffisait pas : il posait la valeur d'un bloc sans passer par
   * le focus, alors que c'est justement le focus qui ouvre la feuille de résultats. Quand
   * celle-ci était modale, elle rendait le champ inerte et la frappe n'arrivait jamais — la
   * recherche était morte en production et ce scénario restait vert, parce qu'il retrouvait
   * ensuite son lieu dans la liste « Tous les lieux » affichée quand la saisie est vide
   * (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N1 et §8).
   */
  const term = planSearchTerm(name);
  test.skip(!term, 'Le premier lieu de cette base n’a aucun mot tapable.');
  await search.click();
  await search.pressSequentially(term);
  const results = page.getByTestId('plan-results-sheet');
  await expect(results).toBeVisible({ timeout: 15_000 });
  // Le titre « Résultats (n) » ne s'affiche que si la saisie est bien arrivée dans le champ.
  await expect(results.getByRole('heading', { name: /Résultats \(/ })).toBeVisible();
  await expect(search).toHaveValue(term);
  await results
    .getByRole('button', { name: planPlaceNamePattern(name) })
    .first()
    .click();

  const placeSheet = page.getByTestId('plan-place-sheet');
  await expect(placeSheet).toBeVisible({ timeout: 15_000 });
  await expect(placeSheet.getByRole('button', { name: 'Y aller' })).toBeDisabled();
  await expect(page).toHaveURL(/lieu=/);

  // La carte reste vivante sous la fiche : surcouche traversante, aucun `inert` posé.
  await expect(placeSheet).toHaveAttribute('data-block-background', 'false');
  await expect(page.locator('#root')).not.toHaveAttribute('inert', /.*/);

  await placeSheet.getByRole('button', { name: 'Fermer la fiche du lieu' }).click();
  await expect(placeSheet).toBeHidden({ timeout: 15_000 });

  /**
   * Fermer cette fiche ne doit pas **quitter le plan**. Les feuilles empilent une entrée
   * d'historique ; quand l'une remplace l'autre dans le même rendu (toucher un résultat ferme
   * la liste et ouvre la fiche), le compte se décalait et la fermeture reculait une fois de
   * trop — le visiteur se retrouvait sur la page précédente
   * (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N16).
   */
  await expect(page.getByLabel('Rechercher un lieu')).toBeVisible();
  await expect(page.getByRole('button', { name: /Voir tout le plan/ })).toBeVisible();
});
