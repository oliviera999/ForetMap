'use strict';

/**
 * Statut biogéographique pédagogique des fiches biodiversité.
 * Valeurs canoniques alignées sur l’ENUM SQL `plants.origin_status`.
 */

const ORIGIN_STATUS_VALUES = Object.freeze(['indigene', 'introduit', 'envahissant']);
const ORIGIN_STATUS_SET = new Set(ORIGIN_STATUS_VALUES);

const ORIGIN_STATUS_LABELS = Object.freeze({
  indigene: 'Indigène',
  introduit: 'Introduit',
  envahissant: 'Envahissant',
});

/** Alias d’import (FR / EN / typos courantes) → valeur canonique. */
const ORIGIN_STATUS_ALIASES = Object.freeze({
  indigene: 'indigene',
  indigène: 'indigene',
  native: 'indigene',
  autochtono: 'indigene',
  autochtone: 'indigene',
  endemique: 'indigene',
  endémique: 'indigene',
  endemic: 'indigene',
  introduit: 'introduit',
  introduite: 'introduit',
  introduced: 'introduit',
  exotic: 'introduit',
  exotique: 'introduit',
  non_indigene: 'introduit',
  non_native: 'introduit',
  envahissant: 'envahissant',
  envahissante: 'envahissant',
  invasive: 'envahissant',
  invasif: 'envahissant',
  invasive_species: 'envahissant',
});

function trimStr(value) {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Normalise une valeur libre (formulaire, import) vers l’ENUM, ou `null`.
 * Accepte les clés canoniques, libellés FR et alias courants.
 */
function normalizeOriginStatus(value) {
  const raw = trimStr(value);
  if (!raw) return null;
  const key = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (ORIGIN_STATUS_SET.has(key)) return key;
  if (ORIGIN_STATUS_ALIASES[raw.toLowerCase()]) return ORIGIN_STATUS_ALIASES[raw.toLowerCase()];
  if (ORIGIN_STATUS_ALIASES[key]) return ORIGIN_STATUS_ALIASES[key];
  return null;
}

function originStatusLabel(value) {
  const canonical = normalizeOriginStatus(value);
  return canonical ? ORIGIN_STATUS_LABELS[canonical] : '';
}

module.exports = {
  ORIGIN_STATUS_VALUES,
  ORIGIN_STATUS_LABELS,
  ORIGIN_STATUS_ALIASES,
  normalizeOriginStatus,
  originStatusLabel,
};
