#!/usr/bin/env node
/**
 * Régénère les captures d'écran du manifeste PWA (`public/pwa-screenshot-*.png`), affichées
 * par Chrome/Edge dans la fenêtre d'installation enrichie.
 *
 * Deux vues possibles :
 *   - `carte` (défaut si un compte est configuré) : l'onglet Carte d'un compte connecté, sur le
 *     plan de la forêt. Compte lu dans `PWA_SCREENSHOT_IDENTIFIER` / `PWA_SCREENSHOT_PASSWORD`
 *     (`.env`, jamais versionné) ; préférer un compte élève de démonstration.
 *   - `visite` : la visite publique (« Visiter sans compte »), sans compte.
 *
 * Ces images sont servies publiquement : le nom et l'avatar du compte sont remplacés par un
 * libellé neutre avant la prise de vue, et une base de test (zones « e2e », « API ») n'a rien à
 * y faire — viser la production, en lecture seule.
 *
 * Usage :
 *   npm run pwa:screenshots
 *   npm run pwa:screenshots -- --vue visite --map sablettes
 *   npm run pwa:screenshots -- --base-url http://127.0.0.1:3000
 *
 * Les dimensions sont celles déclarées dans `public/manifest.json` : un écart entre le fichier
 * et `sizes` fait ignorer la capture par le navigateur.
 */
'use strict';

require('dotenv').config();
const path = require('path');
const { chromium } = require('@playwright/test');

const DEFAULT_BASE_URL = 'https://foretmap.olution.info';
/** Plan de travail photographié en vue `carte`. */
const DEFAULT_WORK_MAP_ID = 'foret';
/** Plan public qui porte des lieux en visite anonyme ; la forêt est réservée aux comptes. */
const DEFAULT_VISIT_MAP_ID = 'sablettes';
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const TMP_DIR = path.resolve(__dirname, '..', 'tmp');
const NEUTRAL_USER_LABEL = 'Élève';

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

function parseArgs(argv, env = process.env) {
  const identifier = String(env.PWA_SCREENSHOT_IDENTIFIER || '').trim();
  const password = String(env.PWA_SCREENSHOT_PASSWORD || '');
  const args = {
    baseUrl: env.PWA_SCREENSHOT_BASE_URL || DEFAULT_BASE_URL,
    view: identifier && password ? 'carte' : 'visite',
    mapId: env.PWA_SCREENSHOT_MAP_ID || '',
    identifier,
    password,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base-url' && argv[i + 1]) {
      args.baseUrl = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--map' && argv[i + 1]) {
      args.mapId = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--vue' && argv[i + 1]) {
      args.view = argv[i + 1];
      i += 1;
    }
  }
  if (args.view !== 'carte' && args.view !== 'visite') {
    throw new Error(`vue inconnue « ${args.view} » (attendu : carte ou visite)`);
  }
  if (args.view === 'carte' && !(args.identifier && args.password)) {
    throw new Error(
      'la vue carte demande un compte : renseigner PWA_SCREENSHOT_IDENTIFIER et PWA_SCREENSHOT_PASSWORD dans .env',
    );
  }
  if (!args.mapId) args.mapId = args.view === 'carte' ? DEFAULT_WORK_MAP_ID : DEFAULT_VISIT_MAP_ID;
  args.baseUrl = String(args.baseUrl).replace(/\/+$/, '');
  return args;
}

async function assertNoOverlay(page) {
  const overlay = page.locator(
    '.visit-mascot-onboarding, .discovery-tour, .profile-promo-card, [role="dialog"]',
  );
  if (
    await overlay
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    throw new Error('une fenêtre recouvre la carte (accueil, visite guidée ou modale)');
  }
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.evaluate(() => globalThis.document.fonts?.ready);
  // Laisse la mascotte et les transitions de zones se poser avant la prise de vue.
  await page.waitForTimeout(1500);
}

async function enterGuestVisit(page) {
  const guestCta = page.getByRole('button', { name: /Visiter sans compte/i });
  await guestCta.waitFor({ state: 'visible', timeout: 60_000 });
  await guestCta.click();

  await page.locator('.visit-view--guest-public').waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('img.visit-map-img').first().waitFor({ state: 'visible', timeout: 60_000 });
  await settle(page);
  await assertNoOverlay(page);
}

async function dismissPromotionIfPresent(page) {
  const cta = page.locator('.profile-promo-card__cta');
  if (await cta.isVisible({ timeout: 1500 }).catch(() => false)) {
    await cta.click();
    await cta.waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  }
}

async function enterWorkMap(page, { identifier, password }) {
  await page.getByLabel('Identifiant (pseudo ou email)').fill(identifier);
  await page.getByLabel('Mot de passe').fill(password);
  const loginResp = page.waitForResponse(
    (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
    { timeout: 60_000 },
  );
  await page.getByRole('button', { name: 'Se connecter' }).click();
  const resp = await loginResp;
  if (!resp.ok()) throw new Error(`connexion refusée (HTTP ${resp.status()})`);
  await page
    .getByRole('button', { name: /Déconnexion/ })
    .waitFor({ state: 'visible', timeout: 60_000 });
  await dismissPromotionIfPresent(page);

  const mapTab = page
    .locator('nav.bottom-nav, .top-tabs')
    .getByRole('button', { name: /^Carte/ })
    .first();
  if (await mapTab.isVisible({ timeout: 5000 }).catch(() => false)) await mapTab.click();

  await page
    .locator('.map-view-stage, .map-view-canvas')
    .first()
    .waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('img[alt^="Plan "]').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('.map-zone-hit').first().waitFor({ state: 'attached', timeout: 30_000 });
  await settle(page);
  await dismissPromotionIfPresent(page);
  await assertNoOverlay(page);
}

/** Remplace l'identité du compte (nom, avatar) par un libellé neutre dans l'en-tête. */
async function anonymizeHeader(page) {
  await page.evaluate((label) => {
    const doc = globalThis.document;
    for (const el of doc.querySelectorAll('.user-badge-text')) el.textContent = label;
    for (const badge of doc.querySelectorAll('.user-badge')) {
      for (const img of badge.querySelectorAll('img')) img.style.visibility = 'hidden';
    }
  }, NEUTRAL_USER_LABEL);
}

async function captureTarget(browser, args, target) {
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
    { map: args.mapId, tabKeys: DISCOVERY_TOUR_TAB_KEYS },
  );
  try {
    const page = await context.newPage();
    await page.goto(`${args.baseUrl}/`, { waitUntil: 'domcontentloaded' });
    try {
      if (args.view === 'carte') {
        await enterWorkMap(page, args);
        await anonymizeHeader(page);
      } else {
        await enterGuestVisit(page);
      }
    } catch (error) {
      const debugPath = path.join(TMP_DIR, `pwa-screenshot-echec-${target.file}`);
      await anonymizeHeader(page).catch(() => {});
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
  console.log(
    `[pwa:screenshots] cible : ${args.baseUrl} — vue ${args.view}, plan « ${args.mapId} »`,
  );
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
