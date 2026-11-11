import { useCallback, useState } from 'react';

/**
 * Ouverture des dialogues de l'en-tête du shell `App` (statistiques, profil, PIN) — états
 * et gestionnaires stables extraits tels quels d'`App.jsx` (lot 6). Aucun effet.
 *
 * Les setters bruts restent exposés : `usePasswordChangeRequired` et `useAuthSession`
 * ouvrent ou ferment « Mon profil » et les statistiques eux-mêmes.
 */
export function useShellDialogs() {
  const [showPin, setShowPin] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const handleOpenStatsDialog = useCallback(() => setShowStats(true), []);
  const handleCloseStatsDialog = useCallback(() => setShowStats(false), []);
  const handleOpenProfileDialog = useCallback(() => setShowProfile(true), []);
  const handleCloseProfileDialog = useCallback(() => setShowProfile(false), []);
  const handleRequestPin = useCallback(() => setShowPin(true), []);

  return {
    showPin,
    setShowPin,
    showStats,
    setShowStats,
    showProfile,
    setShowProfile,
    handleOpenStatsDialog,
    handleCloseStatsDialog,
    handleOpenProfileDialog,
    handleCloseProfileDialog,
    handleRequestPin,
  };
}
