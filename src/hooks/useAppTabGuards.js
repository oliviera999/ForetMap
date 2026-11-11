import { useEffect } from 'react';
import { useTabNavigationGuards } from './useTabNavigationGuards';

/**
 * Garde-fous d'onglets du shell `App` — extraits tels quels d'`App.jsx` (lot 6) : onglet
 * non autorisé pour la session courante ramené à un onglet permis (`useTabNavigationGuards`),
 * puis renvoi d'un compte « visiteur » hors de la carte, des tâches et des tutoriels.
 *
 * Ordre des effets conservé : `useTabNavigationGuards` puis le renvoi visiteur.
 *
 * @param {object} params
 * @param {string} params.tab Onglet courant.
 * @param {(tab: string) => void} params.setTab Changement d'onglet sans entrée d'historique.
 * @param {object} params.access Droits dérivés (`useAppAccess`).
 * @param {boolean} params.shouldUseDesktopSplit Vue « Cartes & tâches » côte à côte.
 * @param {object|null} params.publicSettings Réglages publics (modules).
 * @param {object|null} params.student Session élève en mémoire.
 */
export function useAppTabGuards({
  tab,
  setTab,
  access,
  shouldUseDesktopSplit,
  publicSettings,
  student,
}) {
  const { effectiveIsTeacher, isVisitor } = access;

  useTabNavigationGuards({
    tab,
    setTab,
    effectiveIsTeacher,
    canAccessStudentMapTasks: access.canAccessStudentMapTasks,
    isVisitor,
    shouldUseDesktopSplit,
    canAccessForum: access.canAccessForum,
    canViewGeneralStats: access.canViewGeneralStats,
    canAccessProfiles: access.canAccessProfiles,
    canAccessTutorials: access.canAccessTutorials,
    modules: publicSettings?.modules,
    canManageIdKeys: access.canManageIdKeys,
    canManageIndividuals: access.canManageIndividuals,
    canManagePedagoSessions: access.canManageFoodWeb,
    canManageFresque: access.canManageFoodWeb,
  });

  useEffect(() => {
    if (effectiveIsTeacher || !isVisitor || !student) return;
    const visitOk = publicSettings?.modules?.visit_enabled !== false;
    if (['map', 'tasks', 'maptasks', 'tuto'].includes(tab)) {
      setTab(visitOk ? 'visit' : 'plants');
    }
  }, [effectiveIsTeacher, isVisitor, student, tab, publicSettings?.modules?.visit_enabled, setTab]);
}
