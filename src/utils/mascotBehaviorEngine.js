/**
 * Moteur de comportement mascotte **partagé FM / GL** (étape 3 du plan de convergence,
 * voir `docs/MASCOT_ARCHITECTURE_CONVERGENCE.md`).
 *
 * Résout un déclencheur (donnée du pack) en une **action** produit-agnostique
 * `{ state, durationMs, dialog, everyMs }`, puis l'exécute via des primitives fournies
 * par le produit (`playState`, `showDialog`). FM fournit `triggerMascotTransientState`
 * mono-mascotte ; GL fournit `triggerTransient` lié à une équipe.
 *
 * @see src/utils/visitMascotCustomBehaviors.js (extraction) ·
 *   src/hooks/useAmbientMascotBehavior.js · src/gl/hooks/useGLBoardAmbientBehavior.js
 */
import {
  getPeriodicTriggers,
  getTapTriggers,
  resolveTriggerDialogLines,
} from './visitMascotCustomBehaviors.js';

/**
 * Résout un déclencheur en action exécutable (état + durée + bulle + intervalle).
 * @param {object|null} entry Entrée catalogue (porte `dialogProfile` éventuel).
 * @param {object} trigger Déclencheur personnalisé du pack.
 * @returns {{ key: string, state: string, durationMs: number, everyMs: number, dialog: string[] }}
 */
export function resolveTriggerAction(entry, trigger) {
  return {
    key: String(trigger?.key || ''),
    state: String(trigger?.state || ''),
    durationMs: Math.max(200, Number(trigger?.durationMs) || 1000),
    everyMs: Number(trigger?.everyMs) || 0,
    dialog: resolveTriggerDialogLines(entry, trigger),
  };
}

/** Actions ambiantes (déclencheurs `periodic`) d'une entrée. */
export function getAmbientActions(entry) {
  return getPeriodicTriggers(entry).map((t) => resolveTriggerAction(entry, t));
}

/** Actions au tap (déclencheurs `tap`) d'une entrée. */
export function getTapActions(entry) {
  return getTapTriggers(entry).map((t) => resolveTriggerAction(entry, t));
}

/**
 * Exécute une action via les primitives du produit.
 * @param {{ state: string, durationMs: number, dialog?: string[] }} action
 * @param {{ playState?: (state: string, durationMs: number) => void, showDialog?: (lines: string[]) => void }} primitives
 */
export function runBehaviorAction(action, { playState, showDialog } = {}) {
  if (!action || !action.state) return;
  if (typeof playState === 'function') playState(action.state, action.durationMs);
  if (Array.isArray(action.dialog) && action.dialog.length && typeof showDialog === 'function') {
    showDialog(action.dialog);
  }
}
