'use strict';

/**
 * Politique de sécurité du contenu (CSP).
 *
 * ## Historique
 *
 * `server.js` ne posait qu'un `img-src` ; l'audit du 26/08 (§2.5) recommandait de **mesurer
 * avant d'appliquer**. La politique complète a donc d'abord été envoyée en
 * `Content-Security-Policy-Report-Only`. L'audit RGPD du 28/09/2026 (constat S-5 : jeton de
 * session lisible par un script injecté) l'a fait passer en politique **imposée**, après
 * retrait du dernier script inline du build (la marque est désormais une constante du bundle,
 * cf. `vite.config.js`).
 *
 * ## Comment chaque directive a été établie
 *
 * Par inspection du build et du code, pas par recopie d'un modèle :
 *
 * - `script-src 'self' 'wasm-unsafe-eval'` — le HTML construit ne contient **aucun script inline**
 *   (`dist/index.vite.html`, `dist/gl.html`, `dist/plan.html`). `'wasm-unsafe-eval'` est requis
 *   par Rive, qui compile du WebAssembly ; son runtime est servi **depuis notre origine**
 *   (`src/utils/riveRuntime.js`).
 * - `style-src 'unsafe-inline'` — inévitable : React pose des styles par attribut. C'est la
 *   concession assumée de cette politique ; elle n'affaiblit pas la protection principale, qui
 *   est `script-src`. Les domaines Google Fonts n'y figurent qu'en mode `external` du réglage
 *   `privacy.external_assets_mode`.
 * - `img-src` — en mode `local` pour `foret` / `plan` / `staff` / `enov` : `'self' data: blob:`
 *   (images tierces via le relais `/api/media/remote`). En mode `external`, ou pour le produit
 *   `gl` (avatars DiceBear) : conserve `https:`.
 * - `frame-src` — `'self' https:` pour `foret` (tutoriels-lien, protégés par la façade lot C) ;
 *   `'self'` pour les plans ; inchangé pour `gl`.
 * - `connect-src 'self'` — Socket.IO se connecte à la même origine (`ws://`/`wss://` de même
 *   origine correspondent à `'self'`). Le service worker ne relaie que les requêtes de même
 *   origine pour la même raison.
 * - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'`.
 *
 * ## Exceptions par route
 *
 * - Vue HTML d'un tutoriel : deux petits scripts constants injectés par le serveur (liens dans
 *   l'iframe, auto-liens du glossaire) sont autorisés **par empreinte sha256** — un script
 *   présent dans le contenu du tutoriel reste bloqué (il est de toute façon retiré par
 *   l'assainissement).
 * - Introduction GL (`/gl/intro/`) : page statique versionnée, écrite avec des scripts inline ;
 *   elle reçoit `'unsafe-inline'` pour les scripts, et seulement elle.
 */

const crypto = require('crypto');
const { TUTORIAL_VIEW_IFRAME_LINK_SCRIPT_BODY } = require('./tutorialRouteHelpers');
const { GLOSSARY_AUTOLINK_SCRIPT_BODY } = require('./foretmapGlossaryAutolink');

/** Chemin du collecteur de signalements (même origine, sans authentification). */
const CSP_REPORT_PATH = '/api/csp-report';

/** Préfixe de la page d'introduction GL (scripts inline, cf. en-tête). */
const GL_INTRO_PATH_PREFIX = '/gl/intro/';

const TUTORIAL_VIEW_PATH_RE = /^\/api\/tutorials\/[^/]+\/view\/?$/;

const PRODUCT_IDS_WITH_TIGHT_IMG = Object.freeze(['foret', 'plan', 'staff', 'enov']);

/**
 * Empreinte CSP d'un script inline : sha256 du contenu exact de la balise, en base64.
 * @param {string} body
 * @returns {string}
 */
function inlineScriptHash(body) {
  return `'sha256-${crypto.createHash('sha256').update(String(body), 'utf8').digest('base64')}'`;
}

const TUTORIAL_VIEW_SCRIPT_HASHES = Object.freeze([
  inlineScriptHash(TUTORIAL_VIEW_IFRAME_LINK_SCRIPT_BODY),
  inlineScriptHash(GLOSSARY_AUTOLINK_SCRIPT_BODY),
]);

function normalizeMode(externalAssetsMode) {
  return externalAssetsMode === 'external' ? 'external' : 'local';
}

function normalizeProduct(productId) {
  const id = String(productId || 'foret').trim();
  return id || 'foret';
}

/**
 * Politique complète.
 * @param {{ reportPath?: string, externalAssetsMode?: string, productId?: string, scriptSrc?: string[] }} [options]
 * @returns {string}
 */
function buildPolicy({
  reportPath = CSP_REPORT_PATH,
  externalAssetsMode = 'local',
  productId = 'foret',
  scriptSrc = [],
} = {}) {
  const external = normalizeMode(externalAssetsMode) === 'external';
  const product = normalizeProduct(productId);
  const tightImg = !external && product !== 'gl' && PRODUCT_IDS_WITH_TIGHT_IMG.includes(product);
  const imgSrc = tightImg ? "img-src 'self' data: blob:" : "img-src 'self' https: data: blob:";
  let frameSrc = "frame-src 'self' https:";
  if (product === 'plan' || product === 'staff' || product === 'enov') {
    frameSrc = "frame-src 'self'";
  }
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    ["script-src 'self' 'wasm-unsafe-eval'", ...scriptSrc].join(' '),
    external
      ? "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"
      : "style-src 'self' 'unsafe-inline'",
    external ? "font-src 'self' https://fonts.gstatic.com data:" : "font-src 'self' data:",
    imgSrc,
    "media-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    frameSrc,
    `report-uri ${reportPath}`,
  ].join('; ');
}

/** Politique **imposée** par défaut. */
function buildEnforcedPolicy(options = {}) {
  return buildPolicy({ ...options, scriptSrc: [] });
}

/** Vue HTML d'un tutoriel : scripts serveur autorisés par empreinte. */
function buildTutorialViewPolicy(options = {}) {
  return buildPolicy({ ...options, scriptSrc: [...TUTORIAL_VIEW_SCRIPT_HASHES] });
}

/** Page d'introduction GL : scripts inline de la page statique. */
function buildGlIntroPolicy(options = {}) {
  return buildPolicy({ ...options, scriptSrc: ["'unsafe-inline'"] });
}

/**
 * Choisit la politique d'une requête selon son chemin.
 * @param {string} pathname
 * @returns {'default'|'tutorialView'|'glIntro'}
 */
function resolveCspVariant(pathname) {
  const p = String(pathname || '');
  if (TUTORIAL_VIEW_PATH_RE.test(p)) return 'tutorialView';
  if (p.startsWith(GL_INTRO_PATH_PREFIX)) return 'glIntro';
  return 'default';
}

/**
 * Pré-calcule toutes les politiques (produit × mode × variante).
 * @param {{ reportPath?: string }} [options]
 */
function buildPolicyTable({ reportPath = CSP_REPORT_PATH } = {}) {
  const products = ['foret', 'gl', 'plan', 'staff', 'enov'];
  const table = {};
  for (const productId of products) {
    table[productId] = {};
    for (const mode of ['local', 'external']) {
      const opts = { reportPath, externalAssetsMode: mode, productId };
      table[productId][mode] = {
        default: buildEnforcedPolicy(opts),
        tutorialView: buildTutorialViewPolicy(opts),
        glIntro: buildGlIntroPolicy(opts),
      };
    }
  }
  return table;
}

module.exports = {
  CSP_REPORT_PATH,
  GL_INTRO_PATH_PREFIX,
  TUTORIAL_VIEW_SCRIPT_HASHES,
  inlineScriptHash,
  buildEnforcedPolicy,
  buildTutorialViewPolicy,
  buildGlIntroPolicy,
  resolveCspVariant,
  buildPolicyTable,
};
