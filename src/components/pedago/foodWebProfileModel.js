/**
 * Réseau trophique « borné » du collège (chantier collège du 21/11/2026, flux C3) — helpers
 * purs, sans DOM ni React, testables en Node comme en Vitest.
 *
 * Au collège, le réseau ne s'ouvre pas en entier : l'élève choisit une **espèce de départ**
 * (les espèces phares de la carte en tête de liste, puis une recherche), et le graphe montre
 * ses voisins directs (profondeur 1), extensible à la chaîne (profondeur 2). Les types
 * d'interaction hors palier sont retirés **avant** la construction du graphe ; les espèces
 * hors de la carte restent, grisées (décision 1 du 22/11/2026 : marquer, ne plus masquer).
 * Lycée, université et vue prof : réseau complet, inchangé.
 *
 * Les décisions viennent de la table de visibilité (`src/shared/pedagoVisibilityCore.js`) par
 * le contexte : `foodweb_full_by_default` et `foodWebTypes(...)`.
 * Ce module ne lit jamais le niveau lui-même : il reçoit un **profil** déjà résolu.
 */

import { FOCUS_DEPTHS } from './foodWebGraphModel.js';

/** Profondeurs proposées au collège : voisins directs, puis la chaîne. */
export const COLLEGE_FOCUS_DEPTHS = Object.freeze([1, 2]);

/** Profondeur d'ouverture au collège. */
export const COLLEGE_DEFAULT_FOCUS_DEPTH = 1;

/** Nombre maximal d'espèces de départ affichées sans recherche (hors espèces phares). */
export const START_SPECIES_LIST_MAX = 12;

/**
 * Profil d'affichage du réseau, construit à partir du contexte pédagogique.
 *
 * @param {{ fullByDefault?: boolean, allowedTypes?: string[]|null }} input
 * @returns {{ collegeMode: boolean, allowedTypes: string[]|null, focusDepths: readonly number[] }}
 */
export function foodWebProfile({ fullByDefault = true, allowedTypes = null } = {}) {
  const collegeMode = !fullByDefault;
  return {
    collegeMode,
    allowedTypes: Array.isArray(allowedTypes) ? allowedTypes : null,
    focusDepths: collegeMode ? COLLEGE_FOCUS_DEPTHS : FOCUS_DEPTHS,
  };
}

/**
 * Interactions montrées pour un profil : types autorisés seulement. Les liens qui franchissent
 * la limite de la carte restent : l'extrémité hors périmètre est grisée par le graphe
 * (`outOfScope`) et la liste, avec la mention « vit ailleurs : … » (`*_elsewhere`).
 *
 * @param {object[]} items lignes de `GET /api/food-web`
 * @param {{ allowedTypes?: string[]|null }} profile
 * @returns {object[]}
 */
export function filterItemsForProfile(items, { allowedTypes = null } = {}) {
  const allowed = Array.isArray(allowedTypes) ? new Set(allowedTypes) : null;
  if (!allowed) return [...(items || [])];
  return (items || []).filter((row) => allowed.has(String(row?.interaction_type || '')));
}

/** Identifiants d'espèces (entiers > 0) d'une graine : nombre, chaîne, tableau ou `Set`. */
export function normalizeSeedIds(seeds) {
  const list = seeds == null ? [] : typeof seeds === 'object' ? [...seeds] : [seeds];
  const out = [];
  for (const raw of list) {
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0 && !out.includes(id)) out.push(id);
  }
  return out;
}

function touches(row, id) {
  return Number(row?.from_id) === id || Number(row?.to_id) === id;
}

/**
 * Où en est une espèce mise en avant (fiche, séance) dans le réseau courant ?
 *
 * - `absent` : aucune interaction enregistrée dans la sélection (carte, zone) ;
 * - `hidden` : des interactions existent, mais aucune n'est montrée à ce profil (types hors
 *   palier, espèces hors carte) — il faut le **dire**, pas afficher un graphe vide ;
 * - `visible` : au moins un lien montré.
 *
 * @param {object[]} rawItems toutes les lignes reçues
 * @param {object[]} shownItems lignes après `filterItemsForProfile` (et cadrage)
 * @param {number|string|null} seedId
 * @returns {'absent'|'hidden'|'visible'|null} `null` sans espèce valide
 */
export function seedLinkStatus(rawItems, shownItems, seedId) {
  const [id] = normalizeSeedIds(seedId);
  if (!id) return null;
  if ((shownItems || []).some((row) => touches(row, id))) return 'visible';
  if ((rawItems || []).some((row) => touches(row, id))) return 'hidden';
  return 'absent';
}

/** Minuscules sans accents, pour une recherche tolérante. */
export function searchKey(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Espèces proposées comme point de départ : chaque espèce qui a au moins un lien montré,
 * les **espèces phares** de la carte (`map_species.is_featured`) en tête, puis par nombre de
 * liens décroissant, puis par nom.
 *
 * @param {object[]} shownItems lignes déjà filtrées pour le profil
 * @param {{ featuredIds?: Iterable<number>|null }} [options]
 * @returns {{ id: number, name: string, emoji: string, featured: boolean, links: number }[]}
 */
export function startSpeciesCandidates(shownItems, { featuredIds = null } = {}) {
  const featured = new Set(normalizeSeedIds(featuredIds));
  const byId = new Map();
  const add = (rawId, name, emoji) => {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return;
    const cur = byId.get(id);
    if (cur) {
      cur.links += 1;
      if (!cur.name && name) cur.name = String(name);
      if (!cur.emoji && emoji) cur.emoji = String(emoji);
      return;
    }
    byId.set(id, {
      id,
      name: String(name || ''),
      emoji: String(emoji || ''),
      featured: featured.has(id),
      links: 1,
    });
  };
  for (const row of shownItems || []) {
    add(row?.from_id, row?.from_name, row?.from_emoji);
    if (row?.to_id != null) add(row.to_id, row.to_name, row.to_emoji);
  }
  return [...byId.values()].sort(
    (a, b) =>
      Number(b.featured) - Number(a.featured) ||
      b.links - a.links ||
      a.name.localeCompare(b.name, 'fr'),
  );
}

/**
 * Filtre les espèces de départ par recherche (nom, sans accents). Sans recherche : les
 * espèces phares, puis les `max` premières des autres.
 *
 * @param {ReturnType<typeof startSpeciesCandidates>} candidates
 * @param {string} query
 * @param {{ max?: number }} [options]
 */
export function filterStartSpecies(candidates, query, { max = START_SPECIES_LIST_MAX } = {}) {
  const list = candidates || [];
  const key = searchKey(query);
  if (!key) {
    const featured = list.filter((c) => c.featured);
    const others = list.filter((c) => !c.featured).slice(0, Math.max(0, max));
    return { featured, others, total: list.length };
  }
  const matches = list.filter((c) => searchKey(c.name).includes(key));
  return {
    featured: matches.filter((c) => c.featured),
    others: matches.filter((c) => !c.featured),
    total: matches.length,
  };
}

/**
 * Profondeur initiale du focus : au collège, 1 pour une espèce, 0 (les espèces choisies et
 * leurs liens mutuels) pour plusieurs — cas d'une séance qui montre une liste d'espèces.
 * Hors collège : 1 (comportement historique), 0 pour plusieurs espèces imposées.
 */
export function initialFocusDepth(seedCount) {
  return seedCount > 1 ? 0 : COLLEGE_DEFAULT_FOCUS_DEPTH;
}

/**
 * Profondeurs proposées à l'écran pour une sélection : la profondeur 0 n'a de sens qu'à
 * partir de deux espèces (voir `FOCUS_DEPTHS`).
 *
 * @param {readonly number[]} depths profondeurs du profil
 * @param {number} seedCount
 */
export function focusDepthChoices(depths, seedCount) {
  const base = Array.isArray(depths) ? [...depths] : [...FOCUS_DEPTHS];
  if (seedCount > 1 && !base.includes(0)) base.unshift(0);
  return base.filter((depth) => depth > 0 || seedCount > 1);
}

/** Clé de l'extrémité « environnement » (`to_id` nul) dans `itemsAroundSeeds`. */
const ENV_KEY = 'env';

function endpointKey(id) {
  return id == null ? ENV_KEY : Number(id);
}

/**
 * Sous-réseau **borné** autour des espèces de départ, calculé sur les lignes de l'API (avant
 * construction du graphe) pour que liste et graphe montrent la même chose :
 *
 * - `depth = 0` : les espèces choisies et leurs liens mutuels seulement ;
 * - `depth = 1` : leurs voisins directs ;
 * - `depth = 2` : la chaîne (voisins des voisins).
 *
 * L'« environnement » (sol, air…) peut apparaître comme voisin mais n'est jamais traversé : il
 * relie presque toutes les espèces, et le traverser rendrait le réseau entier.
 *
 * @param {object[]} items lignes déjà filtrées pour le profil
 * @param {Iterable<number>|number} seeds
 * @param {number} depth
 * @returns {object[]} lignes dont les deux extrémités sont dans le sous-réseau
 */
export function itemsAroundSeeds(items, seeds, depth = COLLEGE_DEFAULT_FOCUS_DEPTH) {
  const roots = normalizeSeedIds(seeds);
  if (roots.length === 0) return [];
  const list = items || [];
  const steps = Math.max(0, Math.floor(Number(depth) || 0));
  const visible = new Set(roots);
  let frontier = new Set(roots);
  for (let i = 0; i < steps && frontier.size > 0; i += 1) {
    const next = new Set();
    for (const row of list) {
      const a = endpointKey(row?.from_id);
      const b = endpointKey(row?.to_id);
      for (const [here, there] of [
        [a, b],
        [b, a],
      ]) {
        if (here === ENV_KEY || !frontier.has(here) || visible.has(there)) continue;
        visible.add(there);
        if (there !== ENV_KEY) next.add(there);
      }
    }
    frontier = next;
  }
  return list.filter(
    (row) => visible.has(endpointKey(row?.from_id)) && visible.has(endpointKey(row?.to_id)),
  );
}
