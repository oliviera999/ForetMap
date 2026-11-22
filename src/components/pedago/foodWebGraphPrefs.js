/**
 * Disposition mémorisée du graphe du réseau trophique (sortie de `FoodWebGraph.jsx`, flux
 * C3) : le dernier choix explicite est gardé par produit (`foretmap` / `gl`).
 */

/** Clé de mémorisation de la disposition choisie (par produit). */
export const LAYOUT_STORAGE_KEY = 'foretmap.foodweb.layout';

/** Dispositions proposées. `levels` retombe sur les rôles faute de niveaux calculables. */
export const LAYOUT_CIRCLE = 'circle';
export const LAYOUT_LEVELS = 'levels';
export const LAYOUT_CHAIN = 'chain';

/** Lecture tolérante du dernier choix de disposition (stockage indisponible, valeur inconnue). */
export function readStoredLayout(variant) {
  try {
    const raw = window.localStorage.getItem(`${LAYOUT_STORAGE_KEY}.${variant}`);
    return raw === LAYOUT_CIRCLE || raw === LAYOUT_LEVELS ? raw : null;
  } catch (_) {
    return null;
  }
}

export function storeLayout(variant, value) {
  try {
    window.localStorage.setItem(`${LAYOUT_STORAGE_KEY}.${variant}`, value);
  } catch (_) {
    /* stockage indisponible (navigation privée, quota) : sans conséquence */
  }
}
