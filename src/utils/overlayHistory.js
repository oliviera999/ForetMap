/**
 * Entrées history empilées pour que le bouton « retour » du navigateur / Android
 * ferme d’abord les surcouches (modales, panneaux) sans quitter l’écran courant
 * (ex. visite sans connexion).
 */

let stack = [];
let ignorePopCount = 0;
let listening = false;

/**
 * Sur mobile, l’ouverture de la caméra / du sélecteur fichier peut provoquer un ou plusieurs
 * `popstate` au retour dans la page ; sans garde, la pile des surcouches appelle `onClose`
 * et la modale se ferme avant l’événement `change` de l’input file.
 */
let nativePickerGuard = { active: false, budget: 0, fallbackId: null };

function clearNativePickerTimers() {
  if (nativePickerGuard.fallbackId != null) {
    clearTimeout(nativePickerGuard.fallbackId);
    nativePickerGuard.fallbackId = null;
  }
}

/** À appeler après fermeture du sélecteur (change sur l’input, ou file manquant). */
export function disarmNativeFilePickerGuard() {
  nativePickerGuard.active = false;
  nativePickerGuard.budget = 0;
  clearNativePickerTimers();
}

/**
 * À appeler juste avant `input.click()` sur un file picker (galerie / APN).
 * Ignore plusieurs `popstate` (souvent >2 sur Android au retour caméra). Ne pas désarmer sur
 * `window` `focus` : il peut arriver avant `change` et laissait passer les `popstate` suivants.
 * Désarme après `change` (voir `disarmNativeFilePickerGuard`) ou au timeout (annulation / lenteur).
 */
export function armNativeFilePickerGuard() {
  if (typeof window === 'undefined') return;
  disarmNativeFilePickerGuard();
  nativePickerGuard.active = true;
  nativePickerGuard.budget = 12;
  nativePickerGuard.fallbackId = window.setTimeout(() => disarmNativeFilePickerGuard(), 10000);
}

function onPopState() {
  if (nativePickerGuard.active && nativePickerGuard.budget > 0) {
    nativePickerGuard.budget -= 1;
    return;
  }
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
