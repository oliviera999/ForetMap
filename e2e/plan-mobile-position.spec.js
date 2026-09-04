const { test, expect } = require('@playwright/test');

const { planPlaceNamePattern } = require('./helpers/planPlaceName');

/**
 * Position sur le Plan Lyautey (lot 6) : calage du plan côté admin, position simulée par
 * Playwright, bouton « Me situer », point de position, puis « Y aller » qui annonce une
 * direction et une distance. La géolocalisation est entièrement simulée
 * (`context.setGeolocation`), aucun capteur réel n'entre en jeu.
 *
 * Le produit est résolu par l'en-tête `X-Foretmap-Product` (projet `plan-mobile`).
 */

/** Calage cohérent : le plan couvre ~[48.85, 48.86] × [2.30, 2.31]. */
const GEO_ANCHORS = [
  { xp: 10, yp: 10, lat: 48.86, lng: 2.3 },
  { xp: 90, yp: 10, lat: 48.86, lng: 2.31 },
  { xp: 10, yp: 90, lat: 48.85, lng: 2.3 },
];
/** Centre du plan (xp = yp = 50). */
const IN_MAP_POSITION = { latitude: 48.855, longitude: 2.305, accuracy: 10 };

test.use({ geolocation: IN_MAP_POSITION, permissions: ['geolocation'] });

const PLAN_HEADERS = { 'X-Foretmap-Product': 'plan' };

async function adminToken(request) {
  const email = process.env.TEACHER_ADMIN_EMAIL || 'admin.test@foretmap.local';
  const password = process.env.TEACHER_ADMIN_PASSWORD || 'admin1234';
  const res = await request.post('/api/auth/login', { data: { identifier: email, password } });
  if (!res.ok()) throw new Error(`Connexion admin e2e impossible (HTTP ${res.status()})`);
  const token = (await res.json())?.authToken;
  if (!token) throw new Error('Connexion admin e2e : authToken absent');
  return token;
}

test('plan : « Me situer » affiche le point de position, « Y aller » donne une distance', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const contentRes = await request.get('/api/plan/content', { headers: PLAN_HEADERS });
  expect(contentRes.ok()).toBeTruthy();
  const content = await contentRes.json();
  const mapId = content.map?.id;
  expect(mapId).toBeTruthy();

  const token = await adminToken(request);
  const georefRes = await request.put(`/api/settings/admin/maps/${mapId}/georef`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { anchors: GEO_ANCHORS, gps_enabled: true },
  });
  expect(georefRes.ok()).toBeTruthy();

  try {
    await page.goto('/');
    await expect(page.getByLabel('Rechercher un lieu')).toBeVisible({ timeout: 30_000 });

    // Le plan est calé : le bouton « Me situer » apparaît.
    const locate = page.getByTestId('plan-locate');
    await expect(locate).toBeVisible({ timeout: 15_000 });
    await locate.click();

    // Le point de position s'affiche sur le plan.
    await expect(page.locator('.fm-pct-position').first()).toBeVisible({ timeout: 20_000 });

    const places = [...(content.zones || []), ...(content.markers || [])];
    test.skip(places.length === 0, 'Aucun lieu publié sur le plan de cette base locale.');

    const name = String(places[0].name || places[0].label || '').trim();
    await page.getByLabel('Rechercher un lieu').fill(name);
    const results = page.getByTestId('plan-results-sheet');
    await expect(results).toBeVisible({ timeout: 15_000 });
    await results
      .getByRole('button', { name: planPlaceNamePattern(name) })
      .first()
      .click();

    // « Y aller » est actif et annonce une distance ; la ligne de direction est tracée.
    const sheet = page.getByTestId('plan-place-sheet');
    const goButton = sheet.getByRole('button', { name: /Y aller/ });
    await expect(goButton).toBeEnabled({ timeout: 15_000 });
    await goButton.click();
    await expect(goButton).toContainText(/\d/, { timeout: 20_000 });
    await expect(page.locator('.fm-pct-direct-line')).toBeAttached({ timeout: 15_000 });
  } finally {
    await request
      .put(`/api/settings/admin/maps/${mapId}/georef`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { anchors: [], gps_enabled: false },
      })
      .catch(() => {});
  }
});
