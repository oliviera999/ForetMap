/**
 * Registre central des comportements de mascotte visite (états & déclencheurs).
 *
 * Source unique pour **dériver** les options d'états/déclencheurs depuis
 * `(palette canonique ⊕ pack actif)`, au lieu d'importer des constantes figées à
 * chaque point d'itération (éditeurs, dropdowns). Les énumérations
 * (`VISIT_MASCOT_STATE`, `VISIT_MASCOT_INTERACTION_EVENT`) restent les **valeurs par
 * défaut** ; les états personnalisés d'un pack (`customStates`) s'y ajoutent.
 *
 * Étape 1 du plan de convergence — voir `docs/MASCOT_ARCHITECTURE_CONVERGENCE.md`.
 */
import { VISIT_MASCOT_STATE } from './visitMascotState.js';
import { STATE_OPTIONS, STATE_LABELS } from '../constants/mascotStateLabels.js';
import {
  VISIT_MASCOT_INTERACTION_EVENT_KEYS,
  VISIT_MASCOT_INTERACTION_LABELS,
} from './visitMascotInteractionEvents.js';

/** Clés d'états canoniques (palette prédéfinie). */
export const CANONICAL_STATE_KEYS = Object.freeze(Object.values(VISIT_MASCOT_STATE));

const CANONICAL_STATE_KEY_SET = new Set(CANONICAL_STATE_KEYS);

/**
 * Lit les états personnalisés portés par un **pack** (modèle éditeur) **ou** une
 * **entrée catalogue** résolue (`spriteCut.customStates`).
 * @param {object|null} packOrEntry
 * @returns {Array<{ key: string, label?: string }>}
 */
export function extractCustomStates(packOrEntry) {
  if (!packOrEntry || typeof packOrEntry !== 'object') return [];
  if (Array.isArray(packOrEntry.customStates)) return packOrEntry.customStates;
  if (Array.isArray(packOrEntry.spriteCut?.customStates)) return packOrEntry.spriteCut.customStates;
  return [];
}

/** Clés d'états personnalisés valides (non vides, hors collision canonique). */
export function getCustomStateKeys(packOrEntry) {
  const seen = new Set();
  const out = [];
  for (const cs of extractCustomStates(packOrEntry)) {
    const key = String(cs?.key || '').trim();
    if (!key || CANONICAL_STATE_KEY_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Ensemble de toutes les clés d'états acceptées par un pack : canoniques + personnalisées. */
export function getAllStateKeys(packOrEntry) {
  return [...CANONICAL_STATE_KEYS, ...getCustomStateKeys(packOrEntry)];
}

/**
 * Libellé d'un état : libellé personnalisé valide du pack > libellé canonique > clé.
 * (Une clé personnalisée qui collisionne avec un état canonique est ignorée — comme
 * partout ailleurs : elle est rejetée par la validation.)
 */
export function getStateLabel(key, packOrEntry = null) {
  const k = String(key || '');
  if (!CANONICAL_STATE_KEY_SET.has(k)) {
    for (const cs of extractCustomStates(packOrEntry)) {
      if (String(cs?.key || '') === k) return cs.label || k;
    }
  }
  return STATE_LABELS[k] || k;
}

/**
 * Options d'états ordonnées pour les menus déroulants / éditeurs :
 * palette canonique (ordre `STATE_OPTIONS`) puis états personnalisés du pack.
 * @param {object|null} packOrEntry
 * @returns {Array<{ key: string, label: string, custom: boolean }>}
 */
export function buildStateOptions(packOrEntry = null) {
  const canonical = STATE_OPTIONS.map((key) => ({
    key,
    label: STATE_LABELS[key] || key,
    custom: false,
  }));
  const customs = [];
  for (const cs of extractCustomStates(packOrEntry)) {
    const key = String(cs?.key || '').trim();
    if (!key || CANONICAL_STATE_KEY_SET.has(key) || customs.some((c) => c.key === key)) continue;
    customs.push({ key, label: cs.label || key, custom: true });
  }
  return [...canonical, ...customs];
}

/**
 * Options d'événements d'interaction (prédéfinis) : `[{ key, label }]`.
 * Centralise l'énumération + libellés pour les éditeurs de profil d'interaction.
 */
export const INTERACTION_EVENT_OPTIONS = Object.freeze(
  VISIT_MASCOT_INTERACTION_EVENT_KEYS.map((key) => ({
    key,
    label: VISIT_MASCOT_INTERACTION_LABELS[key] || key,
  })),
);
