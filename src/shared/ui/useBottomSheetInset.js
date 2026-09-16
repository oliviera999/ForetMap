import { useSyncExternalStore } from 'react';

import { getBottomSheetInset, subscribeBottomSheetInset } from './bottomSheetInset.js';

/**
 * Hauteur (px) occupée en bas d'écran par les feuilles basses **non bloquantes** ouvertes.
 *
 * Le produit s'en sert pour ce que la variable CSS ne sait pas faire : recadrer la carte sur
 * la bande qui reste visible, pour que le lieu dont on vient d'ouvrir la fiche ne se retrouve
 * pas dessous (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md` B2).
 *
 * @returns {number} hauteur en px, `0` quand aucune feuille non bloquante n'est ouverte.
 */
export function useBottomSheetInset() {
  return useSyncExternalStore(subscribeBottomSheetInset, getBottomSheetInset, () => 0);
}

export default useBottomSheetInset;
