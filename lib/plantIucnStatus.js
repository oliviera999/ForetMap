'use strict';

/**
 * Statut UICN (Liste rouge) pédagogique des fiches biodiversité.
 * Valeurs canoniques : codes officiels de la Liste rouge mondiale.
 * Aligné sur l’ENUM SQL `plants.iucn_status`.
 */

const IUCN_STATUS_VALUES = Object.freeze(['EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE']);
const IUCN_STATUS_SET = new Set(IUCN_STATUS_VALUES);

/** Libellés courts pour pastilles / filtres (code + sens pédagogique). */
const IUCN_STATUS_LABELS = Object.freeze({
  EX: 'EX — Éteinte',
  EW: 'EW — Éteinte à l’état sauvage',
  CR: 'CR — En danger critique',
  EN: 'EN — En danger',
  VU: 'VU — Vulnérable',
  NT: 'NT — Quasi menacée',
  LC: 'LC — Préoccupation mineure',
  DD: 'DD — Données insuffisantes',
  NE: 'NE — Non évaluée',
});

/** Alias d’import (FR / EN / libellés longs) → code UICN. */
const IUCN_STATUS_ALIASES = Object.freeze({
  ex: 'EX',
  extinct: 'EX',
  eteinte: 'EX',
  éteinte: 'EX',
  ew: 'EW',
  extinct_in_the_wild: 'EW',
  eteinte_a_l_etat_sauvage: 'EW',
  cr: 'CR',
  critically_endangered: 'CR',
  en_danger_critique: 'CR',
  critique: 'CR',
  en: 'EN',
  endangered: 'EN',
  en_danger: 'EN',
  vu: 'VU',
  vulnerable: 'VU',
  vulnérable: 'VU',
  nt: 'NT',
  near_threatened: 'NT',
  quasi_menacee: 'NT',
  quasi_menacée: 'NT',
  lc: 'LC',
  least_concern: 'LC',
  preoccupation_mineure: 'LC',
  préoccupation_mineure: 'LC',
  dd: 'DD',
  data_deficient: 'DD',
  donnees_insuffisantes: 'DD',
  données_insuffisantes: 'DD',
  ne: 'NE',
  not_evaluated: 'NE',
  non_evaluee: 'NE',
  non_évaluée: 'NE',
});

function trimStr(value) {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Normalise une valeur libre vers un code UICN, ou `null`.
 */
function normalizeIucnStatus(value) {
  const raw = trimStr(value);
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (IUCN_STATUS_SET.has(upper)) return upper;
  const key = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (IUCN_STATUS_ALIASES[raw.toLowerCase()]) return IUCN_STATUS_ALIASES[raw.toLowerCase()];
  if (IUCN_STATUS_ALIASES[key]) return IUCN_STATUS_ALIASES[key];
  // « VU — Vulnérable » / « LC Préoccupation mineure »
  const codePrefix = upper.match(/^(EX|EW|CR|EN|VU|NT|LC|DD|NE)\b/);
  if (codePrefix) return codePrefix[1];
  return null;
}

function iucnStatusLabel(value) {
  const canonical = normalizeIucnStatus(value);
  return canonical ? IUCN_STATUS_LABELS[canonical] : '';
}

/** Pastille courte (code seul) pour les vignettes. */
function iucnStatusBadgeLabel(value) {
  const canonical = normalizeIucnStatus(value);
  return canonical ? `UICN ${canonical}` : '';
}

module.exports = {
  IUCN_STATUS_VALUES,
  IUCN_STATUS_LABELS,
  IUCN_STATUS_ALIASES,
  normalizeIucnStatus,
  iucnStatusLabel,
  iucnStatusBadgeLabel,
};
