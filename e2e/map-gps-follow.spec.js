const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

/**
 * Suivi GPS de la mascotte (audit géolocalisation C8) : calage d'un plan côté admin,
 * position simulée par Playwright, bouton « Me suivre », déplacement de la mascotte,
 * puis position hors zone → bannière dédiée. La géolocalisation est entièrement
 * simulée (`context.setGeolocation`), aucun capteur réel n'entre en jeu.
 */

// Calage cohérent : le plan couvre ~[48.85, 48.86] × [2.30, 2.3125] (≈ 1,1 km × 0,9 km).
const GEO_ANCHORS = [
  { xp: 10, yp: 10, lat: 48.86, lng: 2.3 },
  { xp: 90, yp: 10, lat: 48.86, lng: 2.31 },
  { xp: 10, yp: 90, lat: 48.85, lng: 2.3 },
];
/** Centre du plan (xp=yp=50). */
const IN_MAP_POSITION = { latitude: 48.855, longitude: 2.305, accuracy: 10 };
/** Très loin du plan (→ hors bornes même avec la marge de 5 %). */
const FAR_POSITION = { latitude: 48.5, longitude: 2.0, accuracy: 10 };

test.use({
  geolocation: IN_MAP_POSITION,
  permissions: ['geolocation'],
});

async function georefFirstMapAsAdmin(page) {
  const teacherEmail = process.env.TEACHER_ADMIN_EMAIL || 'admin.test@foretmap.local';
  const teacherPassword = process.env.TEACHER_ADMIN_PASSWORD || 'admin1234';
  const loginResp = await page.request.post('/api/auth/login', {
    data: { identifier: teacherEmail, password: teacherPassword },
  });
  if (!loginResp.ok()) {
    throw new Error(`Connexion admin e2e impossible (HTTP ${loginResp.status()}).`);
  }
  const token = (await loginResp.json())?.authToken;
  if (!token) throw new Error('Connexion admin e2e : authToken absent');

  const mapsResp = await page.request.get('/api/maps');
  if (!mapsResp.ok()) throw new Error(`GET /api/maps en échec (HTTP ${mapsResp.status()})`);
  const maps = await mapsResp.json();
  const map = (Array.isArray(maps) ? maps : []).find((m) => m.is_active !== false) || maps[0];
  if (!map?.id) throw new Error('Aucun plan disponible pour le calage GPS e2e');

  const georefResp = await page.request.put(`/api/settings/admin/maps/${map.id}/georef`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { anchors: GEO_ANCHORS, gps_enabled: true },
  });
  if (!georefResp.ok()) {
    const snippet = await georefResp.text().catch(() => '');
    throw new Error(
      `Calage GPS e2e refusé (HTTP ${georefResp.status()}). ${snippet.slice(0, 200)}`,
    );
  }
  return { mapId: map.id, token };
}

async function clearGeoref(page, mapId, token) {
  await page.request
    .put(`/api/settings/admin/maps/${mapId}/georef`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { anchors: [], gps_enabled: false },
    })
    .catch(() => {});
}

test('suivi GPS : la mascotte suit la position simulée puis signale la sortie de zone', async ({
  page,
  context,
}) => {
  const { mapId, token } = await georefFirstMapAsAdmin(page);
  try {
    await loginAsNewStudent(page);

    // Ouvre l'onglet Carte (la vue carte n'est pas montée sur l'onglet d'accueil).
    const mapTab = page
      .locator('nav.bottom-nav')
      .getByRole('button', { name: /Carte/i })
      .or(page.locator('.top-tabs').getByRole('button', { name: /Carte/i }))
      .first();
    await mapTab.click({ timeout: 25_000 });
    await page.locator('.map-view-root').waitFor({ state: 'visible', timeout: 30_000 });

    // Vue carte élève : le bouton n'existe que sur un plan calé + GPS activé.
    const followBtn = page.getByRole('button', { name: 'Suivre ma position avec la mascotte' });
    if (!(await followBtn.isVisible({ timeout: 15_000 }).catch(() => false))) {
      // Mascotte désactivée par réglages ou plan géoréférencé hors du scope élève :
      // le flux GPS n'est pas atteignable dans cet environnement.
      test.skip(true, 'Bouton « Me suivre » absent (mascotte désactivée ou plan hors scope)');
      return;
    }

    // La mascotte peut rester masquée (variante embarquée) : seul son style de position compte ici.
    const mascot = page.locator('.map-view-forest-mascot').first();
    await mascot.waitFor({ state: 'attached', timeout: 15_000 });

    await followBtn.click();
    // Position dans la zone → bannière « Suivi GPS actif » et mascotte proche du centre.
    const banner = page.locator('.map-view-gps-status');
    await expect(banner).toContainText(/Suivi GPS actif/, { timeout: 20_000 });
    await expect
      .poll(
        async () => {
          const style = await mascot.getAttribute('style');
          const match = /left:\s*([\d.]+)%/.exec(style || '');
          return match ? Number(match[1]) : null;
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(30);

    // Sortie de zone : nouvelle position très loin du plan.
    await context.setGeolocation(FAR_POSITION);
    await expect(banner).toContainText(/hors de la zone du plan/, { timeout: 30_000 });

    // Désactivation : la bannière disparaît.
    await page.getByRole('button', { name: 'Désactiver le suivi GPS' }).click();
    await expect(banner).toBeHidden({ timeout: 10_000 });
  } finally {
    await clearGeoref(page, mapId, token);
  }
});
