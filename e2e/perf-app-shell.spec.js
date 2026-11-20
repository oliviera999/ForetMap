const { test, expect } = require('@playwright/test');

/**
 * Lot 2 du chantier UI/UX (audit du 19/11/2026, U1 et U2).
 *
 * 1. Coquille d'application : à cache chaud, la carte de connexion s'affiche en moins d'une
 *    seconde sur un réseau lent simulé (profil « Slow 4G » des DevTools). Avant le lot, le HTML
 *    attendait le réseau jusqu'au délai du service worker (4 s) alors qu'une copie était en cache.
 * 2. Redémarrage du serveur : l'API répond par la page HTML d'une passerelle ; le public non
 *    connecté ne voit jamais d'écran blanc, ni compteur de tentatives, ni « contactez
 *    l'administrateur ».
 *
 * Scénarios Chromium : émulation réseau par le protocole DevTools.
 */

/** Profil « Slow 4G » des DevTools (latence ×3,75, débit ×0,9 de la mesure Lighthouse). */
const SLOW_4G = Object.freeze({
  offline: false,
  latency: 562.5,
  downloadThroughput: (1.6 * 1024 * 1024 * 0.9) / 8,
  uploadThroughput: (750 * 1024 * 0.9) / 8,
});

/** Lenteur prêtée au serveur pendant la mesure (ms) : au-delà du seuil d'une seconde. */
const SLOW_SERVER_DELAY_MS = 3000;

const PUBLIC_RESTART_MESSAGE = 'Le site redémarre, il revient dans un instant.';

async function waitForLoginCard(page) {
  await expect(page.getByRole('button', { name: 'Connexion', exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('coquille d’application (service worker)', () => {
  test.use({ serviceWorkers: 'allow' });

  test('cache chaud, Slow 4G : la carte de connexion s’affiche en moins d’une seconde', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Émulation réseau DevTools : Chromium seulement');
    test.setTimeout(120_000);

    // Premier passage, réseau normal : installation du service worker et précache.
    await page.goto('/');
    await waitForLoginCard(page);
    await page.waitForFunction(
      async () => {
        if (!('serviceWorker' in navigator)) return false;
        await navigator.serviceWorker.ready;
        return !!navigator.serviceWorker.controller;
      },
      null,
      { timeout: 30_000 },
    );

    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    // L'émulation DevTools ne ralentit pas les requêtes émises par le service worker, et le
    // serveur local répond en quelques millisecondes : on lui prête la lenteur mesurée en prod
    // (TTFB de 4 s à cache chaud) en retenant au niveau du contexte toute requête qui part
    // vraiment sur le réseau. Une page servie depuis la coquille ne passe pas par là.
    await context.route('**/*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, SLOW_SERVER_DELAY_MS));
      await route.continue();
    });

    // Mesure côté navigateur : du début de la navigation à la carte visible.
    await page.reload({ waitUntil: 'commit' });
    await waitForLoginCard(page);
    const timing = await page.evaluate(() => {
      const [nav] = performance.getEntriesByType('navigation');
      const paint = performance.getEntriesByName('first-contentful-paint')[0];
      return {
        ttfb: nav ? nav.responseStart - nav.startTime : null,
        fcp: paint ? paint.startTime : null,
        visibleAt: performance.now(),
      };
    });
    console.log('[perf-app-shell] cache chaud, Slow 4G :', JSON.stringify(timing));
    expect(timing.ttfb, 'HTML servi depuis la coquille, sans attendre le réseau').toBeLessThan(300);
    expect(timing.visibleAt, 'carte de connexion visible').toBeLessThan(1000);
    await context.unroute('**/*');
    await cdp.detach();
  });
});

test.describe('redémarrage du serveur (public non connecté)', () => {
  test('API coupée : page lisible, phrase simple, ni compteur ni administrateur', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await waitForLoginCard(page);

    // La passerelle répond pendant le redémarrage : page HTML en 503.
    await page.route('**/api/**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'text/html',
        body: '<html><body><h1>Service Unavailable</h1></body></html>',
      }),
    );

    // Rechargement pendant la coupure : jamais d'écran blanc.
    await page.reload();
    await waitForLoginCard(page);
    const visibleText = await page.locator('#root').innerText();
    expect(visibleText.trim().length).toBeGreaterThan(20);

    // Le bandeau de reconnexion, s'il paraît, parle au public sans compteur.
    const sticky = page.locator('.app-status-sticky');
    if (await sticky.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await expect(sticky).toContainText(PUBLIC_RESTART_MESSAGE);
      await expect(sticky).not.toContainText(/tentative/i);
    }
    await expect(page.getByText(/contactez l.administrateur/i)).toHaveCount(0);
    await expect(page.getByText(/tentative \d+\/\d+/)).toHaveCount(0);

    // Retour du serveur : l'écran reste utilisable.
    await page.unroute('**/api/**');
    await waitForLoginCard(page);
  });
});
