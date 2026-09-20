import { useEffect } from 'react';

import { readLastViewedMapId } from '../utils/lastViewedMap.js';

/**
 * Sélection de la carte par défaut depuis les réglages publics (extrait de App.jsx, O5).
 *
 * Encapsule l'unique effet inline d'App.jsx qui, une fois les réglages publics
 * prêts et SI aucune carte n'est déjà mémorisée sur l'appareil, choisit
 * la carte par défaut adaptée au contexte (visite invité, vue prof ou vue élève)
 * et la pose via `setActiveMapId`. Si une carte est déjà mémorisée, ou si aucune
 * carte par défaut n'est configurée, l'effet ne fait rien (états locaux
 * inchangés).
 *
 * Concern autonome et faiblement couplé : aucun état n'est déplacé ni créé.
 * `activeMapId` (état cœur d'App.jsx) reste géré par App.jsx ; seul l'effet est
 * encapsulé et `setActiveMapId` est passé en paramètre. La mémoire du dernier plan
 * consulté est lue via `readLastViewedMapId` (`src/utils/lastViewedMap.js`), source
 * unique partagée avec la carte et la Visite. Gardes inchangées :
 * `publicSettingsReady`, plan déjà mémorisé, carte par défaut vide.
 *
 * @param {object} params
 * @param {boolean} params.publicSettingsReady - réglages publics chargés.
 * @param {object|null|undefined} params.publicSettings - réglages publics (lecture `map.default_map_*`).
 * @param {boolean} params.effectiveIsTeacher - statut enseignant effectif courant.
 * @param {boolean} params.showPublicVisit - mode visite invité actif.
 * @param {(updater: (prev: string) => string) => void} params.setActiveMapId - setter de la carte active.
 */
export function useDefaultActiveMapFromSettings({
  publicSettingsReady,
  publicSettings,
  effectiveIsTeacher,
  showPublicVisit,
  setActiveMapId,
}) {
  useEffect(() => {
    if (!publicSettingsReady) return;
    // Un plan explicitement choisi sur cet appareil (carte ou Visite) prime sur le
    // réglage : c'est lui qu'on rouvre à la reconnexion.
    if (readLastViewedMapId()) return;
    const defaultMap = showPublicVisit
      ? publicSettings?.map?.default_map_visit
      : effectiveIsTeacher
        ? publicSettings?.map?.default_map_teacher
        : publicSettings?.map?.default_map_student;
    const nextMapId = String(defaultMap || '').trim();
    if (!nextMapId) return;
    setActiveMapId((prev) => (prev === nextMapId ? prev : nextMapId));
  }, [
    effectiveIsTeacher,
    publicSettings?.map?.default_map_student,
    publicSettings?.map?.default_map_teacher,
    publicSettings?.map?.default_map_visit,
    publicSettingsReady,
    showPublicVisit,
    setActiveMapId,
  ]);
}
