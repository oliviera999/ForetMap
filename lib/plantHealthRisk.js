'use strict';

/**
 * Risque sanitaire des fiches biodiversité — ce que l'espèce peut *transmettre*.
 *
 * Distinct de `lib/plantHazard.js` (toxicité) et ce n'est pas un détail de rangement : la
 * rage, le tétanos ou la salmonellose ne rendent pas l'animal toxique, elles le rendent
 * porteur. Écrire « mortel » dans `toxicity_level` sur la fiche du renard serait faux, et
 * rendrait la pastille de toxicité illisible sur tout le catalogue animal.
 *
 * Valeurs canoniques : celles du SET SQL `plants.health_risk`, lues dans le référentiel. Même
 * contrat que les autres normalisateurs : une valeur libre venue d'un formulaire ou d'un
 * import est ramenée à la valeur canonique, ou écartée — jamais écrite telle quelle, le SET
 * SQL la rejetterait et l'enregistrement de la fiche échouerait.
 */

const { HEALTH_RISK_ENUM } = require('./shared/biodivEnums');

// Source unique : le référentiel partagé (`src/shared/enums/biodivEnums.js`, miroir CJS
// `lib/shared/`), aligné sur le SET SQL par `tests/enums-referential.test.js`. Une copie
// locale avait laissé le normaliseur écarter les 7 valeurs ajoutées en prod (ornithose…) à
// chaque enregistrement d'une fiche (flux F7).
const HEALTH_RISK_VALUES = HEALTH_RISK_ENUM.values;
const HEALTH_RISK_SET = new Set(HEALTH_RISK_VALUES);

const HEALTH_RISK_LABELS = HEALTH_RISK_ENUM.labels;

const HEALTH_RISK_ALIASES = Object.freeze({
  rage: 'rage',
  rabies: 'rage',
  lyssavirus: 'rage',
  tetanos: 'tetanos',
  tetanus: 'tetanos',
  salmonellose: 'salmonellose',
  salmonelle: 'salmonellose',
  salmonelles: 'salmonellose',
  salmonella: 'salmonellose',
  leptospirose: 'leptospirose',
  leptospira: 'leptospirose',
  leptospirosis: 'leptospirose',
  toxoplasmose: 'toxoplasmose',
  toxoplasmosis: 'toxoplasmose',
  toxoplasma: 'toxoplasmose',
  vecteur: 'vecteur',
  vectrice: 'vecteur',
  vector: 'vecteur',
  porteur_de_germes: 'vecteur',
  transmission: 'vecteur',
  allergie: 'allergie',
  allergene: 'allergie',
  allergisant: 'allergie',
  allergy: 'allergie',
  pollen: 'allergie',
  ornithose: 'ornithose',
  psittacose: 'ornithose',
  psittacosis: 'ornithose',
  mycobacteriose: 'mycobacteriose',
  mycobacterie: 'mycobacteriose',
  mycobacteriosis: 'mycobacteriose',
  aspergillose: 'aspergillose',
  aspergillus: 'aspergillose',
  aspergillosis: 'aspergillose',
  toxocarose: 'toxocarose',
  toxocara: 'toxocarose',
  toxocariasis: 'toxocarose',
  teigne: 'teigne',
  dermatophytose: 'teigne',
  ringworm: 'teigne',
  echinococcose: 'echinococcose',
  echinococcus: 'echinococcose',
  echinococcosis: 'echinococcose',
  hydatidose: 'echinococcose',
  fievre_q: 'fievre_q',
  coxiellose: 'fievre_q',
  q_fever: 'fievre_q',
});

function slugify(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Normalise une liste de risques sanitaires (chaîne séparée par virgules, points-virgules ou
 * barres, ou tableau) vers la chaîne attendue par le SET SQL.
 *
 * Les doublons sont écrasés et l'ordre canonique de `HEALTH_RISK_VALUES` est réimposé : deux
 * fiches portant les mêmes risques produisent la même chaîne, ce qui rend les comparaisons
 * et les tests stables.
 *
 * @returns {string|null} ex. `'rage,toxoplasmose'`, ou `null` si rien de reconnu.
 */
function normalizeHealthRisk(value) {
  const parts = Array.isArray(value) ? value : String(value == null ? '' : value).split(/[,;|]/);
  const found = new Set();
  for (const part of parts) {
    const key = slugify(part);
    if (!key) continue;
    if (HEALTH_RISK_SET.has(key)) found.add(key);
    else if (HEALTH_RISK_ALIASES[key]) found.add(HEALTH_RISK_ALIASES[key]);
  }
  if (found.size === 0) return null;
  return HEALTH_RISK_VALUES.filter((entry) => found.has(entry)).join(',');
}

/** Liste des risques sanitaires d'une fiche, dans l'ordre canonique. */
function listHealthRisks(value) {
  const normalized = normalizeHealthRisk(value);
  return normalized ? normalized.split(',') : [];
}

function healthRiskLabel(value) {
  const key = slugify(value);
  const canonical = HEALTH_RISK_SET.has(key) ? key : HEALTH_RISK_ALIASES[key];
  return canonical ? HEALTH_RISK_LABELS[canonical] : '';
}

/** Vrai si la fiche porte un risque sanitaire à signaler. */
function hasHealthRisk(plant) {
  return listHealthRisks(plant?.health_risk).length > 0;
}

module.exports = {
  HEALTH_RISK_VALUES,
  HEALTH_RISK_LABELS,
  HEALTH_RISK_ALIASES,
  normalizeHealthRisk,
  listHealthRisks,
  healthRiskLabel,
  hasHealthRisk,
};
