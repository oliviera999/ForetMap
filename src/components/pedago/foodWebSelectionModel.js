/**
 * Sélection de plusieurs espèces dans le réseau trophique du collège (chantier collège du
 * 22/11/2026, lot 2, décision 2) — helpers purs, sans DOM ni React, testables en Node comme
 * en Vitest.
 *
 * La sélection est une **liste ordonnée** d'identifiants d'espèces : on ajoute et on retire
 * d'un simple clic, depuis les puces du choix initial, la barre de sélection ou le panneau
 * d'un nœud du graphe. Le graphe montre les espèces choisies et leur voisinage
 * (`itemsAroundSeeds` de `foodWebProfileModel.js`, inchangé).
 *
 * Les candidats sont calculés sur les liens **filtrés par profil mais avant le cadrage** :
 * pollinisateurs et fleurs figurent dans la liste quel que soit le cadrage. Une espèce sans
 * aucun lien reste trouvable par la recherche, avec la mention « aucune relation enregistrée ».
 */

import { readInScope } from './foodWebGraphModel.js';
import { normalizeSeedIds, searchKey } from './foodWebProfileModel.js';

/** Nombre maximal de candidats affichés sans recherche (hors espèces phares). */
export const SELECTION_LIST_MAX = 12;

/** Mention d'une espèce trouvée par la recherche mais sans aucun lien. */
export const NO_RELATION_TEXT = 'aucune relation enregistrée';

/** Ajoute `id` en fin de sélection (sans doublon). */
export function addToSelection(selection, id) {
  const [n] = normalizeSeedIds(id);
  const list = normalizeSeedIds(selection);
  if (!n || list.includes(n)) return list;
  return [...list, n];
}

/** Retire `id` de la sélection. */
export function removeFromSelection(selection, id) {
  const [n] = normalizeSeedIds(id);
  return normalizeSeedIds(selection).filter((x) => x !== n);
}

/** Ajoute `id` s'il est absent, le retire sinon. */
export function toggleInSelection(selection, id) {
  const [n] = normalizeSeedIds(id);
  const list = normalizeSeedIds(selection);
  if (!n) return list;
  return list.includes(n) ? list.filter((x) => x !== n) : [...list, n];
}

/** Deux espèces de la sélection sont-elles reliées directement ? */
export function hasMutualLinks(items, selection) {
  const set = new Set(normalizeSeedIds(selection));
  if (set.size < 2) return false;
  return (items || []).some((row) => set.has(Number(row?.from_id)) && set.has(Number(row?.to_id)));
}

/**
 * Profondeur par défaut d'une sélection : 1 (« leurs voisins directs ») pour une espèce ; pour
 * plusieurs, 0 (« seulement les liens entre mes espèces ») si elles ont des liens mutuels,
 * sinon 1.
 *
 * @param {object[]} items lignes montrées (profil et cadrage appliqués)
 * @param {number[]} selection
 */
export function defaultSelectionDepth(items, selection) {
  const count = normalizeSeedIds(selection).length;
  if (count < 2) return 1;
  return hasMutualLinks(items, selection) ? 0 : 1;
}

/**
 * Candidats à la sélection : chaque espèce qui a au moins un lien montré à ce profil (avant
 * cadrage), les espèces phares de la carte en tête, puis par nombre de liens décroissant, puis
 * par nom ; ensuite, pour la recherche seulement, les espèces du catalogue sans aucun lien
 * (`links: 0`). Une espèce n'est « hors carte » (`outOfScope`) que si elle ne l'est dans
 * aucune ligne.
 *
 * @param {object[]} profileItems lignes filtrées par profil (types du palier), avant cadrage
 * @param {{ featuredIds?: Iterable<number>|null, plants?: object[]|null }} [options]
 * @returns {{ id: number, name: string, emoji: string, featured: boolean, links: number,
 *   outOfScope: boolean }[]}
 */
export function selectionCandidates(profileItems, { featuredIds = null, plants = null } = {}) {
  const featured = new Set(normalizeSeedIds(featuredIds));
  const byId = new Map();
  const add = (rawId, name, emoji, inScope) => {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return;
    const cur = byId.get(id);
    if (cur) {
      cur.links += 1;
      if (!cur.name && name) cur.name = String(name);
      if (!cur.emoji && emoji) cur.emoji = String(emoji);
      if (inScope) cur.outOfScope = false;
      return;
    }
    byId.set(id, {
      id,
      name: String(name || ''),
      emoji: String(emoji || ''),
      featured: featured.has(id),
      links: 1,
      outOfScope: !inScope,
    });
  };
  for (const row of profileItems || []) {
    add(row?.from_id, row?.from_name, row?.from_emoji, readInScope(row?.from_in_scope));
    if (row?.to_id != null) {
      add(row.to_id, row.to_name, row.to_emoji, readInScope(row.to_in_scope));
    }
  }
  const linked = [...byId.values()].sort(
    (a, b) =>
      Number(b.featured) - Number(a.featured) ||
      b.links - a.links ||
      a.name.localeCompare(b.name, 'fr'),
  );
  const unlinked = [];
  for (const plant of plants || []) {
    const id = Number(plant?.id);
    if (!Number.isInteger(id) || id <= 0 || byId.has(id)) continue;
    unlinked.push({
      id,
      name: String(plant?.name || ''),
      emoji: String(plant?.emoji || ''),
      featured: featured.has(id),
      links: 0,
      outOfScope: false,
    });
  }
  unlinked.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return [...linked, ...unlinked];
}

/**
 * Candidats affichés : sans recherche, les espèces phares liées puis les `max` premières des
 * autres espèces liées ; avec une recherche (nom, sans accents), toutes les correspondances,
 * espèces sans lien comprises (en fin de liste).
 *
 * @param {ReturnType<typeof selectionCandidates>} candidates
 * @param {string} query
 * @param {{ max?: number }} [options]
 */
export function filterSelectionCandidates(candidates, query, { max = SELECTION_LIST_MAX } = {}) {
  const list = candidates || [];
  const key = searchKey(query);
  if (!key) {
    const linked = list.filter((c) => c.links > 0);
    const featured = linked.filter((c) => c.featured);
    const others = linked.filter((c) => !c.featured).slice(0, Math.max(0, max));
    return { featured, others, total: linked.length };
  }
  const matches = list.filter((c) => searchKey(c.name).includes(key));
  return {
    featured: matches.filter((c) => c.featured && c.links > 0),
    others: matches.filter((c) => !c.featured || c.links === 0),
    total: matches.length,
  };
}

/** Clé de mémoire de session de la sélection, par carte (`''` = toutes les cartes). */
export function selectionStorageKey(mapId) {
  return `foretmap.foodweb.selection.${mapId ? String(mapId) : 'all'}`;
}

/** Lit la sélection mémorisée (jamais d'exception : stockage indisponible = liste vide). */
export function readStoredSelection(storage, mapId) {
  try {
    const raw = storage?.getItem(selectionStorageKey(mapId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeSeedIds(parsed) : [];
  } catch {
    return [];
  }
}

/** Mémorise la sélection (silencieux si le stockage est indisponible ou plein). */
export function writeStoredSelection(storage, mapId, selection) {
  try {
    const list = normalizeSeedIds(selection);
    if (list.length === 0) storage?.removeItem(selectionStorageKey(mapId));
    else storage?.setItem(selectionStorageKey(mapId), JSON.stringify(list));
  } catch {
    // Mémoire de confort seulement : on l'ignore.
  }
}

/** Profondeurs de la sélection au collège, avec leurs libellés (décision 2 du 22/11/2026). */
export const SELECTION_DEPTH_LABELS = Object.freeze({
  0: 'Seulement les liens entre mes espèces',
  1: 'Leurs voisins directs',
  2: 'La chaîne autour',
});

/** Profondeurs proposées : la profondeur 0 n'a de sens qu'à partir de deux espèces. */
export function selectionDepthChoices(count) {
  return [0, 1, 2].filter((depth) => depth > 0 || count > 1);
}
