#!/usr/bin/env node
/**
 * Régénère les captures d'écran du manifeste PWA (`public/pwa-screenshot-*.png`), affichées
 * par Chrome/Edge dans la fenêtre d'installation enrichie.
 *
 * Écran photographié : la visite publique (« Visiter sans compte »). C'est la seule vue qui
 * montre la vraie carte sans compte ni donnée nominative — aucune capture ne doit exposer un
 * nom d'élève, puisque ces images sont servies publiquement.
 *
 * Usage :
 *   npm run pwa:screenshots                                  (production, lecture seule)
 *   npm run pwa:screenshots -- --base-url http://127.0.0.1:3000
 *
 * Les dimensions sont celles déclarées dans `public/manifest.json` : un écart entre le fichier
 * et `sizes` fait ignorer la capture par le navigateur.
 */
'use strict';

const path = require('path');
const { chromium } = require('@playwright/test');

const DEFAULT_BASE_URL = 'https://foretmap.olution.info';
/** Plan public qui porte des zones en visite anonyme ; la carte de la forêt est réservée aux comptes. */
const DEFAULT_MAP_ID = 'sablettes';
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

/**
 * Stockage local posé avant le chargement : plan affiché (`src/utils/lastViewedMap.js`),
 * mascotte invitée déjà confirmée (`src/constants/app-runtime.js`) et visites guidées déjà
 * vues — sinon une fenêtre d'accueil recouvre la carte au moment de la prise de vue.
 */
const DISCOVERY_TOUR_TAB_KEYS = [
  'welcome',
  'map',
  'tasks',
  'plants',
  'visit',
  'stats',
  'quiz',
  'glossary',
  'foodweb',
  'notebook',
  'forum',
  'tuto',
  'profiles',
  'settings',
];

const TARGETS = Object.freeze([
  {
    file: 'pwa-screenshot-mobile.png',
    viewport: { width: 720, height: 1280 },
    isMobile: true,
  },
  {
    file: 'pwa-screenshot-wide.png',
    viewport: { width: 1280, height: 720 },
    isMobile: false,
  },
]);

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.PWA_SCREENSHOT_BASE_URL || DEFAULT_BASE_URL,
    mapId: process.env.PWA_SCREENSHOT_MAP_ID || DEFAULT_MAP_ID,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base-url' && argv[i + 1]) {
      args.baseUrl = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--map' && argv[i + 1]) {
      args.mapId = argv[i + 1];
      i += 1;
    }
  }
  args.baseUrl = String(args.baseUrl).replace(/\/+$/, '');
  return args;
}

async function enterGuestVisit(page) {
  const guestCta = page.getByRole('button', { name: /Visiter sans compte/i });
  await guestCta.waitFor({ state: 'visible', timeout: 60_000 });
  await guestCta.click();

  await page.locator('.visit-view--guest-public').waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('img.visit-map-img').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  const overlay = page.locator('.visit-mascot-onboarding, .discovery-tour');
  if (
    await overlay
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    throw new Error('une fenêtre recouvre la carte (onboarding mascotte ou visite guidée)');
  }
  await page.evaluate(() => globalThis.document.fonts?.ready);
  // Laisse la mascotte et les transitions de zones se poser avant la prise de vue.
  await page.waitForTimeout(1500);
}

async function captureTarget(browser, { baseUrl, mapId }, target) {
  const context = await browser.newContext({
    viewport: target.viewport,
    deviceScaleFactor: 1,
    isMobile: target.isMobile,
    hasTouch: target.isMobile,
    locale: 'fr-FR',
    serviceWorkers: 'block',
  });
  await context.addInitScript(
    ({ map, tabKeys }) => {
      const seen = {};
      for (const key of tabKeys) seen[key] = true;
      localStorage.setItem('foretmap_active_map', map);
      localStorage.setItem('foretmap_visit_guest_mascot_confirmed_v1', '1');
      localStorage.setItem('foretmap_discovery_seen_v1', JSON.stringify(seen));
    },
    { map: mapId, tabKeys: DISCOVERY_TOUR_TAB_KEYS },
  );
  try {
    const page = await context.newPage();
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    try {
      await enterGuestVisit(page);
    } catch (error) {
      const debugPath = path.resolve(__dirname, '..', 'tmp', `pwa-screenshot-echec-${target.file}`);
      await page.screenshot({ path: debugPath }).catch(() => {});
      throw new Error(`${error.message}\n  état de la page : ${debugPath}`);
    }
    const output = path.join(PUBLIC_DIR, target.file);
    await page.screenshot({ path: output, fullPage: false });
    return output;
  } finally {
    await context.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[pwa:screenshots] cible : ${args.baseUrl} (plan « ${args.mapId} »)`);
  const browser = await chromium.launch();
  try {
    for (const target of TARGETS) {
      const output = await captureTarget(browser, args, target);
      console.log(
        `[pwa:screenshots] ${target.viewport.width}x${target.viewport.height} → ${path.relative(process.cwd(), output)}`,
      );
    }
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[pwa:screenshots] échec : ${error.message}`);
    process.exit(1);
  });
}

module.exports = { TARGETS, parseArgs };
