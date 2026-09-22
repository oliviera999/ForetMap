/**
 * Helpers purs du catalogue biodiversité — charge paginée et lots HTTP.
 *
 * Plafond HTTP serveur : 200 ids par requête (`observation-counts`, `gating/summary`).
 * Le client découpe en lots plutôt que de tronquer silencieusement (audit 2026-09,
 * plan charge biodiv 1A).
 */

export {
  chunkIds,
  IDS_BATCH_SIZE_DEFAULT as BIODIV_IDS_BATCH_SIZE,
  IDS_DEBOUNCE_MS_DEFAULT as BIODIV_IDS_DEBOUNCE_MS,
} from '../shared/utils/chunkIds.js';

/** Nombre de vignettes montées avant « Voir plus ». */
export const BIODIV_PAGE_SIZE = 36;

/**
 * Normalise / déduplique des ids plantes (entiers positifs), sans plafond.
 * @param {Array<number|string>} plantIds
 * @returns {number[]}
 */
export function normalizePlantIds(plantIds) {
  if (!Array.isArray(plantIds) || plantIds.length === 0) return [];
  const unique = [];
  const seen = new Set();
  for (const raw of plantIds) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    unique.push(n);
  }
  return unique;
}

/** Codes UICN considérés « menacés » pour le chip rapide. */
export const IUCN_THREATENED_CODES = Object.freeze(['CR', 'EN', 'VU']);

export const BIODIV_SORT = Object.freeze({
  NAME_ASC: 'name_asc',
  NAME_DESC: 'name_desc',
  RECENT_OBSERVED: 'recent_observed',
});

/** Valeur du sélecteur « Carte » = toute la biodiversité du site (hors carte précise). */
export const BIODIV_MAP_FILTER_ALL = '__all_site__';

/**
 * @param {object} plant
 * @returns {boolean}
 */
export function plantIsEdible(plant) {
  const v = plant?.is_edible;
  return v === true || v === 1 || v === '1';
}

/**
 * @param {object} plant
 * @returns {boolean}
 */
export function plantIsIucnThreatened(plant) {
  const code = String(plant?.iucn_status || '')
    .trim()
    .toUpperCase();
  if (!code) return false;
  const short = code.match(/^(EX|EW|CR|EN|VU|NT|LC|DD|NE)\b/);
  const normalized = short ? short[1] : code;
  return IUCN_THREATENED_CODES.includes(normalized);
}

/**
 * Tri du catalogue après filtres.
 * @param {object[]} plants
 * @param {string} sortKey
 * @param {Record<string, { my_observation_count?: number }>|null} [countsById]
 * @returns {object[]}
 */
export function sortBiodivPlants(plants, sortKey, countsById = null) {
  const list = Array.isArray(plants) ? [...plants] : [];
  const byName = (a, b) =>
    String(a?.name || '').localeCompare(String(b?.name || ''), 'fr', { sensitivity: 'base' });

  if (sortKey === BIODIV_SORT.NAME_DESC) {
    list.sort((a, b) => -byName(a, b));
    return list;
  }

  if (sortKey === BIODIV_SORT.RECENT_OBSERVED && countsById) {
    list.sort((a, b) => {
      const ca = Number(countsById[String(a.id)]?.my_observation_count) || 0;
      const cb = Number(countsById[String(b.id)]?.my_observation_count) || 0;
      if (cb !== ca) return cb - ca;
      return byName(a, b);
    });
    return list;
  }

  list.sort(byName);
  return list;
}

/**
 * Applique les chips rapides (après filtres structurés).
 * @param {object[]} plants
 * @param {{ edibleOnly?: boolean, iucnThreatenedOnly?: boolean, observation?: ''|'mine'|'unseen' }} chips
 * @param {Record<string, { my_observation_count?: number }>|null} countsById
 */
export function applyBiodivQuickChips(plants, chips = {}, countsById = null) {
  let list = Array.isArray(plants) ? plants : [];
  if (chips.edibleOnly) list = list.filter(plantIsEdible);
  if (chips.iucnThreatenedOnly) list = list.filter(plantIsIucnThreatened);
  if (chips.observation === 'mine' && countsById) {
    list = list.filter((p) => (Number(countsById[String(p.id)]?.my_observation_count) || 0) > 0);
  }
  if (chips.observation === 'unseen' && countsById) {
    list = list.filter((p) => (Number(countsById[String(p.id)]?.my_observation_count) || 0) <= 0);
  }
  return list;
}
