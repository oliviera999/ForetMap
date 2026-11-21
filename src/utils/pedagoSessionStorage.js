/**
 * Séance pédagogique en cours, gardée dans `sessionStorage` (reprise après rechargement).
 *
 * Module sans composant, à dessein (audit UI/UX du 19/11/2026, U1 — lot K) : les hooks du
 * shell montés dès l'écran de connexion l'importent, et l'importer depuis le fichier du
 * composant y ramenait ce composant et toutes ses dépendances.
 */
import { PEDAGO_SESSION_STORAGE_KEY as STORAGE_KEY } from './pedagoSessionScope.js';

export function readStoredPedagoSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id || !Array.isArray(parsed.steps)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredPedagoSession(state) {
  try {
    if (!state) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}
