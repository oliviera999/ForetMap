/**
 * Réseau trophique « borné » du collège (chantier collège du 21/11/2026, flux C3 ; sélection
 * de plusieurs espèces depuis le chantier du 22/11/2026) — helpers purs, sans DOM ni React,
 * testables en Node comme en Vitest.
 *
 * Au collège, le réseau ne s'ouvre pas en entier : l'élève compose une **sélection** d'espèces
 * (`foodWebSelectionModel.js`), et le graphe montre leurs liens mutuels (profondeur 0), leurs
 * voisins directs (1) ou la chaîne (2) — `itemsAroundSeeds`. Les types
 * d'interaction hors palier sont retirés **avant** la construction du graphe ; les espèces
 * hors de la carte restent, grisées (décision 1 du 22/11/2026 : marquer, ne plus masquer).
 * Lycée, université et vue prof : réseau complet, inchangé.
 *
 * Les décisions viennent de la table de visibilité (`src/shared/pedagoVisibilityCore.js`) par
 * le contexte : `foodweb_full_by_default` et `foodWebTypes(...)`.
 * Ce module ne lit jamais le niveau lui-même : il reçoit un **profil** déjà résolu.
 */

/** Profondeur d'ouverture au collège. */
export const COLLEGE_DEFAULT_FOCUS_DEPTH = 1;

/**
 * Profil d'affichage du réseau, construit à partir du contexte pédagogique.
 *
 * @param {{ fullByDefault?: boolean, allowedTypes?: string[]|null }} input
 * @returns {{ collegeMode: boolean, allowedTypes: string[]|null }}
 */
export function foodWebProfile({ fullByDefault = true, allowedTypes = null } = {}) {
  const collegeMode = !fullByDefault;
  return {
    collegeMode,
    allowedTypes: Array.isArray(allowedTypes) ? allowedTypes : null,
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
 * Où en est une espèce mise en avant (fiche, séance) ou choisie (sélection du collège) dans le
 * réseau courant ?
 *
 * - `absent` : aucune interaction enregistrée dans la sélection (carte, zone) ;
 * - `hidden` : des interactions existent, mais aucune n'est montrée à ce profil (types hors
 *   palier, cadrage) — il faut le **dire**, pas afficher un graphe vide ;
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
 * Profondeur initiale du focus : au collège, 1 pour une espèce, 0 (les espèces choisies et
 * leurs liens mutuels) pour plusieurs — cas d'une séance qui montre une liste d'espèces.
 * Hors collège : 1 (comportement historique), 0 pour plusieurs espèces imposées.
 */
export function initialFocusDepth(seedCount) {
  return seedCount > 1 ? 0 : COLLEGE_DEFAULT_FOCUS_DEPTH;
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
