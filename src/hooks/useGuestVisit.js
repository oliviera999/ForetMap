import { useCallback, useState } from 'react';
import { GUEST_VISIT_MASCOT_CONFIRMED_KEY } from '../constants/app-runtime';
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
} from '../shared/platform/browserStorage.js';
import { abandonAllOverlays, pushOverlayClose } from '../shared/platform/overlayHistory';

/**
 * Visite publique invitée (sans compte) du shell `App` — état et gestionnaires extraits
 * tels quels d'`App.jsx` (lot 6) : entrée dans la visite (avec onboarding mascotte si le
 * choix n'a jamais été confirmé sur l'appareil), retour à l'écran de connexion, choix de
 * mascotte confirmé. Aucun effet.
 */
export function useGuestVisit() {
  const [showPublicVisit, setShowPublicVisit] = useState(false);
  const [guestVisitNeedsMascotChoice, setGuestVisitNeedsMascotChoice] = useState(false);

  // Handlers stables de la visite publique invitée : des arrows inline cassaient
  // React.memo(VisitView) à chaque re-render d'App (mode le plus sensible, mobile).
  const onGuestBackToAuth = useCallback(() => {
    abandonAllOverlays();
    setGuestVisitNeedsMascotChoice(false);
    setShowPublicVisit(false);
  }, []);
  const onGuestMascotChoiceDone = useCallback(() => {
    safeLocalStorageSetItem(GUEST_VISIT_MASCOT_CONFIRMED_KEY, '1');
    setGuestVisitNeedsMascotChoice(false);
  }, []);

  /** Entrée en visite publique invitée (avec onboarding mascotte si jamais confirmé). */
  const handleVisitAsGuest = useCallback(() => {
    pushOverlayClose(() => setShowPublicVisit(false));
    const guestAlreadyConfirmedMascot =
      safeLocalStorageGetItem(GUEST_VISIT_MASCOT_CONFIRMED_KEY, null) === '1';
    setGuestVisitNeedsMascotChoice(!guestAlreadyConfirmedMascot);
    setShowPublicVisit(true);
  }, []);

  return {
    showPublicVisit,
    guestVisitNeedsMascotChoice,
    onGuestBackToAuth,
    onGuestMascotChoiceDone,
    handleVisitAsGuest,
  };
}
