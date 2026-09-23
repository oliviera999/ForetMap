const { test, expect } = require('@playwright/test');

/**
 * Plan Lyautey — **mode parcours** (lot 8, `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.6).
 *
 * C'est le flux qu'un établissement imprime sur une affiche à son accueil : un visiteur scanne
 * un QR code et suit une liste de lieux. Il n'avait aucun filet e2e
 * (`docs/AUDIT_PARCOURS_2026-09.md` §3) — celui-ci couvre les deux entrées, la puce « Parcours »
 * et le lien profond `?parcours=`, plus la sortie.
 *
 * Le parcours est créé par l'API avec un compte professeur, puis retiré : la base locale n'a pas
 * à contenir de jeu de données particulier.
 *
 * NETTOYAGE ET UNICITÉ — pourquoi ce n'est pas un simple `finally`
 * ---------------------------------------------------------------
 * Ce test s'est mis à échouer en chaîne sur la CI (runs 2972 à 2976, `main` comme toutes les
 * branches ouvertes). L'enchaînement, relevé à l'identique dans chaque log :
 *
 *   1. `Test timeout of 120000ms exceeded.` — la première tentative dépasse son budget ;
 *   2. Playwright démonte alors les fixtures, dont `request`. Le nettoyage en `finally` lève
 *      `apiRequestContext.delete: Target page, context or browser has been closed` et **le
 *      parcours de test survit en base** ;
 *   3. la reprise (`retries`) en crée un second, du même titre, et le clic devient ambigu :
 *      `strict mode violation: getByRole('button', { name: /Parcours e2e/ }) resolved to
 *      2 elements`.
 *
 * L'échec visible n'était donc pas la cause, et re-lancer le job ne le réparait pas : la base
 * de test restait polluée. Deux gardes, l'une pour la cause, l'autre pour la propagation :
 *
 *   * le nettoyage passe par un **contexte de requête créé à la main** (`playwright.request
 *     .newContext()`), dans un `afterEach` qui a son propre budget de temps — il n'est donc
 *     pas emporté par le démontage des fixtures d'un test qui expire ;
 *   * le parcours porte un **titre unique**, comme son slug l'était déjà. Une fuite résiduelle
 *     — d'un plantage brutal, d'un `Ctrl+C`, d'une base partagée — ne peut plus rendre le
 *     sélecteur ambigu ni faire échouer la tentative suivante.
 */

const ADMIN_EMAIL = process.env.TEACHER_ADMIN_EMAIL || 'admin.test@foretmap.local';
const ADMIN_PASSWORD = process.env.TEACHER_ADMIN_PASSWORD || 'admin1234';

/** Jeton professeur (l'écriture des parcours demande `zones.manage`). */
async function teacherToken(request) {
  const res = await request.post('/api/auth/login', {
    data: { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (!res.ok()) return '';
  const body = await res.json();
  return String(body?.authToken || '');
}

/**
 * Parcours créés par le test en cours, à retirer quoi qu'il arrive. Renseigné dès la création,
 * consommé par l'`afterEach` — y compris quand le corps du test n'a jamais atteint sa fin.
 */
let createdRouteIds = [];

test.afterEach(async ({ playwright, baseURL }) => {
  const ids = createdRouteIds;
  createdRouteIds = [];
  if (ids.length === 0) return;
  // Contexte neuf, hors fixtures : celui du test est déjà démonté si le test a expiré.
  const api = await playwright.request.newContext({ baseURL });
  try {
    const token = await teacherToken(api);
    if (!token) return;
    for (const id of ids) {
      // Un échec de suppression ne doit pas masquer l'échec du test lui-même.
      await api.delete(`/api/map-routes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } finally {
    await api.dispose();
  }
});

test('plan : parcours par la puce, par lien profond, et sortie', async ({ page, request }) => {
  test.setTimeout(120_000);

  const contentRes = await request.get('/api/plan/content');
  expect(contentRes.ok()).toBeTruthy();
  const content = await contentRes.json();
  const mapId = String(content.map?.id || '');
  const zone = (content.zones || [])[0];
  const marker = (content.markers || [])[0];
  test.skip(!mapId || !zone || !marker, 'Le plan de cette base locale n’a pas deux lieux.');

  const token = await teacherToken(request);
  test.skip(!token, 'Compte professeur e2e indisponible.');
  const headers = { Authorization: `Bearer ${token}` };

  // Titre unique, comme le slug : deux parcours de test simultanés (reprise après expiration,
  // fuite d'un run précédent) ne doivent jamais rendre le clic ambigu.
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const slug = `e2e-parcours-${stamp}`;
  const title = `Parcours e2e ${stamp}`;
  const created = await request.post('/api/map-routes', {
    headers,
    data: {
      map_id: mapId,
      title,
      slug,
      audience: 'Test automatisé',
      is_published: true,
      surfaces: ['plan'],
      steps: [
        { target_type: 'zone', target_id: zone.id, step_title: 'Première étape' },
        { target_type: 'marker', target_id: marker.id, step_title: 'Seconde étape' },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();
  const route = await created.json();
  // Enregistré AVANT la première interaction : si le test expire à l'étape suivante,
  // l'`afterEach` a déjà de quoi faire le ménage.
  createdRouteIds.push(route.id);

  // 1) Par la puce : le parcours se choisit sans quitter le plan.
  await page.goto('/');
  await expect(page.getByLabel('Rechercher un lieu')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Parcours/ }).click();
  // `exact: false` : le nom accessible du bouton concatène le titre et l'audience
  // (« Parcours e2e … Test automatisé »). Le titre unique suffit à le désigner sans ambiguïté.
  await page.getByRole('button', { name: title, exact: false }).click();

  const sheet = page.getByTestId('plan-route-sheet');
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByText('Première étape')).toBeVisible();
  await expect(sheet.getByText('Étape 1 sur 2')).toBeVisible();
  // L'URL porte le parcours : c'est elle qu'on imprime sous forme de QR code.
  await expect(page).toHaveURL(new RegExp(`parcours=${slug}`));

  await sheet.getByRole('button', { name: 'Suivant' }).click();
  await expect(sheet.getByText('Étape 2 sur 2')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Suivant' })).toBeDisabled();

  await sheet.getByRole('button', { name: 'Quitter' }).click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });
  await expect(page).not.toHaveURL(/parcours=/);
  await expect(page.getByRole('button', { name: 'Reprendre le parcours' })).toBeVisible();

  // Reprendre rend la main **à l'étape quittée**, pas à la première : on est sorti à la 2.
  await page.getByRole('button', { name: 'Reprendre le parcours' }).click();
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByText('Étape 2 sur 2')).toBeVisible();
  await sheet.getByRole('button', { name: 'Quitter' }).click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  // Et elle survit à un rechargement : le visiteur qui verrouille son téléphone entre deux
  // étapes retrouve son parcours là où il l'a laissé.
  await page.reload();
  await expect(page.getByLabel('Rechercher un lieu')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Reprendre le parcours' }).click();
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByText('Étape 2 sur 2')).toBeVisible();
  await sheet.getByRole('button', { name: 'Quitter' }).click();

  // 2) Par le lien profond : ce que voit un visiteur qui scanne l'affiche.
  await page.goto(`/?parcours=${slug}`);
  const deepSheet = page.getByTestId('plan-route-sheet');
  await expect(deepSheet).toBeVisible({ timeout: 30_000 });
  await expect(deepSheet.getByText('Première étape')).toBeVisible();

  // 3) Affiche périmée : le visiteur l'apprend au lieu d'arriver sur un plan nu.
  await page.goto('/?parcours=parcours-qui-nexiste-pas');
  await expect(page.getByText('Ce parcours n’est plus disponible.')).toBeVisible({
    timeout: 30_000,
  });
});
