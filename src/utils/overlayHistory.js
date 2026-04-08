/**
 * Entrées history empilées pour que le bouton « retour » du navigateur / Android
 * ferme d’abord les surcouches (modales, panneaux) sans quitter l’écran courant
 * (ex. visite sans connexion).
 */

let stack = [];
let ignorePopCount = 0;
let listening = false;

function onPopState() {
  if (ignorePopCount > 0) {
    ignorePopCount -= 1;
    return;
  }
  const fn = stack.pop();
  if (typeof fn === 'function') {
    try {
      fn();
    } catch (_) {
      // ignorer : fermeture React déjà partielle
    }
  }
}

function ensureListener() {
  if (listening) return;
  listening = true;
  window.addEventListener('popstate', onPopState);
}

/** Enregistre une surcouche : un « retour » appellera closeFn (puis dépile l’historique). */
export function pushOverlayClose(closeFn) {
  if (typeof window === 'undefined' || typeof closeFn !== 'function') return;
  ensureListener();
  window.history.pushState({ foretmapOverlay: true }, '', window.location.href);
  stack.push(closeFn);
}

/**
 * Retire la surcouche du sommet de pile et recule d’une entrée dans l’historique
 * (fermeture par bouton ✕ / action interne). Sans effet si closeFn n’est plus en tête.
 */
export function removeOverlayClose(closeFn) {
  if (typeof window === 'undefined' || typeof closeFn !== 'function') return;
  const i = stack.lastIndexOf(closeFn);
  if (i === -1) return;
  if (i !== stack.length - 1) return;
  stack.pop();
  ignorePopCount = 1;
  window.history.back();
}

/** Vide la pile et recule l’historique sans invoquer les callbacks (ex. quitter la visite invité). */
export function abandonAllOverlays() {
  if (typeof window === 'undefined') return;
  const n = stack.length;
  if (n === 0) return;
  stack = [];
  ignorePopCount = n;
  window.history.go(-n);
}
