import { useEffect } from 'react';
import { TAB_STORAGE_KEY } from '../constants/app-runtime';
import {
  safeLocalStorageSetItem,
  safeSessionStorageGetItem,
  safeSessionStorageRemoveItem,
} from '../shared/platform/browserStorage.js';

/**
 * Persistance des préférences d'interface dans le stockage navigateur (O5).
 *
 * Regroupe les effets de bord « état UI -> stockage » jusque-là dispersés dans App.jsx :
 *  - mémorise l'onglet courant (`TAB_STORAGE_KEY`) ;
 *  - consomme une seule fois le drapeau de mise à jour du service worker
 *    (`foretmap_sw_updated`) pour afficher un toast « Nouvelle version installée. ».
 *
 * La **carte active n'est plus mémorisée ici** : cet effet écrivait aussi les cartes
 * posées par la résolution automatique (carte par défaut des réglages, repli sur le
 * premier plan visible), ce qui figeait sur l'appareil un plan que personne n'avait
 * choisi et neutralisait définitivement le réglage « plan ouvert par défaut ». Seul un
 * choix explicite est désormais mémorisé, par `rememberLastViewedMapId`
 * (`src/utils/lastViewedMap.js`), depuis la carte comme depuis la Visite.
 *
 * @param {object} params
 * @param {string} params.tab          Onglet courant à mémoriser.
 * @param {(msg: string) => void} params.onToast  Affiche un toast (typiquement setToast).
 */
export function useAppStoragePersistence({ tab, onToast }) {
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
