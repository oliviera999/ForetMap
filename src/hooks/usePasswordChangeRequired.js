import { useCallback, useEffect, useState } from 'react';

import { PASSWORD_CHANGE_REQUIRED_EVENT } from '../utils/passwordChangeRequired.js';

/**
 * Mot de passe provisoire ou compromis à changer : conduit l'utilisateur à « Mon profil ».
 *
 * Le serveur refuse toute route à session obligatoire d'un compte marqué
 * (`403 PASSWORD_CHANGE_REQUIRED`), sauf `GET /api/auth/me` et `POST /api/auth/me/password`.
 * Le drapeau arrive au shell par trois chemins, qui appellent tous
 * `markPasswordChangeRequired` : la réponse de connexion, celle de `/api/auth/me`
 * (restauration et rafraîchissement de session) et le refus lui-même, signalé par `api()`
 * via l'événement `window` écouté ici. Chaque signal positif rouvre « Mon profil » ; le
 * drapeau retombe au changement réussi (ou à la déconnexion).
 *
 * @param {object} params
 * @param {(open: boolean) => void} params.setShowProfile ouverture du dialogue « Mon profil »
 * @returns {{
 *   passwordChangeRequired: boolean,
 *   markPasswordChangeRequired: (required: boolean) => void,
 * }}
 */
export function usePasswordChangeRequired({ setShowProfile }) {
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);

  const markPasswordChangeRequired = useCallback(
    (required) => {
      const next = !!required;
      setPasswordChangeRequired(next);
      if (next) setShowProfile(true);
    },
    [setShowProfile],
  );

  useEffect(() => {
    const onRequired = () => markPasswordChangeRequired(true);
    window.addEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, onRequired);
  }, [markPasswordChangeRequired]);

  return { passwordChangeRequired, markPasswordChangeRequired };
}
