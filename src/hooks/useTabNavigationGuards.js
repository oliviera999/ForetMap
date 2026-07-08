import { useEffect } from 'react';

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
 *   médiathèque) → repli sur `map` ou `about` selon le cas d'origine ;
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
 * @param {object} [params.modules] - Drapeaux `publicSettings.modules`.
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
  modules,
}) {
  const tutorialsEnabled = modules?.tutorials_enabled;
  const statsEnabled = modules?.stats_enabled;
  const visitEnabled = modules?.visit_enabled;
  const observationsEnabled = modules?.observations_enabled;
  const forumEnabled = modules?.forum_enabled;

  useEffect(() => {
    if (effectiveIsTeacher) return;
    if (!canAccessStudentMapTasks && (tab === 'map' || tab === 'tasks' || tab === 'maptasks')) {
      if (isVisitor && visitEnabled !== false) setTab('visit');
      else setTab('plants');
    }
  }, [effectiveIsTeacher, canAccessStudentMapTasks, isVisitor, visitEnabled, tab, setTab]);

  useEffect(() => {
    if (effectiveIsTeacher || !isVisitor) return;
    if (tab === 'map' || tab === 'tasks' || tab === 'maptasks' || tab === 'tuto') {
      setTab(visitEnabled !== false ? 'visit' : 'plants');
    }
  }, [effectiveIsTeacher, isVisitor, visitEnabled, tab, setTab]);

  useEffect(() => {
    if (tab === 'maptasks' && !shouldUseDesktopSplit) {
      setTab('map');
    }
  }, [shouldUseDesktopSplit, tab, setTab]);

  useEffect(() => {
    if (tab === 'tuto' && tutorialsEnabled === false) setTab(isVisitor ? 'visit' : 'map');
    if (tab === 'stats' && statsEnabled === false) setTab(isVisitor ? 'visit' : 'map');
    if (tab === 'stats' && statsEnabled !== false && !canViewGeneralStats)
      setTab(isVisitor ? 'visit' : 'map');
    if (tab === 'visit' && visitEnabled === false) setTab(isVisitor ? 'plants' : 'map');
    if (tab === 'mascot_packs' && visitEnabled === false) setTab(isVisitor ? 'plants' : 'map');
    if (tab === 'notebook' && observationsEnabled === false) setTab(isVisitor ? 'visit' : 'map');
    if (tab === 'forum' && !canAccessForum) setTab('about');
    if (tab === 'media_library' && !effectiveIsTeacher) setTab('about');
  }, [
    tab,
    tutorialsEnabled,
    statsEnabled,
    visitEnabled,
    observationsEnabled,
    forumEnabled,
    canAccessForum,
    canViewGeneralStats,
    effectiveIsTeacher,
    isVisitor,
    setTab,
  ]);
}
