import { api } from '../../services/api';

/**
 * Liste des ressources déjà importées dans le carnet personnel, mutualisée.
 *
 * `GET /api/user-journal/me/imports/refs` renvoie la liste ENTIÈRE, pas celle d'une
 * ressource : chaque `FmLearnAndImportSlot` la demandait pour son propre compte, donc une
 * requête par accusé affiché. Sur le catalogue biodiversité — un accusé par vignette — cela
 * refaisait douze appels identiques pour douze fiches, et autant que d'espèces en vrai.
 * C'est le motif « une requête par fiche » que l'audit de charge avait justement retiré
 * (`docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md`, §1) et que la garde
 * `tests-ui/components/PlantCatalogTiles.test.jsx` surveille.
 *
 * La promesse en cours est donc partagée : tous les accusés montés dans le même rendu
 * attendent le même appel. Le cache est invalidé après un import (la liste vient de
 * changer) et à chaque changement de session (les imports sont propres à l'utilisateur).
 */
let refsPromise = null;

export function fetchJournalImportRefs() {
  if (!refsPromise) {
    refsPromise = Promise.resolve()
      .then(() => api('/api/user-journal/me/imports/refs'))
      .then((res) => (Array.isArray(res?.refs) ? res.refs : []))
      .catch(() => {
        // Un échec ne doit pas geler le cache sur une liste vide : le prochain montage réessaie.
        refsPromise = null;
        return [];
      });
  }
  return refsPromise;
}

export function invalidateJournalImportRefs() {
  refsPromise = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('foretmap_session_changed', invalidateJournalImportRefs);
}
