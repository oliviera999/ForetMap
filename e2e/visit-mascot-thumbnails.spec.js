const { test, expect } = require('@playwright/test');

/**
 * Vignettes du sélecteur « Guide » de la Visite (lot J, audit UI/UX du 19/11/2026, U1 et U4).
 *
 * Un pack publié au studio reçoit sa vignette à l'enregistrement ; le visiteur sans compte la
 * voit dans le menu, dont les seules images sont des vignettes (pas de planche de sprites pour
 * la liste).
 */

const PACK_LABEL = 'Guide à vignette (e2e)';

async function teacherToken(request) {
  const res = await request.post('/api/auth/login', {
    data: {
      identifier: process.env.TEACHER_ADMIN_EMAIL || 'admin.test@foretmap.local',
      password: process.env.TEACHER_ADMIN_PASSWORD || 'admin1234',
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.authToken || body.token;
}

test.describe('Visite — vignettes des guides', () => {
  let token;
  let packId;

  test.beforeAll(async ({ request }) => {
    token = await teacherToken(request);
    const created = await request.post('/api/visit/mascot-packs', {
      headers: { Authorization: `Bearer ${token}` },
      data: { clone_from_catalog_id: 'tan-bird-spritesheet', is_published: 1, label: PACK_LABEL },
    });
    expect(created.status()).toBe(201);
    packId = (await created.json()).id;
  });

  test.afterAll(async ({ request }) => {
    if (!packId) return;
    await request.delete(`/api/visit/mascot-packs/${packId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  test('le menu « Guide » montre la vignette du pack, sans charger de planche', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Découvrir le lieu/i }).click();
    await expect(page.locator('.visit-view--guest-public')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.visit-map-stage img.visit-map-img')).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId('visit-mascot-picker').click();
    const menu = page.getByRole('menu', { name: 'Mascottes disponibles' });
    await expect(menu).toBeVisible({ timeout: 10_000 });

    const option = menu.getByRole('menuitemradio', { name: PACK_LABEL });
    await option.scrollIntoViewIfNeeded();
    const thumb = option.getByTestId('visit-mascot-thumb');
    await expect(thumb).toBeVisible();
    await expect(thumb).toHaveAttribute(
      'src',
      `/api/visit/mascot-packs/${packId}/assets/_vignette.png`,
    );
    // L'image est réellement servie et décodée, à sa taille de case.
    await expect
      .poll(async () => thumb.evaluate((img) => img.complete && img.naturalWidth > 0))
      .toBe(true);
    const natural = await thumb.evaluate((img) => Math.max(img.naturalWidth, img.naturalHeight));
    expect(natural).toBeLessThanOrEqual(96);
    const box = await thumb.boundingBox();
    expect(Math.round(box.width)).toBe(32);
    expect(Math.round(box.height)).toBe(32);

    // Chaque ligne a son visuel (vignette ou silhouette de repli), jamais une case vide.
    const rows = menu.getByRole('menuitemradio');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      await expect(rows.nth(i).locator('.visit-mascot-picker__thumb :is(img, svg)')).toHaveCount(1);
    }

    // Les seules images du menu sont des vignettes : aucune planche de sprites pour la liste.
    const sources = await menu
      .locator('img')
      .evaluateAll((imgs) => imgs.map((img) => new URL(img.src).pathname));
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((pathname) => pathname.endsWith('/_vignette.png'))).toBe(true);
  });
});
