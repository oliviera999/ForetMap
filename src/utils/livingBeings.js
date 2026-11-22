/**
 * Normalisation des listes d’êtres vivants (noms du catalogue biodiversité),
 * alignée sur les zones / repères côté API.
 */

import { PRESENCE_VALIDATION_STATUS_ENUM } from '../shared/enums/biodivEnums.js';

export function parseLivingBeings(value, fallback = '') {
  const raw = Array.isArray(value)
    ? value
    : (() => {
        if (!value) return [];
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
          } catch (_) {
            /* ignore */
          }
          return value.split(',');
        }
        return [];
      })();
  const cleaned = [...new Set(raw.map((v) => String(v || '').trim()).filter(Boolean))];
  if (cleaned.length === 0 && fallback) return [String(fallback).trim()];
  return cleaned;
}

/** Ordre conservé depuis `living_beings` (JSON) ; `primary` sert de repli si la liste est vide (colonnes legacy). */
export function orderedLivingBeingsForForm(value, primary) {
  return parseLivingBeings(value, primary);
}

/**
 * Préserve l’ordre des sélections (Ctrl/Cmd + clic).
 * Les nouveaux noms suivent l’ordre du catalogue `plants`.
 */
export function nextLivingBeingsFromMultiSelect(prevOrdered, selectedNames, plants) {
  const selectedSet = new Set(selectedNames);
  const kept = prevOrdered.filter((name) => selectedSet.has(name));
  const added = plants
    .map((p) => p.name)
    .filter((name) => selectedSet.has(name) && !kept.includes(name));
  return [...kept, ...added];
}

/** Libellé court pour listes déroulantes (noms séparés par des virgules, troncature). */
export function formatLivingBeingsListLine(names, maxLen = 56) {
  if (!Array.isArray(names) || !names.length) return '';
  const s = names.join(', ');
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

// ─── Fiche de lieu au collège : espèces phares, « à chercher », plafond ─────────────

/**
 * Certitudes de présence rangées après les autres et signalées « à chercher » au collège
 * (décision 5 du chantier collège, 21/11/2026) : l'espèce est connue par la documentation ou
 * reste à confirmer sur le site.
 */
export const TO_SEARCH_VALIDATION_STATUSES = Object.freeze(
  PRESENCE_VALIDATION_STATUS_ENUM.values.filter((v) => v === 'documentaire' || v === 'a_confirmer'),
);

/**
 * Plafond de vignettes lu dans la table de visibilité (`zone_tiles_cap`) : un entier positif,
 * sinon `null` = pas de plafond (hors contexte, `visibility()` rend `'show'` — fiche E6).
 */
export function zoneTilesCapValue(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Index nom → `{ is_featured, validation_status }` d'une liste de présences : espèces du site
 * (`GET /api/maps/:id/species`, `site_species`) ou espèces d'un lieu de visite (`species[]`).
 * Le premier nom rencontré l'emporte ; une entrée sans nom est ignorée.
 *
 * @param {Array<{ name?: string, is_featured?: boolean, validation_status?: string|null }>|null} entries
 * @returns {Map<string, { is_featured: boolean, validation_status: string|null }>}
 */
export function zoneSpeciesPresenceIndex(entries) {
  const index = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const name = String(entry?.name || '').trim();
    if (!name || index.has(name)) continue;
    index.set(name, {
      is_featured: entry.is_featured === true,
      validation_status: entry.validation_status == null ? null : String(entry.validation_status),
    });
  }
  return index;
}

/**
 * Ordre des espèces d'une fiche de lieu.
 *
 * - `featuredFirst` faux (lycée, universitaire) : ordre reçu, rien n'est signalé ;
 * - `featuredFirst` vrai (collège) : espèces phares d'abord, puis les autres, puis celles
 *   « à chercher » (`documentaire`, `a_confirmer`), chaque groupe gardant l'ordre reçu. Repli :
 *   sans espèce phare ni présence « à chercher » (ou sans présence connue), l'ordre est
 *   l'ordre reçu.
 *
 * @param {string[]} names noms du lieu, dans l'ordre de saisie
 * @param {Map<string, { is_featured: boolean, validation_status: string|null }>} presenceByName
 * @param {{ featuredFirst?: boolean }} [opts]
 * @returns {{ ordered: string[], featured: Set<string>, toSearch: Set<string> }}
 */
export function orderZoneSpeciesForCollege(names, presenceByName, { featuredFirst = false } = {}) {
  const list = Array.isArray(names) ? names : [];
  const featured = new Set();
  const toSearch = new Set();
  if (!featuredFirst) return { ordered: [...list], featured, toSearch };
  const index = presenceByName instanceof Map ? presenceByName : new Map();
  const groups = [[], [], []];
  for (const name of list) {
    const presence = index.get(name);
    const searching = TO_SEARCH_VALIDATION_STATUSES.includes(presence?.validation_status);
    if (searching) toSearch.add(name);
    if (presence?.is_featured) featured.add(name);
    groups[searching ? 2 : presence?.is_featured ? 0 : 1].push(name);
  }
  return { ordered: groups.flat(), featured, toSearch };
}

/**
 * Coupe une liste au plafond : `visible` (au plus `cap` noms) et `hidden` (le reste).
 * `cap` nul ou non entier : rien n'est caché.
 *
 * @param {string[]} list
 * @param {number|null} cap
 * @returns {{ visible: string[], hidden: string[] }}
 */
export function capZoneSpecies(list, cap) {
  const all = Array.isArray(list) ? list : [];
  const limit = zoneTilesCapValue(cap);
  if (limit == null || all.length <= limit) return { visible: [...all], hidden: [] };
  return { visible: all.slice(0, limit), hidden: all.slice(limit) };
}

/** Libellé du bouton qui déplie les espèces cachées par le plafond. */
export function zoneSpeciesMoreLabel(hiddenCount) {
  const n = Number(hiddenCount) || 0;
  if (n <= 0) return '';
  return n === 1 ? 'Voir l’autre espèce' : `Voir les ${n} autres`;
}
