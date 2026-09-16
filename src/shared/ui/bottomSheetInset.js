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

/** Part de la fenêtre au-delà de laquelle remonter les commandes n'a plus de sens. */
const MAX_INSET_RATIO = 0.6;

function applyInset() {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement;
  if (openSheets.size === 0) {
    root.style.removeProperty('--fm-bottom-sheet-inset');
    return;
  }
  const viewport = typeof window !== 'undefined' ? window.innerHeight || 0 : 0;
  const ceiling = viewport > 0 ? viewport * MAX_INSET_RATIO : Number.POSITIVE_INFINITY;
  const tallest = Math.max(0, ...openSheets.values());
  const inset = Math.min(tallest, ceiling);
  if (inset <= 0) root.style.removeProperty('--fm-bottom-sheet-inset');
  else root.style.setProperty('--fm-bottom-sheet-inset', `${Math.round(inset)}px`);
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
