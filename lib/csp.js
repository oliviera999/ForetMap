'use strict';

/**
 * Politique de sécurité du contenu (CSP).
 *
 * ## Où on en était
 *
 * `server.js` ne posait qu'un `img-src`, et la CSP de helmet est désactivée : il n'y avait donc
 * **ni `default-src`, ni `script-src`** — aucune atténuation d'XSS sur l'application. L'audit du
 * 26/08 (§2.5) le signalait en recommandant de **mesurer avant d'appliquer**, parce qu'une CSP
 * trop stricte posée d'un coup casse l'application en silence côté navigateur, sans qu'aucun test
 * serveur ne s'en aperçoive.
 *
 * ## Ce que fait ce module
 *
 * Il construit **deux** politiques :
 *
 * - `buildEnforcedPolicy()` — ce qui est réellement imposé aujourd'hui : le `img-src` historique,
 *   **inchangé**. Ce lot ne durcit rien : il mesure.
 * - `buildReportOnlyPolicy()` — la politique complète *candidate*, envoyée en
 *   `Content-Security-Policy-Report-Only`. Le navigateur ne bloque rien ; il **signale** ce qui
 *   serait bloqué. C'est la donnée qui manquait pour décider.
 *
 * ## Comment chaque directive a été établie
 *
 * Par inspection du build et du code, pas par recopie d'un modèle :
 *
 * - `script-src 'self' 'wasm-unsafe-eval'` — le HTML construit ne contient **aucun script inline**
 *   (vérifié sur `dist/index.vite.html` et `dist/gl.html`). `'wasm-unsafe-eval'` est requis par
 *   Rive, qui compile du WebAssembly ; son runtime est servi **depuis notre origine**
 *   (`src/utils/riveRuntime.js` remplace les URL unpkg/jsdelivr par défaut), donc aucun CDN
 *   tiers n'est nécessaire.
 * - `style-src 'unsafe-inline'` — inévitable : React pose des styles par attribut, et la feuille
 *   Google Fonts est chargée par `<link>`. C'est la concession assumée de cette politique ; elle
 *   n'affaiblit pas la protection principale, qui est `script-src`.
 * - `img-src 'self' https: data: blob:` — repris tel quel du réglage imposé (photos d'espèces
 *   hébergées ailleurs, images en base64, aperçus locaux).
 * - `frame-src 'self' https:` — un tutoriel de type « lien » embarque une **URL externe saisie par
 *   un professeur** (`TutorialPreviewModal`, `tutorial.source_url`). Restreindre à `'self'`
 *   casserait cette fonctionnalité ; l'`iframe` est déjà `sandbox`é côté composant.
 * - `connect-src 'self'` — Socket.IO se connecte à la même origine, et la spécification fait
 *   correspondre `ws://`/`wss://` de même origine à `'self'`. Si des signalements apparaissent
 *   ici, c'est précisément ce que la mesure doit révéler.
 * - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'` — pas
 *   de plugin, pas de réécriture de base, pas d'envoi de formulaire ailleurs, pas d'enchâssement
 *   par un tiers (`X-Frame-Options: SAMEORIGIN` dit déjà la même chose, helmet le pose).
 *
 * ## Ensuite
 *
 * Quand les signalements se taisent en usage réel, la politique candidate devient la politique
 * imposée : il suffit d'échanger les deux en-têtes. Tant qu'ils parlent, c'est qu'elle n'est pas
 * prête — et on saura exactement ce qui manque.
 */

/** Chemin du collecteur de signalements (même origine, sans authentification). */
const CSP_REPORT_PATH = '/api/csp-report';

/** Politique **imposée** — identique à l'historique. Ce lot ne durcit rien. */
function buildEnforcedPolicy() {
  return "img-src 'self' https: data: blob:;";
}

/** Politique **candidate**, envoyée en Report-Only : elle signale, elle ne bloque pas. */
function buildReportOnlyPolicy({ reportPath = CSP_REPORT_PATH } = {}) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' https: data: blob:",
    "media-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self' https:",
    `report-uri ${reportPath}`,
  ].join('; ');
}

module.exports = {
  CSP_REPORT_PATH,
  buildEnforcedPolicy,
  buildReportOnlyPolicy,
};
