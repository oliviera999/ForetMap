import { useEffect } from 'react';

import { resolvePedagoModuleAccess } from '../utils/appAccess.js';

/**
 * Garde-fous de navigation par onglet (extrait de App.jsx, O5).
 *
 * Regroupe les effets qui normalisent l'onglet actif `tab` lorsqu'il devient
 * invalide pour le contexte courant (rôle, mise en page, modules désactivés,
 * fusion Tâches/Tuto). Chaque effet appelle `setTab` pour rediriger vers un
 * onglet de repli, exactement comme les anciens `useEffect` inline d'App.jsx :
 *
 * - élève sans accès carte/tâches → repli sur `plants` ;
 * - onglet split `maptasks` hors écran large → repli sur `map` ;
 * - modules désactivés (tuto, stats, visite, packs mascotte, carnet, forum,
 *   médiathèque) → repli sur `map` (ou `visit` pour un visiteur) ou `about` selon
 *   le cas d'origine ;
 * - modules pédagogiques éteints (clés d'identification, individus, séances) : même
 *   repli, **sauf** pour le compte qui porte la permission de gestion du module — il
 *   garde l'onglet pour préparer (`resolvePedagoModuleAccess`, miroir du serveur) ;
 * - onglet `tuto` avec un focus lieu actif (fusion Tâches&tuto) → bascule sur
 *   `tasks`.
 *
 * Iso-comportement : mêmes conditions, mêmes onglets de repli, mêmes tableaux
 * de dépendances que dans App.jsx avant extraction.
 *
 * @param {object} params
 * @param {string} params.tab - Onglet actif courant.
 * @param {(next: string) => void} params.setTab - Setter de l'onglet actif.
 * @param {boolean} params.effectiveIsTeacher
 * @param {boolean} params.canAccessStudentMapTasks
 * @param {boolean} [params.isVisitor]
 * @param {boolean} params.shouldUseDesktopSplit
 * @param {boolean} params.canAccessForum
 * @param {boolean} params.canViewGeneralStats
 * @param {boolean} [params.canAccessProfiles]
 * @param {boolean} [params.canAccessTutorials]
 * @param {object} [params.modules] - Drapeaux `publicSettings.modules`.
 * @param {boolean} [params.canManageIdKeys] - `id_keys.manage`.
 * @param {boolean} [params.canManageIndividuals] - `individuals.manage`.
 * @param {boolean} [params.canManagePedagoSessions] - `plants.manage` (gestion des séances).
 */
export function useTabNavigationGuards({
  tab,
  setTab,
  effectiveIsTeacher,
  canAccessStudentMapTasks,
  isVisitor = false,
  shouldUseDesktopSplit,
  canAccessForum,
  canViewGeneralStats,
  canAccessProfiles = false,
  canAccessTutorials = false,
  modules,
  canManageIdKeys = false,
  canManageIndividuals = false,
  canManagePedagoSessions = false,
}) {
  const tutorialsEnabled = modules?.tutorials_enabled;
  const statsEnabled = modules?.stats_enabled;
  const visitEnabled = modules?.visit_enabled;
  const observationsEnabled = modules?.observations_enabled;
  const forumEnabled = modules?.forum_enabled;
  const pedagoAccess = resolvePedagoModuleAccess({
    modules,
    canManageIdKeys,
    canManageIndividuals,
    canManagePedagoSessions,
  });
  const idKeysAvailable = pedagoAccess.idKeys.available;
  const individualsAvailable = pedagoAccess.individuals.available;
  const pedagoSessionsAvailable = pedagoAccess.pedagoSessions.available;

  useEffect(() => {
    if (effectiveIsTeacher) return;
    if (!canAccessStudentMapTasks && (tab === 'map' || tab === 'tasks' || tab === 'maptasks')) {
      if (isVisitor && visitEnabled !== false) setTab('visit');
      else setTab('plants');
    }
  }, [effectiveIsTeacher, canAccessStudentMapTasks, isVisitor, visitEnabled, tab, setTab]);

  useEffect(() => {
    if (effectiveIsTeacher || !isVisitor) return;
    // Carte / tâches interdites ; les tutos restent accessibles (accusés d'apprentissage).
    if (tab === 'map' || tab === 'tasks' || tab === 'maptasks') {
      setTab(visitEnabled !== false ? 'visit' : 'plants');
    }
  }, [effectiveIsTeacher, isVisitor, visitEnabled, tab, setTab]);

  useEffect(() => {
    if (tab === 'maptasks' && !shouldUseDesktopSplit) {
      setTab('map');
    }
  }, [shouldUseDesktopSplit, tab, setTab]);

  useEffect(() => {
    const visitFallback = isVisitor ? 'visit' : 'map';
    if (tab === 'tuto' && tutorialsEnabled === false) setTab(visitFallback);
    if (tab === 'tuto' && tutorialsEnabled !== false && !canAccessTutorials)
      setTab(visitFallback === 'visit' && visitEnabled !== false ? 'visit' : 'plants');
    if (tab === 'stats' && statsEnabled === false) setTab(visitFallback);
    if (tab === 'stats' && statsEnabled !== false && !canViewGeneralStats) setTab(visitFallback);
    if (tab === 'profiles' && !canAccessProfiles)
      setTab(visitEnabled !== false && isVisitor ? 'visit' : 'plants');
    if (tab === 'visit' && visitEnabled === false) setTab(isVisitor ? 'plants' : 'map');
    if (tab === 'mascot_packs' && visitEnabled === false) setTab(isVisitor ? 'plants' : 'map');
    if (tab === 'notebook' && observationsEnabled === false) setTab(visitFallback);
    if (tab === 'id-keys' && !idKeysAvailable) setTab(visitFallback);
    if (tab === 'individuals' && !individualsAvailable) setTab(visitFallback);
    if (tab === 'sessions' && !pedagoSessionsAvailable) setTab(visitFallback);
    if (tab === 'forum' && !canAccessForum) setTab('about');
    if (tab === 'media_library' && !effectiveIsTeacher) setTab('about');
  }, [
    tab,
    tutorialsEnabled,
    statsEnabled,
    visitEnabled,
    observationsEnabled,
    forumEnabled,
    idKeysAvailable,
    individualsAvailable,
    pedagoSessionsAvailable,
    canAccessForum,
    canViewGeneralStats,
    canAccessProfiles,
    canAccessTutorials,
    effectiveIsTeacher,
    isVisitor,
    setTab,
  ]);
}
