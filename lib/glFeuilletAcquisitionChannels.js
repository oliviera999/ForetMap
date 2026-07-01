'use strict';

/**
 * Canaux d'acquisition de feuillets (stratégie ③) : types d'éléments consultables
 * dont la consultation gatée peut attribuer un feuillet. Sous-ensemble des ressources
 * marquables (`GL_MARKABLE`) — hors `feuillet` lui-même. Fichier sans dépendance
 * (importé par glSettings, la route learning et l'admin) pour éviter les cycles.
 */

const ACQUISITION_SOURCE_TYPES = Object.freeze([
  'species',
  'glossary',
  'lore_glossary',
  'tutorial',
  'content_page',
  'ecosystem',
]);
const ACQUISITION_SOURCE_SET = new Set(ACQUISITION_SOURCE_TYPES);

/** Par défaut, tous les canaux sont éligibles (l'activation globale reste un réglage à part). */
const DEFAULT_ACQUISITION_CHANNELS = Object.freeze([...ACQUISITION_SOURCE_TYPES]);

/** Normalise une valeur de réglage en liste de canaux valides (dédupliquée). */
function normalizeAcquisitionChannels(value) {
  if (!Array.isArray(value)) return [...DEFAULT_ACQUISITION_CHANNELS];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const channel = String(raw || '').trim();
    if (ACQUISITION_SOURCE_SET.has(channel) && !seen.has(channel)) {
      seen.add(channel);
      out.push(channel);
    }
  }
  return out;
}

module.exports = {
  ACQUISITION_SOURCE_TYPES,
  ACQUISITION_SOURCE_SET,
  DEFAULT_ACQUISITION_CHANNELS,
  normalizeAcquisitionChannels,
};
