/**
 * Statut UICN (Liste rouge) pédagogique des fiches biodiversité (UI).
 * Aligné sur l’ENUM SQL `plants.iucn_status` et `lib/plantIucnStatus.js`.
 */

export const IUCN_STATUS_VALUES = Object.freeze([
  'EX',
  'EW',
  'CR',
  'EN',
  'VU',
  'NT',
  'LC',
  'DD',
  'NE',
]);

export const IUCN_STATUS_LABELS = Object.freeze({
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

const IUCN_STATUS_SET = new Set(IUCN_STATUS_VALUES);

export function normalizeIucnStatus(value) {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (IUCN_STATUS_SET.has(upper)) return upper;
  const codePrefix = upper.match(/^(EX|EW|CR|EN|VU|NT|LC|DD|NE)\b/);
  return codePrefix ? codePrefix[1] : '';
}

export function iucnStatusLabel(value) {
  const canonical = normalizeIucnStatus(value);
  return canonical ? IUCN_STATUS_LABELS[canonical] : '';
}

export function iucnStatusBadgeLabel(value) {
  const canonical = normalizeIucnStatus(value);
  return canonical ? `UICN ${canonical}` : '';
}
