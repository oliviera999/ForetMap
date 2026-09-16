/**
 * Hauteur occupée par les feuilles basses **non bloquantes**, publiée en variable CSS
 * `--fm-bottom-sheet-inset` sur la racine du document.
 *
 * Une feuille non bloquante laisse la carte vivante derrière elle — mais les commandes de la
 * carte (zoom, « Voir tout le plan », « Me situer ») sont ancrées en bas à droite : elles
 * passaient dessous et devenaient intouchables dès qu'une fiche s'ouvrait
 * (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N2). Le produit s'en sert pour les remonter.
 *
 * Plusieurs feuilles peuvent cohabiter (résultats + filtres) : on publie la plus haute, et la
 * variable disparaît quand la dernière se referme.
 */

/** @type {Map<string, number>} */
const openSheets = new Map();

/** Abonnés à la hauteur courante (produits qui doivent aussi **déplacer** quelque chose). */
/** @type {Set<(inset: number) => void>} */
const listeners = new Set();

/** Dernière hauteur publiée, en px (0 = aucune feuille non bloquante ouverte). */
let currentInset = 0;

/**
 * La hauteur publiée est la **vraie** hauteur couverte, sans plafond.
 *
 * Elle était plafonnée à 60 % de la fenêtre, et le Plan la replafonnait à 30 % : les commandes
 * de carte remontaient donc de 199 px sous une feuille haute de 365 px, et trois d'entre elles
 * restaient **dans** la feuille, intouchables (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md`
 * B1). Un plafond posé ici ment sur ce qui est couvert ; c'est au produit de décider quoi faire
 * quand la feuille ne laisse plus de place — le Plan efface alors ses commandes au lieu de les
 * laisser sous la feuille.
 */

function applyInset() {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement;
  if (openSheets.size === 0) {
    root.style.removeProperty('--fm-bottom-sheet-inset');
    publish(0);
    return;
  }
  const inset = Math.max(0, ...openSheets.values());
  if (inset <= 0) root.style.removeProperty('--fm-bottom-sheet-inset');
  else root.style.setProperty('--fm-bottom-sheet-inset', `${Math.round(inset)}px`);
  publish(inset <= 0 ? 0 : Math.round(inset));
}

function publish(inset) {
  if (inset === currentInset) return;
  currentInset = inset;
  for (const listener of listeners) {
    try {
      listener(inset);
    } catch (_) {
      // un abonné qui échoue ne doit pas empêcher les autres d'être prévenus
    }
  }
}

/**
 * Hauteur courante des feuilles non bloquantes, en px.
 *
 * La variable CSS suffit tant qu'il s'agit de **décaler** un élément ; elle ne suffit plus dès
 * qu'il faut en **calculer** quelque chose — recentrer la carte sur le lieu ouvert au-dessus
 * de la feuille demande la valeur en JavaScript
 * (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md` B2).
 */
export function getBottomSheetInset() {
  return currentInset;
}

/**
 * S'abonne aux changements de hauteur. Renvoie la fonction de désabonnement.
 * @param {(inset: number) => void} listener
 */
export function subscribeBottomSheetInset(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Déclare (ou met à jour) la hauteur d'une feuille ouverte. */
export function setBottomSheetInset(id, heightPx) {
  const height = Number(heightPx);
  openSheets.set(String(id), Number.isFinite(height) && height > 0 ? height : 0);
  applyInset();
}

/** Retire une feuille fermée. */
export function clearBottomSheetInset(id) {
  openSheets.delete(String(id));
  applyInset();
}

/** Remise à zéro (tests). */
export function resetBottomSheetInsets() {
  openSheets.clear();
  applyInset();
}
