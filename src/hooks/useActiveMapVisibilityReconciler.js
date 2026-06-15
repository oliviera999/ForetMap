import { useEffect } from 'react';

import { pickVisibleMapId } from '../utils/appShellHelpers';

/**
 * Réconciliation de la carte active avec les cartes visibles (extrait de App.jsx, O5).
 *
 * Encapsule l'unique effet inline d'App.jsx qui garde `activeMapId` cohérent avec
 * la liste `visibleMaps` (filtrée par affiliation / vue prof / visite invité) :
 * - aucune carte visible → vide `activeMapId` s'il était posé ;
 * - carte active déjà visible → ne touche à rien ;
 * - sinon → choisit la carte par défaut adaptée au contexte (visite / prof /
 *   élève) si elle est visible, à défaut la première carte visible, via
 *   `pickVisibleMapId`, et la pose avec `setActiveMapId`.
 *
 * Concern autonome et faiblement couplé : aucun état n'est déplacé ni créé.
 * `activeMapId` (état cœur d'App.jsx) reste possédé par App.jsx ; seul l'effet est
 * encapsulé et `setActiveMapId` est passé en paramètre. La dérivation pure
 * `pickVisibleMapId` provient de l'util partagé et est importée directement ici.
 * Iso-comportement : mêmes gardes (liste vide, carte déjà visible), même
 * sélection conditionnelle, mêmes appels (`setActiveMapId('')` /
 * `setActiveMapId((prev) => …)`) et mêmes dépendances que l'ancien `useEffect`.
 *
 * @param {object} params
 * @param {string} params.activeMapId - identifiant de la carte active courante.
 * @param {Array<object>} params.visibleMaps - cartes visibles dans le contexte courant.
 * @param {boolean} params.effectiveIsTeacher - statut enseignant effectif courant.
 * @param {boolean} params.showPublicVisit - mode visite invité actif.
 * @param {object|null|undefined} params.publicSettings - réglages publics (lecture `map.default_map_*`).
 * @param {(next: string | ((prev: string) => string)) => void} params.setActiveMapId - setter de la carte active.
 */
export function useActiveMapVisibilityReconciler({
  activeMapId,
  visibleMaps,
  effectiveIsTeacher,
  showPublicVisit,
  publicSettings,
  setActiveMapId,
}) {
  useEffect(() => {
    if (!Array.isArray(visibleMaps) || visibleMaps.length === 0) {
      if (activeMapId) setActiveMapId('');
      return;
    }
    if (activeMapId && visibleMaps.some((map) => map.id === activeMapId)) return;
    const preferredDefaultMapId = showPublicVisit
      ? publicSettings?.map?.default_map_visit
      : (effectiveIsTeacher ? publicSettings?.map?.default_map_teacher : publicSettings?.map?.default_map_student);
    const nextMapId = pickVisibleMapId(visibleMaps, preferredDefaultMapId);
    setActiveMapId((prev) => (prev === nextMapId ? prev : nextMapId));
  }, [
    activeMapId,
    effectiveIsTeacher,
    publicSettings?.map?.default_map_student,
    publicSettings?.map?.default_map_teacher,
    publicSettings?.map?.default_map_visit,
    showPublicVisit,
    visibleMaps,
    setActiveMapId,
  ]);
}
