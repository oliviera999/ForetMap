/**
 * Logique pure de l'éditeur de parcours (`/api/map-routes`, lot 8 du plan de convergence —
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.6).
 *
 * Un parcours est une **liste ordonnée de lieux existants** : rien n'y est dupliqué, chaque
 * étape pointe vers une zone ou un repère par `target_type` + `target_id`. Renommer le lieu
 * renomme l'étape.
 *
 * Ce module ne rend rien : il convertit un parcours serveur en brouillon d'édition, le
 * brouillon en charge d'API, et manipule la liste d'étapes (ajout, retrait, déplacement).
 * Il est testé sans montage (`tests-ui/utils/mapRoutesEditor.test.js`) — le composant
 * `components/settings/MapRoutesPanel.jsx` ne fait plus qu'appeler ces fonctions.
 */

import { normalizeSurfaceList } from '../shared/ui/SurfaceVisibilityField.jsx';

/** Miroir de `ROUTE_STEPS_MAX` (`lib/mapRoutes.js`) : borne annoncée avant l'aller-retour serveur. */
export const ROUTE_STEPS_MAX = 60;

/** Brouillon d'un parcours neuf : publié sur le plan seul, c'est là qu'ils servent. */
export const EMPTY_ROUTE_DRAFT = Object.freeze({
  title: '',
  slug: '',
  description: '',
  audience: '',
  surfaces: ['plan'],
  is_published: false,
  sort_order: 100,
  steps: [],
});

/** Clé stable d'un lieu ou d'une étape : `zone:42`, `marker:7`. */
export function stepKey(step) {
  return `${step?.target_type ?? ''}:${step?.target_id ?? ''}`;
}

/** Parcours renvoyé par l'API → brouillon éditable (jamais de `null` dans les champs texte). */
export function routeDraftFrom(route) {
  return {
    title: String(route?.title || ''),
    slug: String(route?.slug || ''),
    description: String(route?.description || ''),
    audience: String(route?.audience || ''),
    surfaces: normalizeSurfaceList(route?.surfaces ?? ['plan']),
    is_published: !!route?.is_published,
    sort_order: Number(route?.sort_order) || 0,
    steps: (route?.steps || []).map((step) => ({
      target_type: String(step?.target_type || ''),
      target_id: String(step?.target_id || ''),
      step_title: String(step?.step_title || ''),
      step_text: String(step?.step_text || ''),
    })),
  };
}

/**
 * Brouillon → charge `POST`/`PUT`. Les positions ne sont pas envoyées : le serveur les
 * renumérote depuis l'ordre du tableau (`normalizeRouteSteps`), ce qui rend le
 * glisser-déposer sans état supplémentaire.
 */
export function routePayloadFromDraft(draft, { mapId } = {}) {
  const payload = {
    title: String(draft?.title || '').trim(),
    slug: String(draft?.slug || '').trim(),
    description: String(draft?.description || '').trim(),
    audience: String(draft?.audience || '').trim(),
    surfaces: normalizeSurfaceList(draft?.surfaces),
    is_published: !!draft?.is_published,
    sort_order: Number(draft?.sort_order) || 0,
    steps: (draft?.steps || []).map((step) => ({
      target_type: step.target_type,
      target_id: String(step.target_id),
      step_title: String(step.step_title || '').trim(),
      step_text: String(step.step_text || '').trim(),
    })),
  };
  if (mapId) payload.map_id = String(mapId);
  return payload;
}

/**
 * Vérifications faites côté client **avant** l'appel : elles évitent un aller-retour, elles
 * ne remplacent pas celles du serveur (qui restent la référence).
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateRouteDraft(draft, { mapId } = {}) {
  if (!String(draft?.title || '').trim()) return { ok: false, error: 'Titre requis' };
  if (!mapId) return { ok: false, error: 'Choisissez une carte' };
  const steps = draft?.steps || [];
  if (steps.length > ROUTE_STEPS_MAX) {
    return { ok: false, error: `Un parcours ne peut pas dépasser ${ROUTE_STEPS_MAX} étapes` };
  }
  return { ok: true };
}

/**
 * Zones et repères d'une carte → liste unique de lieux sélectionnables, triée par nom
 * (comparaison française). Même unification que le plan (`src/plan/utils/planPlaces.js`),
 * mais côté console : on garde `target_type` / `target_id` pour composer les étapes.
 *
 * @param {object} source `{ zones, markers, categories }` (charges `/api/zones`,
 *   `/api/map/markers`, `/api/map-categories`).
 * @param {string} mapId carte retenue ; `''` = toutes.
 */
export function routePlaceOptions({ zones = [], markers = [], categories = [] } = {}, mapId = '') {
  const categoryById = new Map((categories || []).map((cat) => [String(cat.id), cat]));
  const labelsOf = (item) =>
    (item?.category_ids || item?.categories?.map((c) => c.id) || [])
      .map((id) => categoryById.get(String(id))?.label)
      .filter(Boolean);

  const keep = (item) => !mapId || String(item?.map_id || '') === String(mapId);
  const options = [
    ...(zones || [])
      .filter(keep)
      .map((zone) => ({ ...zone, target_type: 'zone', name: String(zone.name || '').trim() })),
    ...(markers || []).filter(keep).map((marker) => ({
      ...marker,
      target_type: 'marker',
      name: String(marker.label || '').trim(),
    })),
  ].map((item) => ({
    ...item,
    target_id: String(item.id),
    key: `${item.target_type}:${item.id}`,
    category_labels: labelsOf(item),
  }));

  const collator = new Intl.Collator('fr-FR', { sensitivity: 'base' });
  return options.sort((a, b) => collator.compare(a.name, b.name));
}

/** Index `clé → lieu`, pour afficher le nom réel d'une étape sans rechercher à chaque rendu. */
export function placesByKey(options) {
  return new Map((options || []).map((option) => [option.key, option]));
}

/**
 * Ce qu'on affiche pour une étape : son titre propre s'il en a un, sinon le nom du lieu visé,
 * sinon un repli explicite (un lieu supprimé après coup ne doit pas rendre une ligne vide).
 */
export function stepDisplayLabel(step, index, byKey) {
  const own = String(step?.step_title || '').trim();
  if (own) return own;
  const place = byKey?.get?.(stepKey(step));
  const name = String(place?.name || '').trim();
  if (name) return name;
  return `Étape ${index + 1} (lieu introuvable)`;
}

/** Ajoute un lieu en fin de parcours ; un lieu déjà présent n'est pas ajouté deux fois. */
export function addStep(steps, place) {
  const list = steps || [];
  if (!place?.target_type || !place?.target_id) return list;
  const key = `${place.target_type}:${place.target_id}`;
  if (list.some((step) => stepKey(step) === key)) return list;
  if (list.length >= ROUTE_STEPS_MAX) return list;
  return [
    ...list,
    {
      target_type: place.target_type,
      target_id: String(place.target_id),
      step_title: '',
      step_text: '',
    },
  ];
}

/** Retire l'étape d'un rang. */
export function removeStepAt(steps, index) {
  const list = steps || [];
  if (index < 0 || index >= list.length) return list;
  return list.filter((_, i) => i !== index);
}

/**
 * Déplace une étape d'un rang à un autre (glisser-déposer, et boutons ↑/↓ qui restent la
 * voie accessible au clavier). Les rangs hors bornes sont ramenés dans la liste ; un
 * déplacement sur place renvoie la liste inchangée.
 */
export function moveStep(steps, from, to) {
  const list = steps || [];
  if (list.length < 2) return list;
  const src = Math.max(0, Math.min(list.length - 1, Number(from)));
  const dst = Math.max(0, Math.min(list.length - 1, Number(to)));
  if (!Number.isFinite(src) || !Number.isFinite(dst) || src === dst) return list;
  const next = [...list];
  const [moved] = next.splice(src, 1);
  next.splice(dst, 0, moved);
  return next;
}

/** Modifie un champ d'une étape (titre propre, texte). */
export function patchStepAt(steps, index, patch) {
  const list = steps || [];
  if (index < 0 || index >= list.length) return list;
  return list.map((step, i) => (i === index ? { ...step, ...patch } : step));
}

/** Résumé d'une ligne de la liste : état de publication, surfaces, nombre d'étapes. */
export function routeSummaryLine(route) {
  const surfaces = normalizeSurfaceList(route?.surfaces);
  const count = (route?.steps || []).length;
  return [
    route?.is_published ? 'Publié' : 'Brouillon',
    `${count} étape${count > 1 ? 's' : ''}`,
    surfaces.length ? surfaces.join(', ') : 'aucune surface',
    route?.audience ? String(route.audience) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
