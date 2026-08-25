/**
 * Bus d'événements du bandeau d'état sticky (ForetMap + GL).
 *
 * Neutre produit (aucune session, aucun jeton) : les émetteurs sont la boucle
 * réseau partagée (`fetchJsonWithRetry` — reconnexions) et l'auto-enregistrement
 * (`useDebouncedAutoSave`). Le consommateur unique est `AppStatusSticky`.
 *
 * Contrat du détail émis : `{ id, kind, message?, attempt?, maxAttempts? }`
 * - `id` : identifiant stable de la source (une requête, un formulaire) ;
 * - `kind` : 'saving' | 'saved' | 'error' | 'retrying' | 'recovered' | 'clear' ;
 * - `clear` retire l'entrée `id` de l'affichage.
 */

export const APP_STATUS_EVENT = 'foretmap:app-status';

export function emitAppStatus(detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(APP_STATUS_EVENT, { detail }));
}

/** Abonne `handler(detail)` ; retourne la fonction de désabonnement. */
export function subscribeAppStatus(handler) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  const listener = (event) => handler(event?.detail || {});
  window.addEventListener(APP_STATUS_EVENT, listener);
  return () => window.removeEventListener(APP_STATUS_EVENT, listener);
}
