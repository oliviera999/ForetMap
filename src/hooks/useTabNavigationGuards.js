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
 * @param {boolean} params.shouldUseDesktopSplit
 * @param {boolean} params.canAccessForum
 * @param {boolean} params.canViewGeneralStats
 * @param {boolean} params.mergeTasksTutoNav
 * @param {object} [params.modules] - Drapeaux `publicSettings.modules`.
 */
export function useTabNavigationGuards({
  tab,
  setTab,
  effectiveIsTeacher,
  canAccessStudentMapTasks,
  shouldUseDesktopSplit,
  canAccessForum,
  canViewGeneralStats,
  mergeTasksTutoNav,
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
      setTab('plants');
    }
  }, [effectiveIsTeacher, canAccessStudentMapTasks, tab, setTab]);

  useEffect(() => {
    if (tab === 'maptasks' && !shouldUseDesktopSplit) {
      setTab('map');
    }
  }, [shouldUseDesktopSplit, tab, setTab]);

  useEffect(() => {
    if (tab === 'tuto' && tutorialsEnabled === false) setTab('map');
    if (tab === 'stats' && statsEnabled === false) setTab('map');
    if (tab === 'stats' && statsEnabled !== false && !canViewGeneralStats) setTab('map');
    if (tab === 'visit' && visitEnabled === false) setTab('map');
    if (tab === 'mascot_packs' && visitEnabled === false) setTab('map');
    if (tab === 'notebook' && observationsEnabled === false) setTab('map');
    if (tab === 'forum' && !canAccessForum) setTab('about');
    if (tab === 'media_library' && !effectiveIsTeacher) setTab('about');
  }, [tab, tutorialsEnabled, statsEnabled, visitEnabled, observationsEnabled, forumEnabled, canAccessForum, canViewGeneralStats, effectiveIsTeacher, setTab]);

  /** Avec une zone/repère au focus, l'onglet Tuto est fusionné avec Tâches (navigation vers la vue Tâches). */
  useEffect(() => {
    if (!mergeTasksTutoNav || tab !== 'tuto') return;
    setTab('tasks');
  }, [mergeTasksTutoNav, tab, setTab]);
}
