'use strict';

/**
 * Danger des fiches biodiversité — gravité et voies d'exposition.
 *
 * Valeurs canoniques alignées sur l'ENUM SQL `plants.toxicity_level` et le SET
 * `plants.hazard_exposure` (migration 246). Même contrat que `plantOriginStatus.js` :
 * une valeur libre venue d'un formulaire ou d'un import est ramenée à la valeur
 * canonique, ou à `null` — jamais écrite telle quelle, le SET SQL la rejetterait.
 */

const TOXICITY_LEVEL_VALUES = Object.freeze(['aucune', 'irritation', 'toxique', 'mortel']);
const TOXICITY_LEVEL_SET = new Set(TOXICITY_LEVEL_VALUES);

const TOXICITY_LEVEL_LABELS = Object.freeze({
  aucune: 'Aucun danger connu',
  irritation: 'Irritation',
  toxique: 'Toxique',
  mortel: 'Potentiellement mortel',
});

/**
 * Rang de gravité — sert au tri « le plus dangereux d'abord » et au seuil d'alerte de
 * l'affichage. `aucune` vaut 0 : c'est une information positive, pas un danger.
 */
const TOXICITY_LEVEL_RANK = Object.freeze({
  aucune: 0,
  irritation: 1,
  toxique: 2,
  mortel: 3,
});

const HAZARD_EXPOSURE_VALUES = Object.freeze([
  'ingestion',
  'contact',
  'inhalation',
  'projection_oculaire',
  'piqure_morsure',
  'seve_latex',
]);
const HAZARD_EXPOSURE_SET = new Set(HAZARD_EXPOSURE_VALUES);

const HAZARD_EXPOSURE_LABELS = Object.freeze({
  ingestion: 'Ingestion',
  contact: 'Contact avec la peau',
  inhalation: 'Inhalation',
  projection_oculaire: 'Projection dans l’œil',
  piqure_morsure: 'Piqûre ou morsure',
  seve_latex: 'Sève ou latex',
});

/** Alias d'import (FR / EN / formulations courantes) → valeur canonique. */
const TOXICITY_LEVEL_ALIASES = Object.freeze({
  aucun: 'aucune',
  aucune: 'aucune',
  non_toxique: 'aucune',
  sans_danger: 'aucune',
  comestible: 'aucune',
  none: 'aucune',
  safe: 'aucune',
  irritation: 'irritation',
  irritant: 'irritation',
  urticant: 'irritation',
  allergisant: 'irritation',
  piquant: 'irritation',
  irritating: 'irritation',
  toxique: 'toxique',
  toxic: 'toxique',
  poisonous: 'toxique',
  venimeux: 'toxique',
  mortel: 'mortel',
  mortelle: 'mortel',
  letal: 'mortel',
  lethal: 'mortel',
  deadly: 'mortel',
  tres_toxique: 'mortel',
});

const HAZARD_EXPOSURE_ALIASES = Object.freeze({
  ingestion: 'ingestion',
  ingere: 'ingestion',
  oral: 'ingestion',
  bouche: 'ingestion',
  contact: 'contact',
  contact_cutane: 'contact',
  peau: 'contact',
  cutane: 'contact',
  skin: 'contact',
  inhalation: 'inhalation',
  respiratoire: 'inhalation',
  pollen: 'inhalation',
  spores: 'inhalation',
  projection_oculaire: 'projection_oculaire',
  oeil: 'projection_oculaire',
  yeux: 'projection_oculaire',
  oculaire: 'projection_oculaire',
  eye: 'projection_oculaire',
  piqure_morsure: 'piqure_morsure',
  piqure: 'piqure_morsure',
  morsure: 'piqure_morsure',
  venin: 'piqure_morsure',
  sting: 'piqure_morsure',
  bite: 'piqure_morsure',
  seve_latex: 'seve_latex',
  seve: 'seve_latex',
  latex: 'seve_latex',
  sap: 'seve_latex',
});

function slugify(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Normalise une gravité libre vers l'ENUM, ou `null`. */
function normalizeToxicityLevel(value) {
  const key = slugify(value);
  if (!key) return null;
  if (TOXICITY_LEVEL_SET.has(key)) return key;
  return TOXICITY_LEVEL_ALIASES[key] || null;
}

/**
 * Normalise une liste de voies d'exposition (chaîne séparée par virgules, point-virgules
 * ou barres, ou tableau) vers la chaîne attendue par le SET SQL.
 *
 * Les doublons sont écrasés et l'ordre canonique de `HAZARD_EXPOSURE_VALUES` est
 * réimposé : deux fiches portant les mêmes voies produisent la même chaîne, ce qui rend
 * les comparaisons et les tests stables.
 *
 * @returns {string|null} ex. `'contact,seve_latex'`, ou `null` si rien de reconnu.
 */
function normalizeHazardExposure(value) {
  const parts = Array.isArray(value) ? value : String(value == null ? '' : value).split(/[,;|]/);
  const found = new Set();
  for (const part of parts) {
    const key = slugify(part);
    if (!key) continue;
    if (HAZARD_EXPOSURE_SET.has(key)) found.add(key);
    else if (HAZARD_EXPOSURE_ALIASES[key]) found.add(HAZARD_EXPOSURE_ALIASES[key]);
  }
  if (found.size === 0) return null;
  return HAZARD_EXPOSURE_VALUES.filter((entry) => found.has(entry)).join(',');
}

/** Liste des voies d'exposition d'une fiche, dans l'ordre canonique. */
function listHazardExposures(value) {
  const normalized = normalizeHazardExposure(value);
  return normalized ? normalized.split(',') : [];
}

function toxicityLevelLabel(value) {
  const canonical = normalizeToxicityLevel(value);
  return canonical ? TOXICITY_LEVEL_LABELS[canonical] : '';
}

function hazardExposureLabel(value) {
  const key = slugify(value);
  const canonical = HAZARD_EXPOSURE_SET.has(key) ? key : HAZARD_EXPOSURE_ALIASES[key];
  return canonical ? HAZARD_EXPOSURE_LABELS[canonical] : '';
}

/**
 * Vrai si la fiche porte un danger à signaler — c'est-à-dire tout sauf « aucun danger
 * connu » et « pas encore regardé ». C'est le seul critère d'affichage de l'encadré
 * d'alerte : `hazard_reviewed` ne conditionne PAS l'affichage, seulement la mention
 * « à valider » qui l'accompagne (cf. migration 246).
 */
function hasHazard(plant) {
  const level = normalizeToxicityLevel(plant?.toxicity_level);
  return Boolean(level) && level !== 'aucune';
}

/** Rang de gravité (0 à 3), ou `-1` si la fiche n'a pas été renseignée. */
function toxicityRank(value) {
  const level = normalizeToxicityLevel(value);
  return level ? TOXICITY_LEVEL_RANK[level] : -1;
}

module.exports = {
  TOXICITY_LEVEL_VALUES,
  TOXICITY_LEVEL_LABELS,
  TOXICITY_LEVEL_RANK,
  TOXICITY_LEVEL_ALIASES,
  HAZARD_EXPOSURE_VALUES,
  HAZARD_EXPOSURE_LABELS,
  HAZARD_EXPOSURE_ALIASES,
  normalizeToxicityLevel,
  normalizeHazardExposure,
  listHazardExposures,
  toxicityLevelLabel,
  hazardExposureLabel,
  hasHazard,
  toxicityRank,
};
