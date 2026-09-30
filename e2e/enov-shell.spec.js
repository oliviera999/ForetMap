const { test, expect } = require('@playwright/test');

/**
 * Plan e-nov (migration 313) — filet e2e du produit servi par host : un lieu désigné comme
 * innovation depuis la console ressort sur le plan e-nov, la puce « Innovations » le liste, et
 * sa fiche s'ouvre sur son texte e-nov. Le plan public, lui, n'en montre rien.
 *
 * Le produit est résolu par l'en-tête `X-Foretmap-Product: enov` (projet `enov-mobile` de
 * `playwright.config.js`) : en local il n'y a pas de sous-domaine `enov.*`.
 *
 * Le lieu est étiqueté par l'API avec un compte professeur, puis rendu à son état d'origine
 * dans un `afterEach` à contexte propre (patron de `plan-routes-mode.spec.js`) : la base
 * locale n'a pas à contenir de jeu de données particulier.
 */

const ADMIN_EMAIL = process.env.TEACHER_ADMIN_EMAIL || 'admin.test@foretmap.local';
const ADMIN_PASSWORD = process.env.TEACHER_ADMIN_PASSWORD || 'admin1234';

/** Catégorie-label semée par la migration 313. */
const ENOV_CATEGORY_ID = 'cat-enov';

/**
 * Contexte « console ForêtMap ». Un contexte créé à la main **hérite** de l'en-tête
 * `X-Foretmap-Product: enov` du projet : sans cette surcharge, la lecture de la zone passait par
 * la surface `enov`, qui ne sert que les cartes déclarées du plan — 404 sur une base où la
 * carte servie n'est qu'un repli.
 */
const CONSOLE_HEADERS = Object.freeze({ 'X-Foretmap-Product': 'foret' });

/** Zone dessinée (au moins trois sommets) : seule une zone tracée a un contour à entourer. */
function hasPolygon(zone) {
  try {
    const points = typeof zone?.points === 'string' ? JSON.parse(zone.points) : zone?.points;
    return Array.isArray(points) && points.length >= 3;
  } catch (_) {
    return false;
  }
}

async function teacherToken(api) {
  const res = await api.post('/api/auth/login', {
    data: { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (!res.ok()) return '';
  const body = await res.json();
  return String(body?.authToken || '');
}

/** État d'origine du lieu étiqueté, à restaurer quoi qu'il arrive. */
let restore = null;

test.afterEach(async ({ playwright, baseURL }) => {
  const pending = restore;
  restore = null;
  if (!pending) return;
  // Contexte neuf, hors fixtures, en ForêtMap : c'est la console qui restaure.
  const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: CONSOLE_HEADERS });
  try {
    const token = await teacherToken(api);
    if (!token) return;
    await api.put(`/api/zones/${pending.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { category_ids: pending.categoryIds, enov_description: pending.enovDescription },
    });
  } finally {
    await api.dispose();
  }
});

test('plan e-nov : innovation mise en avant, listée, fiche ouverte sur son texte', async ({
  page,
  request,
  playwright,
  baseURL,
}) => {
  test.setTimeout(120_000);

  const contentRes = await request.get('/api/enov/content');
  expect(contentRes.ok()).toBeTruthy();
  const content = await contentRes.json();
  expect(content.settings?.enov).toBeTruthy();
  expect(content.tasks).toBeUndefined();
  expect(content.students).toBeUndefined();
  test.skip(!content.map?.map_image_url, 'La carte du plan de cette base locale n’a pas de fond.');
  const zone = (content.zones || []).find(hasPolygon);
  test.skip(!zone, 'Aucune zone dessinée sur le plan de cette base locale.');

  const consoleApi = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: CONSOLE_HEADERS,
  });
  const text = `Innovation e2e ${Date.now()}`;
  try {
    const token = await teacherToken(consoleApi);
    test.skip(!token, 'Compte professeur e2e indisponible.');
    const headers = { Authorization: `Bearer ${token}` };
    const before = await consoleApi.get(`/api/zones/${zone.id}`, { headers });
    expect(before.ok()).toBeTruthy();
    const original = await before.json();
    const categoryIds = (original.category_ids || []).map(String);
    // Enregistré AVANT l'écriture : si le test expire ensuite, l'`afterEach` restaure.
    restore = {
      id: zone.id,
      categoryIds,
      enovDescription: original.enov_description || '',
    };
    const saved = await consoleApi.put(`/api/zones/${zone.id}`, {
      headers,
      data: {
        category_ids: [...new Set([...categoryIds, ENOV_CATEGORY_ID])],
        enov_description: text,
      },
    });
    expect(saved.ok()).toBeTruthy();
  } finally {
    await consoleApi.dispose();
  }

  // La charge du plan e-nov le met en avant ; celle du plan public n'en dit rien.
  const enov = await (await request.get('/api/enov/content')).json();
  const tagged = enov.zones.find((z) => z.id === zone.id);
  expect(tagged?.is_enov).toBe(true);
  expect(tagged?.enov_description).toBe(text);
  const publicPlan = await (
    await request.get('/api/plan/content', { headers: { 'X-Foretmap-Product': 'plan' } })
  ).json();
  const onPublic = publicPlan.zones.find((z) => z.id === zone.id);
  if (onPublic) {
    expect(onPublic.is_enov).toBeUndefined();
    expect(onPublic.enov_description).toBeUndefined();
    expect(onPublic.category_ids).not.toContain(ENOV_CATEGORY_ID);
  }

  await page.goto('/');
  await expect(page.getByLabel('Rechercher un lieu')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.plan-map.has-highlight')).toBeVisible();
  await expect(page.locator('.fm-pct-zone.is-highlight').first()).toBeAttached();

  await page.getByTestId('plan-innovations-button').click();
  const results = page.getByTestId('plan-results-sheet');
  await expect(results).toBeVisible({ timeout: 15_000 });
  await expect(results.getByRole('heading', { name: /Innovations \(/ })).toBeVisible();
  await results.locator('.plan-results__btn').filter({ hasText: 'Innovation' }).first().click();

  const placeSheet = page.getByTestId('plan-place-sheet');
  await expect(placeSheet).toBeVisible({ timeout: 15_000 });
  await expect(placeSheet.getByTestId('plan-place-enov')).toBeVisible();
});
