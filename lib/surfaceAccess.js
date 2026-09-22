'use strict';

/**
 * Garde de lecture par surface — lots A, B, D et E du plan de correction de
 * `docs/AUDIT_SECURITE_2026-09-22.md` §7.
 *
 * Ce module branche sur les **routes génériques** de lieux (`/api/zones`,
 * `/api/map/markers`, `/api/map-categories`, `/api/maps`) la politique d'accès qui n'existait
 * jusqu'ici que sur les points d'entrée composites de chaque surface (`/api/plan/content`,
 * `/api/staff-plan/content`). C'était tout le constat S1 : fermer le plan par un code fermait
 * la porte d'entrée et laissait les fenêtres ouvertes — `/api/plan/content` rendait `401`
 * pendant que `/api/zones?map_id=lyautey` rendait les 36 zones du lycée.
 *
 * Trois décisions, toutes prises côté serveur :
 *
 * 1. **La surface** (`lib/shared/surfaceCore.js`) — produit résolu par host + état
 *    d'authentification, jamais `?surface=`.
 * 2. **Le laissez-passer** — une surface gardée (`plan`, `staff`) exige le cookie de code ou
 *    le compte, sur ces routes comme sur les composites.
 * 3. **Les cartes** — chaque surface ne sert que les cartes qui y sont **déclarées**. C'est
 *    le point de S1/S4 : jusqu'ici un lecteur anonyme n'était pas « hors périmètre », il était
 *    *non borné* (`lib/shared/mapScopeCore.js`, `canBypassMapScope`), si bien qu'omettre
 *    `?map_id=` rendait les zones des sept cartes.
 *
 * Le périmètre par **groupe** d'un compte (`lib/mapAccess.js`) n'est pas remplacé : il
 * s'ajoute. Une carte doit être à la fois dans la surface et dans le périmètre du lecteur.
 */

const { queryAll } = require('../database');
const { getSettingValue } = require('./settings');
const { loadPlanSettings, allowedPlanMapIds } = require('./planContent');
const { isPlanAccessGranted } = require('./planAccess');
const { resolveStaffPlanViewer } = require('./staffPlanAccess');
const { isVisibleOnSurface, isPublicSurface } = require('./locationSurfaces');
const { isLocationManager } = require('./locationAudience');
const { normalizeHost } = require('./productResolver');
const { DEFAULT_PRODUCT_ID, normalizeProductId, resolveProductIdFromHost } = require('./products');
const {
  normalizeSurface,
  resolveRequestSurface,
  resolveSurfaceFilters,
} = require('./shared/surfaceCore');

/** Réglages portant la carte déclarée de chaque plan (`lib/planContent.js`). */
const PLAN_SURFACE_SETTINGS = Object.freeze({
  plan: Object.freeze({ prefix: 'ui.plan.', accessModes: ['public', 'code'] }),
  staff: Object.freeze({ prefix: 'ui.staff_plan.', accessModes: ['disabled', 'code'] }),
});

/**
 * La surcharge `X-Foretmap-Product` est-elle honorée ?
 *
 * Elle existe pour les tests et l'e2e (`e2e/plan-mobile-shell.spec.js` sert le plan par
 * en-tête). Depuis que la surface est une décision du serveur, l'accepter en production
 * rouvrirait par en-tête ce que le host vient de fermer : un visiteur de `foretmap` se
 * déclarerait `staff`. On la restreint donc au hors-production — et au harnais e2e, qui
 * tourne volontairement en `NODE_ENV=production` sur `dist/` (cf. `playwright.config.js`).
 */
function isProductOverrideAllowed() {
  return process.env.NODE_ENV !== 'production' || process.env.E2E_DISABLE_RATE_LIMIT === '1';
}

/**
 * Produit d'une requête pour les besoins de la **sécurité** : comme
 * `resolveProductFromRequest`, mais la surcharge par en-tête n'est lue que là où elle est
 * permise (voir ci-dessus).
 */
function resolveSecureProductId(req) {
  if (isProductOverrideAllowed()) {
    const override = normalizeProductId(req?.get?.('x-foretmap-product'));
    if (override) return override;
  }
  const host = normalizeHost(req?.hostname || req?.get?.('host') || '');
  return resolveProductIdFromHost(host) || DEFAULT_PRODUCT_ID;
}

/** Surface décidée par le serveur pour cette requête. Exige `authenticate` en amont. */
function resolveSurfaceForRequest(req) {
  return resolveRequestSurface({
    productId: resolveSecureProductId(req),
    authenticated: !!req?.auth,
  });
}

/** Liste d'identifiants séparés par `;` ou `,` (réglages `*_map_ids`). */
function idListFromSetting(value) {
  return String(value ?? '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Cartes déclarées d'un plan gardé (`ui.plan.*` / `ui.staff_plan.*`). */
async function declaredPlanMapIds(surface) {
  const config = PLAN_SURFACE_SETTINGS[normalizeSurface(surface)];
  if (!config) return [];
  return allowedPlanMapIds(await loadPlanSettings(config));
}

/**
 * Cartes servies sur la Visite publique.
 *
 * `ui.visit.selectable_map_ids` fait autorité dès qu'il est renseigné. À défaut — le cas au
 * jour de l'audit — on prend les cartes actives **moins celles déclarées pour les plans
 * gardés**. La règle se dit en une phrase : *une carte réservée à une surface gardée n'est
 * pas servie sur la surface publique tant qu'un administrateur ne l'y a pas explicitement
 * mise*. C'est ce qui ferme `lyautey` (carte de `ui.plan.map_id`) sans rien déclarer à la
 * main, et sans fermer les terrains d'apprentissage — forêt comestible, n³, sites de sortie —
 * qui sont la raison d'être de la Visite.
 *
 * @returns {Promise<string[]>}
 */
async function allowedVisitMapIds() {
  const declared = idListFromSetting(await getSettingValue('ui.visit.selectable_map_ids', ''));
  if (declared.length) return [...new Set(declared)];
  const [rows, planMaps, staffMaps] = await Promise.all([
    queryAll('SELECT id FROM maps WHERE is_active = 1'),
    declaredPlanMapIds('plan'),
    declaredPlanMapIds('staff'),
  ]);
  const reserved = new Set([...planMaps, ...staffMaps].map((id) => String(id)));
  return rows.map((row) => String(row.id)).filter((id) => !reserved.has(id));
}

/**
 * Cartes qu'une surface a le droit de servir.
 * @returns {Promise<string[]|null>} `null` = pas de borne **de surface** (la surface `map`
 *   est bornée par le périmètre de groupe du compte, `lib/mapAccess.js`).
 */
async function allowedMapIdsForSurface(surface) {
  const value = normalizeSurface(surface);
  if (value === 'plan' || value === 'staff') return declaredPlanMapIds(value);
  if (value === 'visit') return allowedVisitMapIds();
  return null;
}

/**
 * Le lecteur peut-il lire les lieux de cette surface ?
 *
 * @returns {Promise<{ ok: true, auth?: object } | { ok: false, status: number, body: object }>}
 *   `auth` est le lecteur **synthétique** d'un porteur de code du plan des personnels
 *   (un rôle, aucune permission) : il sert au filtrage d'audience, jamais à écrire.
 */
async function authorizeSurfaceRead(req, surface) {
  const value = normalizeSurface(surface);
  if (value === 'plan') {
    if (await isPlanAccessGranted(req)) return { ok: true };
    return {
      ok: false,
      status: 401,
      body: { error: 'Code d’accès requis', access_required: true },
    };
  }
  if (value === 'staff') {
    const viewer = await resolveStaffPlanViewer(req);
    if (viewer.ok) return { ok: true, auth: viewer.auth };
    return {
      ok: false,
      status: 401,
      body: {
        error: 'Accès réservé aux personnels',
        access_required: true,
        code_available: !!viewer.codeAvailable,
      },
    };
  }
  return { ok: true };
}

/**
 * Middleware des routes de lieux : décide la surface, exige le laissez-passer qu'elle
 * réclame, et pose `req.locationSurface` pour la route.
 *
 * `req.locationSurface` :
 * - `surface`        — surface décidée par le serveur ;
 * - `allowedMapIds`  — cartes de la surface (`null` = pas de borne de surface) ;
 * - `filters`        — surfaces à vérifier sur chaque ligne (intersection) ;
 * - `publicSurface`  — le lecteur anonyme compte-t-il comme « visiteur » ? ;
 * - `viewerAuth`     — lecteur à passer à `filterLocationsForViewer`.
 *
 * Exige `authenticate` en amont (la surface dépend de `req.auth`).
 */
function withLocationSurface(req, res, next) {
  const surface = resolveSurfaceForRequest(req);
  authorizeSurfaceRead(req, surface)
    .then(async (decision) => {
      if (!decision.ok) return res.status(decision.status).json(decision.body);
      const viewerAuth = decision.auth || req.auth || null;
      // Gestion : seul un gestionnaire de lieux, et seulement sur la surface de travail,
      // lit sans filtre de surface — c'est l'onglet « Lieux », qui doit montrer les lieux
      // masqués pour permettre de les éditer.
      const unfiltered = surface === 'map' && isLocationManager(viewerAuth);
      req.locationSurface = {
        surface,
        allowedMapIds: await allowedMapIdsForSurface(surface),
        filters: resolveSurfaceFilters({ surface, requested: req.query?.surface, unfiltered }),
        publicSurface: isPublicSurface(surface),
        viewerAuth,
      };
      return next();
    })
    .catch(next);
}

/**
 * Croise le périmètre de **surface** avec celui, déjà calculé, du **compte**.
 *
 * @param {object} surfaceScope `req.locationSurface`.
 * @param {string[]|null} accountMapIds périmètre du compte (`resolveScopedMapFilter`).
 * @param {string} requestedMapId `?map_id=` normalisé (`''` si absent).
 * @returns {{ notFound: true } | { notFound: false, mapIds: string[]|null }}
 *   `notFound` : carte hors surface. On répond « Carte introuvable » plutôt que « hors
 *   périmètre » — distinguer les deux apprendrait au curieux quelles cartes existent sans
 *   être publiées, comme le note déjà `resolvePlanMap`.
 */
function intersectSurfaceMapScope(surfaceScope, accountMapIds, requestedMapId) {
  const allowed = surfaceScope?.allowedMapIds ?? null;
  if (allowed == null) return { notFound: false, mapIds: accountMapIds };
  const requested = String(requestedMapId ?? '').trim();
  if (requested && !allowed.includes(requested)) return { notFound: true };
  if (accountMapIds == null) {
    return { notFound: false, mapIds: requested ? [requested] : [...allowed] };
  }
  return { notFound: false, mapIds: accountMapIds.filter((id) => allowed.includes(id)) };
}

/**
 * Applique le filtrage de surface à des lignes déjà sérialisées. Intersection : une ligne
 * doit être visible sur **toutes** les surfaces de `filters`.
 */
function filterRowsForSurface(rows, filters) {
  const list = Array.isArray(rows) ? rows : [];
  const surfaces = Array.isArray(filters) ? filters : [];
  if (!surfaces.length) return list;
  return list.filter((row) => surfaces.every((surface) => isVisibleOnSurface(row, surface)));
}

module.exports = {
  PLAN_SURFACE_SETTINGS,
  isProductOverrideAllowed,
  resolveSecureProductId,
  resolveSurfaceForRequest,
  allowedVisitMapIds,
  allowedMapIdsForSurface,
  authorizeSurfaceRead,
  withLocationSurface,
  intersectSurfaceMapScope,
  filterRowsForSurface,
};
