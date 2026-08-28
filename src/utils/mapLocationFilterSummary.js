/**
 * Chips des filtres actifs sur la carte (zones / repères).
 */

import { STAGE_LABELS } from '../constants/garden.js';
import { MAP_LOCATION_FILTER_DEFAULTS } from './mapLocationFilters.js';

const KIND_LABELS = {
  both: 'Tout',
  zones: 'Zones',
  markers: 'Repères',
};

const TRI_LABELS = {
  yes: 'Avec',
  no: 'Sans',
};

/**
 * @param {typeof MAP_LOCATION_FILTER_DEFAULTS} filters
 * @param {Array<{id:string,label:string}>} [speciesOptions]
 * @returns {Array<{key:string,label:string,removeLabel:string}>}
 */
export function activeMapLocationFilterChips(filters = {}, speciesOptions = []) {
  const f = { ...MAP_LOCATION_FILTER_DEFAULTS, ...filters };
  const chips = [];

  if (f.kinds && f.kinds !== 'both') {
    chips.push({
      key: 'kinds',
      label: `Type : ${KIND_LABELS[f.kinds] || f.kinds}`,
      removeLabel: 'Retirer le filtre type',
    });
  }

  if (f.stages?.length) {
    const labels = f.stages.map((s) => STAGE_LABELS[s] || s).join(', ');
    chips.push({
      key: 'stages',
      label: `État : ${labels}`,
      removeLabel: 'Retirer le filtre état',
    });
  }

  if (f.specialOnly) {
    chips.push({
      key: 'specialOnly',
      label: 'Infra uniquement',
      removeLabel: 'Retirer le filtre infra',
    });
  }

  if (f.speciesId) {
    const sp = speciesOptions.find((o) => String(o.id) === String(f.speciesId));
    chips.push({
      key: 'speciesId',
      label: `Espèce : ${sp?.label || f.speciesId}`,
      removeLabel: 'Retirer le filtre espèce',
    });
  }

  if (f.hasTasks) {
    chips.push({
      key: 'hasTasks',
      label: `${TRI_LABELS[f.hasTasks] || ''} tâches`.trim(),
      removeLabel: 'Retirer le filtre tâches',
    });
  }

  if (f.hasTutorials) {
    chips.push({
      key: 'hasTutorials',
      label: `${TRI_LABELS[f.hasTutorials] || ''} tutoriels`.trim(),
      removeLabel: 'Retirer le filtre tutoriels',
    });
  }

  return chips;
}

/** Retire un critère structuré par clé de chip. */
export function clearMapLocationFilterKey(filters, key) {
  const next = { ...MAP_LOCATION_FILTER_DEFAULTS, ...filters };
  if (key === 'kinds') next.kinds = 'both';
  if (key === 'stages') next.stages = [];
  if (key === 'specialOnly') next.specialOnly = false;
  if (key === 'speciesId') next.speciesId = '';
  if (key === 'hasTasks') next.hasTasks = '';
  if (key === 'hasTutorials') next.hasTutorials = '';
  return next;
}
