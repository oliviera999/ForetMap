import { useCallback, useEffect, useMemo, useState } from 'react';

import { detectIosDevice } from '../utils/appShellHelpers';
import { safeLocalStorageGetItem } from '../utils/browserStorage.js';
import { IOS_INSTALL_HINT_DISMISSED_KEY } from '../constants/app-runtime';

/**
 * Gestion autonome de l'installation PWA (extrait de App.jsx, O5/O6) :
 * - capture de l'événement `beforeinstallprompt` (Android/desktop) et `appinstalled` ;
 * - détection du mode `standalone` (display-mode + iOS navigator.standalone) ;
 * - astuce d'installation iOS (Safari → Sur l'écran d'accueil), masquable.
 *
 * Aucun couplage au cœur fetchAll/polling/realtime/session : la seule dépendance
 * externe est un callback de notification (`onToast`). Iso-comportement avec
 * l'ancien état inline d'App.jsx (mêmes valeurs/setters exposés).
 *
 * @param {{ onToast?: (msg: string) => void }} [options]
 */
export function usePwaInstall({ onToast } = {}) {
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(() => {
    const displayStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = window.navigator.standalone === true;
    return displayStandalone || iosStandalone;
  });
  const isIosDevice = useMemo(() => detectIosDevice(), []);

  useEffect(() => {
    const displayModeQuery = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null;
    const updateStandaloneState = () => {
      const displayStandalone = displayModeQuery ? displayModeQuery.matches : false;
      const iosStandalone = window.navigator.standalone === true;
      setIsStandaloneMode(displayStandalone || iosStandalone);
    };
    updateStandaloneState();
    if (!displayModeQuery) return undefined;
    if (typeof displayModeQuery.addEventListener === 'function') {
      displayModeQuery.addEventListener('change', updateStandaloneState);
      return () => displayModeQuery.removeEventListener('change', updateStandaloneState);
    }
    if (typeof displayModeQuery.addListener === 'function') {
      displayModeQuery.addListener(updateStandaloneState);
      return () => displayModeQuery.removeListener(updateStandaloneState);
    }
    return undefined;
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event);
    };
    const onAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setShowIosInstallHint(false);
      if (onToast) onToast('Application installée sur cet appareil.');
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [onToast]);

  useEffect(() => {
    if (!isIosDevice || isStandaloneMode) {
      setShowIosInstallHint(false);
      return;
    }
    const dismissed = safeLocalStorageGetItem(IOS_INSTALL_HINT_DISMISSED_KEY, null) === '1';
    setShowIosInstallHint(!dismissed);
  }, [isIosDevice, isStandaloneMode]);

  const handleInstallClick = useCallback(async () => {
    if (!deferredInstallPrompt) return;
    try {
      await deferredInstallPrompt.prompt();
      const result = await deferredInstallPrompt.userChoice;
      if (result?.outcome === 'accepted') {
        if (onToast) onToast('Installation en cours...');
      } else if (onToast) {
        onToast('Installation annulée.');
      }
    } catch (_) {
      if (onToast) onToast('Installation impossible sur ce navigateur.');
    } finally {
      setDeferredInstallPrompt(null);
    }
  }, [deferredInstallPrompt, onToast]);

  return {
    deferredInstallPrompt,
    showIosInstallHint,
    isStandaloneMode,
    handleInstallClick,
    setShowIosInstallHint,
  };
}
