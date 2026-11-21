const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  loginAsTeacherAdminApi,
  dismissProfilePromotionModalIfPresent,
} = require('./fixtures/auth.fixture');

/**
 * Chantier collège (flux C3) — une étape de séance « réseau trophique » montre une liste
 * d'espèces (`plantIds`) : l'élève voit ces espèces et leurs liens mutuels seulement
 * (profondeur 0), quel que soit son niveau (graphe isolé au lycée, réseau borné au collège).
 *
 * Le réseau est servi par interception (le scénario ne dépend pas des liens de la base) ; les
 * identifiants d'espèces sont réels, car le serveur vérifie les cibles d'une séance.
 */

function fixtureFor([a, b, c, d]) {
  const row = (id, type, from, to) => ({
    id,
    interaction_type: type,
    from_id: from.id,
    from_name: from.name,
    from_emoji: '',
    from_role: 'consommateur',
    to_id: to.id,
    to_name: to.name,
    to_emoji: '',
    to_role: 'producteur',
    description: '',
  });
  return [row(1, 'predation', a, b), row(2, 'herbivorie', b, c), row(3, 'herbivorie', d, c)];
}

test('séance : étape réseau trophique avec plantIds — les espèces choisies et leurs liens', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const slug = `e2e-c3-reseau-${stamp}`;

  const adminToken = await loginAsTeacherAdminApi(page);
  const auth = { Authorization: `Bearer ${adminToken}` };
  const plantsResp = await page.request.get('/api/plants', { headers: auth });
  const plants = await plantsResp.json();
  const list = (Array.isArray(plants) ? plants : plants?.items || [])
    .filter((p) => Number(p.id) > 0)
    .slice(0, 4)
    .map((p) => ({ id: Number(p.id), name: `Espèce E2E ${p.id}` }));
  expect(list.length).toBe(4);
  const items = fixtureFor(list);

  await page.route('**/api/food-web**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (route.request().method() !== 'GET') return route.continue();
    if (pathname.endsWith('/glossary')) return route.fulfill({ json: { terms: [] } });
    if (pathname.endsWith('/api/food-web')) return route.fulfill({ json: { items } });
    return route.continue();
  });

  const created = await page.request.post('/api/pedago-sessions', {
    headers: auth,
    data: {
      templateKey: 'custom',
      title: `Réseau choisi ${stamp}`,
      slug,
      isPublished: true,
      steps: [
        {
          title: 'Qui mange qui',
          body: 'Observe le lien entre ces deux espèces.',
          action: { type: 'open_foodweb', payload: { plantIds: [list[0].id, list[1].id] } },
        },
      ],
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const sessionId = (await created.json()).id;

  try {
    await loginAsNewStudent(page);
    await dismissProfilePromotionModalIfPresent(page);
    await page.goto(`/?seance=${slug}`);
    await dismissProfilePromotionModalIfPresent(page);

    await expect(page.getByRole('heading', { name: /Réseau trophique/i })).toBeVisible({
      timeout: 20_000,
    });
    const graph = page.locator('svg.pedago-foodweb-graph');
    await expect(graph).toBeVisible({ timeout: 20_000 });
    // Profondeur 0 : les deux espèces de la séance, leur lien, rien d'autre.
    await expect(page.locator('.pedago-foodweb-graph__node-group')).toHaveCount(2);
    await expect(
      page.locator('.pedago-foodweb-graph__node-group', { hasText: list[2].name }),
    ).toHaveCount(0);
  } finally {
    await page.request
      .delete(`/api/pedago-sessions/${sessionId}`, { headers: auth })
      .catch(() => {});
  }
});
