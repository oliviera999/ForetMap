import { useState } from 'react';

/**
 * Sous-état d'overlay autonome de l'app GL (extrait d'AppGL.jsx, O5/O6) :
 * visibilité des deux modales chrome joueur — profil (`showProfile`) et
 * statistiques personnelles (`showPlayerStats`).
 *
 * Groupe purement local et faiblement couplé : aucune dépendance au cœur
 * polling/realtime/session GL, aucun effet, aucune ref. Les setters bruts
 * sont exposés tels quels (mêmes valeurs/setters qu'inline dans AppGL.jsx) —
 * extraction iso-comportement. L'ouverture/fermeture reste pilotée par le
 * parent dans les gestionnaires d'événements JSX.
 */
export function useGLOverlays() {
  const [showProfile, setShowProfile] = useState(false);
  const [showPlayerStats, setShowPlayerStats] = useState(false);

  return {
    showProfile,
    setShowProfile,
    showPlayerStats,
    setShowPlayerStats,
  };
}
