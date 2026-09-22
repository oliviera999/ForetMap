/**
 * Statut biogéographique pédagogique des fiches biodiversité (UI).
 * Aligné sur l’ENUM SQL `plants.origin_status` et `lib/plantOriginStatus.js`.
 */

export const ORIGIN_STATUS_VALUES = Object.freeze([
  'indigene',
  'introduit',
  'envahissant',
  'endemique',
  'domestique',
]);

export const ORIGIN_STATUS_LABELS = Object.freeze({
  indigene: 'Indigène',
  introduit: 'Introduit',
  envahissant: 'Envahissant',
  endemique: 'Endémique',
  domestique: 'Domestique',
});

const ORIGIN_STATUS_SET = new Set(ORIGIN_STATUS_VALUES);

export function normalizeOriginStatus(value) {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const key = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return ORIGIN_STATUS_SET.has(key) ? key : '';
}

export function originStatusLabel(value) {
  const canonical = normalizeOriginStatus(value);
  return canonical ? ORIGIN_STATUS_LABELS[canonical] : '';
}
