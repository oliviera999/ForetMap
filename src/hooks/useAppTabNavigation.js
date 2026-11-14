import { useCallback, useEffect, useRef, useState } from 'react';
import { KNOWN_TAB_VALUES } from '../constants/app-runtime';
import { MASCOT_PACK_UNSAVED_LEAVE_MSG } from '../constants/mascotPackEditor.js';
import { useTabBrowserHistory } from '../shared/platform/useTabBrowserHistory';
import { reportUsage } from '../shared/usage/reportUsage.js';
import { withAppBase } from '../shared/appBase.js';
import { readStoredTab } from '../utils/appShellHelpers';

/**
 * Onglet courant du shell `App` et navigation entre onglets — extrait tel quel d'`App.jsx`
 * (lot 6) : état `tab`, historique navigateur (Retour = onglet précédent), compteur d'usage
 * anonyme, garde « packs mascotte non enregistrés » au changement d'onglet prof, et les
 * raccourcis de navigation de l'en-tête et des vues pédagogiques.
 *
 * Ordre des effets conservé : `useTabBrowserHistory` puis le compteur d'usage.
 *
 * @param {object} params
 * @param {{ current: object|null }} params.appDialogsRef Dialogues applicatifs (confirm…),
 *   exposés par le pont `AppDialogsBridge` (cf. `AppProviders`).
 */
export function useAppTabNavigation({ appDialogsRef }) {
  const [tab, setTab] = useState(() => readStoredTab());
  const isKnownForetTab = useCallback((id) => KNOWN_TAB_VALUES.has(id), []);
  /** Retour navigateur / smartphone → onglet précédent (après fermeture des surcouches). */
  const { navigateTab } = useTabBrowserHistory({
    tab,
    setTab,
    isKnownTab: isKnownForetTab,
  });
  /**
   * Compteur d'usage anonyme (lot 8) : une ouverture par session, puis l'onglet consulté.
   * Aucun identifiant n'est envoyé — seulement le nom de l'événement et l'onglet.
   */
  const usageOpenedRef = useRef(false);
  useEffect(() => {
    if (!usageOpenedRef.current) {
      usageOpenedRef.current = true;
      reportUsage('foret', 'open', '', withAppBase);
    }
    reportUsage('foret', 'tab_open', String(tab || ''), withAppBase);
  }, [tab]);

  const mascotPackDirtyRef = useRef(false);
  const onMascotPackDirtyChange = useCallback((dirty) => {
    mascotPackDirtyRef.current = dirty;
  }, []);

  const handleTeacherTabChange = useCallback(
    async (nextTab) => {
      if (tab === 'mascot_packs' && nextTab !== 'mascot_packs' && mascotPackDirtyRef.current) {
        if (!(await appDialogsRef.current?.confirm({ message: MASCOT_PACK_UNSAVED_LEAVE_MSG }))) {
          return;
        }
      }
      navigateTab(nextTab);
    },
    [tab, navigateTab, appDialogsRef],
  );

  const openMascotPackStudioTab = useCallback(() => {
    navigateTab('mascot_packs');
  }, [navigateTab]);

  const handleOpenTeacherStatsTab = useCallback(() => navigateTab('stats'), [navigateTab]);
  const handleOpenSettingsLearning = useCallback(() => {
    try {
      sessionStorage.setItem('foretmap:settings:focus', 'learning-gating');
    } catch (_) {
      /* ignore */
    }
    navigateTab('settings');
  }, [navigateTab]);

  return {
    tab,
    setTab,
    navigateTab,
    onMascotPackDirtyChange,
    handleTeacherTabChange,
    openMascotPackStudioTab,
    handleOpenTeacherStatsTab,
    handleOpenSettingsLearning,
  };
}
