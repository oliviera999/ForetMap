import { useEffect, useState } from 'react';

import { api } from '../services/api';
import { DEFAULT_PUBLIC_SETTINGS, mergePublicSettings } from '../utils/appPublicSettings';
import { useAppVersion } from './useAppVersion.js';

/**
 * Amorçage applicatif autonome (extrait de App.jsx, O5) : deux lectures réseau
 * effectuées une seule fois au montage, sans aucun couplage à la session, au
 * cœur fetchAll/polling/realtime ni à la navigation :
 * - GET /api/version → numéro de version affiché (footer, badge, vues About),
 *   délégué à `useAppVersion` (même hook que AppGL) — échec silencieux
 *   (`appVersion` reste `null`, plus de `console.error`) et setState annulé
 *   au démontage ;
 * - GET /api/settings/public → réglages publics fusionnés (modules, contenus,
 *   cartes par défaut) + drapeau `publicSettingsReady` une fois la requête
 *   terminée (succès comme échec).
 *
 * Iso-comportement avec les anciens états/effets inline d'App.jsx : mêmes
 * valeurs par défaut, même fusion non bloquante.
 *
 * @returns {{
 *   appVersion: (string|number|null),
 *   publicSettings: object,
 *   publicSettingsReady: boolean,
 * }}
 */
export function useAppBootstrap() {
  const appVersion = useAppVersion();
  const [publicSettings, setPublicSettings] = useState(DEFAULT_PUBLIC_SETTINGS);
  const [publicSettingsReady, setPublicSettingsReady] = useState(false);

  useEffect(() => {
    api('/api/settings/public')
      .then((d) => {
        if (!d?.settings) return;
        setPublicSettings((prev) => mergePublicSettings(prev, d.settings));
      })
      .catch(() => {
        // Réglages publics non bloquants.
      })
      .finally(() => {
        setPublicSettingsReady(true);
      });
  }, []);

  return {
    appVersion,
    publicSettings,
    publicSettingsReady,
  };
}
