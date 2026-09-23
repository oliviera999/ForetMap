'use strict';

/**
 * Périmètre de `GET /api/settings/public` **par produit** — lot K de
 * `docs/AUDIT_SECURITE_2026-09-22.md` (constat **S10**).
 *
 * Le constat : 95 clés étaient déclarées `scope: 'public'` et servies **identiques à tous les
 * hosts**, sans authentification. Aucun secret n'y transitait, mais l'ensemble composait une
 * carte de reconnaissance gratuite — au premier rang de laquelle `ui.staff_plan.access_mode`,
 * qui apprenait à n'importe quel visiteur de `foretmap.*` que la surface des personnels
 * **existe** et dans quel état elle est. Une surface qu'on n'a pas encore ouverte n'a pas à
 * s'annoncer.
 *
 * Le correctif ne retire rien du registre : il borne ce que **chaque produit** reçoit à ce que
 * son front lit réellement. Les lectures serveur (`getSettingValue`) ne passent pas par ici et
 * ne sont donc pas touchées — le plan continue de lire `ui.plan.map_id` pour se construire.
 *
 * Comment la liste a été établie, et comment la tenir à jour : en partant des **valeurs par
 * défaut du front** (`src/utils/appPublicSettings.js`), qui énumèrent exactement les sections
 * qu'il fusionne, plus les sections enrichies à la volée (`content.help.registry`,
 * `content.tour.registry`, `visit.mascot.dialog`). Une section ajoutée au front sans être
 * ajoutée ici arriverait vide côté client : c'est un oubli visible, pas une panne silencieuse.
 *
 * À noter : les fronts du plan et du plan personnels **n'appellent pas** cette route (ils
 * lisent `/api/plan/content` et `/api/staff-plan/content`, qui portent leur propre garde). Leur
 * périmètre est donc réduit à leur propre espace de noms, par principe plutôt que par besoin.
 */

/**
 * Chemins autorisés par produit, en notation pointée sur l'objet **imbriqué** rendu par
 * `getSettings('public')`. Un chemin autorise tout ce qu'il contient.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
const PUBLIC_SETTINGS_SCOPES = Object.freeze({
  // ForêtMap : tout ce que le shell fusionne — c'est-à-dire tout, **sauf** les deux espaces
  // de noms des surfaces de plan, qu'il ne lit nulle part (les panneaux d'administration, eux,
  // passent par `/api/settings/admin`, qui demande `admin.settings.read`).
  foret: Object.freeze([
    'ui.auth',
    'ui.map',
    'ui.foret',
    'ui.visit',
    'ui.modules',
    'ui.biodiv',
    'ui.help',
    'ui.reactions',
    'content',
    'runtime',
    'visit',
    'realtime',
  ]),
  // GL ne lit que les réglages de rendu de carte (ratio repères/plateau, partagé avec
  // ForêtMap) — cf. `src/gl/context/GlMapOverlaySettingsContext.jsx`.
  gl: Object.freeze(['ui.map', 'content.brand', 'runtime', 'realtime']),
  plan: Object.freeze(['ui.plan', 'content.brand', 'realtime']),
  staff: Object.freeze(['ui.staff_plan', 'content.brand', 'realtime']),
});

/** Produit de repli si le host n'en désigne aucun. */
const DEFAULT_SCOPE_PRODUCT = 'foret';

/**
 * Sous-arbre de `nested` réduit aux chemins autorisés.
 *
 * Un nœud est conservé si son chemin **est** un chemin autorisé, ou s'il en contient un : le
 * préfixe `ui.map` garde tout `ui.map`, et `content` garde tout `content.*`. Rien n'est
 * recopié en profondeur au-delà du nœud retenu — la charge rendue est un extrait de l'objet
 * d'origine, pas une copie.
 *
 * @param {object} nested réglages imbriqués (`getSettings('public').nested`).
 * @param {readonly string[]} allowed chemins pointés autorisés.
 * @returns {object}
 */
function pickAllowedPaths(nested, allowed) {
  const out = {};
  if (!nested || typeof nested !== 'object') return out;
  for (const path of allowed) {
    const parts = String(path || '')
      .split('.')
      .filter(Boolean);
    if (!parts.length) continue;
    let source = nested;
    let missing = false;
    for (const part of parts) {
      if (!source || typeof source !== 'object' || !(part in source)) {
        missing = true;
        break;
      }
      source = source[part];
    }
    if (missing) continue;
    let target = out;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (!target[part] || typeof target[part] !== 'object') target[part] = {};
      target = target[part];
    }
    target[parts[parts.length - 1]] = source;
  }
  return out;
}

/**
 * Réglages publics servis à un produit donné.
 *
 * Un produit inconnu retombe sur le périmètre de ForêtMap : c'est déjà le repli du registre
 * (`lib/products.js`), et une liste absente ne doit pas se traduire par un écran vide.
 *
 * @param {object} nested réglages imbriqués complets.
 * @param {string} productId identifiant de produit résolu par le host.
 * @returns {object}
 */
function scopePublicSettings(nested, productId) {
  const key = String(productId || '')
    .trim()
    .toLowerCase();
  const allowed = PUBLIC_SETTINGS_SCOPES[key] || PUBLIC_SETTINGS_SCOPES[DEFAULT_SCOPE_PRODUCT];
  return pickAllowedPaths(nested, allowed);
}

module.exports = {
  PUBLIC_SETTINGS_SCOPES,
  DEFAULT_SCOPE_PRODUCT,
  pickAllowedPaths,
  scopePublicSettings,
};
