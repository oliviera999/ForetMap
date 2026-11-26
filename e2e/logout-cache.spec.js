const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

/**
 * Lot A — à la déconnexion, les copies d'API cloisonnées (`__fm_sw_user`) quittent le
 * Cache Storage, et `POST /api/auth/logout` porte `Clear-Site-Data`. L'application reste
 * ouvrable hors ligne (écran de connexion).
 */

test.describe('Déconnexion : purge cache SW + Clear-Site-Data', () => {
  test('élève : plus de __fm_sw_user après déconnexion ; hors ligne = connexion', async ({
    page,
    context,
  }) => {
    let logoutClearSiteData = null;
    page.on('response', (res) => {
      if (res.url().includes('/api/auth/logout') && res.request().method() === 'POST') {
        logoutClearSiteData = res.headers()['clear-site-data'] || null;
      }
    });

    await loginAsNewStudent(page);
    await expect(page.locator('header')).toBeVisible();

    // Ouvre les tâches pour que le SW mette éventuellement /api/tasks en cache.
    const tasksTab = page
      .getByRole('button', { name: /^Tâches$/i })
      .or(page.getByRole('tab', { name: /Tâches/i }));
    if (
      await tasksTab
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await tasksTab.first().click();
      await page.waitForTimeout(1500);
    }

    // Force une entrée cloisonnée + une copie terrain si le SW n'a pas encore écrit (CI / timing).
    await page.evaluate(async () => {
      if (!('caches' in window)) return;
      const cache = await caches.open('e2e-logout-probe');
      await cache.put(
        'https://example.invalid/api/tasks?__fm_sw_user=e2eprobe',
        new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
      );
      const terrain = await caches.open('e2e-logout-probe-terrain');
      await terrain.put(
        'https://example.invalid/uploads/maps/foret.jpg',
        new Response('x', { headers: { 'Content-Type': 'image/jpeg' } }),
      );
    });

    await page.getByRole('button', { name: /Déconnexion/ }).click();
    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible().catch(() => false)) {
      await dialog.getByRole('button', { name: 'Se déconnecter' }).click();
    }

    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('foretmap_session')))
      .toBeNull();

    const remaining = await page.evaluate(async () => {
      if (!('caches' in window)) return { userHits: [], terrainCaches: [] };
      const userHits = [];
      const terrainCaches = [];
      for (const name of await caches.keys()) {
        if (/-terrain$/.test(name)) terrainCaches.push(name);
        const cache = await caches.open(name);
        for (const req of await cache.keys()) {
          if (String(req.url).includes('__fm_sw_user')) userHits.push(req.url);
        }
      }
      return { userHits, terrainCaches };
    });
    expect(remaining.userHits).toEqual([]);
    expect(remaining.terrainCaches).toEqual([]);

    expect(logoutClearSiteData).toBeTruthy();
    expect(String(logoutClearSiteData)).toMatch(/cache/i);
    expect(String(logoutClearSiteData)).not.toMatch(/cookies/i);

    // Hors ligne : la coquille (précache) doit encore servir l'écran de connexion.
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await expect(page.getByRole('button', { name: /Connexion|Se connecter/i }).first()).toBeVisible(
      { timeout: 15000 },
    );
  });
});
