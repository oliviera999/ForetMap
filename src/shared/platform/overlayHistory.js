/**
 * Entrées history empilées pour que le bouton « retour » du navigateur / Android
 * ferme d’abord les surcouches (modales, panneaux) sans quitter l’écran courant
 * (ex. visite sans connexion).
 */

let stack = [];
/**
 * Entrées d'historique réellement posées par les surcouches. Doit rester égal à
 * `stack.length` : c'est l'invariant que `syncHistoryDepth` rétablit.
 */
let pushedEntries = 0;
let ignorePopCount = 0;
let listening = false;
let syncScheduled = false;

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

/**
 * Ramène la profondeur d'historique sur le nombre de surcouches ouvertes.
 *
 * Pourquoi en différé : quand une surcouche en remplace une autre dans le **même** rendu
 * (toucher un résultat de recherche ferme la liste et ouvre la fiche), le démontage et le
 * montage s'enchaînent dans le même lot React. Un `history.back()` immédiat au démontage
 * partait alors qu'un `pushState` allait suivre : le compte se décalait d'une entrée, et la
 * fermeture suivante reculait une fois de trop — le visiteur **quittait le plan**
 * (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N16). En microtâche, les deux mouvements se
 * sont produits : on n'ajuste qu'une fois, et seulement s'il reste vraiment des entrées en trop.
 */
function syncHistoryDepth() {
  syncScheduled = false;
  if (typeof window === 'undefined') return;
  const excess = pushedEntries - stack.length;
  if (excess <= 0) return;
  pushedEntries -= excess;
  ignorePopCount += excess;
  window.history.go(-excess);
}

function scheduleHistorySync() {
  if (syncScheduled || typeof window === 'undefined') return;
  syncScheduled = true;
  Promise.resolve().then(syncHistoryDepth);
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
  // Retour navigateur : le visiteur vient de consommer une entrée de surcouche.
  if (pushedEntries > 0) pushedEntries -= 1;
  const fn = stack.pop();
  if (typeof fn === 'function') {
    try {
      fn();
    } catch (_) {
      // ignorer : fermeture React déjà partielle
    }
  }
  // La fermeture peut en démonter d'autres (feuille qui en referme une seconde).
  scheduleHistorySync();
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
  pushedEntries += 1;
  stack.push(closeFn);
}

/**
 * Retire la surcouche du sommet de pile, et rend son entrée d'historique — en différé, le
 * temps qu'une surcouche qui la remplace dans le même rendu ait pu s'empiler
 * (voir `syncHistoryDepth`). Sans effet si `closeFn` n'est plus en tête.
 */
export function removeOverlayClose(closeFn) {
  if (typeof window === 'undefined' || typeof closeFn !== 'function') return;
  const i = stack.lastIndexOf(closeFn);
  if (i === -1) return;
  if (i !== stack.length - 1) return;
  stack.pop();
  scheduleHistorySync();
}

/** Vide la pile et recule l’historique sans invoquer les callbacks (ex. quitter la visite invité). */
export function abandonAllOverlays() {
  if (typeof window === 'undefined') return;
  const n = stack.length;
  if (n === 0) return;
  stack = [];
  const back = Math.min(n, pushedEntries);
  pushedEntries -= back;
  if (back === 0) return;
  ignorePopCount = back;
  window.history.go(-back);
}
