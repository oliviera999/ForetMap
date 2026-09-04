'use strict';

/**
 * Parcours de carte — helpers partagés (lot 8 du plan de convergence,
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.6).
 *
 * Un parcours est une **liste ordonnée de lieux**, sans validation ni progression enregistrée :
 * on avance, on saute, on quitte. Les étapes pointent vers les lieux existants
 * (`target_type` / `target_id`, le couple déjà utilisé par la visite) — aucun lieu n'est
 * dupliqué, et un parcours suit les renommages.
 *
 * Ce module ne fait que valider et sérialiser ; les routes s'occupent des permissions et du
 * SQL. `surfaces` reprend le mécanisme du lot 4 (`lib/locationSurfaces.js`).
 */

const { parseSurfaceSet, serializeSurfaceSet } = require('./locationSurfaces');

/** Longueurs maximales, alignées sur le schéma. */
const ROUTE_TITLE_MAX = 180;
const ROUTE_SLUG_MAX = 120;
const ROUTE_AUDIENCE_MAX = 120;
const STEP_TITLE_MAX = 180;

/** Un parcours plus long qu'une visite d'établissement n'a pas de sens ; borne de sûreté. */
const ROUTE_STEPS_MAX = 60;

/** Types de cible d'une étape. */
const STEP_TARGET_TYPES = Object.freeze(['zone', 'marker']);

/** Identifiant lisible dérivé d'un titre (`Portes ouvertes` → `portes-ouvertes`). */
function slugifyRouteTitle(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ROUTE_SLUG_MAX);
}

/**
 * Valide les étapes reçues d'un client.
 * @param {unknown} raw liste d'étapes `{ target_type, target_id, step_title?, step_text? }`.
 * @returns {{ ok: true, value: Array<object> } | { ok: false, error: string }}
 */
function normalizeRouteSteps(raw) {
  if (raw === undefined) return { ok: true, value: null };
  if (!Array.isArray(raw)) return { ok: false, error: 'steps doit être une liste' };
  if (raw.length > ROUTE_STEPS_MAX) {
    return { ok: false, error: `Un parcours ne peut pas dépasser ${ROUTE_STEPS_MAX} étapes` };
  }
  const value = [];
  for (const [index, step] of raw.entries()) {
    const targetType = String(step?.target_type || '')
      .trim()
      .toLowerCase();
    if (!STEP_TARGET_TYPES.includes(targetType)) {
      return { ok: false, error: `Étape ${index + 1} : target_type doit valoir zone ou marker` };
    }
    const targetId = String(step?.target_id || '').trim();
    if (!targetId) return { ok: false, error: `Étape ${index + 1} : target_id requis` };
    value.push({
      position: index,
      target_type: targetType,
      target_id: targetId,
      step_title: String(step?.step_title || '')
        .trim()
        .slice(0, STEP_TITLE_MAX),
      step_text: step?.step_text == null ? null : String(step.step_text),
    });
  }
  return { ok: true, value };
}

/** Ligne SQL `map_routes` → objet API (les étapes sont ajoutées par l'appelant). */
function serializeRouteRow(row) {
  return {
    id: String(row.id),
    map_id: String(row.map_id),
    slug: String(row.slug || ''),
    title: String(row.title || ''),
    description: row.description == null ? '' : String(row.description),
    audience: String(row.audience || ''),
    surfaces: parseSurfaceSet(row.surfaces),
    is_published: !!Number(row.is_published),
    sort_order: Number(row.sort_order) || 0,
    steps: [],
  };
}

/** Ligne SQL `map_route_steps` → objet API. */
function serializeStepRow(row) {
  return {
    position: Number(row.position) || 0,
    target_type: String(row.target_type),
    target_id: String(row.target_id),
    step_title: String(row.step_title || ''),
    step_text: row.step_text == null ? '' : String(row.step_text),
  };
}

/**
 * Regroupe les étapes par parcours et les attache, dans l'ordre des positions.
 * @param {Array<object>} routes parcours déjà sérialisés.
 * @param {Array<object>} stepRows lignes d'étapes (toutes cartes confondues).
 */
function attachStepsToRoutes(routes, stepRows) {
  const byRoute = new Map();
  for (const row of stepRows || []) {
    const key = String(row.route_id);
    if (!byRoute.has(key)) byRoute.set(key, []);
    byRoute.get(key).push(serializeStepRow(row));
  }
  return (routes || []).map((route) => ({
    ...route,
    steps: (byRoute.get(String(route.id)) || []).sort((a, b) => a.position - b.position),
  }));
}

/**
 * Base d'un lien profond imprimé, par ordre de priorité : ce que demande l'appelant,
 * puis le réglage `ui.plan.public_base_url`, puis l'hôte de la requête.
 *
 * L'ordre compte : l'affiche est exportée depuis la console ForetMap, servie par un autre
 * hôte que le plan. Sans le réglage, le QR code renverrait vers la console — donc vers un
 * écran de connexion, pour un visiteur qui n'a pas de compte.
 *
 * @param {{ query?: string, setting?: string, request?: string }} sources
 * @returns {string} base sans barre oblique finale, ou `''` si aucune source n'est utilisable.
 */
function resolveRouteBaseUrl(sources = {}) {
  for (const candidate of [sources.query, sources.setting, sources.request]) {
    const value = String(candidate || '').trim();
    if (value) return value.replace(/\/+$/, '');
  }
  return '';
}

/** Lien profond d'un parcours (QR code, affiche d'accueil). */
function routeDeepLink(baseUrl, slug) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  return `${base}/?parcours=${encodeURIComponent(String(slug || ''))}`;
}

module.exports = {
  ROUTE_TITLE_MAX,
  ROUTE_SLUG_MAX,
  ROUTE_AUDIENCE_MAX,
  STEP_TITLE_MAX,
  ROUTE_STEPS_MAX,
  STEP_TARGET_TYPES,
  slugifyRouteTitle,
  normalizeRouteSteps,
  serializeRouteRow,
  serializeStepRow,
  attachStepsToRoutes,
  resolveRouteBaseUrl,
  routeDeepLink,
  serializeSurfaceSet,
};
