import { useEffect } from 'react';
import { TAB_STORAGE_KEY } from '../constants/app-runtime';
import {
  safeLocalStorageSetItem,
  safeSessionStorageGetItem,
  safeSessionStorageRemoveItem,
} from '../utils/browserStorage.js';

/**
 * Persistance des préférences d'interface dans le stockage navigateur (O5).
 *
 * Regroupe les effets de bord « état UI -> stockage » jusque-là dispersés dans App.jsx :
 *  - mémorise la carte active (`foretmap_active_map`) ;
 *  - mémorise l'onglet courant (`TAB_STORAGE_KEY`) ;
 *  - consomme une seule fois le drapeau de mise à jour du service worker
 *    (`foretmap_sw_updated`) pour afficher un toast « Nouvelle version installée. ».
 *
 * Comportement strictement identique à l'origine : mêmes clés, mêmes helpers
 * `safe*Storage` (tolérants au stockage indisponible), même message de toast.
 *
 * @param {object} params
 * @param {string} params.activeMapId  Identifiant de la carte active à mémoriser.
 * @param {string} params.tab          Onglet courant à mémoriser.
 * @param {(msg: string) => void} params.onToast  Affiche un toast (typiquement setToast).
 */
export function useAppStoragePersistence({ activeMapId, tab, onToast }) {
  useEffect(() => {
    safeLocalStorageSetItem('foretmap_active_map', activeMapId);
  }, [activeMapId]);

  useEffect(() => {
    safeLocalStorageSetItem(TAB_STORAGE_KEY, tab);
  }, [tab]);

  useEffect(() => {
    try {
      if (safeSessionStorageGetItem('foretmap_sw_updated', null) === '1') {
        safeSessionStorageRemoveItem('foretmap_sw_updated');
        onToast('Nouvelle version installée.');
      }
    } catch (_) {}
    // Effet de montage : on consomme le drapeau une seule fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
